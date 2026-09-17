from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Iterable


CADUCADO = "Caducado"
PROXIMO = "Proximo a caducar"
CORRECTO = "Correcto"
SIN_FECHA = "Sin fecha"


@dataclass(frozen=True)
class AgeBucket:
    label: str
    min_days: int
    max_days: int | None


def parse_age_buckets(spec: str) -> list[AgeBucket]:
    buckets: list[AgeBucket] = []
    for raw in spec.split(","):
        token = raw.strip()
        if not token:
            continue
        if token.endswith("+"):
            buckets.append(AgeBucket(token, int(token[:-1]), None))
            continue
        lo, hi = token.split("-", 1)
        buckets.append(AgeBucket(token, int(lo), int(hi)))
    return buckets


def expiry_status(expiry: date | None, today: date, warning_days: int) -> tuple[str, int | None]:
    if expiry is None:
        return SIN_FECHA, None
    days = (expiry - today).days
    if days < 0:
        return CADUCADO, days
    if days <= warning_days:
        return PROXIMO, days
    return CORRECTO, days


def days_since_packing(packing: date | None, today: date) -> int | None:
    if packing is None:
        return None
    return (today - packing).days


def age_label(days: int | None, buckets: Iterable[AgeBucket]) -> str:
    if days is None:
        return "Sin fecha empaque"
    for b in buckets:
        if days < b.min_days:
            continue
        if b.max_days is None or days <= b.max_days:
            return b.label
    return "Sin clasificar"


def identity_key(warehouse: str, product_no: str, lot_no: str, packing: date | None, expiry: date | None) -> tuple:
    return (
        warehouse or "",
        product_no or "",
        lot_no or "",
        packing.isoformat() if packing else "",
        expiry.isoformat() if expiry else "",
    )
