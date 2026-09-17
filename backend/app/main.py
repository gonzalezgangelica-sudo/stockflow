from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api import router
from .config import ROOT
from .data.snapshots import seed_reference
from .db import Base, SessionLocal, engine
from .jobs import start_scheduler

WEB_DIR = ROOT / "web"


def create_app() -> FastAPI:
    (ROOT / "data").mkdir(exist_ok=True)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_reference(db)
    finally:
        db.close()

    app = FastAPI(title="Stock — gestion y analisis", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router, prefix="/api")
    start_scheduler()

    if WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="static")

        @app.get("/")
        def index():
            return FileResponse(WEB_DIR / "index.html")

    return app


app = create_app()
