import json
import os
import uuid
from datetime import datetime

DEBUG_LOG = os.environ.get('LLM_DEBUG_LOG', os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'llm_debug.jsonl'
))


def _ensure_dir():
    os.makedirs(os.path.dirname(os.path.abspath(DEBUG_LOG)), exist_ok=True)


def append_call(
    session_id: str,
    model: str,
    system_prompt: str,
    messages_sent: list,
    response: str,
    latency_ms: int,
    error: str = None,
):
    _ensure_dir()
    entry = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.now().isoformat(),
        "session_id": session_id,
        "model": model,
        "latency_ms": latency_ms,
        "system_prompt": system_prompt,
        "messages_sent": messages_sent,
        "response": response,
        "error": error,
    }
    with open(DEBUG_LOG, 'a') as f:
        f.write(json.dumps(entry) + '\n')


def read_calls(limit: int = 50) -> list:
    if not os.path.exists(DEBUG_LOG):
        return []
    entries = []
    with open(DEBUG_LOG, 'r') as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    entries.append(json.loads(line))
                except Exception:
                    pass
    return list(reversed(entries[-limit:]))


def clear_calls():
    if os.path.exists(DEBUG_LOG):
        os.remove(DEBUG_LOG)
