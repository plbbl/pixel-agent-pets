//! Read-only, bounded local activity observation. No transcript text is retained.
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    hash::{Hash, Hasher},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const READ_CAP: usize = 256 * 1024;
const LINE_CAP: usize = 256 * 1024;
const DISCOVER_MS: u64 = 10_000;
const CODEX_STALE_MS: u64 = 10 * 60_000;
const BRIDGE_STALE_MS: u64 = 15_000;
const TERMINAL_MS: u64 = 8_000;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Follow {
    #[default]
    Auto,
    Codex,
    Dsh,
    Off,
}
impl Follow {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "auto" => Some(Self::Auto),
            "codex" => Some(Self::Codex),
            "dsh" => Some(Self::Dsh),
            "off" => Some(Self::Off),
            _ => None,
        }
    }
}
#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct Activity {
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    pub observed_at: u64,
    pub busy: bool,
    pub phase: String,
    pub awaiting_input: bool,
    pub chinese_draft: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub chinese_input_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub turn_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_id: Option<String>,
}
impl Default for Activity {
    fn default() -> Self {
        Self {
            source: None,
            owner: None,
            observed_at: 0,
            busy: false,
            phase: "thinking".into(),
            awaiting_input: false,
            chinese_draft: false,
            chinese_input_id: None,
            turn_id: None,
            tool: None,
            tool_id: None,
            error_id: None,
        }
    }
}
impl Activity {
    pub fn same_facts(&self, other: &Self) -> bool {
        let mut a = self.clone();
        let mut b = other.clone();
        a.observed_at = 0;
        b.observed_at = 0;
        a == b
    }
    fn codex(path: &Path) -> Self {
        Self {
            source: Some("codex".into()),
            owner: Some(opaque("codex-owner", path)),
            ..Self::default()
        }
    }
    fn clear_tool(&mut self) {
        self.tool = None;
        self.tool_id = None;
        self.awaiting_input = false;
    }
}
pub fn now_ms() -> u64 {
    epoch_ms(SystemTime::now())
}
fn epoch_ms(time: SystemTime) -> u64 {
    time.duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .min(u64::MAX as u128) as u64
}
fn opaque(source: &str, value: impl Hash) -> String {
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hash);
    format!("{source}:{:016x}", hash.finish())
}
fn phase(value: &str) -> bool {
    [
        "sending",
        "preparing",
        "thinking",
        "responding",
        "tools",
        "retrying",
        "stopping",
    ]
    .contains(&value)
}
fn tool_kind(name: &str) -> &'static str {
    let lower = name.to_ascii_lowercase();
    if ["search", "grep", "find", "glob", "web", "browse"]
        .iter()
        .any(|n| lower.contains(n))
    {
        "search"
    } else if ["read", "view_file", "list", "open_in_codex"]
        .iter()
        .any(|n| lower.contains(n))
    {
        "read_file"
    } else if ["write", "edit", "replace", "patch"]
        .iter()
        .any(|n| lower.contains(n))
    {
        "write_file"
    } else {
        "run_command"
    }
}
fn waiting(name: &str) -> bool {
    [
        "request_user_input",
        "request_user_input_async",
        "request_permissions",
        "ask_user",
    ]
    .iter()
    .any(|n| name.ends_with(n))
}

// Derive ignores all unknown fields, so message/arguments/output/reasoning content
// is never allocated as a Value or kept in observer state.
#[derive(Default, Deserialize)]
struct Record {
    #[serde(default)]
    timestamp: String,
    #[serde(default)]
    ordinal: u64,
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    payload: Metadata,
}
#[derive(Default, Deserialize)]
struct Metadata {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    turn_id: Option<String>,
    #[serde(default)]
    call_id: Option<String>,
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    role: Option<String>,
    #[serde(default)]
    phase: Option<String>,
    #[serde(default)]
    item: Option<Item>,
    #[serde(default, deserialize_with = "has_value", rename = "error")]
    has_error: bool,
}
#[derive(Default, Deserialize)]
struct Item {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    id: Option<String>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    phase: Option<String>,
    #[serde(default)]
    tool: Option<String>,
}
fn has_value<'de, D: serde::Deserializer<'de>>(d: D) -> Result<bool, D::Error> {
    Ok(Option::<serde::de::IgnoredAny>::deserialize(d)?.is_some())
}
#[derive(Deserialize)]
struct UserRecord {
    payload: UserMessage,
}
#[derive(Deserialize)]
struct UserMessage {
    message: String,
}

#[derive(Default, Deserialize)]
struct SessionRecord {
    #[serde(rename = "type", default)]
    kind: String,
    #[serde(default)]
    payload: SessionMetadata,
}
#[derive(Default, Deserialize)]
struct SessionMetadata {
    #[serde(default)]
    source: Option<SessionSource>,
    #[serde(default)]
    originator: String,
    #[serde(default)]
    parent_thread_id: Option<String>,
    #[serde(default)]
    agent_path: Option<String>,
}
#[derive(Deserialize)]
#[serde(untagged)]
enum SessionSource {
    Text(String),
    Other(serde::de::IgnoredAny),
}
fn main_session_metadata(meta: &SessionRecord) -> bool {
    meta.kind == "session_meta"
        && meta.payload.parent_thread_id.is_none()
        && meta.payload.agent_path.is_none()
        && matches!(meta.payload.source,Some(SessionSource::Text(ref s)) if s=="cli" || s=="vscode")
        && [
            "Codex Desktop",
            "codex_cli_rs",
            "codex_vscode",
            "codex_exec",
        ]
        .contains(&meta.payload.originator.as_str())
}
#[cfg(test)]
fn main_session(bytes: &[u8]) -> bool {
    serde_json::from_slice::<SessionRecord>(bytes).is_ok_and(|meta| main_session_metadata(&meta))
}
fn eligible(path: &Path) -> Option<bool> {
    let metadata = fs::symlink_metadata(path).ok()?;
    if !metadata.is_file() {
        return Some(false);
    }
    let file = File::open(path).ok()?;
    let mut bytes = Vec::new();
    let mut reader = std::io::BufReader::new(file);
    use std::io::BufRead;
    reader
        .by_ref()
        .take((READ_CAP + 1) as u64)
        .read_until(b'\n', &mut bytes)
        .ok()?;
    if bytes.len() > READ_CAP {
        return Some(false);
    }
    // A newly-created file may still be writing its first line. Retry next discovery.
    if bytes.last() != Some(&b'\n') {
        return None;
    }
    let meta: SessionRecord = serde_json::from_slice(&bytes).ok()?;
    Some(main_session_metadata(&meta))
}

struct Session {
    path: PathBuf,
    offset: u64,
    pending: Vec<u8>,
    skip_line: bool,
    facts: Activity,
    pending_tools: HashMap<String, (&'static str, bool)>,
    terminal: bool,
    live: bool,
}
impl Session {
    fn new(path: PathBuf) -> Self {
        Self {
            facts: Activity::codex(&path),
            path,
            offset: 0,
            pending: Vec::new(),
            skip_line: false,
            pending_tools: HashMap::new(),
            terminal: false,
            live: false,
        }
    }
    fn apply(&mut self, line: &[u8], bootstrap: bool, fallback: u64, offset: u64) {
        let Ok(record) = serde_json::from_slice::<Record>(line) else {
            return;
        };
        let at = iso_ms(&record.timestamp)
            .unwrap_or(fallback)
            .min(fallback.saturating_add(5_000));
        let p = record.payload;
        let kind = p.kind.as_str();
        let id = opaque("codex", (&self.path, p.turn_id.as_deref().unwrap_or("")));
        if record.kind == "event_msg" {
            match kind {
                "task_started" => {
                    self.facts = Activity {
                        source: Some("codex".into()),
                        owner: self.facts.owner.clone(),
                        observed_at: at,
                        busy: true,
                        phase: "thinking".into(),
                        turn_id: Some(id),
                        chinese_draft: self.facts.chinese_draft,
                        chinese_input_id: self.facts.chinese_input_id.clone(),
                        ..Activity::default()
                    };
                    self.pending_tools.clear();
                    self.terminal = false;
                }
                "task_complete" | "turn_complete" | "turn_aborted" | "error" => {
                    self.facts.busy = false;
                    self.facts.clear_tool();
                    self.facts.phase = if kind == "turn_aborted" {
                        "stopping"
                    } else {
                        "thinking"
                    }
                    .into();
                    self.facts.observed_at = at;
                    self.facts.turn_id = Some(id.clone());
                    self.terminal = true;
                    self.pending_tools.clear();
                    if !bootstrap && (p.has_error || kind == "error") {
                        self.facts.error_id =
                            Some(opaque("codex-error", (&self.path, record.ordinal, offset)));
                    }
                }
                "user_message" if !bootstrap => {
                    if let Ok(user) = serde_json::from_slice::<UserRecord>(line) {
                        let chinese =
                            user.payload.message.chars().any(
                                |c| matches!(c,'\u{3400}'..='\u{9fff}'|'\u{20000}'..='\u{323af}'),
                            );
                        self.facts.chinese_draft = chinese;
                        self.facts.chinese_input_id = chinese
                            .then(|| opaque("codex-input", (&self.path, record.ordinal, offset)));
                        self.facts.observed_at = at;
                    }
                }
                "item_completed" => {
                    if p.turn_id.is_some()
                        && self.facts.turn_id.as_ref().is_some_and(|old| old != &id)
                    {
                        self.terminal = false;
                        self.facts.turn_id = Some(id);
                        self.pending_tools.clear();
                    }
                    if let Some(item) = p.item {
                        self.item(item, at, bootstrap, record.ordinal, offset);
                    }
                }
                "token_count" => {
                    if self.facts.busy {
                        self.facts.observed_at = at;
                    }
                }
                _ => {}
            }
        } else if record.kind == "response_item" {
            match kind {
                "reasoning" => self.working("thinking", at),
                "message" if p.role.as_deref() == Some("assistant") => self.working(
                    if p.phase.as_deref() == Some("final_answer") {
                        "responding"
                    } else {
                        "thinking"
                    },
                    at,
                ),
                "function_call" | "custom_tool_call" => {
                    let name = p.name.as_deref().unwrap_or("");
                    let call = p.call_id.unwrap_or_else(|| format!("{offset}"));
                    let wait = waiting(name);
                    let tool = tool_kind(name);
                    if self.pending_tools.len() >= 32 {
                        self.pending_tools.clear();
                    }
                    self.pending_tools.insert(call.clone(), (tool, wait));
                    self.working("tools", at);
                    self.facts.tool = Some(tool.into());
                    self.facts.tool_id = Some(opaque("codex-tool", (&self.path, &call)));
                    self.facts.awaiting_input = wait;
                }
                "function_call_output" | "custom_tool_call_output" => {
                    if let Some(call) = p.call_id {
                        self.pending_tools.remove(&call);
                    }
                    self.working(
                        if self.pending_tools.is_empty() {
                            "thinking"
                        } else {
                            "tools"
                        },
                        at,
                    );
                    self.facts.awaiting_input = self.pending_tools.values().any(|(_, wait)| *wait);
                    if self.pending_tools.is_empty() {
                        self.facts.tool = None;
                        self.facts.tool_id = None;
                    }
                }
                _ => {}
            }
        }
        if bootstrap {
            self.facts.chinese_draft = false;
            self.facts.chinese_input_id = None;
            self.facts.error_id = None;
            if !self.facts.busy {
                self.facts.turn_id = None;
            }
        }
    }
    fn working(&mut self, value: &str, at: u64) {
        // Late bookkeeping for an already completed turn cannot resurrect it.
        if self.terminal {
            return;
        }
        self.facts.busy = true;
        self.facts.phase = value.into();
        self.facts.observed_at = at;
    }
    fn item(&mut self, item: Item, at: u64, bootstrap: bool, ordinal: u64, offset: u64) {
        match item.kind.as_str() {
            "Reasoning" => self.working("thinking", at),
            "AgentMessage" => self.working(
                if item.phase.as_deref() == Some("final_answer") {
                    "responding"
                } else {
                    "thinking"
                },
                at,
            ),
            "CommandExecution" | "FileChange" | "McpToolCall" | "Extension" | "ImageView" => {
                self.working("thinking", at);
                if !self.terminal && item.status.as_deref() == Some("failed") && !bootstrap {
                    self.facts.error_id =
                        Some(opaque("codex-tool-error", (&self.path, ordinal, offset)));
                }
                let _ = (item.id, item.tool); // Never expose raw tool names or result fields.
            }
            _ => {}
        }
    }
    fn poll(&mut self, now: u64) {
        let Ok(metadata) = fs::symlink_metadata(&self.path) else {
            self.live = false;
            self.offset = 0;
            self.pending.clear();
            return;
        };
        if !metadata.is_file() {
            self.live = false;
            return;
        }
        let length = metadata.len();
        let fresh = self.offset != 0;
        if fresh && length == self.offset {
            return;
        }
        let mut bootstrap = !fresh;
        if length < self.offset {
            self.offset = 0;
            self.pending.clear();
            self.skip_line = false;
            self.facts = Activity::codex(&self.path);
            self.pending_tools.clear();
            self.terminal = false;
            self.live = false;
            bootstrap = true;
        }
        let Ok(mut file) = File::open(&self.path) else {
            return;
        };
        if self.offset == 0 || length.saturating_sub(self.offset) > READ_CAP as u64 {
            self.offset = length.saturating_sub(READ_CAP as u64);
            self.pending.clear();
            self.skip_line = self.offset > 0;
        }
        if file.seek(SeekFrom::Start(self.offset)).is_err() {
            return;
        }
        let mut bytes = Vec::new();
        if file.take(READ_CAP as u64).read_to_end(&mut bytes).is_err() {
            return;
        }
        if !bootstrap && !bytes.is_empty() {
            self.live = true;
        }
        let fallback = metadata.modified().map(epoch_ms).unwrap_or(now).min(now);
        let start = self.offset;
        self.offset += bytes.len() as u64;
        for (i, byte) in bytes.into_iter().enumerate() {
            if self.skip_line {
                if byte == b'\n' {
                    self.skip_line = false;
                }
                continue;
            }
            if byte == b'\n' {
                let line = std::mem::take(&mut self.pending);
                self.apply(&line, bootstrap, fallback, start + i as u64);
            } else if self.pending.len() < LINE_CAP {
                self.pending.push(byte);
            } else {
                self.pending.clear();
                self.skip_line = true;
            }
        }
    }
    fn current(&self, now: u64) -> Option<Activity> {
        let age = now.saturating_sub(self.facts.observed_at);
        if !self.live
            || self.facts.observed_at == 0
            || age
                > if self.facts.busy {
                    CODEX_STALE_MS
                } else {
                    TERMINAL_MS
                }
        {
            return None;
        }
        Some(self.facts.clone())
    }
}

pub struct CodexObserver {
    home: PathBuf,
    sessions: Vec<Session>,
    checked: HashMap<PathBuf, bool>,
    last_discovery: u64,
    enabled: bool,
    selected: Option<String>,
}
impl CodexObserver {
    pub fn new(home: PathBuf) -> Self {
        Self {
            home,
            sessions: Vec::new(),
            checked: HashMap::new(),
            last_discovery: 0,
            enabled: false,
            selected: None,
        }
    }
    pub fn poll(&mut self, enabled: bool, now: u64) -> Option<Activity> {
        if !enabled {
            self.enabled = false;
            return None;
        }
        if !self.enabled {
            self.sessions.clear();
            self.checked.clear();
            self.last_discovery = 0;
            self.enabled = true;
            self.selected = None;
        }
        if self.last_discovery == 0 || now.saturating_sub(self.last_discovery) >= DISCOVER_MS {
            self.discover(now);
            self.last_discovery = now;
        }
        for session in &mut self.sessions {
            session.poll(now);
        }
        // Stick to the most recently active main session; no subagent is eligible.
        let facts: Vec<_> = self
            .sessions
            .iter()
            .filter_map(|s| s.current(now))
            .collect();
        let selected = facts
            .iter()
            .find(|s| s.owner == self.selected && (s.busy || s.awaiting_input))
            .cloned()
            .or_else(|| {
                facts
                    .into_iter()
                    .max_by_key(|s| (s.busy || s.awaiting_input, s.observed_at))
            });
        self.selected = selected.as_ref().and_then(|s| s.owner.clone());
        selected
    }
    fn discover(&mut self, now: u64) {
        let root = self.home.join("sessions");
        let mut dates = HashSet::new();
        for days in 0..3 {
            dates.insert(date_path(now.saturating_sub(days * 86_400_000)));
        }
        // The public index's UUIDv7 creation date resolves resumed older sessions
        // directly; no recursive scan of the user's historical transcripts.
        for date in index_dates(&self.home.join("session_index.jsonl")) {
            dates.insert(date);
        }
        let mut candidates = Vec::new();
        for date in dates {
            if let Ok(entries) = fs::read_dir(root.join(date)) {
                for entry in entries.take(2048).flatten() {
                    let path = entry.path();
                    if !entry.file_name().to_string_lossy().starts_with("rollout-")
                        || path.extension().and_then(|s| s.to_str()) != Some("jsonl")
                    {
                        continue;
                    }
                    if let Ok(m) = entry.metadata() {
                        if m.is_file() {
                            candidates.push((m.modified().map(epoch_ms).unwrap_or(0), path));
                        }
                    }
                }
            }
        }
        for session in &self.sessions {
            if let Ok(m) = fs::metadata(&session.path) {
                candidates.push((
                    m.modified().map(epoch_ms).unwrap_or(0),
                    session.path.clone(),
                ));
            }
        }
        candidates.sort_by(|a, b| b.0.cmp(&a.0));
        let mut seen = HashSet::new();
        candidates.retain(|(_, p)| seen.insert(p.clone()));
        let mut chosen = Vec::new();
        for (_, path) in candidates.into_iter().take(64) {
            let allowed = match self.checked.get(&path) {
                Some(allowed) => *allowed,
                None => match eligible(&path) {
                    Some(allowed) => {
                        self.checked.insert(path.clone(), allowed);
                        allowed
                    }
                    None => false,
                },
            };
            if allowed {
                chosen.push(path);
                if chosen.len() == 4 {
                    break;
                }
            }
        }
        self.sessions.retain(|s| chosen.contains(&s.path));
        for path in chosen {
            if !self.sessions.iter().any(|s| s.path == path) {
                self.sessions.push(Session::new(path));
            }
        }
        if self.checked.len() > 256 {
            let paths: HashSet<_> = self.sessions.iter().map(|s| s.path.clone()).collect();
            self.checked.retain(|p, _| paths.contains(p));
        }
    }
}
#[derive(Deserialize)]
struct IndexEntry {
    id: String,
}
fn index_dates(path: &Path) -> Vec<String> {
    let Ok(mut file) = File::open(path) else {
        return Vec::new();
    };
    let Ok(m) = file.metadata() else {
        return Vec::new();
    };
    let offset = m.len().saturating_sub(64 * 1024);
    if file.seek(SeekFrom::Start(offset)).is_err() {
        return Vec::new();
    }
    let mut bytes = Vec::new();
    if file.take(64 * 1024).read_to_end(&mut bytes).is_err() {
        return Vec::new();
    }
    let mut dates = Vec::new();
    for line in bytes.split(|b| *b == b'\n').rev().take(96) {
        if let Ok(entry) = serde_json::from_slice::<IndexEntry>(line) {
            let compact = entry.id.replace('-', "");
            if compact.len() == 32
                && compact.bytes().all(|b| b.is_ascii_hexdigit())
                && compact.as_bytes()[12] == b'7'
            {
                if let Ok(ms) = u64::from_str_radix(&compact[..12], 16) {
                    let date = date_path(ms);
                    if !dates.contains(&date) {
                        dates.push(date);
                        if dates.len() == 8 {
                            break;
                        }
                    }
                }
            }
        }
    }
    dates
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Bridge {
    version: u8,
    source: String,
    updated_at: u64,
    busy: bool,
    phase: String,
    #[serde(default)]
    awaiting_input: bool,
    #[serde(default)]
    chinese_draft: bool,
    #[serde(default)]
    chinese_input_id: Option<String>,
    #[serde(default)]
    turn_id: Option<String>,
    #[serde(default)]
    tool: Option<String>,
    #[serde(default)]
    tool_id: Option<String>,
    #[serde(default)]
    error_id: Option<String>,
    #[serde(default)]
    owner: String,
}
pub fn read_dsh(path: &Path, now: u64) -> Option<Activity> {
    let m = fs::symlink_metadata(path).ok()?;
    if !m.is_file() || m.len() > 8192 {
        return None;
    }
    let mut bytes = Vec::new();
    File::open(path)
        .ok()?
        .take(8193)
        .read_to_end(&mut bytes)
        .ok()?;
    let bridge: Bridge = serde_json::from_slice(&bytes).ok()?;
    if bridge.version != 1
        || bridge.source != "dsh"
        || !phase(&bridge.phase)
        || bridge.updated_at > now + 5_000
        || now.saturating_sub(bridge.updated_at) > BRIDGE_STALE_MS
    {
        return None;
    }
    let scoped = |s: &String| opaque("dsh", (&bridge.owner, s));
    let tool = bridge
        .tool
        .as_deref()
        .filter(|s| ["read_file", "write_file", "run_command", "search"].contains(s))
        .map(str::to_owned);
    Some(Activity {
        source: Some("dsh".into()),
        owner: Some(opaque("dsh-owner", &bridge.owner)),
        observed_at: bridge.updated_at,
        busy: bridge.busy,
        phase: bridge.phase,
        awaiting_input: bridge.awaiting_input,
        chinese_draft: bridge.chinese_draft,
        chinese_input_id: if bridge.chinese_draft {
            bridge
                .chinese_input_id
                .as_ref()
                .map(|id| opaque("dsh-input", (&bridge.owner, id)))
        } else {
            None
        },
        turn_id: bridge.turn_id.as_ref().map(scoped),
        tool,
        tool_id: bridge.tool_id.as_ref().map(scoped),
        error_id: bridge.error_id.as_ref().map(scoped),
    })
}
pub fn select(
    follow: Follow,
    codex: Option<Activity>,
    dsh: Option<Activity>,
    previous: &Activity,
) -> Activity {
    if follow == Follow::Off {
        return Activity::default();
    }
    let mut candidates: Vec<_> = [
        if matches!(follow, Follow::Auto | Follow::Codex) {
            codex
        } else {
            None
        },
        if matches!(follow, Follow::Auto | Follow::Dsh) {
            dsh
        } else {
            None
        },
    ]
    .into_iter()
    .flatten()
    .collect();
    // Keep an active source until its work ends, rather than bouncing on heartbeats.
    if let Some(i) = candidates.iter().position(|s| {
        s.source == previous.source && s.owner == previous.owner && (s.busy || s.awaiting_input)
    }) {
        return candidates.swap_remove(i);
    }
    candidates
        .into_iter()
        .max_by_key(|s| (s.busy || s.awaiting_input, s.observed_at))
        .unwrap_or_default()
}
pub fn heartbeat(path: &Path, now: u64) -> std::io::Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidInput, "activity path"))?;
    fs::create_dir_all(parent)?;
    let temp = parent.join(format!(".desktop-active-{}.tmp", std::process::id()));
    let mut options = OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp)?;
    file.write_all(format!("{{\"version\":1,\"updatedAt\":{now}}}").as_bytes())?;
    drop(file);
    fs::rename(&temp, path)
}
// Gregorian date conversion, UTC only; avoids a timezone/database dependency.
fn civil(days: i64) -> (i64, u64, u64) {
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = z - era * 146097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    (y + if m <= 2 { 1 } else { 0 }, m as u64, d as u64)
}
fn date_path(ms: u64) -> String {
    let (y, m, d) = civil((ms / 86_400_000) as i64);
    format!("{y:04}/{m:02}/{d:02}")
}
fn iso_ms(text: &str) -> Option<u64> {
    if text.len() < 20 || !text.is_ascii() {
        return None;
    }
    let y = text[0..4].parse::<i64>().ok()?;
    let m = text[5..7].parse::<i64>().ok()?;
    let d = text[8..10].parse::<i64>().ok()?;
    let h = text[11..13].parse::<u64>().ok()?;
    let min = text[14..16].parse::<u64>().ok()?;
    let sec = text[17..19].parse::<u64>().ok()?;
    if !(1970..=2200).contains(&y)
        || !(1..=12).contains(&m)
        || !(1..=31).contains(&d)
        || h > 23
        || min > 59
        || sec > 60
        || !text.ends_with('Z')
    {
        return None;
    }
    let year = y - if m <= 2 { 1 } else { 0 };
    let era = year / 400;
    let yoe = year - era * 400;
    let mp = m + if m > 2 { -3 } else { 9 };
    let days = era * 146097 + yoe * 365 + yoe / 4 - yoe / 100 + (153 * mp + 2) / 5 + d - 1 - 719468;
    let fraction = text
        .strip_suffix('Z')?
        .split_once('.')
        .map(|(_, s)| s)
        .unwrap_or("");
    let millis = format!("{fraction:0<3}")[..3].parse::<u64>().unwrap_or(0);
    Some(days as u64 * 86_400_000 + h * 3_600_000 + min * 60_000 + sec * 1000 + millis)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn temp() -> PathBuf {
        static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let p = std::env::temp_dir().join(format!(
            "pet-activity-test-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
        ));
        fs::create_dir_all(&p).unwrap();
        p
    }
    #[test]
    fn only_confirmed_main_sessions_are_eligible() {
        assert!(main_session(br#"{"type":"session_meta","payload":{"source":"vscode","originator":"Codex Desktop","base_instructions":{"text":"private"}}}"#));
        for value in [
            r#"{"source":{"subagent":{}},"originator":"Codex Desktop"}"#,
            r#"{"source":"vscode","originator":"Codex Desktop","parent_thread_id":"x"}"#,
            r#"{"source":"unknown","originator":"Codex Desktop"}"#,
        ] {
            assert!(!main_session(
                format!("{{\"type\":\"session_meta\",\"payload\":{value}}}").as_bytes()
            ));
        }
    }
    #[test]
    fn incomplete_first_metadata_is_retried_without_qualifying_unknown_sessions() {
        let root = temp();
        let file = root.join("rollout.jsonl");
        fs::write(&file, b"{\"type\":\"session_meta\"").unwrap();
        assert_eq!(eligible(&file), None);
        fs::write(&file,b"{\"type\":\"session_meta\",\"payload\":{\"source\":\"vscode\",\"originator\":\"Codex Desktop\"}}\n").unwrap();
        assert_eq!(eligible(&file), Some(true));
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn new_input_only_and_metadata_lifecycle() {
        let mut s = Session::new(PathBuf::from("rollout"));
        let user=br#"{"type":"event_msg","ordinal":3,"payload":{"type":"user_message","message":"\u4e2d\u6587 secret"}}"#;
        s.apply(user, true, 1000, 1);
        assert!(!s.facts.chinese_draft);
        s.apply(
            br#"{"type":"event_msg","payload":{"type":"task_started","turn_id":"t"}}"#,
            false,
            2000,
            2,
        );
        s.apply(user, false, 2000, 3);
        assert!(s.facts.chinese_draft);
        let chinese = s.facts.chinese_input_id.clone();
        s.apply(br#"{"type":"response_item","payload":{"type":"function_call","name":"read_file","call_id":"a","arguments":"secret command"}}"#,false,2000,4);
        assert_eq!(s.facts.tool.as_deref(), Some("read_file"));
        assert!(s.facts.busy);
        s.apply(br#"{"type":"event_msg","payload":{"type":"task_complete","turn_id":"t","last_agent_message":"secret answer"}}"#,false,3000,5);
        assert!(!s.facts.busy);
        let result = serde_json::to_string(&s.facts).unwrap();
        assert!(!result.contains("secret"));
        assert!(!result.contains("arguments"));
        assert_eq!(s.facts.chinese_input_id, chinese);
        s.apply(
            br#"{"type":"response_item","payload":{"type":"reasoning","summary":["secret"]}}"#,
            false,
            3000,
            6,
        );
        assert!(!s.facts.busy);
    }
    #[test]
    fn partial_lines_truncation_and_idle_ttl() {
        let root = temp();
        let path = root.join("rollout.jsonl");
        fs::write(&path,b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\",\"turn_id\":\"one\"}}\n").unwrap();
        let mut s = Session::new(path.clone());
        let now = now_ms();
        s.poll(now);
        assert!(s.facts.busy);
        let mut file = OpenOptions::new().append(true).open(&path).unwrap();
        file.write_all(b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\"")
            .unwrap();
        s.poll(now);
        assert!(s.facts.busy);
        file.write_all(b"}}\n").unwrap();
        s.poll(now);
        assert!(!s.facts.busy);
        assert!(s.current(now + TERMINAL_MS + 1).is_none());
        fs::write(&path, b"{}\n").unwrap();
        s.poll(now);
        assert!(!s.facts.busy);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn dsh_bridge_is_tiny_fresh_and_never_forwards_extras() {
        let root = temp();
        let file = root.join("dsh.json");
        fs::write(&file,r#"{"version":1,"source":"dsh","updatedAt":10000,"owner":"opaque","busy":true,"phase":"tools","tool":"read_file","turnId":"t","arguments":"secret","message":"secret"}"#).unwrap();
        let a = read_dsh(&file, 11000).unwrap();
        assert_eq!(a.tool.as_deref(), Some("read_file"));
        assert!(!serde_json::to_string(&a).unwrap().contains("secret"));
        assert!(read_dsh(&file, 30000).is_none());
        fs::write(&file, vec![b'x'; 8193]).unwrap();
        assert!(read_dsh(&file, 11000).is_none());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn source_stays_active_and_off_releases_it() {
        let a = Activity {
            source: Some("codex".into()),
            busy: true,
            observed_at: 100,
            ..Activity::default()
        };
        let b = Activity {
            source: Some("dsh".into()),
            busy: true,
            observed_at: 200,
            ..Activity::default()
        };
        assert_eq!(
            select(Follow::Auto, Some(a.clone()), Some(b), &a).source,
            a.source
        );
        assert_eq!(
            select(Follow::Off, Some(a.clone()), None, &a),
            Activity::default()
        );
    }
    #[test]
    fn dates_and_index_find_resumed_old_sessions() {
        assert_eq!(iso_ms("2026-10-20T07:00:00.123456Z"), Some(1792479600123));
        assert_eq!(date_path(1792479600123), "2026/10/20");
        let root = temp();
        let index = root.join("session_index.jsonl");
        let created = iso_ms("2026-08-01T12:00:00Z").unwrap();
        let id = format!("{:012x}70008000000000000000", created);
        fs::write(
            &index,
            format!("{{\"id\":\"{id}\",\"thread_name\":\"private\"}}\n"),
        )
        .unwrap();
        assert_eq!(index_dates(&index), vec!["2026/08/01"]);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn resumed_old_main_session_is_found_without_reading_the_archive() {
        let root = temp();
        let now = now_ms();
        let created = now - 40 * 86_400_000;
        let id = format!("{:012x}70008000000000000000", created);
        let day = root.join("sessions").join(date_path(created));
        fs::create_dir_all(&day).unwrap();
        let file = day.join(format!("rollout-old-{id}.jsonl"));
        let meta="{\"type\":\"session_meta\",\"payload\":{\"source\":\"vscode\",\"originator\":\"Codex Desktop\"}}\n";
        fs::write(&file,format!("{meta}{{\"type\":\"event_msg\",\"payload\":{{\"type\":\"task_started\",\"turn_id\":\"t\"}}}}\n")).unwrap();
        fs::write(
            root.join("session_index.jsonl"),
            format!("{{\"id\":\"{id}\",\"thread_name\":\"private title\"}}\n"),
        )
        .unwrap();
        // An unrelated historical directory must never be traversed.
        fs::create_dir_all(root.join("sessions/2000/01/01")).unwrap();
        fs::write(
            root.join("sessions/2000/01/01/rollout-ignored.jsonl"),
            b"not a transcript",
        )
        .unwrap();
        let mut observer = CodexObserver::new(root.clone());
        assert!(observer.poll(true, now).is_none());
        assert_eq!(observer.sessions.len(), 1);
        let mut append = OpenOptions::new().append(true).open(&file).unwrap();
        append.write_all(b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"user_message\",\"message\":\"\\u4e2d\\u6587 secret\"}}\n{\"type\":\"response_item\",\"payload\":{\"type\":\"reasoning\",\"summary\":[\"secret\"]}}\n").unwrap();
        let activity = observer.poll(true, now + 2).unwrap();
        assert!(activity.busy && activity.chinese_draft);
        assert!(activity.chinese_input_id.is_some());
        assert!(!serde_json::to_string(&activity).unwrap().contains("secret"));
        assert!(observer.poll(false, now + 3).is_none());
        assert!(observer.poll(true, now + 4).is_none());
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn a_large_append_jumps_to_the_new_terminal_and_stale_work_is_unavailable() {
        let root = temp();
        let path = root.join("rollout.jsonl");
        fs::write(
            &path,
            b"{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_started\"}}\n",
        )
        .unwrap();
        let now = now_ms();
        let mut session = Session::new(path.clone());
        session.poll(now);
        assert!(session.current(now).is_none());
        let mut append = OpenOptions::new().append(true).open(&path).unwrap();
        append
            .write_all(b"{\"type\":\"response_item\",\"payload\":{\"type\":\"reasoning\"}}\n")
            .unwrap();
        session.poll(now + 1);
        assert!(session.current(now + 1).unwrap().busy);
        assert!(session.current(now + CODEX_STALE_MS + 100).is_none());
        assert!(session.facts.busy);
        append.write_all(&vec![b'x'; READ_CAP * 4]).unwrap();
        append
            .write_all(b"\n{\"type\":\"event_msg\",\"payload\":{\"type\":\"task_complete\"}}\n")
            .unwrap();
        session.poll(now + 2);
        assert_eq!(session.offset, fs::metadata(&path).unwrap().len());
        assert!(session.pending.len() <= LINE_CAP);
        assert!(!session.facts.busy);
        fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn error_stop_and_waiting_use_metadata_only() {
        let mut session = Session::new(PathBuf::from("rollout"));
        session.apply(
            br#"{"type":"event_msg","payload":{"type":"task_started","turn_id":"t"}}"#,
            false,
            100,
            1,
        );
        session.apply(br#"{"type":"response_item","payload":{"type":"function_call","name":"request_user_input","call_id":"ask","arguments":"private"}}"#,false,101,2);
        assert!(session.facts.awaiting_input);
        session.apply(br#"{"type":"response_item","payload":{"type":"function_call_output","call_id":"ask","output":"private"}}"#,false,102,3);
        assert!(!session.facts.awaiting_input);
        session.apply(br#"{"type":"event_msg","payload":{"type":"task_complete","error":{"message":"private","codex_error_info":"capacity"}}}"#,false,103,4);
        assert!(session.facts.error_id.is_some());
        assert!(!session.facts.busy);
        session.apply(
            br#"{"type":"event_msg","payload":{"type":"task_started","turn_id":"next"}}"#,
            false,
            104,
            5,
        );
        session.apply(
            br#"{"type":"event_msg","payload":{"type":"turn_aborted"}}"#,
            false,
            105,
            6,
        );
        assert_eq!(session.facts.phase, "stopping");
        assert!(!serde_json::to_string(&session.facts)
            .unwrap()
            .contains("private"));
    }
    #[test]
    fn multiple_dsh_processes_do_not_let_idle_steal_busy_work() {
        let root = temp();
        let now = now_ms();
        let write = |id: u8, busy: bool, at: u64| {
            fs::write(root.join(format!("dsh-{id}.json")),format!("{{\"version\":1,\"source\":\"dsh\",\"owner\":\"owner-{id}\",\"updatedAt\":{at},\"busy\":{busy},\"phase\":\"thinking\"}}")).unwrap()
        };
        write(1, true, now - 100);
        write(2, false, now);
        let mut observer = DshObserver::default();
        let first = observer.poll(&root, now).unwrap();
        assert!(first.busy);
        write(2, true, now + 1);
        assert_eq!(observer.poll(&root, now + 1).unwrap().owner, first.owner);
        write(1, false, now + 2);
        assert_ne!(observer.poll(&root, now + 2).unwrap().owner, first.owner);
        assert!(observer.poll(&root, now + BRIDGE_STALE_MS + 10).is_none());
        fs::remove_dir_all(root).unwrap();
    }
}

#[derive(Default)]
pub struct DshObserver {
    selected: Option<String>,
}
impl DshObserver {
    pub fn poll(&mut self, directory: &Path, now: u64) -> Option<Activity> {
        let mut files = Vec::new();
        for entry in fs::read_dir(directory).ok()?.take(256).flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            let owned = name == "dsh.json"
                || name
                    .strip_prefix("dsh-")
                    .and_then(|n| n.strip_suffix(".json"))
                    .is_some_and(|n| {
                        !n.is_empty() && n.len() <= 10 && n.bytes().all(|b| b.is_ascii_digit())
                    });
            if !owned {
                continue;
            }
            if let Ok(metadata) = entry.metadata() {
                let modified = metadata.modified().map(epoch_ms).unwrap_or(0);
                if metadata.is_file()
                    && metadata.len() <= 8192
                    && now.saturating_sub(modified) <= BRIDGE_STALE_MS
                {
                    files.push((modified, entry.path()));
                }
            }
        }
        files.sort_by(|a, b| b.0.cmp(&a.0));
        let facts: Vec<_> = files
            .into_iter()
            .take(16)
            .filter_map(|(_, path)| read_dsh(&path, now))
            .collect();
        let selected = facts
            .iter()
            .find(|a| a.owner == self.selected && (a.busy || a.awaiting_input))
            .cloned()
            .or_else(|| {
                facts
                    .into_iter()
                    .max_by_key(|a| (a.busy || a.awaiting_input, a.observed_at))
            });
        self.selected = selected.as_ref().and_then(|a| a.owner.clone());
        selected
    }
}

/// Fixed metadata scenarios exercise the production event bridge, never actions.
pub fn smoke_scenario(name: &str, previous: &Activity, now: u64) -> Option<Activity> {
    let mut a = Activity {
        source: Some("codex".into()),
        owner: Some("smoke-owner".into()),
        observed_at: now,
        turn_id: Some("smoke-turn".into()),
        ..Activity::default()
    };
    match name {
        "thinking" => {
            a.busy = true;
            a.phase = "thinking".into();
        }
        "tools" => {
            a.source = Some("dsh".into());
            a.owner = Some("smoke-dsh-owner".into());
            a.busy = true;
            a.phase = "tools".into();
            a.tool = Some("read_file".into());
            a.tool_id = Some("smoke-tool".into());
        }
        "awaiting" => {
            a.source = Some("dsh".into());
            a.owner = Some("smoke-dsh-owner".into());
            a.busy = true;
            a.awaiting_input = true;
        }
        "responding" => {
            a.busy = true;
            a.phase = "responding".into();
        }
        "completed" => {
            a.turn_id = previous.turn_id.clone().or(a.turn_id);
        }
        "stopping" => {
            a.phase = "stopping".into();
        }
        "error" => {
            a.error_id = Some("smoke-error".into());
        }
        "idle" => {
            a = Activity::default();
        }
        "chinese" => {
            a.chinese_draft = true;
            a.chinese_input_id = Some(format!("smoke-input:{now}"));
        }
        _ => return None,
    }
    Some(a)
}
