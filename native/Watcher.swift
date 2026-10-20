import Foundation
import CoreServices

final class CodexWatcher {
    private struct Cursor { var offset: UInt64 = 0; var pending = Data(); var skipping = false }
    private let queue = DispatchQueue(label: "pets.codex.events", qos: .utility)
    private let root: URL
    private var stream: FSEventStreamRef?
    private var cursors: [String: Cursor] = [:]
    private var sessions: [String: SessionActivity] = [:]
    private var prior = Activity()
    private var settle: DispatchWorkItem?
    var onChange: ((Activity) -> Void)?
    init(home: URL) { root = home.appendingPathComponent("sessions").resolvingSymlinksInPath() }
    func start() {
        queue.async { [weak self] in self?.seed() }
        var context = FSEventStreamContext(version: 0, info: Unmanaged.passUnretained(self).toOpaque(), retain: nil, release: nil, copyDescription: nil)
        let callback: FSEventStreamCallback = { _, raw, _, paths, _, _ in
            guard let raw = raw else { return }
            let watcher = Unmanaged<CodexWatcher>.fromOpaque(raw).takeUnretainedValue()
            for path in unsafeBitCast(paths, to: NSArray.self) as? [String] ?? [] where path.hasSuffix(".jsonl") {
                watcher.read(URL(fileURLWithPath: path), initial: false)
            }
            watcher.publish()
        }
        stream = FSEventStreamCreate(nil, callback, &context, [root.path] as CFArray, FSEventStreamEventId(kFSEventStreamEventIdSinceNow), 0.15, FSEventStreamCreateFlags(kFSEventStreamCreateFlagUseCFTypes | kFSEventStreamCreateFlagFileEvents))
        if let stream = stream { FSEventStreamSetDispatchQueue(stream, queue); FSEventStreamStart(stream) }
    }
    private func seed() {
        var files: [URL] = []
        let formatter = DateFormatter(); formatter.dateFormat = "yyyy/MM/dd"
        for timezone in [TimeZone.current, TimeZone(secondsFromGMT: 0)!] {
            formatter.timeZone = timezone
            for day in 0...2 {
                let dir = root.appendingPathComponent(formatter.string(from: Date().addingTimeInterval(Double(-day * 86400))))
                files += (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
            }
        }
        let unique = Array(Set(files.filter { $0.pathExtension == "jsonl" })).sorted {
            ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) > ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
        }
        for file in unique.prefix(24) { read(file, initial: true) }
        publish()
    }
    private func read(_ input: URL, initial: Bool) {
        let file = input.resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), file.pathExtension == "jsonl", let handle = try? FileHandle(forReadingFrom: file) else { return }
        defer { try? handle.close() }
        let size = (try? handle.seekToEnd()) ?? 0
        var cursor = cursors[file.path] ?? Cursor()
        let first = cursors[file.path] == nil
        if first || size < cursor.offset {
            cursor = Cursor(offset: size > 131072 ? size - 131072 : 0)
            cursor.skipping = cursor.offset > 0
        }
        try? handle.seek(toOffset: cursor.offset)
        var session = sessions[file.path] ?? SessionActivity()
        let modified = (try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()
        var budget = 0
        while let data = try? handle.read(upToCount: 65536), !data.isEmpty {
            cursor.offset += UInt64(data.count); budget += data.count
            for byte in data {
                if byte == 10 {
                    if !cursor.skipping, let record = (try? JSONSerialization.jsonObject(with: cursor.pending)) as? [String: Any] { session.consume(record, now: initial ? modified : Date()) }
                    cursor.pending.removeAll(keepingCapacity: true); cursor.skipping = false
                } else if !cursor.skipping {
                    if cursor.pending.count < 262144 { cursor.pending.append(byte) } else { cursor.pending.removeAll(keepingCapacity: true); cursor.skipping = true }
                }
            }
            if budget >= 1048576 { break }
        }
        cursors[file.path] = cursor; sessions[file.path] = session
        if cursor.offset < size { queue.async { [weak self] in self?.read(file, initial: initial); self?.publish() } }
        if sessions.count > 64 {
            for key in sessions.sorted(by: { $0.value.updated > $1.value.updated }).dropFirst(48).map({ $0.key }) { sessions.removeValue(forKey: key); cursors.removeValue(forKey: key) }
        }
    }
    private func publish() {
        // Coalesce nearby writes so tool-result + task-complete do not flash an intermediate pose.
        settle?.cancel()
        let job = DispatchWorkItem { [weak self] in
            guard let self = self else { return }
            let value = aggregate(self.sessions)
            if value != self.prior { self.prior = value; DispatchQueue.main.async { self.onChange?(value) } }
        }
        settle = job; queue.asyncAfter(deadline: .now() + 0.08, execute: job)
    }
    deinit { if let stream = stream { FSEventStreamStop(stream); FSEventStreamInvalidate(stream); FSEventStreamRelease(stream) } }
}
