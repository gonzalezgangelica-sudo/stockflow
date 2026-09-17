"""Crea/actualiza el informe Excel Stock_caducidad.xlsm con macro Actualizar.

Estructura:
  Resumen  — vista global + boton Actualizar
  Pivot    — tabla dinamica (Almacen como filtro de informe)
  Todos    — detalle completo ILE (Cajas pendientes = 1)
  Alm X    — una pestana por almacen
  Parametros / Query — conexion y SQL embebida
"""
from __future__ import annotations

import datetime as dt
import os
import winreg
from pathlib import Path

import win32com.client as win32

ROOT = Path(__file__).resolve().parent
SQL_PATH = ROOT / "sql" / "stock_ile.sql"
BAS_PATH = ROOT / "StockILE.bas"
OUT_PATH = ROOT / "Reports" / "Stock_caducidad.xlsm"
BIOMASA_ENV = Path(r"C:\Users\ACZ\.codex\CALCULO_BIOMASA\.env")


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
            continue
        if ":" not in line:
            continue
        label, value = line.split(":", 1)
        mapped = {
            "server name": "BC_SERVER",
            "database": "BC_DATABASE",
            "user": "BC_USER",
            "password": "BC_PASSWORD",
        }.get(label.strip().lower())
        if mapped:
            env[mapped] = value.strip()
    return env


def enable_vbom() -> None:
    try:
        key = winreg.CreateKey(
            winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Office\16.0\Excel\Security"
        )
        winreg.SetValueEx(key, "AccessVBOM", 0, winreg.REG_DWORD, 1)
        winreg.CloseKey(key)
    except OSError:
        pass


def ensure_sheet(wb, name: str, after=None):
    try:
        return wb.Worksheets(name)
    except Exception:
        ws = wb.Worksheets.Add(After=after or wb.Worksheets(wb.Worksheets.Count))
        ws.Name = name
        return ws


def get_wb(excel):
    for i in range(1, excel.Workbooks.Count + 1):
        wb = excel.Workbooks.Item(i)
        if "Stock_caducidad" in wb.Name:
            return wb
    if OUT_PATH.exists():
        return excel.Workbooks.Open(str(OUT_PATH), UpdateLinks=0)
    wb = excel.Workbooks.Add()
    while wb.Worksheets.Count < 3:
        wb.Worksheets.Add(After=wb.Worksheets(wb.Worksheets.Count))
    return wb


def reimport_vba(wb) -> None:
    vb = wb.VBProject
    for i in range(vb.VBComponents.Count, 0, -1):
        name = vb.VBComponents(i).Name
        if name.startswith("StockILE"):
            try:
                vb.VBComponents.Remove(vb.VBComponents(i))
            except Exception:
                pass
    vb.VBComponents.Import(str(BAS_PATH))


def write_parametros(ws, env: dict[str, str]) -> None:
    ws.Cells.Clear
    ws.Range("A1").Value = "Conexion BC SQL (Item Ledger Entry) — solo lectura"
    ws.Range("A1").Font.Bold = True
    ws.Range("A1").Font.Size = 12
    ws.Range("A1").Font.Color = 0x513000  # BGR for 003051 approx via Excel COM often wants Long

    ws.Range("A2").Value = "Fecha (informativo)"
    ws.Range("B2").Value = dt.date.today().isoformat()
    ws.Range("A3").Value = "Filtro fijo"
    ws.Range("B3").Value = "Open = 1 AND Remaining Quantity = 1 (Cajas pendientes = 1)"
    ws.Range("A5").Value = "Ultima actualizacion"
    ws.Range("B5").NumberFormat = "dd/mm/yyyy hh:mm"
    ws.Range("A6").Value = "Registros ultima carga"

    ws.Range("A7").Value = "BC servidor"
    ws.Range("B7").Value = env.get("BC_SERVER") or os.environ.get("BC_SERVER", "")
    ws.Range("A8").Value = "BC base"
    ws.Range("B8").Value = env.get("BC_DATABASE") or os.environ.get("BC_DATABASE", "")
    ws.Range("A9").Value = "BC usuario"
    ws.Range("B9").Value = env.get("BC_USER") or os.environ.get("BC_USER", "")
    ws.Range("A10").Value = "BC password"
    ws.Range("B10").Value = env.get("BC_PASSWORD") or os.environ.get("BC_PASSWORD", "")
    ws.Range("B10").NumberFormat = ";;;"

    ws.Range("A12").Value = (
        "Pulsa Actualizar en la hoja Resumen. La SQL vive en Query!B2. "
        "No hace falta copiar/pegar datos."
    )
    ws.Columns("A:B").AutoFit()


def write_query(ws) -> None:
    sql = SQL_PATH.read_text(encoding="utf-8").strip()
    # Quitar comentarios de cabecera para ADO (opcional; SQL Server acepta --)
    ws.Cells.Clear
    ws.Range("A1").Value = "SQL embebida (Item Ledger Entry)"
    ws.Range("A2").Value = "Stock ILE cajas pendientes = 1"
    ws.Range("B2").Value = sql
    ws.Range("B2").WrapText = True
    ws.Columns("B").ColumnWidth = 120
    ws.Rows("2").RowHeight = 120


def ensure_button(ws) -> None:
    for i in range(1, ws.Shapes.Count + 1):
        shp = ws.Shapes.Item(i)
        try:
            if "Actualizar" in str(shp.OnAction):
                shp.OnAction = "StockILE.Actualizar"
                return
        except Exception:
            pass
    while ws.Shapes.Count > 0:
        try:
            ws.Shapes.Item(1).Delete()
        except Exception:
            break
    shp = ws.Shapes.AddShape(
        5, float(ws.Range("E2").Left), float(ws.Range("E2").Top), 140, 30
    )  # msoShapeRoundedRectangle
    shp.Fill.ForeColor.RGB = 0x513000
    shp.Line.Visible = 0
    shp.TextFrame.Characters().Text = "Actualizar"
    shp.TextFrame.Characters().Font.Color = 0xFFFFFF
    shp.TextFrame.Characters().Font.Bold = True
    shp.TextFrame.Characters().Font.Size = 12
    shp.Name = "BtnActualizar"
    shp.OnAction = "StockILE.Actualizar"


def main() -> None:
    enable_vbom()
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    env = load_env(BIOMASA_ENV)
    env.update(load_env(ROOT / ".env"))
    missing = [k for k in ("BC_SERVER", "BC_DATABASE", "BC_USER", "BC_PASSWORD") if not env.get(k)]
    if missing:
        raise SystemExit("Faltan credenciales BC: " + ", ".join(missing))

    if not BAS_PATH.exists():
        raise SystemExit(f"No encuentro {BAS_PATH}")
    if not SQL_PATH.exists():
        raise SystemExit(f"No encuentro {SQL_PATH}")

    try:
        excel = win32.GetActiveObject("Excel.Application")
    except Exception:
        excel = win32.Dispatch("Excel.Application")
    excel.Visible = True
    excel.DisplayAlerts = False

    wb = get_wb(excel)
    ws_p = ensure_sheet(wb, "Parametros")
    ws_q = ensure_sheet(wb, "Query", ws_p)
    ws_r = ensure_sheet(wb, "Resumen", ws_q)
    ensure_sheet(wb, "Todos", ws_r)

    write_parametros(ws_p, env)
    write_query(ws_q)

    ws_r.Range("A1").Value = "Stock y caducidad — Item Ledger Entry"
    ws_r.Range("A1").Font.Size = 18
    ws_r.Range("A1").Font.Bold = True
    ws_r.Range("A2").Value = "Pulsa Actualizar para cargar desde BC (Cajas pendientes = 1)."
    ensure_button(ws_r)

    # Orden: Resumen primero
    ws_r.Move(Before=wb.Worksheets(1))

    reimport_vba(wb)
    dest = str(OUT_PATH)
    wb.SaveAs(dest, FileFormat=52)  # xlOpenXMLWorkbookMacroEnabled
    print("Guardado", dest)
    print("Ejecutando StockILE.Actualizar (puede tardar varios minutos)...")
    excel.Run("StockILE.Actualizar")
    wb.Save()
    excel.DisplayAlerts = True
    print("Listo", wb.FullName)


if __name__ == "__main__":
    main()
