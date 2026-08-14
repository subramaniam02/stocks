import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Optional

CHAT_DIR = os.environ.get(
    'CHAT_DIR',
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'chat_history')
)


def _ensure_dir():
    os.makedirs(CHAT_DIR, exist_ok=True)


def _session_path(session_id: str) -> str:
    return os.path.join(CHAT_DIR, f"{session_id}.json")


def create_session() -> str:
    session_id = str(uuid.uuid4())
    _ensure_dir()
    now = datetime.now().isoformat()
    session_data = {
        "session_id": session_id,
        "created_at": now,
        "updated_at": now,
        "messages": []
    }
    with open(_session_path(session_id), 'w') as f:
        json.dump(session_data, f, indent=2)
    return session_id


def load_session(session_id: str) -> Optional[Dict]:
    path = _session_path(session_id)
    if not os.path.exists(path):
        return None
    with open(path, 'r') as f:
        return json.load(f)


def save_messages(session_id: str, messages: List[Dict]) -> None:
    _ensure_dir()
    path = _session_path(session_id)
    if os.path.exists(path):
        with open(path, 'r') as f:
            session = json.load(f)
    else:
        session = {
            "session_id": session_id,
            "created_at": datetime.now().isoformat(),
        }
    session["messages"] = messages
    session["updated_at"] = datetime.now().isoformat()
    with open(path, 'w') as f:
        json.dump(session, f, indent=2)


def list_sessions() -> List[Dict]:
    _ensure_dir()
    sessions = []
    for filename in sorted(os.listdir(CHAT_DIR), reverse=True):
        if not filename.endswith('.json'):
            continue
        path = os.path.join(CHAT_DIR, filename)
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            messages = data.get('messages', [])
            user_messages = [m for m in messages if m.get('role') == 'user']
            preview = user_messages[0]['content'][:100] if user_messages else 'Empty session'
            sessions.append({
                "session_id": data['session_id'],
                "created_at": data.get('created_at', ''),
                "updated_at": data.get('updated_at', ''),
                "message_count": len(messages),
                "preview": preview
            })
        except Exception:
            pass
    return sorted(sessions, key=lambda x: x.get('updated_at', ''), reverse=True)


def delete_session(session_id: str) -> bool:
    path = _session_path(session_id)
    if os.path.exists(path):
        os.remove(path)
        return True
    return False
