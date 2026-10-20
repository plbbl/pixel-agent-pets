import AppKit
import ImageIO

struct Caption: Decodable { let start: Double; let end: Double; let text: String }
struct Animation: Decodable {
    let title: String; let file: String; let width: Int; let height: Int; let columns: Int; let frames: Int; let fps: Double; let poster: Int; let sustain: Int?; let captions: [Caption]?
}
struct Manifest: Decodable { let animations: [String: Animation] }
struct RuntimePolicy: Decodable {
    let names: [String: String]; let idle: [String: [String]]; let states: [String: [String: String]]; let complete: [String: [String]]; let send: [String: String]; let error: [String: String]; let captions: [String: [String: [Caption]]]
}

final class PetView: NSView {
    var image: CGImage?
    var previous: CGImage?
    var animation: Animation?
    var spriteFrame = 0
    var mix: CGFloat = 1
    var caption = ""
    var title = ""
    var dragging = false
    var menuBuilder: (() -> NSMenu)?
    override var isOpaque: Bool { false }
    override func draw(_ dirtyRect: NSRect) {
        guard let context = NSGraphicsContext.current?.cgContext else { return }
        context.clear(bounds); context.interpolationQuality = .none
        if let a = animation, let image = image, let cropped = image.cropping(to: CGRect(x: spriteFrame % a.columns * a.width, y: spriteFrame / a.columns * a.height, width: a.width, height: a.height)) {
            let rect = CGRect(x: (bounds.width - CGFloat(a.width)) / 2, y: 12, width: CGFloat(a.width), height: CGFloat(a.height))
            if let previous = previous, mix < 1 {
                context.setAlpha(1 - mix); context.draw(previous, in: CGRect(x: (bounds.width - CGFloat(previous.width)) / 2, y: 12, width: CGFloat(previous.width), height: CGFloat(previous.height)))
                context.setBlendMode(.plusLighter)
            }
            context.setAlpha(previous == nil ? 1 : mix); context.draw(cropped, in: rect); context.setAlpha(1); context.setBlendMode(.normal)
        }
        if !caption.isEmpty {
            let paragraph = NSMutableParagraphStyle(); paragraph.alignment = .center; paragraph.lineBreakMode = .byTruncatingTail
            let attributes: [NSAttributedString.Key: Any] = [.font: NSFont.systemFont(ofSize: 10, weight: .semibold), .foregroundColor: NSColor.labelColor, .paragraphStyle: paragraph, .strokeColor: NSColor.windowBackgroundColor, .strokeWidth: -2]
            (caption as NSString).draw(in: NSRect(x: 4, y: 96, width: bounds.width - 8, height: 18), withAttributes: attributes)
        }
    }
    func capture() -> CGImage? {
        guard let a = animation else { return nil }
        guard let crop = image?.cropping(to: CGRect(x: spriteFrame % a.columns * a.width, y: spriteFrame / a.columns * a.height, width: a.width, height: a.height)),
              let context = CGContext(data: nil, width: a.width, height: a.height, bitsPerComponent: 8, bytesPerRow: a.width * 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        context.draw(crop, in: CGRect(x: 0, y: 0, width: a.width, height: a.height))
        return context.makeImage()
    }
    override func mouseDown(with event: NSEvent) { dragging = true; window?.performDrag(with: event); dragging = false; if let frame = window?.frame { UserDefaults.standard.set([frame.origin.x, frame.origin.y], forKey: "position") } }
    override func rightMouseDown(with event: NSEvent) { if let menu = menuBuilder?() { NSMenu.popUpContextMenu(menu, with: event, for: self) } }
}

final class Companion: NSObject, NSApplicationDelegate {
    private let resources = Bundle.main.resourceURL!
    private var window: NSPanel!
    private var view = PetView(frame: NSRect(x: 0, y: 0, width: 220, height: 118))
    private var manifests: [String: Manifest] = [:]
    private var policy: RuntimePolicy!
    private var watcher: CodexWatcher?
    private var timer: Timer?
    private var state = Activity()
    private var character = UserDefaults.standard.string(forKey: "character") ?? "claude"
    private var action = "", since = Date(), phaseSince = Date(), idleSince = Date()
    private var transient = false, hold = false, resting = false
    private var revision = 0, frame = -1, idleIndex = 0, completionIndex = 0, commandIndex = 0
    private var cache: [String: CGImage] = [:], order: [String] = []
    private var decode = DispatchQueue(label: "pets.decode", qos: .userInitiated)
    private var lastSpecial = Date.distantPast, pendingSpecial = false
    private var status: NSStatusItem!
    private var following = true
    private var manualPreview = false
    private var stopped = false
    private var selectedTool = ""
    private var globalMouse: Any?
    private var localMouse: Any?
    private var reduced: Bool { NSWorkspace.shared.accessibilityDisplayShouldReduceMotion }

    func applicationDidFinishLaunching(_ notification: Notification) {
        do {
            policy = try JSONDecoder().decode(RuntimePolicy.self, from: Data(contentsOf: resources.appendingPathComponent("policy.json")))
            for c in ["claude", "gpt", "deepseek", "clawd"] { manifests[c] = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: resources.appendingPathComponent("assets/\(c)/manifest.json"))) }
        } catch { showError("资源加载失败：\(error.localizedDescription)"); return }
        if manifests[character] == nil { character = "claude" }
        window = NSPanel(contentRect: view.frame, styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        window.title = "Pixel Agent Pets · 完整动作"; window.isOpaque = false; window.backgroundColor = .clear; window.hasShadow = false; window.level = .floating; window.hidesOnDeactivate = false
        window.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]; window.contentView = view; window.isReleasedWhenClosed = false; window.acceptsMouseMovedEvents = true
        let saved = UserDefaults.standard.array(forKey: "position") as? [Double]
        let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1000, height: 700)
        let origin = saved?.count == 2 ? NSPoint(x: saved![0], y: saved![1]) : NSPoint(x: screen.maxX - 240, y: screen.minY + 44)
        window.setFrameOrigin(NSPoint(x: min(max(screen.minX, origin.x), screen.maxX - 220), y: min(max(screen.minY, origin.y), screen.maxY - 118)))
        view.menuBuilder = { [weak self] in self?.menu() ?? NSMenu() }
        view.setAccessibilityElement(true); view.setAccessibilityRole(.image); view.setAccessibilityLabel("Pixel Agent Pets，右键切换与完整预览")
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        status.button?.image = NSImage(systemSymbolName: "pawprint", accessibilityDescription: "Pixel Agent Pets")
        status.menu = menu()
        selectedTool = policy.states[character]?["tools-command-0"] ?? "idle"
        window.orderFrontRegardless(); base(urgent: true)
        // Mouse movement only; no keyboard interception or accessibility permission.
        globalMouse = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] _ in self?.updateHitRegion() }
        localMouse = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved]) { [weak self] event in self?.updateHitRegion(); return event }
        updateHitRegion()
        let codexHome = ProcessInfo.processInfo.environment["CODEX_HOME"].map { URL(fileURLWithPath: $0) } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex")
        watcher = CodexWatcher(home: codexHome); watcher?.onChange = { [weak self] in if self?.following == true { self?.update($0) } }; watcher?.start()
        NSWorkspace.shared.notificationCenter.addObserver(self, selector: #selector(motionChanged), name: NSWorkspace.accessibilityDisplayOptionsDidChangeNotification, object: nil)
        if let i = CommandLine.arguments.firstIndex(of: "--action"), CommandLine.arguments.count > i + 1 {
            following = false; play(CommandLine.arguments[i + 1], transient: true)
        }
    }
    private func showError(_ message: String) { let alert = NSAlert(); alert.messageText = message; alert.runModal(); NSApp.terminate(nil) }
    private func updateHitRegion() {
        guard window.isVisible, !view.dragging else { return }
        let point = window.convertPoint(fromScreen: NSEvent.mouseLocation)
        let width = CGFloat(view.animation?.width ?? 80)
        let body = NSRect(x: (view.bounds.width - width) / 2, y: 12, width: width, height: 80)
        let ignore = !body.contains(point)
        if window.ignoresMouseEvents != ignore { window.ignoresMouseEvents = ignore }
    }
    private func family(_ a: Activity) -> String { "\(a.busy):\(a.waiting):\(a.phase)" }
    private func update(_ next: Activity) {
        let old = state; state = next
        if stopped { return }
        if manualPreview { return }
        if family(old) != family(next) { phaseSince = Date() }
        if next.toolID != old.toolID && !next.toolID.isEmpty {
            let name = next.tool.lowercased()
            let read = ["read", "view", "cat", "search", "grep", "find", "glob", "list"].contains { name.hasPrefix($0) || name.contains("__" + $0) }
            let key = read ? "tools-read" : (name.contains("write") || name.contains("edit") || name == "apply_patch") ? "tools-write" : "tools-command-\(commandIndex % 4)"
            selectedTool = policy.states[character]?[key] ?? "idle"; commandIndex += 1
        }
        if character == "claude", next.chinese, (!old.chinese || next.turnID != old.turnID), Date().timeIntervalSince(lastSpecial) > 20 { pendingSpecial = true }
        if next.waiting { base(urgent: true); return }
        if !next.errorID.isEmpty && next.errorID != old.errorID { play(policy.error[character] ?? "error", transient: true); return }
        if next.stopped && !old.stopped { play(policy.states[character]?["stopping"] ?? "idle", transient: true); return }
        if next.busy && !old.busy { if reduced { base(urgent: true) } else { play(policy.send[character] ?? "idle", transient: true) }; return }
        if !next.busy && old.busy {
            idleSince = Date()
            if next.stopped || !next.errorID.isEmpty { return }
            let options = policy.complete[character] ?? ["idle"]; play(options[completionIndex % options.count], transient: true); completionIndex += 1; return
        }
        if !transient && desired() != action { base() }
    }
    private func desired() -> String {
        let key = state.waiting ? "waiting" : !state.busy ? "idle" : state.phase == "tools" ? "tools" : state.phase == "thinking" && Date().timeIntervalSince(phaseSince) >= 12 ? "thinking-long" : state.phase
        return key == "tools" ? selectedTool : policy.states[character]?[key] ?? "idle"
    }
    private func base(urgent: Bool = false) {
        if transient && !urgent { return }
        if pendingSpecial && !state.waiting && state.errorID.isEmpty && !reduced {
            pendingSpecial = false; lastSpecial = Date(); play("special", transient: true); return
        }
        play(desired(), transient: false, hold: state.busy || state.waiting, rest: !state.busy && !state.waiting)
    }
    private func play(_ name: String, transient oneShot: Bool, hold: Bool = false, rest: Bool = false) {
        guard let a = manifests[character]?.animations[name] else { return }
        let oneShot = oneShot && !reduced
        if name == action && self.transient == oneShot && self.hold == hold && resting == rest && view.image != nil { return }
        timer?.invalidate(); revision += 1; let rev = revision; let c = character
        action = name; transient = oneShot; self.hold = hold; resting = rest; frame = -1
        let key = c + "/" + name
        let commit: (CGImage) -> Void = { [weak self] image in
            guard let self = self, self.revision == rev else { return }
            self.view.previous = self.reduced ? nil : self.view.capture(); self.view.image = image; self.view.animation = a
            self.since = Date(); self.paint(self.reduced ? a.poster : 0)
            self.view.title = a.title; self.view.setAccessibilityLabel("\(self.policy.names[c] ?? c)：\(a.title)，完整 \(a.frames) 帧")
            if !self.reduced { self.schedule(0.05) }
        }
        if let image = cache[key] { order.removeAll { $0 == key }; order.append(key); commit(image); return }
        let url = resources.appendingPathComponent("assets/\(c)/\(a.file)")
        decode.async { [weak self] in
            guard let source = CGImageSourceCreateWithURL(url as CFURL, nil), let image = CGImageSourceCreateImageAtIndex(source, 0, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary) else { return }
            DispatchQueue.main.async {
                guard let self = self, self.revision == rev else { return }
                self.cache[key] = image; self.order.removeAll { $0 == key }; self.order.append(key)
                while self.order.count > 2 || self.cache.values.reduce(0, { $0 + $1.bytesPerRow * $1.height }) > 10 * 1024 * 1024 {
                    guard self.order.count > 1 else { break }; self.cache.removeValue(forKey: self.order.removeFirst())
                }
                commit(image)
            }
        }
    }
    private func schedule(_ delay: Double) {
        timer?.invalidate()
        let next = Timer(timeInterval: delay, repeats: false) { [weak self] _ in self?.tick() }
        timer = next; RunLoop.main.add(next, forMode: .common)
    }
    private func tick() {
        guard !stopped, let a = view.animation else { return }
        let elapsed = Date().timeIntervalSince(since)
        if resting {
            if view.previous != nil { paint(0) }
            if elapsed >= 15 {
                let choices = policy.idle[character] ?? ["idle"]
                var choice = choices[idleIndex % choices.count]; idleIndex += 1
                if choice == "sleep" && Date().timeIntervalSince(idleSince) < 90 { choice = "idle" }
                play(choice, transient: true, hold: choice == "sleep"); return
            }
            schedule(view.previous != nil ? 0.05 : max(0.05, 15 - elapsed)); return
        }
        if !manualPreview && transient && state.busy && action == policy.send[character] && elapsed >= 0.9 { transient = false; base(); return }
        if !transient && desired() != action { base(); return }
        guard let selected = playbackFrame(total: a.frames, fps: a.fps, elapsed: elapsed, holdAt: hold ? (a.sustain ?? a.frames - 1) : nil) else { transient = false; manualPreview = false; base(); return }
        if selected != frame || view.previous != nil { paint(selected) }
        updateCaption(elapsed)
        schedule(hold && selected == (a.sustain ?? a.frames - 1) && view.previous == nil ? 1 : max(0.005, 1 / a.fps - elapsed.truncatingRemainder(dividingBy: 1 / a.fps)))
    }
    private func paint(_ frame: Int) {
        self.frame = frame; view.spriteFrame = frame; view.mix = CGFloat(min(1, Date().timeIntervalSince(since) / 0.15))
        if view.mix >= 1 { view.previous = nil }
        updateCaption(Date().timeIntervalSince(since)); view.needsDisplay = true
    }
    private func updateCaption(_ elapsed: Double) {
        let authored = view.animation?.captions ?? []
        let ranges = authored.isEmpty ? policy.captions[character]?[action] ?? [] : authored
        let text = ranges.first { elapsed >= $0.start && elapsed < $0.end }?.text ?? ""
        if view.caption != text { view.caption = text; view.needsDisplay = true }
    }
    private func menu() -> NSMenu {
        let menu = NSMenu(title: "Pixel Agent Pets")
        let title = NSMenuItem(title: "Pixel Agent Pets · 完整动作", action: nil, keyEquivalent: ""); menu.addItem(title); menu.addItem(.separator())
        for c in ["claude", "gpt", "deepseek", "clawd"] {
            let item = NSMenuItem(title: policy?.names[c] ?? c, action: #selector(choose(_:)), keyEquivalent: ""); item.representedObject = c; item.target = self; item.state = c == character ? .on : .off; menu.addItem(item)
        }
        let previews = NSMenu(title: "完整预览")
        for (name, a) in (manifests[character]?.animations ?? [:]).sorted(by: { $0.key < $1.key }) {
            let item = NSMenuItem(title: "\(a.title) · \(a.frames) 帧", action: #selector(preview(_:)), keyEquivalent: ""); item.representedObject = name; item.target = self; previews.addItem(item)
        }
        let preview = NSMenuItem(title: "播放完整动作", action: nil, keyEquivalent: ""); preview.submenu = previews; menu.addItem(preview); menu.addItem(.separator())
        let follow = NSMenuItem(title: "跟随 Codex 活动", action: #selector(toggleFollow), keyEquivalent: ""); follow.target = self; follow.state = following ? .on : .off; menu.addItem(follow)
        let visibility = NSMenuItem(title: window?.isVisible == true ? "隐藏宠物" : "显示宠物", action: #selector(toggleVisible), keyEquivalent: ""); visibility.target = self; menu.addItem(visibility)
        menu.addItem(.separator()); let quit = NSMenuItem(title: "退出 Pixel Agent Pets", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"); menu.addItem(quit)
        return menu
    }
    @objc private func choose(_ item: NSMenuItem) {
        guard let c = item.representedObject as? String else { return }
        character = c; UserDefaults.standard.set(c, forKey: "character"); cache.removeAll(); order.removeAll(); view.previous = nil; view.image = nil; action = ""; pendingSpecial = false
        selectedTool = policy.states[c]?["tools-command-0"] ?? "idle"; transient = false; manualPreview = false; base(urgent: true); status.menu = menu()
    }
    @objc private func preview(_ item: NSMenuItem) { if let name = item.representedObject as? String { window.orderFrontRegardless(); stopped = false; manualPreview = true; play(name, transient: true) } }
    @objc private func toggleFollow() { following.toggle(); status.menu = menu() }
    @objc private func toggleVisible() {
        if window.isVisible { window.orderOut(nil); stopped = true; timer?.invalidate(); revision += 1; cache.removeAll(); order.removeAll(); view.image = nil; view.previous = nil }
        else { stopped = false; transient = false; window.orderFrontRegardless(); base(urgent: true) }
        status.menu = menu()
    }
    @objc private func motionChanged() { transient = false; action = ""; base(urgent: true) }
    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate(); watcher = nil; if let m = globalMouse { NSEvent.removeMonitor(m) }; if let m = localMouse { NSEvent.removeMonitor(m) } }
}

if CommandLine.arguments.contains("--self-test") { activitySelfTest(); exit(0) }
if CommandLine.arguments.contains("--watch-self-test") {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("pets-watch-" + UUID().uuidString)
    let dir = root.appendingPathComponent("sessions/2026/10/19")
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let file = dir.appendingPathComponent("test.jsonl")
    try Data().write(to: file)
    let watcher = CodexWatcher(home: root)
    var observed = false
    watcher.onChange = { a in if a.busy && a.phase == "tools" { observed = true } }
    watcher.start()
    DispatchQueue.global().asyncAfter(deadline: .now() + 0.4) {
        try? Data("{\"type\":\"response_item\",\"payload\":{\"type\":\"function_call\",\"name\":\"read_file\",\"call_id\":\"sample\"}}\n".utf8).write(to: file)
    }
    let until = Date().addingTimeInterval(4)
    withExtendedLifetime(watcher) {
        while !observed && Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.03)) }
    }
    try? FileManager.default.removeItem(at: root)
    precondition(observed, "Filesystem activity did not reach the companion")
    print("Native live filesystem test passed")
    exit(0)
}
let application = NSApplication.shared
application.setActivationPolicy(.accessory)
let companion = Companion()
application.delegate = companion
application.run()
