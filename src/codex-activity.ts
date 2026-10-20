import type {Activity} from './policy';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const identifier = (value: unknown): string | undefined => typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
const text = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
const chinese = /[\u3400-\u9fff\uf900-\ufaff]/u;
const inputRequests = new Set([
 'item/tool/requestUserInput', 'item/commandExecution/requestApproval',
 'item/fileChange/requestApproval', 'item/permissions/requestApproval',
 'mcpServer/elicitation/request', 'item/plan/requestImplementation',
]);

/** The wrapper is native overlay j_'s {state, latestTurn, turnCount}. */
export type CodexActivitySource = {key: string; thread: unknown; awaitingInput?: boolean};
export type CodexSourceSelection = {key?: string; conversationId?: string; hostId?: string};
export type CodexActivityOptions = {awaitingInput?: boolean; chineseDraft?: boolean};

/** Called with current composer content; this helper returns only a boolean. */
export function hasChineseDraft(value: unknown) { return typeof value === 'string' && chinese.test(value); }

function activeTool(item: RecordValue): Pick<Activity, 'tool' | 'toolId'> | undefined {
 if (item.status !== 'inProgress') return;
 const toolId = identifier(item.id);
 if (item.type === 'commandExecution') {
  const action = record(list(item.commandActions).at(-1));
  // Native app-server tags, before lmn converts listFiles to list_files.
  const tool = action.type === 'read' ? 'read' : action.type === 'listFiles' ? 'list' : action.type === 'search' ? 'search' : 'exec';
  return {tool, toolId};
 }
 if (item.type === 'fileChange') return {tool: 'edit', toolId};
 if (item.type === 'mcpToolCall' || item.type === 'dynamicToolCall') return {tool: text(item.tool)?.slice(0, 160) ?? 'tool', toolId};
 if (item.type === 'webSearch') return {tool: 'search', toolId};
}

/**
 * Pure projection of native state. It never reads a transcript file or returns
 * prompts, reasoning, error messages, paths, commands, arguments or tool output.
 * ip's resolved waiting result can be supplied to retain native request grouping.
 */
export function activityFromCodex(input: unknown, options: CodexActivityOptions = {}): Activity {
 const thread = record(input), state = record(thread.state), summary = record(state.summary);
 const turn = record(thread.latestTurn), items = list(turn.items).map(record), last = items.at(-1);
 const status = text(turn.status) ?? text(state.latestTurnStatus);
 const runtime = record(summary.threadRuntimeStatus), flags = list(runtime.activeFlags);
 const needsResume = state.resumeState === 'needs_resume';
 const submitting = summary.hasPendingTurnSubmission === true || turn.pendingUserMessageAdmission != null;
 const sleeping = status === 'inProgress' && last?.type === 'sleep' && !submitting;
 const running = needsResume ? runtime.type === 'active' : state.resumeState === 'resuming' || state.isConversationInProgress === true || status === 'inProgress';
 const awaitingInput = options.awaitingInput === true || flags.includes('waitingOnUserInput') || flags.includes('waitingOnApproval') || list(state.requests).some(value => inputRequests.has(String(record(value).method)));
 const failed = needsResume ? runtime.type === 'systemError' : status === 'failed';
 const interrupted = status === 'interrupted';
 const busy = awaitingInput || submitting || !failed && !interrupted && !sleeping && running;
 const turnId = [identifier(summary.hostId) ?? 'local', identifier(summary.conversationId) ?? 'unknown', identifier(turn.turnId) ?? identifier(state.latestTurnId) ?? identifier(thread.turnCount) ?? 'pending'].join('/');
 // A submitted historical user message is not a live composer draft. The draft
 // observer must supply this boolean; never infer it from transcript contents.
 const result: Activity = {busy, phase: 'thinking', turnId, chineseDraft: options.chineseDraft ?? false};
 if (awaitingInput) return {...result, awaitingInput: true};
 // A new unconfirmed submission can coexist briefly with the prior failed or
 // interrupted turn. Its admission must win over that historical terminal state.
 if (submitting) return {...result, phase: 'sending'};
 if (failed) return {...result, busy: false, errorId: turnId + ':failed'};
 if (interrupted) return {...result, busy: false, phase: 'stopping'};
 // hasUnreadTurn is a result notification, never an active review operation.
 if (!busy) return result;
 if (turn.turnId == null && state.isConversationInProgress === true && !items.length) return {...result, phase: 'sending'};
 if (state.resumeState === 'resuming') return {...result, phase: 'preparing'};
 if (last?.type === 'error' && last.willRetry === true) return {...result, phase: 'retrying'};
 for (let index = items.length - 1; index >= 0; index--) {
  const tool = activeTool(items[index]);
  if (tool) return {...result, phase: 'tools', ...tool};
 }
 for (let index = items.length - 1; index >= 0; index--) {
  if (items[index].type === 'agentMessage') return {...result, phase: 'responding'};
  if (items[index].type === 'reasoning') return result;
  if (items[index].type === 'userMessage' || items[index].type === 'steeringUserMessage') return {...result, phase: 'preparing'};
 }
 return result;
}

/**
 * Follow the native window's chosen source, rather than choosing an unrelated
 * task by recency. In Qg, the current mascot notification is notifications[0]
 * (minified `_ [0]`), whose native key/localConversationId identifies ip's source.
 * A missing explicit selection stays idle instead of silently changing tasks.
 */
export function activityForCodexSource(sources: readonly CodexActivitySource[], selection: CodexSourceSelection | null | undefined, options: CodexActivityOptions = {}): Activity {
 if (!selection) return {busy: false, phase: 'thinking', chineseDraft: options.chineseDraft};
 const matches = selection.key ? sources.filter(source => source.key === selection.key) : sources.filter(source => {
  const summary = record(record(record(source.thread).state).summary);
  return selection.conversationId != null && identifier(summary.conversationId) === selection.conversationId && (selection.hostId == null || (identifier(summary.hostId) ?? 'local') === selection.hostId);
 });
 // Conversation IDs can overlap across remote hosts. Never guess between them.
 const selected = matches.length === 1 ? matches[0] : undefined;
 return selected ? activityFromCodex(selected.thread, {...options, awaitingInput: selected.awaitingInput ?? options.awaitingInput}) : {busy: false, phase: 'thinking', chineseDraft: options.chineseDraft};
}
