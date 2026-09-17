from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import get_settings
from .data.bc_source import fetch_live_stock
from .data.snapshots import get_config_value, latest_ok_snapshot, seed_reference, set_config_value, take_snapshot
from .db import get_db
from .domain.analytics import (
    age_analysis,
    apply_filters,
    buckets,
    compare_sets,
    enrich,
    evolution,
    line_to_dict,
    live_to_dict,
    movement,
    packing_analysis,
    snapshot_lines,
    summarize,
    warning_days,
)
from .models import AppConfig, ExecutionLog, Snapshot, Warehouse

router = APIRouter()


def _today() -> date:
    return date.today()


def _params(
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    lot_no: Optional[str] = None,
    family: Optional[str] = None,
    expiry_status: Optional[str] = None,
    packing_date: Optional[str] = None,
    expiry_date: Optional[str] = None,
) -> dict:
    return {
        "warehouse": warehouse,
        "product_no": product_no,
        "lot_no": lot_no,
        "family": family,
        "expiry_status": expiry_status,
        "packing_date": packing_date,
        "expiry_date": expiry_date,
    }


def _live_enriched(db: Session, q: dict) -> list[dict]:
    warn = warning_days(db)
    ages = buckets(db)
    rows = [enrich(live_to_dict(r), _today(), warn, ages) for r in fetch_live_stock()]
    return apply_filters(rows, q)


def _snap_enriched(db: Session, snapshot_id: int, q: dict) -> list[dict]:
    warn = warning_days(db)
    ages = buckets(db)
    rows = [enrich(line_to_dict(r), _today(), warn, ages) for r in snapshot_lines(db, snapshot_id)]
    return apply_filters(rows, q)


@router.get("/health")
def health():
    s = get_settings()
    return {"ok": True, "demo_mode": s.demo_mode, "bc_configured": bool(s.bc_server)}


@router.get("/config")
def read_config(db: Session = Depends(get_db)):
    seed_reference(db)
    rows = db.scalars(select(AppConfig)).all()
    warehouses = db.scalars(select(Warehouse).order_by(Warehouse.code)).all()
    return {
        "config": {r.key: r.value for r in rows},
        "warehouses": [{"code": w.code, "name": w.name, "active": bool(w.active)} for w in warehouses],
    }


@router.put("/config")
def write_config(payload: dict, db: Session = Depends(get_db)):
    for k, v in (payload or {}).items():
        set_config_value(db, str(k), str(v))
    db.commit()
    return {"ok": True}


@router.get("/stock/live")
def stock_live(
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    lot_no: Optional[str] = None,
    family: Optional[str] = None,
    expiry_status: Optional[str] = None,
    packing_date: Optional[str] = None,
    expiry_date: Optional[str] = None,
    db: Session = Depends(get_db),
):
    try:
        rows = _live_enriched(db, _params(warehouse, product_no, lot_no, family, expiry_status, packing_date, expiry_date))
    except Exception as exc:
        raise HTTPException(503, f"No se pudo leer stock vivo: {exc}") from exc
    last = latest_ok_snapshot(db)
    return {
        "source": "live",
        "as_of": _today().isoformat(),
        "initial_snapshot_date": last.snapshot_date.isoformat() if last else None,
        "summary": summarize(rows),
        "rows": rows,
    }


@router.get("/dashboard")
def dashboard(
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    days: int = Query(30, ge=7, le=370),
    db: Session = Depends(get_db),
):
    q = _params(warehouse, product_no)
    try:
        live = _live_enriched(db, q)
        live_ok = True
        live_error = ""
    except Exception as exc:
        live, live_ok, live_error = [], False, str(exc)
        last = latest_ok_snapshot(db)
        if last:
            live = _snap_enriched(db, last.id, q)
    last = latest_ok_snapshot(db)
    initial = _snap_enriched(db, last.id, q) if last else []
    live_sum = summarize(live)
    init_sum = summarize(initial) if initial else None
    return {
        "live_ok": live_ok,
        "live_error": live_error,
        "kpis": live_sum,
        "initial": init_sum,
        "variation_kg": round(live_sum["kg"] - (init_sum["kg"] if init_sum else 0), 2) if init_sum else None,
        "warehouses": live_sum["by_warehouse"],
        "evolution": evolution(db, days, warehouse, product_no),
        "snapshot_date": last.snapshot_date.isoformat() if last else None,
    }


@router.get("/snapshots")
def list_snapshots(db: Session = Depends(get_db)):
    rows = db.scalars(select(Snapshot).order_by(Snapshot.snapshot_date.desc())).all()
    return [
        {
            "id": s.id,
            "date": s.snapshot_date.isoformat(),
            "time": s.snapshot_time.strftime("%H:%M"),
            "status": s.status,
            "records": s.records_processed,
            "error": s.error_message,
        }
        for s in rows
    ]


@router.get("/snapshots/{snapshot_id}")
def snapshot_detail(
    snapshot_id: int,
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    lot_no: Optional[str] = None,
    expiry_status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    snap = db.get(Snapshot, snapshot_id)
    if not snap:
        raise HTTPException(404, "Fotografia no encontrada")
    rows = _snap_enriched(db, snap.id, _params(warehouse, product_no, lot_no, expiry_status=expiry_status))
    return {
        "id": snap.id,
        "date": snap.snapshot_date.isoformat(),
        "time": snap.snapshot_time.strftime("%H:%M"),
        "status": snap.status,
        "summary": summarize(rows),
        "rows": rows,
    }


@router.post("/snapshots/run")
def run_snapshot(db: Session = Depends(get_db)):
    snap = take_snapshot(db)
    return {
        "id": snap.id,
        "date": snap.snapshot_date.isoformat(),
        "time": snap.snapshot_time.strftime("%H:%M"),
        "status": snap.status,
        "records": snap.records_processed,
        "error": snap.error_message,
    }


@router.get("/compare")
def compare(
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    db: Session = Depends(get_db),
):
    last = latest_ok_snapshot(db)
    if not last:
        raise HTTPException(404, "No hay fotografia historica todavia")
    q = _params(warehouse, product_no)
    try:
        live = _live_enriched(db, q)
    except Exception as exc:
        raise HTTPException(503, f"No se pudo leer stock vivo: {exc}") from exc
    initial = _snap_enriched(db, last.id, q)
    rows = compare_sets(initial, live)
    return {
        "snapshot_date": last.snapshot_date.isoformat(),
        "snapshot_time": last.snapshot_time.strftime("%H:%M"),
        "initial": summarize(initial),
        "live": summarize(live),
        "rows": rows,
    }


@router.get("/evolution")
def evolution_api(
    days: int = Query(30, ge=7, le=370),
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    db: Session = Depends(get_db),
):
    return {"points": evolution(db, days, warehouse, product_no), "movement": movement(db, days)}


@router.get("/analysis/packing")
def packing_api(
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    db: Session = Depends(get_db),
):
    last = latest_ok_snapshot(db)
    if not last:
        rows = _live_enriched(db, _params(warehouse, product_no))
    else:
        rows = _snap_enriched(db, last.id, _params(warehouse, product_no))
    return {"packing": packing_analysis(rows), "age": age_analysis(rows)}


@router.get("/expiry")
def expiry_api(
    warehouse: Optional[str] = None,
    product_no: Optional[str] = None,
    db: Session = Depends(get_db),
):
    try:
        rows = _live_enriched(db, _params(warehouse, product_no))
    except Exception:
        last = latest_ok_snapshot(db)
        if not last:
            raise HTTPException(503, "Sin stock vivo ni historico")
        rows = _snap_enriched(db, last.id, _params(warehouse, product_no))
    interesting = [r for r in rows if r["expiry_status"] in ("Caducado", "Proximo a caducar", "Sin fecha")]
    interesting.sort(key=lambda r: (r["days_to_expiry"] is None, r["days_to_expiry"] or 0))
    return {"summary": summarize(rows), "rows": interesting}


@router.get("/product/{product_no}")
def product_detail(product_no: str, db: Session = Depends(get_db)):
    try:
        rows = _live_enriched(db, _params(product_no=product_no))
    except Exception:
        last = latest_ok_snapshot(db)
        if not last:
            raise HTTPException(404, "Producto no encontrado")
        rows = _snap_enriched(db, last.id, _params(product_no=product_no))
    rows = [r for r in rows if r["product_no"] == product_no]
    if not rows:
        raise HTTPException(404, "Producto no encontrado")
    by_wh: dict[str, float] = {}
    for r in rows:
        by_wh[r["warehouse"]] = by_wh.get(r["warehouse"], 0) + r["kg"]
    return {
        "product_no": product_no,
        "description": rows[0]["product_description"],
        "summary": summarize(rows),
        "by_warehouse": [{"warehouse": k, "kg": round(v, 2)} for k, v in sorted(by_wh.items())],
        "rows": rows,
    }


@router.get("/logs")
def logs(db: Session = Depends(get_db)):
    rows = db.scalars(select(ExecutionLog).order_by(ExecutionLog.id.desc()).limit(200)).all()
    return [
        {
            "id": r.id,
            "date": r.execution_date.isoformat(),
            "time": r.execution_time.strftime("%H:%M:%S"),
            "status": r.status,
            "records": r.records_processed,
            "error": r.error_message,
        }
        for r in rows
    ]
