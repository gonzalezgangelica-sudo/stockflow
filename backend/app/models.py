from __future__ import annotations

from datetime import date, datetime, time

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, String, Text, Time, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class Warehouse(Base):
    __tablename__ = "warehouse"
    code: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    active: Mapped[int] = mapped_column(Integer, default=1)


class Product(Base):
    __tablename__ = "product"
    product_no: Mapped[str] = mapped_column(String(40), primary_key=True)
    description: Mapped[str] = mapped_column(String(200), default="")
    family: Mapped[str] = mapped_column(String(80), default="")
    active: Mapped[int] = mapped_column(Integer, default=1)


class AppConfig(Base):
    __tablename__ = "app_config"
    key: Mapped[str] = mapped_column(String(80), primary_key=True)
    value: Mapped[str] = mapped_column(String(400), default="")


class Snapshot(Base):
    __tablename__ = "stock_snapshot"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_date: Mapped[date] = mapped_column(Date, index=True)
    snapshot_time: Mapped[time] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20), default="OK")
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    lines: Mapped[list["SnapshotLine"]] = relationship(back_populates="snapshot")
    __table_args__ = (UniqueConstraint("snapshot_date", name="uq_snapshot_date"),)


class SnapshotLine(Base):
    __tablename__ = "stock_snapshot_line"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    snapshot_id: Mapped[int] = mapped_column(ForeignKey("stock_snapshot.id"), index=True)
    warehouse: Mapped[str] = mapped_column(String(20), index=True)
    product_no: Mapped[str] = mapped_column(String(40), index=True)
    product_description: Mapped[str] = mapped_column(String(200), default="")
    lot_no: Mapped[str] = mapped_column(String(50), default="", index=True)
    packing_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    harvest_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    quantity: Mapped[float] = mapped_column(Float, default=1)
    remaining_quantity: Mapped[float] = mapped_column(Float, default=1)
    boxes: Mapped[float] = mapped_column(Float, default=1)
    kg: Mapped[float] = mapped_column(Float, default=0)
    snapshot: Mapped[Snapshot] = relationship(back_populates="lines")
    __table_args__ = (
        Index("ix_snap_wh_prod", "snapshot_id", "warehouse", "product_no"),
    )


class ExecutionLog(Base):
    __tablename__ = "execution_log"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    execution_date: Mapped[date] = mapped_column(Date, index=True)
    execution_time: Mapped[time] = mapped_column(Time)
    status: Mapped[str] = mapped_column(String(20))
    records_processed: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
