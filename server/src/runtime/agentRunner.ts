export const AGENT_RUNNER_PY = String.raw`#!/usr/bin/env python3
import json
import os
import subprocess
import sys
import traceback
import urllib.error
import urllib.request

ROOT = "/workspace"
# Per-work-card run dir (injected by the server) so concurrent runners in the
# same shared sandbox don't overwrite each other's task/status/log.
MISSIONRY_DIR = os.environ.get("MISSIONRY_RUN_DIR") or os.path.join(ROOT, ".missionry")
TASK_PATH = os.path.join(MISSIONRY_DIR, "task.json")
STATUS_PATH = os.path.join(MISSIONRY_DIR, "status.json")
RESULT_PATH = os.path.join(MISSIONRY_DIR, "result.json")
MAX_STEPS = 12

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a shell command in /workspace.",
            "parameters": {
                "type": "object",
                "properties": {"command": {"type": "string"}},
                "required": ["command"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write a UTF-8 text file under /workspace.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}, "content": {"type": "string"}},
                "required": ["path", "content"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read a UTF-8 text file under /workspace.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
                "required": ["path"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_files",
            "description": "List files under /workspace.",
            "parameters": {
                "type": "object",
                "properties": {"path": {"type": "string"}},
            },
        },
    },
]


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)


def status(state, step, last_action):
    write_json(STATUS_PATH, {"state": state, "step": step, "lastAction": last_action})


def safe_path(path):
    raw = str(path or "").strip().lstrip("/")
    if "\x00" in raw or raw.startswith("..") or "/../" in ("/" + raw + "/"):
        raise ValueError("invalid relative path")
    full = os.path.abspath(os.path.join(ROOT, raw))
    root = os.path.abspath(ROOT)
    if full != root and not full.startswith(root + os.sep):
        raise ValueError("path escapes workspace")
    return full


def rel_path(full):
    return os.path.relpath(full, ROOT)


def run_command(command):
    proc = subprocess.run(
        command,
        cwd=ROOT,
        shell=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=600,
    )
    return {"exitCode": proc.returncode, "stdout": proc.stdout[-12000:], "stderr": proc.stderr[-12000:]}


def write_file(path, content):
    full = safe_path(path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return {"path": rel_path(full)}


def read_file(path):
    full = safe_path(path)
    with open(full, "r", encoding="utf-8", errors="replace") as f:
        return {"path": rel_path(full), "content": f.read(200000)}


def list_files(path=""):
    root = safe_path(path)
    entries = []
    if not os.path.exists(root):
        return {"entries": []}
    for name in sorted(os.listdir(root))[:200]:
        if name == ".missionry" and root == ROOT:
            continue
        full = os.path.join(root, name)
        entries.append({"name": name, "path": rel_path(full), "type": "dir" if os.path.isdir(full) else "file"})
    return {"entries": entries}


def workspace_files():
    files = []
    for base, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d != ".missionry" and not d.startswith(".git")]
        for name in names:
            full = os.path.join(base, name)
            try:
                files.append({"path": rel_path(full), "size": os.path.getsize(full)})
            except OSError:
                pass
            if len(files) >= 200:
                return files
    return files


def call_openai(api_key, model, messages):
    body = json.dumps({"model": model, "messages": messages, "tools": TOOLS, "tool_choice": "auto"}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=body,
        headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json", "User-Agent": "Missionry-Runner/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def run_tool(name, args):
    if name == "run_command":
        return run_command(args.get("command", ""))
    if name == "write_file":
        return write_file(args.get("path", ""), args.get("content", ""))
    if name == "read_file":
        return read_file(args.get("path", ""))
    if name == "list_files":
        return list_files(args.get("path", ""))
    return {"error": "unknown tool"}


def heartbeat(task):
    # Tell the server the runner is alive so the stuck-card reaper doesn't kill a
    # legitimately long task. Best-effort; never fail the run on a heartbeat error.
    url = task.get("heartbeatUrl")
    if not url:
        return
    try:
        data = json.dumps({"cardId": task.get("cardId")}).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json", "x-callback-token": task.get("callbackToken", ""), "User-Agent": "Missionry-Runner/1.0"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
    except Exception:
        pass


def post_callback(task, result):
    if not task.get("callbackUrl"):
        return
    data = json.dumps(result).encode("utf-8")
    req = urllib.request.Request(
        task["callbackUrl"],
        data=data,
        # A custom User-Agent is REQUIRED: the default "Python-urllib/x" UA is
        # blocked by Cloudflare WAF (403) in front of the Worker, so the callback
        # never lands and the card hangs until the stuck-reaper fails it.
        headers={"Content-Type": "application/json", "x-callback-token": task.get("callbackToken", ""), "User-Agent": "Missionry-Runner/1.0"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        resp.read()


def main():
    os.makedirs(MISSIONRY_DIR, exist_ok=True)
    with open(TASK_PATH, "r", encoding="utf-8") as f:
        task = json.load(f)
    status("running", 0, "loaded task")
    api_key = task.get("openaiApiKey")
    if not api_key:
        raise RuntimeError("openaiApiKey missing")
    system = "\n\n".join([part for part in [
        task.get("soul") or "You are a Missionry execution agent.",
        task.get("identity") or "",
        task.get("memory") or "",
        "You are running inside the E2B VM at /workspace. Use local tools to run commands and read/write files. Produce real artifacts when useful. Finish with a concise summary of exact actions and files changed.",
    ] if part])
    user = "\n".join([
        "Work card: " + task.get("title", ""),
        "Description: " + (task.get("description") or ""),
        "Mission objective: " + (task.get("objective") or ""),
    ])
    messages = [{"role": "system", "content": system}, {"role": "user", "content": user}]
    summary = ""
    for step in range(1, MAX_STEPS + 1):
        status("running", step, "calling model")
        heartbeat(task)
        response = call_openai(api_key, task.get("model") or "gpt-5.5", messages)
        message = response["choices"][0]["message"]
        messages.append(message)
        calls = message.get("tool_calls") or []
        if not calls:
            summary = message.get("content") or "Completed."
            break
        for call in calls:
            name = call.get("function", {}).get("name")
            raw_args = call.get("function", {}).get("arguments") or "{}"
            try:
                args = json.loads(raw_args)
                status("running", step, name)
                output = run_tool(name, args)
            except Exception as exc:
                output = {"error": str(exc)}
            messages.append({"role": "tool", "tool_call_id": call["id"], "content": json.dumps(output)})
    else:
        summary = "Stopped after maximum tool steps."
    result = {"cardId": task.get("cardId"), "missionId": task.get("missionId"), "instanceId": task.get("instanceId"), "agentId": task.get("agentId"), "status": "done", "summary": summary, "files": workspace_files()}
    write_json(RESULT_PATH, result)
    status("done", MAX_STEPS, "posted result")
    post_callback(task, result)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        task = {}
        try:
            with open(TASK_PATH, "r", encoding="utf-8") as f:
                task = json.load(f)
        except Exception:
            task = {}
        result = {"cardId": task.get("cardId"), "missionId": task.get("missionId"), "instanceId": task.get("instanceId"), "agentId": task.get("agentId"), "status": "failed", "summary": str(exc), "files": workspace_files() if os.path.isdir(ROOT) else [], "trace": traceback.format_exc()[-4000:]}
        write_json(RESULT_PATH, result)
        try:
            post_callback(task, result)
        except Exception:
            pass
        status("failed", -1, str(exc))
        sys.exit(1)
`;
