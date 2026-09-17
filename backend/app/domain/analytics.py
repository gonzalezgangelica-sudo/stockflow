from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .stock import age_label, days_since_packing, expiry_status, identity_key, parse_age_buckets
from ..config import get_settings
from ..data.bc_source import StockRow
from ..data.snapshots import get_config_value
from ..models import Snapshot, SnapshotLine


def warning_days(db: Session) -> int:
    return int(get_config_value(db, "expiry_warning_days", str(get_settings().expiry_warning_days)))


def buckets(db: Session):
    return parse_age_buckets(get_config_value(db, "age_buckets", get_settings().age_buckets))


def enrich(row: dict[str, Any], today: date, warn: int, age_spec) -> dict[str, Any]:
    status, days = expiry_status(row.get("expiry_date"), today, warn)
    age_days = days_since_packing(row.get("packing_date"), today)
    out = dict(row)
    out["expiry_status"] = status
    out["days_to_expiry"] = days
    out["days_since_packing"] = age_days
    out["age_bucket"] = age_label(age_days, age_spec)
    out["boxes"] = float(out.get("boxes") or out.get("remaining_quantity") or 0)
    out["kg"] = float(out.get("kg") or 0)
    return out


def line_to_dict(line: SnapshotLine) -> dict[str, Any]:
    return {
        "warehouse": line.warehouse,
        "product_no": line.product_no,
        "product_description": line.product_description,
        "lot_no": line.lot_no,
        "packing_date": line.packing_date,
        "harvest_date": line.harvest_date,
        "expiry_date": line.expiry_date,
        "quantity": line.quantity,
        "remaining_quantity": line.remaining_quantity,
        "boxes": line.boxes,
        "kg": line.kg,
        "family": "",
    }


def live_to_dict(row: StockRow) -> dict[str, Any]:
    return {
        "warehouse": row.warehouse,
        "product_no": row.product_no,
        "product_description": row.product_description,
        "lot_no": row.lot_no,
        "packing_date": row.packing_date,
        "harvest_date": row.harvest_date,
        "expiry_date": row.expiry_date,
        "quantity": row.remaining_quantity,
        "remaining_quantity": row.remaining_quantity,
        "boxes": row.boxes,
        "kg": row.kg,
        "family": "",
    }


def apply_filters(rows: list[dict[str, Any]], q: dict[str, Any]) -> list[dict[str, Any]]:
    out = rows
    if q.get("warehouse"):
        out = [r for r in out if r["warehouse"] == q["warehouse"]]
    if q.get("product_no"):
        needle = q["product_no"].lower()
        out = [r for r in out if needle in (r["product_no"] + " " + r["product_description"]).lower()]
    if q.get("lot_no"):
        out = [r for r in out if q["lot_no"].lower() in (r["lot_no"] or "").lower()]
    if q.get("family"):
        out = [r for r in out if (r.get("family") or "") == q["family"]]
    if q.get("expiry_status"):
        out = [r for r in out if r.get("expiry_status") == q["expiry_status"]]
    if q.get("packing_date"):
        out = [r for r in out if str(r.get("packing_date") or "") == str(q["packing_date"])]
    if q.get("expiry_date"):
        out = [r for r in out if str(r.get("expiry_date") or "") == str(q["expiry_date"])]
    return out


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    kg = sum(r["kg"] for r in rows)
    boxes = sum(r["boxes"] for r in rows)
    by_status: dict[str, dict[str, float]] = defaultdict(lambda: {"kg": 0.0, "boxes": 0.0, "count": 0})
    products = set()
    lots = set()
    warehouses: dict[str, dict[str, float]] = defaultdict(lambda: {"kg": 0.0, "boxes": 0.0, "products": set(), "caducado_kg": 0.0, "proximo_kg": 0.0})
    for r in rows:
        st = r.get("expiry_status") or "Sin fecha"
        by_status[st]["kg"] += r["kg"]
        by_status[st]["boxes"] += r["boxes"]
        by_status[st]["count"] += 1
        products.add(r["product_no"])
        if r.get("lot_no"):
            lots.add(r["lot_no"])
        wh = warehouses[r["warehouse"]]
        wh["kg"] += r["kg"]
        wh["boxes"] += r["boxes"]
        wh["products"].add(r["product_no"])
        if st == "Caducado":
            wh["caducado_kg"] += r["kg"]
        if st == "Proximo a caducar":
            wh["proximo_kg"] += r["kg"]
    return {
        "kg": round(kg, 2),
        "boxes": round(boxes, 2),
        "products": len(products),
        "lots": len(lots),
        "records": len(rows),
        "by_status": {k: {"kg": round(v["kg"], 2), "boxes": round(v["boxes"], 2), "count": int(v["count"])} for k, v in by_status.items()},
        "by_warehouse": [
            {
                "warehouse": code,
                "kg": round(v["kg"], 2),
                "boxes": round(v["boxes"], 2),
                "products": len(v["products"]),
                "caducado_kg": round(v["caducado_kg"], 2),
                "proximo_kg": round(v["proximo_kg"], 2),
            }
            for code, v in sorted(warehouses.items())
        ],
    }


def snapshot_lines(db: Session, snapshot_id: int) -> list[SnapshotLine]:
    return list(db.scalars(select(SnapshotLine).where(SnapshotLine.snapshot_id == snapshot_id)))


def evolution(db: Session, days: int, warehouse: str | None, product_no: str | None) -> list[dict[str, Any]]:
    since = date.today() - timedelta(days=days)
    snaps = list(
        db.scalars(select(Snapshot).where(Snapshot.status == "OK", Snapshot.snapshot_date >= since).order_by(Snapshot.snapshot_date))
    )
    series = []
    for s in snaps:
        lines = snapshot_lines(db, s.id)
        rows = [line_to_dict(x) for x in lines]
        if warehouse:
            rows = [r for r in rows if r["warehouse"] == warehouse]
        if product_no:
            rows = [r for r in rows if r["product_no"] == product_no]
        series.append(
            {
                "date": s.snapshot_date.isoformat(),
                "kg": round(sum(r["kg"] for r in rows), 2),
                "boxes": round(sum(r["boxes"] for r in rows), 2),
            }
        )
    return series


def movement(db: Session, days: int) -> list[dict[str, Any]]:
    series = evolution(db, days, None, None)
    out = []
    for i, point in enumerate(series):
        prev = series[i - 1]["kg"] if i else None
        delta = None if prev is None else round(point["kg"] - prev, 2)
        out.append(
            {
                "date": point["date"],
                "stock_inicial": prev,
                "stock_final": point["kg"],
                "variacion": delta,
            }
        )
    return out


def packing_analysis(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, float]] = defaultdict(lambda: {"kg": 0.0, "boxes": 0.0})
    total = sum(r["kg"] for r in rows) or 1
    for r in rows:
        key = r["packing_date"].isoformat() if r.get("packing_date") else "Sin fecha"
        groups[key]["kg"] += r["kg"]
        groups[key]["boxes"] += r["boxes"]
    result = []
    for k, v in sorted(groups.items()):
        result.append({"packing_date": k, "kg": round(v["kg"], 2), "boxes": round(v["boxes"], 2), "pct": round(100 * v["kg"] / total, 1)})
    return result


def age_analysis(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, dict[str, float]] = defaultdict(lambda: {"kg": 0.0, "boxes": 0.0, "count": 0})
    for r in rows:
        b = r.get("age_bucket") or "Sin clasificar"
        groups[b]["kg"] += r["kg"]
        groups[b]["boxes"] += r["boxes"]
        groups[b]["count"] += 1
    return [{"bucket": k, "kg": round(v["kg"], 2), "boxes": round(v["boxes"], 2), "count": int(v["count"])} for k, v in groups.items()]


def compare_sets(initial: list[dict[str, Any]], live: list[dict[str, Any]]) -> list[dict[str, Any]]:
    a: dict[tuple, dict[str, float]] = defaultdict(lambda: {"kg": 0.0, "boxes": 0.0, "desc": "", "warehouse": "", "product_no": ""})
    b: dict[tuple, dict[str, float]] = defaultdict(lambda: {"kg": 0.0, "boxes": 0.0, "desc": "", "warehouse": "", "product_no": ""})
    for r in initial:
        k = (r["warehouse"], r["product_no"])
        a[k]["kg"] += r["kg"]
        a[k]["boxes"] += r["boxes"]
        a[k]["desc"] = r["product_description"]
        a[k]["warehouse"] = r["warehouse"]
        a[k]["product_no"] = r["product_no"]
    for r in live:
        k = (r["warehouse"], r["product_no"])
        b[k]["kg"] += r["kg"]
        b[k]["boxes"] += r["boxes"]
        b[k]["desc"] = r["product_description"]
        b[k]["warehouse"] = r["warehouse"]
        b[k]["product_no"] = r["product_no"]
    keys = sorted(set(a) | set(b))
    out = []
    for k in keys:
        kg0 = a[k]["kg"]
        kg1 = b[k]["kg"]
        diff = kg1 - kg0
        pct = (diff / kg0 * 100) if kg0 else None
        out.append(
            {
                "warehouse": k[0],
                "product_no": k[1],
                "product_description": a[k]["desc"] or b[k]["desc"],
                "kg_inicial": round(kg0, 2),
                "kg_vivo": round(kg1, 2),
                "kg_diff": round(diff, 2),
                "pct": round(pct, 1) if pct is not None else None,
                "boxes_inicial": round(a[k]["boxes"], 2),
                "boxes_vivo": round(b[k]["boxes"], 2),
            }
        )
    out.sort(key=lambda x: abs(x["kg_diff"]), reverse=True)
    return out
