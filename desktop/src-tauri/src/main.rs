#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod model;
use model::{Catalog, Preferences, Selection};
use serde::Serialize;
use serde_json::{json, Value};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu},
    tray::TrayIconBuilder,
    Emitter, LogicalPosition, LogicalSize, Manager,
};

struct PetState {
    catalog: Catalog,
    preferences: Mutex<Preferences>,
    preferences_file: PathBuf,
    baseline: Mutex<f64>,
    ready: AtomicBool,
    drawn: AtomicBool,
    position_dirty: AtomicBool,
    smoke_progress: Mutex<Vec<model::DrawCheck>>,
    smoke: Option<PathBuf>,
}
fn error(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn lock_preferences(state: &PetState) -> Result<Preferences, String> {
    state.preferences.lock().map(|p| p.clone()).map_err(error)
}
fn save(state: &PetState, prefs: &Preferences) -> Result<(), String> {
    if state.smoke.is_some() {
        return Ok(());
    }
    if let Some(parent) = state.preferences_file.parent() {
        fs::create_dir_all(parent).map_err(error)?;
    }
    let stage = state.preferences_file.with_extension("tmp");
    fs::write(&stage, serde_json::to_vec(prefs).map_err(error)?).map_err(error)?;
    fs::rename(stage, &state.preferences_file).map_err(error)
}
fn emit(app: &tauri::AppHandle, kind: &str, value: Value) -> Result<(), String> {
    app.emit_to("pet", "pet:command", json!({"type":kind,"value":value}))
        .map_err(error)
}
fn native_menu(app: &tauri::AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let state = app.state::<PetState>();
    let prefs = state
        .preferences
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .clone();
    let roles = Submenu::new(app, "切换宠物", true)?;
    for c in &state.catalog.characters {
        roles.append(&CheckMenuItem::with_id(
            app,
            format!("character:{}", c.id),
            &c.title,
            true,
            c.id == prefs.character,
            None::<&str>,
        )?)?;
    }
    let actions = Submenu::new(app, "完整动作库", true)?;
    if let Some(c) = state.catalog.character(&prefs.character) {
        for a in &c.actions {
            actions.append(&MenuItem::with_id(
                app,
                format!("action:{}", a.id),
                &a.title,
                true,
                None::<&str>,
            )?)?;
        }
    }
    let sizes = Submenu::new(app, "大小", true)?;
    for size in [80, 112, 160, 224] {
        sizes.append(&CheckMenuItem::with_id(
            app,
            format!("size:{size}"),
            format!("{size} px"),
            true,
            size == prefs.size,
            None::<&str>,
        )?)?;
    }
    let quality = Submenu::new(app, "清晰度", true)?;
    for (value, title) in [
        ("auto", "自动（按屏幕选择）"),
        ("80", "80 px · 原像素"),
        ("160", "160 px"),
        ("320", "320 px · 清晰"),
    ] {
        quality.append(&CheckMenuItem::with_id(
            app,
            format!("quality:{value}"),
            title,
            true,
            value == prefs.quality,
            None::<&str>,
        )?)?;
    }
    let story = MenuItem::with_id(app, "showcase", "完整演出", true, None::<&str>)?;
    let visible = MenuItem::with_id(
        app,
        "visible",
        if prefs.visible {
            "隐藏桌宠"
        } else {
            "显示桌宠"
        },
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, "quit", "退出抱抱龙桌宠", true, None::<&str>)?;
    Menu::with_items(
        app,
        &[
            &roles,
            &actions,
            &story,
            &sizes,
            &quality,
            &PredefinedMenuItem::separator(app)?,
            &visible,
            &quit,
        ],
    )
}
fn refresh_menu(app: &tauri::AppHandle) -> Result<(), String> {
    if let Some(tray) = app.tray_by_id("pet-tray") {
        tray.set_menu(Some(native_menu(app).map_err(error)?))
            .map_err(error)?;
    }
    Ok(())
}
fn set_visible(app: &tauri::AppHandle, visible: bool) -> Result<(), String> {
    let state = app.state::<PetState>();
    let mut prefs = state.preferences.lock().map_err(error)?;
    prefs.visible = visible;
    save(&state, &prefs)?;
    drop(prefs);
    if let Some(window) = app.get_webview_window("pet") {
        if visible {
            window.show().map_err(error)?;
        } else {
            window.hide().map_err(error)?;
        }
    }
    emit(app, "visible", json!(visible))?;
    refresh_menu(app)
}
fn menu_selected(app: &tauri::AppHandle, id: &str) -> Result<(), String> {
    let state = app.state::<PetState>();
    let before = lock_preferences(&state)?;
    let command = model::selection(id, &before, &state.catalog).ok_or("Unknown pet menu action")?;
    match command {
        Selection::Quit => app.exit(0),
        Selection::Visibility => return set_visible(app, !before.visible),
        Selection::Action(action) => emit(app, "action", json!(action))?,
        Selection::Showcase => emit(app, "showcase", json!("full"))?,
        other => {
            let mut next = before;
            let (kind, value) = match other {
                Selection::Character(c) => {
                    next.character = c.clone();
                    ("character", json!(c))
                }
                Selection::Size(n) => {
                    next.size = n;
                    ("size", json!(n))
                }
                Selection::Quality(q) => {
                    next.quality = q.clone();
                    ("quality", json!(q))
                }
                _ => unreachable!(),
            };
            save(&state, &next)?;
            *state.preferences.lock().map_err(error)? = next;
            emit(app, kind, value)?;
            refresh_menu(app)?;
        }
    }
    Ok(())
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FrontendConfig {
    #[serde(flatten)]
    preferences: Preferences,
    smoke_test: bool,
    characters: usize,
    animations: usize,
}
#[tauri::command]
fn frontend_ready(
    app: tauri::AppHandle,
    state: tauri::State<'_, PetState>,
) -> Result<FrontendConfig, String> {
    let preferences = lock_preferences(&state)?;
    if preferences.visible || state.smoke.is_some() {
        if let Some(window) = app.get_webview_window("pet") {
            window.show().map_err(error)?;
        }
    }
    state.ready.store(true, Ordering::SeqCst);
    Ok(FrontendConfig {
        preferences,
        smoke_test: state.smoke.is_some(),
        characters: state.catalog.characters.len(),
        animations: state.catalog.animations,
    })
}
fn write_report(file: &Path, value: Value) -> Result<(), String> {
    if let Some(parent) = file.parent() {
        fs::create_dir_all(parent).map_err(error)?;
    }
    fs::write(file, serde_json::to_vec_pretty(&value).map_err(error)?).map_err(error)
}
#[tauri::command]
fn pet_drawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, PetState>,
    character: String,
    action: String,
    width: u32,
    height: u32,
    drawn_pixels: u32,
    checks: Option<Vec<model::DrawCheck>>,
) -> Result<(), String> {
    if !state.ready.load(Ordering::SeqCst)
        || !state.catalog.action(&character, &action)
        || width == 0
        || height == 0
        || width > 2048
        || height > 2048
        || drawn_pixels == 0
        || drawn_pixels as u64 > width as u64 * height as u64
    {
        return Err("A real nonblank pet frame is required".into());
    }
    if state.drawn.load(Ordering::SeqCst) {
        return Ok(());
    }
    if let Some(report) = &state.smoke {
        if !checks
            .as_deref()
            .is_some_and(|checks| model::smoke_checks(&state.catalog, checks))
        {
            return Err("All four pets and quality levels must draw in smoke mode".into());
        }
        write_report(
            report,
            json!({"ok":true,"frontendReady":true,"frameDrawn":true,"character":character,"action":action,"width":width,"height":height,"drawnPixels":drawn_pixels,"characters":state.catalog.characters.len(),"animations":state.catalog.animations,"platform":std::env::consts::OS,"version":env!("CARGO_PKG_VERSION"),"checks":checks,"timestamp":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()}),
        )?;
        state.drawn.store(true, Ordering::SeqCst);
        app.exit(0);
    } else if lock_preferences(&state)?.visible {
        if let Some(window) = app.get_webview_window("pet") {
            window.show().map_err(error)?;
        }
    }
    state.drawn.store(true, Ordering::SeqCst);
    Ok(())
}
#[tauri::command]
fn frontend_error(
    app: tauri::AppHandle,
    state: tauri::State<'_, PetState>,
    message: String,
) -> Result<(), String> {
    if let Some(report) = &state.smoke {
        write_report(
            report,
            json!({"ok":false,"frontendReady":state.ready.load(Ordering::SeqCst),"frameDrawn":false,"reason":message.chars().take(1000).collect::<String>(),"checks":state.smoke_progress.lock().map_err(error)?.clone(),"platform":std::env::consts::OS}),
        )?;
        app.exit(1);
    } else {
        eprintln!("Pet frontend: {message}");
    }
    Ok(())
}
#[tauri::command]
fn smoke_progress(
    state: tauri::State<'_, PetState>,
    check: model::DrawCheck,
) -> Result<(), String> {
    if state.smoke.is_none() {
        return Ok(());
    }
    let mut progress = state.smoke_progress.lock().map_err(error)?;
    if progress.len() < 16 {
        progress.push(check);
    }
    Ok(())
}
#[tauri::command]
fn start_dragging(window: tauri::WebviewWindow) -> Result<(), String> {
    window.start_dragging().map_err(error)
}
#[tauri::command]
fn open_pet_menu(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    x: f64,
    y: f64,
) -> Result<(), String> {
    if !x.is_finite() || !y.is_finite() || x < 0.0 || y < 0.0 || x > 2048.0 || y > 2048.0 {
        return Err("Invalid menu position".into());
    }
    window
        .popup_menu_at(
            &native_menu(&app).map_err(error)?,
            LogicalPosition::new(x, y),
        )
        .map_err(error)
}
#[tauri::command]
fn sync_preferences(
    app: tauri::AppHandle,
    state: tauri::State<'_, PetState>,
    character: String,
    size: u16,
    quality: String,
) -> Result<Preferences, String> {
    let previous = lock_preferences(&state)?;
    let next = Preferences {
        character,
        size,
        quality,
        visible: previous.visible,
        position: previous.position,
    };
    if !next.valid(&state.catalog) {
        return Err("Unsupported pet preferences".into());
    }
    save(&state, &next)?;
    *state.preferences.lock().map_err(error)? = next.clone();
    refresh_menu(&app)?;
    Ok(next)
}
#[tauri::command]
fn window_fit(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, PetState>,
    width: f64,
    height: f64,
    baseline: f64,
) -> Result<(), String> {
    if ![width, height, baseline].iter().all(|v| v.is_finite())
        || !(128.0..=768.0).contains(&width)
        || !(80.0..=640.0).contains(&height)
        || baseline < 0.0
        || baseline > height
    {
        return Err("Unsupported pet window geometry".into());
    }
    let scale = window.scale_factor().map_err(error)?;
    let old = window.inner_size().map_err(error)?.to_logical::<f64>(scale);
    let position = window
        .outer_position()
        .map_err(error)?
        .to_logical::<f64>(scale);
    let mut prior = state.baseline.lock().map_err(error)?;
    let (mut x, mut y) =
        model::fit_origin(position.x, position.y, old.width, *prior, width, baseline);
    if let Some(monitor) = window.current_monitor().map_err(error)? {
        let area = monitor.work_area();
        let left = area.position.x as f64 / scale;
        let top = area.position.y as f64 / scale;
        let right = (area.position.x as f64 + area.size.width as f64) / scale;
        let bottom = (area.position.y as f64 + area.size.height as f64) / scale;
        x = x.clamp(left, (right - width).max(left));
        y = y.clamp(top, (bottom - height).max(top));
    }
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(error)?;
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(error)?;
    *prior = baseline;
    Ok(())
}
fn cursor_passthrough(app: tauri::AppHandle) {
    std::thread::spawn(move || {
        let mut last = None;
        let mut tick = 0_u8;
        loop {
            std::thread::sleep(Duration::from_millis(80));
            let Some(window) = app.get_webview_window("pet") else {
                break;
            };
            let state = app.state::<PetState>();
            if state.smoke.is_some() {
                break;
            }
            tick = (tick + 1) % 10;
            if tick == 0 && state.position_dirty.swap(false, Ordering::SeqCst) {
                if let Ok(prefs) = lock_preferences(&state) {
                    let _ = save(&state, &prefs);
                }
            }
            let Ok(prefs) = lock_preferences(&state) else {
                continue;
            };
            if !prefs.visible {
                continue;
            }
            let (Ok(cursor), Ok(position), Ok(scale), Ok(size)) = (
                app.cursor_position(),
                window.outer_position(),
                window.scale_factor(),
                window.inner_size(),
            ) else {
                continue;
            };
            let inside = model::actor_hit(
                (cursor.x - position.x as f64) / scale,
                (cursor.y - position.y as f64) / scale,
                size.width as f64 / scale,
                prefs.size as f64,
            );
            if last != Some(inside) && window.set_ignore_cursor_events(!inside).is_ok() {
                last = Some(inside);
            }
        }
    });
}
fn smoke_argument() -> Option<PathBuf> {
    let args: Vec<String> = std::env::args().collect();
    args.iter()
        .position(|a| a == "--smoke-test")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("BAOBAOLONG_SMOKE_REPORT").map(PathBuf::from))
}
fn main() {
    let smoke = smoke_argument();
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![frontend_ready,pet_drawn,start_dragging,open_pet_menu,sync_preferences,window_fit,frontend_error,smoke_progress])
        .setup(move |app| {
            #[cfg(target_os="macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let catalog:Catalog=serde_json::from_str(include_str!("../generated/catalog.json"))?;
            let file=app.path().app_config_dir()?.join("preferences.json");
            let preferences=if smoke.is_some(){Preferences::default()}else{fs::read(&file).ok().and_then(|bytes|serde_json::from_slice::<Preferences>(&bytes).ok()).filter(|p|p.valid(&catalog)).unwrap_or_default()};
            app.manage(PetState{catalog,preferences:Mutex::new(preferences.clone()),preferences_file:file,baseline:Mutex::new(42.0+preferences.size as f64*67.0/80.0),ready:AtomicBool::new(false),drawn:AtomicBool::new(false),position_dirty:AtomicBool::new(false),smoke_progress:Mutex::new(Vec::new()),smoke:smoke.clone()});
            let window=app.get_webview_window("pet").ok_or("Missing pet window")?;window.set_focusable(false)?;window.set_always_on_top(true)?;
            let width=(preferences.size as f64*1.6+16.0).ceil().max(256.0);let height=preferences.size as f64+54.0;window.set_size(LogicalSize::new(width,height))?;
            let monitors=window.available_monitors()?;
            let restored=preferences.position.and_then(|position|monitors.iter().find(|monitor|{let area=monitor.work_area();position.x>=area.position.x && position.y>=area.position.y && position.x<area.position.x+area.size.width as i32 && position.y<area.position.y+area.size.height as i32}).map(|monitor|(position,monitor.clone())));
            let placement=restored.or_else(||window.primary_monitor().ok().flatten().map(|monitor|{let area=monitor.work_area();(model::PetPosition{x:area.position.x+area.size.width as i32-(width*monitor.scale_factor()) as i32-24,y:area.position.y+area.size.height as i32-(height*monitor.scale_factor()) as i32-24},monitor)}));
            if let Some((position,monitor))=placement {let area=monitor.work_area();let position=model::clamp_position(position,area.position.x,area.position.y,area.position.x+area.size.width as i32,area.position.y+area.size.height as i32,(width*monitor.scale_factor()) as i32,(height*monitor.scale_factor()) as i32);window.set_position(tauri::PhysicalPosition::new(position.x,position.y))?;}
            let icon=app.default_window_icon().ok_or("Missing pet tray icon")?.clone();
            TrayIconBuilder::with_id("pet-tray").tooltip("抱抱龙桌宠 · 右键切换角色与动作").icon(icon).menu(&native_menu(app.handle())?).show_menu_on_left_click(true).build(app)?;
            if preferences.visible || smoke.is_some() { window.show()?; }
            cursor_passthrough(app.handle().clone());
            if let Some(report)=smoke.clone() {let handle=app.handle().clone();std::thread::spawn(move ||{std::thread::sleep(Duration::from_secs(60));let state=handle.state::<PetState>();if !state.drawn.load(Ordering::SeqCst){let _=write_report(&report,json!({"ok":false,"frontendReady":state.ready.load(Ordering::SeqCst),"frameDrawn":false,"reason":"frontend draw timeout","checks":state.smoke_progress.lock().ok().map(|v|v.clone()),"platform":std::env::consts::OS}));handle.exit(1);}});}
            Ok(())
        })
        .on_menu_event(|app,event|{if let Err(error)=menu_selected(app,event.id.as_ref()){eprintln!("Pet menu: {error}");}})
        .on_window_event(|window,event|{match event {
            tauri::WindowEvent::CloseRequested{api,..}=>{api.prevent_close();let _=set_visible(window.app_handle(),false);},
            tauri::WindowEvent::Moved(position)=>{let state=window.state::<PetState>();if state.smoke.is_none(){if let Ok(mut prefs)=state.preferences.lock(){prefs.position=Some(model::PetPosition{x:position.x,y:position.y});state.position_dirty.store(true,Ordering::SeqCst);}}},
            _=>{}
        }})
        .build(tauri::generate_context!())
        .expect("Unable to run the local pet app")
        .run(|app,event|{if matches!(event,tauri::RunEvent::ExitRequested{..}|tauri::RunEvent::Exit){let state=app.state::<PetState>();if let Ok(prefs)=lock_preferences(&state){let _=save(&state,&prefs);}}});
}
