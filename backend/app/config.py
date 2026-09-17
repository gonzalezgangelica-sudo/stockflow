from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]
BIOMASA_ENV = Path(r"C:\Users\ACZ\.codex\CALCULO_BIOMASA\.env")


def _load_legacy_env(path: Path) -> None:
    if not path.exists():
        return
    mapping = {
        "server name": "BC_SERVER",
        "database": "BC_DATABASE",
        "user": "BC_USER",
        "password": "BC_PASSWORD",
    }
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))
            continue
        if ":" not in line:
            continue
        label, value = line.split(":", 1)
        mapped = mapping.get(label.strip().lower())
        if mapped:
            os.environ.setdefault(mapped, value.strip())


_load_legacy_env(BIOMASA_ENV)
_load_legacy_env(ROOT / ".env")



class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(str(BIOMASA_ENV) if BIOMASA_ENV.exists() else None, str(ROOT / ".env")),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    bc_server: str = ""
    bc_database: str = ""
    bc_user: str = ""
    bc_password: str = ""
    stock_database_url: str = f"sqlite:///{(ROOT / 'data' / 'stock_app.db').as_posix()}"
    snapshot_hour: int = 5
    snapshot_minute: int = 0
    expiry_warning_days: int = 30
    timezone: str = "Europe/Madrid"
    demo_mode: bool = False
    run_scheduler: bool = True
    age_buckets: str = "0-7,8-15,16-30,31-60,61+"
    default_warehouses: str = "E,G,W,J,Z"


@lru_cache
def get_settings() -> Settings:
    return Settings()
