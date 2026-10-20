import Foundation

struct Activity: Equatable {
    var busy = false
    var phase = "thinking"
    var waiting = false
    var tool = ""
    var toolID = ""
    var turnID = ""
    var errorID = ""
    var chinese = false
    var stopped = false
}

func playbackFrame(total: Int, fps: Double, elapsed: Double, holdAt: Int?) -> Int? {
    let n = max(0, Int(elapsed * fps))
    if let holdAt = holdAt { return min(n, holdAt) }
    return n < total ? n : nil
}

// Discard payload bodies after deriving these small, local activity facts.
struct SessionActivity {
    var value = Activity()
    var tools: [String: String] = [:]
    var updated = Date.distantPast

    mutating func consume(_ record: [String: Any], now: Date = Date()) {
        guard let p = record["payload"] as? [String: Any] else { return }
        let kind = record["type"] as? String ?? ""
        let type = p["type"] as? String ?? ""
        var changed = true
        if kind == "event_msg" {
            switch type {
            case "task_started":
                value = Activity(busy: true, phase: "sending", turnID: p["turn_id"] as? String ?? "")
                tools.removeAll()
            case "task_complete", "turn_complete":
                value.busy = false; value.waiting = false; value.stopped = false; value.errorID = ""; tools.removeAll()
            case "turn_aborted", "task_aborted":
                value.busy = false; value.waiting = false; value.stopped = true; tools.removeAll()
            case "error", "task_failed":
                value.busy = false; value.waiting = false; value.errorID = "failure-" + (record["timestamp"] as? String ?? UUID().uuidString); tools.removeAll()
            case "agent_reasoning": value.busy = true; value.phase = "thinking"
            case "agent_message": value.phase = "responding"
            case "user_message":
                value.chinese = (p["message"] as? String ?? "").range(of: "[\\u3400-\\u9fff]", options: .regularExpression) != nil
            case "exec_approval_request", "apply_patch_approval_request", "request_user_input": value.waiting = true
            default: changed = false
            }
        } else if kind == "response_item" {
            switch type {
            case "reasoning": value.busy = true; value.phase = "thinking"
            case "message":
                if p["role"] as? String == "user" {
                    let texts = (p["content"] as? [[String: Any]] ?? []).compactMap { $0["text"] as? String }
                    value.chinese = texts.contains { $0.range(of: "[\\u3400-\\u9fff]", options: .regularExpression) != nil }
                } else if p["role"] as? String == "assistant" { value.phase = "responding" }
            case "function_call", "custom_tool_call":
                let id = p["call_id"] as? String ?? "tool"
                let name = p["name"] as? String ?? "tool"
                tools[id] = name; value.busy = true; value.phase = "tools"; value.tool = name; value.toolID = id
                value.waiting = name.contains("request_user_input") || name.contains("request_user_input_async")
            case "function_call_output", "custom_tool_call_output":
                tools.removeValue(forKey: p["call_id"] as? String ?? "")
                value.waiting = false
                value.phase = tools.isEmpty ? "thinking" : "tools"
                if let entry = tools.sorted(by: { $0.key < $1.key }).last { value.tool = entry.value; value.toolID = entry.key }
            default: changed = false
            }
        } else { changed = false }
        if changed { updated = now }
    }

    mutating func consumeHook(_ p: [String: Any], now: Date = Date()) {
        let type = p["hook_event_name"] as? String ?? ""
        switch type {
        case "UserPromptSubmit":
            value = Activity(busy: true, phase: "sending", turnID: p["turn_id"] as? String ?? "")
            value.chinese = (p["prompt"] as? String ?? "").range(of: "[\\u3400-\\u9fff]", options: .regularExpression) != nil
            tools.removeAll()
        case "PreToolUse":
            let id = p["tool_use_id"] as? String ?? "tool", name = p["tool_name"] as? String ?? "tool"
            tools[id] = name; value.busy = true; value.phase = "tools"; value.tool = name; value.toolID = id
            value.waiting = name.contains("request_user_input")
        case "PostToolUse":
            tools.removeValue(forKey: p["tool_use_id"] as? String ?? "")
            value.waiting = false; value.phase = tools.isEmpty ? "thinking" : "tools"
        case "PermissionRequest": value.waiting = true
        case "Stop", "SessionEnd": value.busy = false; value.waiting = false; value.stopped = false; tools.removeAll()
        case "Interrupt": value.busy = false; value.waiting = false; value.stopped = true; tools.removeAll()
        case "PreCompact", "PostCompact": value.phase = "thinking"
        default: return
        }
        updated = now
    }
}

func aggregate(_ sessions: [String: SessionActivity], now: Date = Date()) -> Activity {
    let recent = sessions.values.filter { now.timeIntervalSince($0.updated) < 3600 }
    if let waiting = recent.filter({ $0.value.waiting }).max(by: { $0.updated < $1.updated }) { return waiting.value }
    if let working = recent.filter({ $0.value.busy }).max(by: { $0.updated < $1.updated }) { return working.value }
    return recent.max(by: { $0.updated < $1.updated })?.value ?? Activity()
}

func activitySelfTest() {
    func event(_ t: String, _ p: [String: Any] = [:]) -> [String: Any] { ["type": "event_msg", "payload": p.merging(["type": t], uniquingKeysWith: { _, b in b })] }
    func response(_ t: String, _ p: [String: Any] = [:]) -> [String: Any] { ["type": "response_item", "payload": p.merging(["type": t], uniquingKeysWith: { _, b in b })] }
    var a = SessionActivity(); a.consume(event("task_started", ["turn_id": "one"])); precondition(a.value.busy)
    a.consume(response("message", ["role": "user", "content": [["text": "你好 private"]]])); precondition(a.value.chinese)
    a.consume(response("function_call", ["name": "read_file", "call_id": "read"])); precondition(a.value.phase == "tools")
    a.consume(response("function_call", ["name": "exec_command", "call_id": "exec"])); a.consume(response("function_call_output", ["call_id": "read"])); precondition(a.value.phase == "tools")
    a.consumeHook(["hook_event_name": "PermissionRequest"]); precondition(a.value.waiting)
    a.consumeHook(["hook_event_name": "PostToolUse", "tool_use_id": "exec"]); precondition(!a.value.waiting && a.value.phase == "thinking")
    var b = SessionActivity(); b.consume(event("task_started")); a.consume(event("task_complete")); precondition(aggregate(["a": a, "b": b]).busy)
    b.consume(event("turn_aborted")); precondition(!b.value.busy && b.value.stopped)
    b.consume(event("task_started")); b.consume(event("error")); precondition(!b.value.errorID.isEmpty && !b.value.busy)
    for i in 0..<195 { precondition(playbackFrame(total: 195, fps: 20, elapsed: Double(i) / 20 + 0.000001, holdAt: nil) == i) }
    precondition(playbackFrame(total: 195, fps: 20, elapsed: 9.75, holdAt: nil) == nil)
    precondition(playbackFrame(total: 80, fps: 20, elapsed: 100, holdAt: 58) == 58)
    print("Native activity tests: 9 scenarios passed")
    print("Native original-frame clock: all 195 frames, completion and hold passed")
}
