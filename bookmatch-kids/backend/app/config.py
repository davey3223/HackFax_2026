import os
from pathlib import Path

from dotenv import load_dotenv


def _candidate_paths() -> list[Path]:
    here = Path(__file__).resolve()
    return [
        Path.cwd() / ".env",
        here.parents[2] / ".env",
        here.parents[3] / ".env",
    ]


def _resolve_env_path() -> Path:
    for candidate in _candidate_paths():
        if candidate.exists():
            return candidate
    return _candidate_paths()[1]


def load_env() -> dict:
    if os.getenv("MONGODB_URI"):
        return {"path": None, "loaded": False}

    for candidate in _candidate_paths():
        if candidate.exists():
            load_dotenv(dotenv_path=candidate, override=False)
        if os.getenv("MONGODB_URI"):
            return {"path": str(candidate), "loaded": True}
    return {"path": None, "loaded": False}


def env_debug() -> dict:
    return {
        "cwd": str(Path.cwd()),
        "candidates": [
            {"path": str(p), "exists": p.exists()}
            for p in _candidate_paths()
        ],
        "mongodb_set": bool(os.getenv("MONGODB_URI")),
    }


def write_env_var(key: str, value: str) -> dict:
    env_path = _resolve_env_path()
    lines: list[str] = []
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines()

    updated = False
    new_lines = []
    for line in lines:
        if not line or line.lstrip().startswith("#"):
            new_lines.append(line)
            continue
        if line.split("=", 1)[0].strip() == key:
            new_lines.append(f"{key}={value}")
            updated = True
        else:
            new_lines.append(line)
    if not updated:
        new_lines.append(f"{key}={value}")

    env_path.write_text("\n".join(new_lines) + "\n", encoding="utf-8")
    os.environ[key] = value
    return {"path": str(env_path), "updated": True}
