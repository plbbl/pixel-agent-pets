use crate::activity::Follow;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
pub struct Action {
    pub id: String,
    pub title: String,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Character {
    pub id: String,
    pub title: String,
    pub actions: Vec<Action>,
}
#[derive(Clone, Debug, Deserialize)]
pub struct Catalog {
    pub characters: Vec<Character>,
    pub animations: usize,
}
impl Catalog {
    pub fn character(&self, id: &str) -> Option<&Character> {
        self.characters.iter().find(|c| c.id == id)
    }
    pub fn action(&self, character: &str, id: &str) -> bool {
        self.character(character)
            .is_some_and(|c| c.actions.iter().any(|a| a.id == id))
    }
}
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq)]
pub struct PetPosition {
    pub x: i32,
    pub y: i32,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct Preferences {
    pub character: String,
    pub size: u16,
    pub quality: String,
    pub visible: bool,
    pub position: Option<PetPosition>,
    pub follow: Follow,
}
impl Default for Preferences {
    fn default() -> Self {
        Self {
            character: "claude".into(),
            size: 160,
            quality: "auto".into(),
            visible: true,
            position: None,
            follow: Follow::Auto,
        }
    }
}
impl Preferences {
    pub fn valid(&self, catalog: &Catalog) -> bool {
        catalog.character(&self.character).is_some()
            && [80, 112, 160, 224].contains(&self.size)
            && ["auto", "80", "160", "320"].contains(&self.quality.as_str())
    }
}
#[derive(Clone, Debug, PartialEq)]
pub enum Selection {
    Character(String),
    Action(String),
    Showcase,
    Size(u16),
    Quality(String),
    Follow(Follow),
    Visibility,
    Quit,
}
pub fn selection(id: &str, prefs: &Preferences, catalog: &Catalog) -> Option<Selection> {
    if id == "showcase" {
        return Some(Selection::Showcase);
    }
    if id == "visible" {
        return Some(Selection::Visibility);
    }
    if id == "quit" {
        return Some(Selection::Quit);
    }
    let (kind, value) = id.split_once(':')?;
    match kind {
        "character" if catalog.character(value).is_some() => {
            Some(Selection::Character(value.into()))
        }
        "action" if catalog.action(&prefs.character, value) => {
            Some(Selection::Action(value.into()))
        }
        "size" => {
            let size = value.parse::<u16>().ok()?;
            ([80, 112, 160, 224].contains(&size) && size.to_string() == value)
                .then_some(Selection::Size(size))
        }
        "quality" if ["auto", "80", "160", "320"].contains(&value) => {
            Some(Selection::Quality(value.into()))
        }
        "follow" => Follow::parse(value).map(Selection::Follow),
        _ => None,
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DrawCheck {
    pub character: String,
    pub quality: String,
    pub resolution: u16,
    pub action: String,
    #[serde(rename = "drawnPixels")]
    pub drawn_pixels: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BehaviorCheck {
    pub scenario: String,
    pub source: Option<String>,
    pub mode: String,
    pub action: String,
    pub drawn_pixels: u32,
}
pub fn behavior_checks(catalog: &Catalog, checks: &[BehaviorCheck]) -> bool {
    let names = [
        "thinking",
        "tools",
        "awaiting",
        "responding",
        "completed",
        "stopping",
        "mouse-pet",
        "mouse-hover",
        "mouse-wake",
        "drag-land",
        "auto-story",
        "chinese",
    ];
    checks.len() == names.len()
        && names
            .iter()
            .all(|name| checks.iter().any(|c| c.scenario == *name))
        && checks.iter().all(|c| {
            c.drawn_pixels > 0
                && c.drawn_pixels <= 2048 * 2048
                && c.source
                    .as_deref()
                    .is_none_or(|s| ["codex", "dsh"].contains(&s))
                && [
                    "idle",
                    "greeting",
                    "autonomous",
                    "interaction",
                    "manual",
                    "work",
                    "feedback",
                    "sleep",
                ]
                .contains(&c.mode.as_str())
                && catalog
                    .characters
                    .iter()
                    .any(|character| catalog.action(&character.id, &c.action))
        })
        && checks.iter().any(|c| c.source.as_deref() == Some("codex"))
        && checks.iter().any(|c| c.source.as_deref() == Some("dsh"))
}
pub fn smoke_checks(catalog: &Catalog, checks: &[DrawCheck]) -> bool {
    checks.len() == 16
        && checks.iter().all(|c| {
            catalog.action(&c.character, &c.action)
                && c.drawn_pixels > 0
                && c.drawn_pixels <= 2048 * 2048
                && if c.character == "clawd" {
                    c.resolution == 80
                } else {
                    match c.quality.as_str() {
                        "auto" => [80, 160, 320].contains(&c.resolution),
                        "80" => c.resolution == 80,
                        "160" => c.resolution == 160,
                        "320" => c.resolution == 320,
                        _ => false,
                    }
                }
        })
        && catalog.characters.iter().all(|character| {
            ["auto", "80", "160", "320"].iter().all(|quality| {
                checks
                    .iter()
                    .any(|c| c.character == character.id && c.quality == *quality)
            })
        })
}
pub fn clamp_position(
    position: PetPosition,
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
    width: i32,
    height: i32,
) -> PetPosition {
    PetPosition {
        x: position.x.clamp(left, (right - width).max(left)),
        y: position.y.clamp(top, (bottom - height).max(top)),
    }
}
pub fn actor_hit(x: f64, y: f64, width: f64, size: f64) -> bool {
    x.is_finite()
        && y.is_finite()
        && x >= width / 2.0 - size * 0.8
        && x <= width / 2.0 + size * 0.8
        && y >= 42.0
        && y <= 42.0 + size
}
pub fn fit_origin(
    old_x: f64,
    old_y: f64,
    old_width: f64,
    old_baseline: f64,
    width: f64,
    baseline: f64,
) -> (f64, f64) {
    (
        old_x + old_width / 2.0 - width / 2.0,
        old_y + old_baseline - baseline,
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    fn catalog() -> Catalog {
        serde_json::from_str(include_str!("../generated/catalog.json")).unwrap()
    }
    #[test]
    fn all_actions_are_native_menu_choices() {
        let c = catalog();
        assert_eq!(c.animations, 66);
        assert_eq!(c.characters.len(), 4);
        for character in &c.characters {
            let p = Preferences {
                character: character.id.clone(),
                ..Default::default()
            };
            for action in &character.actions {
                assert_eq!(
                    selection(&format!("action:{}", action.id), &p, &c),
                    Some(Selection::Action(action.id.clone()))
                );
            }
        }
    }
    #[test]
    fn forged_actions_and_invalid_preferences_fail_closed() {
        let c = catalog();
        let p = Preferences::default();
        for value in [
            "action:../../file",
            "character:unknown",
            "size:0160",
            "size:0",
            "quality:720",
            "action:rice",
        ] {
            assert_eq!(selection(value, &p, &c), None);
        }
        assert!(p.valid(&c));
        assert!(!Preferences {
            size: 999,
            ..p.clone()
        }
        .valid(&c));
        assert!(!Preferences {
            quality: "unlimited".into(),
            ..p
        }
        .valid(&c));
    }
    #[test]
    fn smoke_requires_all_roles_and_quality_frames() {
        let c = catalog();
        let mut checks = Vec::new();
        for role in &c.characters {
            for quality in ["auto", "80", "160", "320"] {
                checks.push(DrawCheck {
                    character: role.id.clone(),
                    quality: quality.into(),
                    resolution: if role.id == "clawd" {
                        80
                    } else {
                        quality.parse().unwrap_or(160)
                    },
                    action: role.actions[0].id.clone(),
                    drawn_pixels: 100,
                });
            }
        }
        assert!(smoke_checks(&c, &checks));
        checks[0].drawn_pixels = 0;
        assert!(!smoke_checks(&c, &checks));
        checks.remove(0);
        assert!(!smoke_checks(&c, &checks));
    }
    #[test]
    fn saved_positions_stay_on_the_current_monitor() {
        assert_eq!(
            clamp_position(
                PetPosition { x: 2500, y: -100 },
                0,
                24,
                1920,
                1040,
                272,
                214
            ),
            PetPosition { x: 1648, y: 24 }
        );
        assert_eq!(
            clamp_position(
                PetPosition { x: -1400, y: 300 },
                -1920,
                24,
                0,
                1080,
                272,
                214
            ),
            PetPosition { x: -1400, y: 300 }
        );
        let prefs: Preferences = serde_json::from_str(
            r#"{"character":"gpt","size":224,"quality":"320","position":{"x":-1400,"y":300}}"#,
        )
        .unwrap();
        assert_eq!(prefs.position, Some(PetPosition { x: -1400, y: 300 }));
    }
    #[test]
    fn transparent_padding_does_not_capture_clicks() {
        assert!(actor_hit(128.0, 100.0, 256.0, 80.0));
        assert!(!actor_hit(10.0, 100.0, 256.0, 80.0));
        assert!(!actor_hit(128.0, 20.0, 256.0, 80.0));
        assert!(!actor_hit(f64::NAN, 100.0, 256.0, 80.0));
    }
    #[test]
    fn resize_keeps_actor_feet_fixed() {
        let (x, y) = fit_origin(400.0, 500.0, 272.0, 176.0, 528.0, 310.0);
        assert_eq!(x + 528.0 / 2.0, 536.0);
        assert_eq!(y + 310.0, 676.0);
    }
}

#[derive(Default)]
pub struct DragTracker {
    gesture: Option<Gesture>,
}
struct Gesture {
    x: i32,
    y: i32,
    last_x: i32,
    last_y: i32,
    scale: f64,
    started: u64,
    moved_at: u64,
}
impl DragTracker {
    pub fn start(&mut self, x: i32, y: i32, scale: f64, now: u64) {
        self.gesture = (scale.is_finite() && scale > 0.0).then_some(Gesture {
            x,
            y,
            last_x: x,
            last_y: y,
            scale,
            started: now,
            moved_at: now,
        });
    }
    pub fn active(&self) -> bool {
        self.gesture.is_some()
    }
    pub fn moved(&mut self, x: i32, y: i32, now: u64) {
        if let Some(g) = self.gesture.as_mut() {
            if x != g.last_x || y != g.last_y {
                g.last_x = x;
                g.last_y = y;
                g.moved_at = now;
            }
        }
    }
    pub fn cancel(&mut self) -> Option<f64> {
        self.gesture.take().map(|_| 0.0)
    }
    pub fn finish(&mut self, now: u64, pressed: Option<bool>) -> Option<f64> {
        let g = self.gesture.as_ref()?;
        let moved = g.x != g.last_x || g.y != g.last_y;
        // Silence is not release: a user may hold the pet still for seconds.
        if pressed == Some(true) {
            return None;
        }
        if pressed.is_none()
            && if moved {
                now.saturating_sub(g.moved_at) < 250
            } else {
                now.saturating_sub(g.started) < 1500
            }
        {
            return None;
        }
        let g = self.gesture.take()?;
        Some(
            ((g.last_x as f64 - g.x as f64).hypot(g.last_y as f64 - g.y as f64) / g.scale)
                .min(10_000.0),
        )
    }
}
#[cfg(test)]
mod drag_tests {
    use super::*;
    #[test]
    fn only_an_owned_drag_ends_once_and_preserves_logical_distance() {
        let mut drag = DragTracker::default();
        drag.moved(200, 100, 0);
        assert!(!drag.active());
        assert_eq!(drag.finish(500, Some(false)), None);
        drag.start(0, 0, 2.0, 1000);
        drag.moved(200, 0, 1050);
        assert_eq!(drag.finish(1299, Some(true)), None);
        assert_eq!(drag.finish(2050, Some(true)), None);
        assert_eq!(drag.finish(2100, Some(false)), Some(100.0));
        assert!(!drag.active());
        assert_eq!(drag.finish(5000, Some(false)), None);
    }
    #[test]
    fn no_move_cancel_and_failed_start_cannot_stick() {
        let mut drag = DragTracker::default();
        drag.start(20, 20, 1.0, 100);
        assert_eq!(drag.finish(1599, None), None);
        assert_eq!(drag.finish(1600, None), Some(0.0));
        drag.start(20, 20, 1.0, 2000);
        assert_eq!(drag.cancel(), Some(0.0));
        assert!(!drag.active());
        assert_eq!(drag.finish(9999, Some(false)), None);
        drag.start(0, 0, f64::NAN, 10_000);
        assert!(!drag.active());
    }
}

#[cfg(test)]
mod activity_menu_tests {
    use super::*;
    #[test]
    fn follow_is_backwards_compatible_and_rejects_unknown_targets() {
        let p: Preferences =
            serde_json::from_str(r#"{"character":"claude","size":160,"quality":"auto"}"#).unwrap();
        assert_eq!(p.follow, Follow::Auto);
        let catalog: Catalog =
            serde_json::from_str(include_str!("../generated/catalog.json")).unwrap();
        assert_eq!(
            selection("follow:off", &p, &catalog),
            Some(Selection::Follow(Follow::Off))
        );
        assert_eq!(selection("follow:untrusted", &p, &catalog), None);
    }
    #[test]
    fn smoke_behavior_requires_all_real_scenarios_and_both_sources() {
        let catalog: Catalog =
            serde_json::from_str(include_str!("../generated/catalog.json")).unwrap();
        let mut checks: Vec<_> = [
            "thinking",
            "tools",
            "awaiting",
            "responding",
            "completed",
            "stopping",
            "mouse-pet",
            "mouse-hover",
            "mouse-wake",
            "drag-land",
            "auto-story",
            "chinese",
        ]
        .into_iter()
        .map(|scenario| BehaviorCheck {
            scenario: scenario.into(),
            source: Some(if scenario == "tools" { "dsh" } else { "codex" }.into()),
            mode: "work".into(),
            action: "idle".into(),
            drawn_pixels: 100,
        })
        .collect();
        assert!(behavior_checks(&catalog, &checks));
        checks[0].drawn_pixels = 0;
        assert!(!behavior_checks(&catalog, &checks));
        checks[0].drawn_pixels = 100;
        checks[1].source = Some("codex".into());
        assert!(!behavior_checks(&catalog, &checks));
        checks[1].source = Some("dsh".into());
        checks[1].scenario = "thinking".into();
        assert!(!behavior_checks(&catalog, &checks));
    }
}
