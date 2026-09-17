Attribute VB_Name = "StockILE"
Option Explicit

' Informe stock + caducidad desde Item Ledger Entry (Cajas pendientes = 1).

Public Sub Actualizar()
    Dim cn As Object
    Dim sql As String
    Dim calc As XlCalculation
    Dim wsAct As Worksheet
    Dim zoomPct As Double, scRow As Long, scCol As Long
    Dim t0 As Double
    Dim paso As String

    On Error GoTo Fallo
    t0 = Timer
    paso = "inicio"
    calc = Application.Calculation
    Set wsAct = ActiveSheet
    On Error Resume Next
    zoomPct = ActiveWindow.Zoom
    scRow = ActiveWindow.ScrollRow
    scCol = ActiveWindow.ScrollColumn
    On Error GoTo Fallo

    Application.StatusBar = "Stock ILE: conectando a BC..."
    Application.ScreenUpdating = False
    Application.DisplayAlerts = False
    Application.EnableEvents = False
    Application.Calculation = xlCalculationManual

    paso = "conexion BC"
    Set cn = OpenCnn()
    cn.CommandTimeout = 600
    sql = Trim$(CStr(ThisWorkbook.Worksheets("Query").Range("B2").Value))
    If Len(sql) = 0 Then Err.Raise 1004, , "Falta la SQL en Query!B2."

    Application.StatusBar = "Stock ILE: consultando Item Ledger Entry (Cajas pendientes = 1)..."
    paso = "consulta ILE"
    DumpToDatos cn, sql
    cn.Close

    Application.StatusBar = "Stock ILE: formato y alertas..."
    paso = "formato Todos"
    FormatearDatos
    Application.StatusBar = "Stock ILE: resumen..."
    paso = "resumen"
    RebuildResumen
    Application.StatusBar = "Stock ILE: pestañas por almacén..."
    paso = "hojas por almacen"
    RebuildAlmacenSheets
    Application.StatusBar = "Stock ILE: tabla dinámica..."
    paso = "pivot"
    RebuildPivot
    paso = "boton Actualizar"
    EnsureHojasControl
    EnsureActualizarButton ThisWorkbook.Worksheets("Actualizar")
    paso = "visibilidad hojas"
    ApplySheetVisibility

    ThisWorkbook.Worksheets("Parametros").Range("B5").Value = Now
    On Error Resume Next
    ThisWorkbook.Worksheets("Actualizar").Range("B3").Value = Now
    On Error GoTo Fallo

    On Error Resume Next
    ThisWorkbook.Worksheets("Actualizar").Activate
    On Error GoTo Fallo

    Application.Calculation = calc
    Application.EnableEvents = True
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    Application.StatusBar = False

    MsgBox "Informe actualizado desde Item Ledger Entry." & vbCrLf & _
           "Filtro: Open = 1 y Cajas pendientes = 1." & vbCrLf & _
           "Tiempo: " & Format$(Timer - t0, "0") & " s", vbInformation, "Stock caducidad"
    Exit Sub

Fallo:
    Application.Calculation = xlCalculationAutomatic
    Application.EnableEvents = True
    Application.DisplayAlerts = True
    Application.ScreenUpdating = True
    Application.StatusBar = False
    MsgBox "Error en paso '" & paso & "':" & vbCrLf & Err.Description, vbCritical, "Stock caducidad"
End Sub

Private Function OpenCnn() As Object
    Dim wsP As Worksheet
    Dim server As String, db As String, user As String, pwd As String, cs As String
    Dim cn As Object

    Set wsP = ThisWorkbook.Worksheets("Parametros")
    server = Trim$(CStr(wsP.Range("B7").Value))
    db = Trim$(CStr(wsP.Range("B8").Value))
    user = Trim$(CStr(wsP.Range("B9").Value))
    pwd = Trim$(CStr(wsP.Range("B10").Value))
    If server = "" Or db = "" Then Err.Raise 1004, , "Faltan servidor/base en Parametros (B7/B8)."

    Set cn = CreateObject("ADODB.Connection")
    On Error Resume Next
    If user = "" Then
        cs = "Provider=SQLOLEDB;Data Source=" & server & ";Initial Catalog=" & db & ";Integrated Security=SSPI;"
    Else
        cs = "Provider=SQLOLEDB;Data Source=" & server & ";Initial Catalog=" & db & ";User ID=" & user & ";Password=" & pwd & ";"
    End If
    cn.Open cs
    If Err.Number <> 0 Then
        Err.Clear
        If user = "" Then
            cs = "Provider=MSOLEDBSQL;Data Source=" & server & ";Initial Catalog=" & db & ";Trusted_Connection=yes;"
        Else
            cs = "Provider=MSOLEDBSQL;Data Source=" & server & ";Initial Catalog=" & db & ";User ID=" & user & ";Password=" & pwd & ";"
        End If
        cn.Open cs
    End If
    If Err.Number <> 0 Then
        Dim msg As String
        msg = Err.Description
        On Error GoTo 0
        Err.Raise 1004, "OpenCnn", msg
    End If
    On Error GoTo 0
    Set OpenCnn = cn
End Function

Private Sub DumpToDatos(cn As Object, sql As String)
    Dim rs As Object, ws As Worksheet, lo As Object
    Dim i As Long, lastRow As Long, lastCol As Long

    Set rs = CreateObject("ADODB.Recordset")
    rs.CursorLocation = 3 ' adUseClient
    rs.Open sql, cn, 3, 1 ' adOpenStatic, adLockReadOnly

    Set ws = SheetByName("Todos")
    On Error Resume Next
    For Each lo In ws.ListObjects
        lo.Unlist
    Next lo
    On Error GoTo 0
    ws.Cells.Clear
    ws.Cells.FormatConditions.Delete

    lastCol = rs.Fields.Count
    For i = 0 To lastCol - 1
        ws.Cells(1, i + 1).Value = rs.Fields(i).Name
    Next i
    If Not rs.EOF Then
        ws.Range("A2").CopyFromRecordset rs
    End If
    rs.Close

    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    If lastRow < 2 Then lastRow = 2
    ThisWorkbook.Worksheets("Parametros").Range("B6").Value = lastRow - 1
End Sub

Private Sub FormatearDatos()
    Dim ws As Worksheet
    Dim lastRow As Long, lastCol As Long
    Dim lo As ListObject
    Dim rng As Range

    Set ws = ThisWorkbook.Worksheets("Todos")
    lastRow = ws.Cells(ws.Rows.Count, 1).End(xlUp).Row
    lastCol = ws.Cells(1, ws.Columns.Count).End(xlToLeft).Column
    If lastRow < 2 Then Exit Sub

    StyleHeaderRow ws, lastCol
    ApplyNumberFormats ws, lastRow
    ApplyEstadoCF ws, lastRow, ColByHeader(ws, "Estado caducidad")

    On Error Resume Next
    For Each lo In ws.ListObjects
        lo.Unlist
    Next lo
    On Error GoTo 0

    Set rng = ws.Range(ws.Cells(1, 1), ws.Cells(lastRow, lastCol))
    Set lo = ws.ListObjects.Add(xlSrcRange, rng, , xlYes)
    lo.Name = "StockTodos"
    lo.TableStyle = "TableStyleMedium2"

    ws.Activate
    On Error Resume Next
    ActiveWindow.FreezePanes = False
    ws.Range("A2").Select
    ActiveWindow.FreezePanes = True
    On Error GoTo 0
    ws.Columns("A").ColumnWidth = 10
    ws.Columns("B").ColumnWidth = 12
    ws.Columns("C").ColumnWidth = 40
    ws.Columns("D").ColumnWidth = 16
    ws.Columns("E").ColumnWidth = 14
    ws.Columns("F").ColumnWidth = 14
    ws.Columns("G").ColumnWidth = 14
    ws.Columns("H").ColumnWidth = 12
    ws.Columns("I").ColumnWidth = 12
    ws.Columns("J").ColumnWidth = 18
    ws.DisplayPageBreaks = False
End Sub

Private Sub RebuildResumen()
    Dim wsR As Worksheet, wsD As Worksheet
    Dim lastRow As Long, i As Long, r As Long, rAlert As Long, nAlert As Long
    Dim alm As String, est As String, sheetName As String, sem As String
    Dim kg As Double, totKg As Double, pct As Double
    Dim totReg As Long
    Dim nCad As Long, nProx As Long, nSeg As Long, nOk As Long, nSin As Long
    Dim kgCad As Double, kgProx As Double, kgSeg As Double, kgOk As Double, kgSin As Double
    Dim dReg As Object, dKg As Object
    Dim dCad As Object, dProx As Object, dSeg As Object, dOk As Object, dSin As Object
    Dim keys As Variant, key As Variant
    Dim s As Long, prio As Long
    Dim lo As ListObject
    Dim arr() As Variant, nKeys As Long, a As Long, b As Long, tmp As Variant

    Set wsR = SheetByName("Resumen")
    Set wsD = ThisWorkbook.Worksheets("Todos")

    On Error Resume Next
    For s = wsR.Shapes.Count To 1 Step -1
        wsR.Shapes(s).Delete
    Next s
    For Each lo In wsR.ListObjects
        lo.Unlist
    Next lo
    wsR.Cells.Clear
    wsR.Cells.ClearFormats
    On Error GoTo 0

    Set dReg = CreateObject("Scripting.Dictionary")
    Set dKg = CreateObject("Scripting.Dictionary")
    Set dCad = CreateObject("Scripting.Dictionary")
    Set dProx = CreateObject("Scripting.Dictionary")
    Set dSeg = CreateObject("Scripting.Dictionary")
    Set dOk = CreateObject("Scripting.Dictionary")
    Set dSin = CreateObject("Scripting.Dictionary")

    lastRow = wsD.Cells(wsD.Rows.Count, 1).End(xlUp).Row
    totReg = 0&
    totKg = 0#
    For i = 2 To lastRow
        alm = Trim$(CStr(wsD.Cells(i, 1).Value))
        If Len(alm) = 0 Then GoTo NextI
        est = Trim$(CStr(wsD.Cells(i, 10).Value))
        kg = CDbl(Val(Replace(CStr(wsD.Cells(i, 4).Value), ",", ".")))

        If Not dReg.Exists(alm) Then
            dReg.Add alm, 0&
            dKg.Add alm, 0#
            dCad.Add alm, 0&
            dProx.Add alm, 0&
            dSeg.Add alm, 0&
            dOk.Add alm, 0&
            dSin.Add alm, 0&
        End If
        dReg(alm) = CLng(dReg(alm)) + 1&
        dKg(alm) = CDbl(dKg(alm)) + kg

        Select Case est
            Case "Caducado"
                dCad(alm) = CLng(dCad(alm)) + 1&: nCad = nCad + 1&: kgCad = kgCad + kg
            Case "Proximo a caducar"
                dProx(alm) = CLng(dProx(alm)) + 1&: nProx = nProx + 1&: kgProx = kgProx + kg
            Case "En seguimiento"
                dSeg(alm) = CLng(dSeg(alm)) + 1&: nSeg = nSeg + 1&: kgSeg = kgSeg + kg
            Case "Correcto"
                dOk(alm) = CLng(dOk(alm)) + 1&: nOk = nOk + 1&: kgOk = kgOk + kg
            Case Else
                dSin(alm) = CLng(dSin(alm)) + 1&: nSin = nSin + 1&: kgSin = kgSin + kg
        End Select
        totReg = totReg + 1&
        totKg = totKg + kg
NextI:
    Next i

    ' === Cabecera ===
    With wsR.Range("A1:J1")
        .Merge
        .Value = "  STOCK Y CADUCIDAD  —  Dashboard de alertas"
        .Font.Name = "Calibri"
        .Font.Size = 20
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(0, 48, 81)
        .VerticalAlignment = xlCenter
    End With
    wsR.Rows(1).RowHeight = 34

    With wsR.Range("A2:J2")
        .Merge
        .Value = "  Item Ledger Entry  |  Open = 1  |  Cajas pendientes = 1  |  Stock = Kilos de la linea ILE"
        .Font.Size = 10
        .Font.Color = RGB(220, 230, 240)
        .Interior.Color = RGB(0, 70, 110)
        .VerticalAlignment = xlCenter
    End With
    wsR.Rows(2).RowHeight = 18

    wsR.Range("A3").Value = "Actualizado"
    wsR.Range("B3").NumberFormat = "dd/mm/aaaa hh:mm"
    wsR.Range("C3").Value = "Total lineas"
    wsR.Range("D3").Value = totReg
    wsR.Range("D3").NumberFormat = "#,##0"
    wsR.Range("E3").Value = "Total kg"
    wsR.Range("F3").Value = Round(totKg, 2)
    wsR.Range("F3").NumberFormat = "#,##0.00"
    wsR.Range("A3:F3").Font.Size = 11
    wsR.Range("A3").Font.Bold = True
    wsR.Range("C3").Font.Bold = True
    wsR.Range("E3").Font.Bold = True

    ' === Semaforo / cards ===
    wsR.Range("A5").Value = "SEMAFORO DE ALERTAS"
    wsR.Range("A5").Font.Size = 13
    wsR.Range("A5").Font.Bold = True
    wsR.Range("A5").Font.Color = RGB(0, 48, 81)

    PaintCard wsR, 6, 1, "ROJO", "Caducado", nCad, kgCad, totReg, RGB(192, 0, 0), RGB(255, 255, 255)
    PaintCard wsR, 6, 3, "NARANJA", "Proximo (<=7 d)", nProx, kgProx, totReg, RGB(237, 125, 49), RGB(255, 255, 255)
    PaintCard wsR, 6, 5, "AMARILLO", "Seguimiento (8-15)", nSeg, kgSeg, totReg, RGB(255, 192, 0), RGB(64, 64, 64)
    PaintCard wsR, 6, 7, "VERDE", "Correcto (>15 d)", nOk, kgOk, totReg, RGB(84, 130, 53), RGB(255, 255, 255)
    PaintCard wsR, 6, 9, "GRIS", "Sin fecha", nSin, kgSin, totReg, RGB(127, 127, 127), RGB(255, 255, 255)

    ' === Tabla detalle estado ===
    wsR.Range("A10").Value = "Detalle por estado"
    wsR.Range("A10").Font.Bold = True
    wsR.Range("A10").Font.Size = 12
    wsR.Range("A10").Font.Color = RGB(0, 48, 81)

    wsR.Range("A11").Value = "Semaforo"
    wsR.Range("B11").Value = "Estado"
    wsR.Range("C11").Value = "Lineas"
    wsR.Range("D11").Value = "Kg"
    wsR.Range("E11").Value = "% lineas"
    StyleHeaderRow wsR, 5, 11
    WriteSemaforoFila wsR, 12, "ROJO", "Caducado", nCad, kgCad, totReg, RGB(255, 199, 206), RGB(156, 0, 6)
    WriteSemaforoFila wsR, 13, "NARANJA", "Proximo a caducar", nProx, kgProx, totReg, RGB(248, 203, 173), RGB(156, 87, 0)
    WriteSemaforoFila wsR, 14, "AMARILLO", "En seguimiento", nSeg, kgSeg, totReg, RGB(255, 230, 153), RGB(128, 96, 0)
    WriteSemaforoFila wsR, 15, "VERDE", "Correcto", nOk, kgOk, totReg, RGB(198, 239, 206), RGB(0, 97, 0)
    WriteSemaforoFila wsR, 16, "GRIS", "Sin fecha", nSin, kgSin, totReg, RGB(217, 217, 217), RGB(89, 89, 89)
    Set lo = wsR.ListObjects.Add(xlSrcRange, wsR.Range("A11:E16"), , xlYes)
    lo.Name = "TablaEstado"
    lo.TableStyle = "TableStyleMedium9"

    ' Ordenar almacenes por prioridad de alerta
    keys = dReg.Keys
    nKeys = UBound(keys) - LBound(keys) + 1
    ReDim arr(1 To nKeys, 1 To 2)
    i = 1
    For Each key In keys
        alm = CStr(key)
        prio = SemaforoPrio(CLng(dCad(alm)), CLng(dProx(alm)), CLng(dSeg(alm)))
        arr(i, 1) = prio
        arr(i, 2) = alm
        i = i + 1
    Next key
    For a = 1 To nKeys - 1
        For b = a + 1 To nKeys
            If arr(b, 1) < arr(a, 1) Or (arr(b, 1) = arr(a, 1) And CStr(arr(b, 2)) < CStr(arr(a, 2))) Then
                tmp = arr(a, 1): arr(a, 1) = arr(b, 1): arr(b, 1) = tmp
                tmp = arr(a, 2): arr(a, 2) = arr(b, 2): arr(b, 2) = tmp
            End If
        Next b
    Next a

    ' === Almacenes en alerta (solo rojo/naranja) ===
    wsR.Range("A18").Value = "Almacenes en alerta (rojo / naranja) — revisar primero"
    wsR.Range("A18").Font.Bold = True
    wsR.Range("A18").Font.Size = 12
    wsR.Range("A18").Font.Color = RGB(192, 0, 0)

    wsR.Range("A19").Value = "Semaforo"
    wsR.Range("B19").Value = "Almacen"
    wsR.Range("C19").Value = "Lineas"
    wsR.Range("D19").Value = "Kg"
    wsR.Range("E19").Value = "Caducado"
    wsR.Range("F19").Value = "Proximo"
    wsR.Range("G19").Value = "Seguimiento"
    wsR.Range("H19").Value = "Correcto"
    wsR.Range("I19").Value = "Sin fecha"
    wsR.Range("J19").Value = "Ir a hoja"
    StyleHeaderRow wsR, 10, 19

    rAlert = 20
    nAlert = 0
    For a = 1 To nKeys
        alm = CStr(arr(a, 2))
        If CLng(dCad(alm)) > 0 Or CLng(dProx(alm)) > 0 Then
            WriteAlmacenFila wsR, rAlert, alm, dReg, dKg, dCad, dProx, dSeg, dOk, dSin
            rAlert = rAlert + 1
            nAlert = nAlert + 1
        End If
    Next a
    If nAlert = 0 Then
        wsR.Range("A20").Value = "VERDE"
        wsR.Range("B20").Value = "(ninguno)"
        wsR.Range("C20").Value = 0
        rAlert = 21
    End If
    Set lo = wsR.ListObjects.Add(xlSrcRange, wsR.Range(wsR.Cells(19, 1), wsR.Cells(rAlert - 1, 10)), , xlYes)
    lo.Name = "TablaAlertas"
    lo.TableStyle = "TableStyleMedium3"

    ' === Todos los almacenes ===
    r = rAlert + 1
    wsR.Cells(r, 1).Value = "Todos los almacenes (ordenados por urgencia)"
    wsR.Cells(r, 1).Font.Bold = True
    wsR.Cells(r, 1).Font.Size = 12
    wsR.Cells(r, 1).Font.Color = RGB(0, 48, 81)
    r = r + 1
    wsR.Cells(r, 1).Value = "Semaforo"
    wsR.Cells(r, 2).Value = "Almacen"
    wsR.Cells(r, 3).Value = "Lineas"
    wsR.Cells(r, 4).Value = "Kg"
    wsR.Cells(r, 5).Value = "Caducado"
    wsR.Cells(r, 6).Value = "Proximo"
    wsR.Cells(r, 7).Value = "Seguimiento"
    wsR.Cells(r, 8).Value = "Correcto"
    wsR.Cells(r, 9).Value = "Sin fecha"
    wsR.Cells(r, 10).Value = "Ir a hoja"
    StyleHeaderRow wsR, 10, r
    r = r + 1
    For a = 1 To nKeys
        alm = CStr(arr(a, 2))
        WriteAlmacenFila wsR, r, alm, dReg, dKg, dCad, dProx, dSeg, dOk, dSin
        r = r + 1
    Next a
    Set lo = wsR.ListObjects.Add(xlSrcRange, wsR.Range(wsR.Cells(rAlert + 2, 1), wsR.Cells(r - 1, 10)), , xlYes)
    lo.Name = "TablaAlmacenes"
    lo.TableStyle = "TableStyleMedium2"

    ' Leyenda
    wsR.Cells(r + 1, 1).Value = "Como leer el semaforo"
    wsR.Cells(r + 1, 1).Font.Bold = True
    wsR.Cells(r + 1, 1).Font.Color = RGB(0, 48, 81)
    wsR.Cells(r + 2, 1).Value = "Semaforo"
    wsR.Cells(r + 2, 2).Value = "Significado"
    StyleHeaderRow wsR, 2, r + 2
    wsR.Cells(r + 3, 1).Value = "ROJO": wsR.Cells(r + 3, 1).Interior.Color = RGB(255, 199, 206): wsR.Cells(r + 3, 1).Font.Bold = True
    wsR.Cells(r + 3, 2).Value = "Hay producto caducado en el almacen"
    wsR.Cells(r + 4, 1).Value = "NARANJA": wsR.Cells(r + 4, 1).Interior.Color = RGB(248, 203, 173): wsR.Cells(r + 4, 1).Font.Bold = True
    wsR.Cells(r + 4, 2).Value = "Hay producto a 7 dias o menos de caducar"
    wsR.Cells(r + 5, 1).Value = "AMARILLO": wsR.Cells(r + 5, 1).Interior.Color = RGB(255, 230, 153): wsR.Cells(r + 5, 1).Font.Bold = True
    wsR.Cells(r + 5, 2).Value = "Hay producto en seguimiento (8-15 dias)"
    wsR.Cells(r + 6, 1).Value = "VERDE": wsR.Cells(r + 6, 1).Interior.Color = RGB(198, 239, 206): wsR.Cells(r + 6, 1).Font.Bold = True
    wsR.Cells(r + 6, 2).Value = "Sin alertas de caducidad (<=15 dias)"
    Set lo = wsR.ListObjects.Add(xlSrcRange, wsR.Range(wsR.Cells(r + 2, 1), wsR.Cells(r + 6, 2)), , xlYes)
    lo.Name = "TablaLeyenda"
    lo.TableStyle = "TableStyleMedium2"

    wsR.Columns("A").ColumnWidth = 12
    wsR.Columns("B").ColumnWidth = 18
    wsR.Columns("C").ColumnWidth = 11
    wsR.Columns("D").ColumnWidth = 12
    wsR.Columns("E").ColumnWidth = 11
    wsR.Columns("F").ColumnWidth = 11
    wsR.Columns("G").ColumnWidth = 12
    wsR.Columns("H").ColumnWidth = 11
    wsR.Columns("I").ColumnWidth = 11
    wsR.Columns("J").ColumnWidth = 12
    wsR.DisplayPageBreaks = False
    On Error Resume Next
    ActiveWindow.DisplayGridlines = False
    On Error GoTo 0
    wsR.Activate
End Sub

Private Function SemaforoPrio(nCad As Long, nProx As Long, nSeg As Long) As Long
    If nCad > 0 Then
        SemaforoPrio = 1
    ElseIf nProx > 0 Then
        SemaforoPrio = 2
    ElseIf nSeg > 0 Then
        SemaforoPrio = 3
    Else
        SemaforoPrio = 4
    End If
End Function

Private Function SemaforoTexto(nCad As Long, nProx As Long, nSeg As Long) As String
    If nCad > 0 Then
        SemaforoTexto = "ROJO"
    ElseIf nProx > 0 Then
        SemaforoTexto = "NARANJA"
    ElseIf nSeg > 0 Then
        SemaforoTexto = "AMARILLO"
    Else
        SemaforoTexto = "VERDE"
    End If
End Function

Private Sub PaintCard(ws As Worksheet, r As Long, c As Long, sem As String, titulo As String, n As Long, kg As Double, tot As Long, fillRgb As Long, fontRgb As Long)
    Dim rng As Range
    Dim pct As Double
    If tot > 0 Then pct = n / tot Else pct = 0

    Set rng = ws.Range(ws.Cells(r, c), ws.Cells(r, c + 1))
    rng.Merge
    rng.Value = sem & "  ·  " & titulo
    rng.Interior.Color = fillRgb
    rng.Font.Color = fontRgb
    rng.Font.Bold = True
    rng.Font.Size = 9
    rng.HorizontalAlignment = xlCenter
    rng.VerticalAlignment = xlCenter

    Set rng = ws.Range(ws.Cells(r + 1, c), ws.Cells(r + 1, c + 1))
    rng.Merge
    rng.Value = n
    rng.NumberFormat = "#,##0"
    rng.Interior.Color = fillRgb
    rng.Font.Color = fontRgb
    rng.Font.Bold = True
    rng.Font.Size = 18
    rng.HorizontalAlignment = xlCenter
    rng.VerticalAlignment = xlCenter

    Set rng = ws.Range(ws.Cells(r + 2, c), ws.Cells(r + 2, c + 1))
    rng.Merge
    rng.Value = Format$(kg, "#,##0.0") & " kg  |  " & Format$(pct, "0.0%")
    rng.Interior.Color = fillRgb
    rng.Font.Color = fontRgb
    rng.Font.Size = 8
    rng.HorizontalAlignment = xlCenter
    rng.VerticalAlignment = xlCenter

    ws.Rows(r).RowHeight = 18
    ws.Rows(r + 1).RowHeight = 28
    ws.Rows(r + 2).RowHeight = 16
End Sub

Private Sub WriteSemaforoFila(ws As Worksheet, r As Long, sem As String, est As String, n As Long, kg As Double, tot As Long, fillRgb As Long, fontRgb As Long)
    Dim pct As Double
    If tot > 0 Then pct = n / tot Else pct = 0
    ws.Cells(r, 1).Value = sem
    ws.Cells(r, 1).Interior.Color = fillRgb
    ws.Cells(r, 1).Font.Color = fontRgb
    ws.Cells(r, 1).Font.Bold = True
    ws.Cells(r, 2).Value = est
    ws.Cells(r, 3).Value = n
    ws.Cells(r, 3).NumberFormat = "#,##0"
    ws.Cells(r, 4).Value = Round(kg, 2)
    ws.Cells(r, 4).NumberFormat = "#,##0.00"
    ws.Cells(r, 5).Value = pct
    ws.Cells(r, 5).NumberFormat = "0.0%"
End Sub

Private Sub WriteAlmacenFila(ws As Worksheet, r As Long, alm As String, dReg As Object, dKg As Object, dCad As Object, dProx As Object, dSeg As Object, dOk As Object, dSin As Object)
    Dim sem As String
    Dim sheetName As String
    Dim fillRgb As Long, fontRgb As Long

    sem = SemaforoTexto(CLng(dCad(alm)), CLng(dProx(alm)), CLng(dSeg(alm)))
    Select Case sem
        Case "ROJO": fillRgb = RGB(255, 199, 206): fontRgb = RGB(156, 0, 6)
        Case "NARANJA": fillRgb = RGB(248, 203, 173): fontRgb = RGB(156, 87, 0)
        Case "AMARILLO": fillRgb = RGB(255, 230, 153): fontRgb = RGB(128, 96, 0)
        Case Else: fillRgb = RGB(198, 239, 206): fontRgb = RGB(0, 97, 0)
    End Select

    ws.Cells(r, 1).Value = sem
    ws.Cells(r, 1).Interior.Color = fillRgb
    ws.Cells(r, 1).Font.Color = fontRgb
    ws.Cells(r, 1).Font.Bold = True
    ws.Cells(r, 2).Value = alm
    ws.Cells(r, 2).Font.Bold = True
    ws.Cells(r, 3).Value = CLng(dReg(alm))
    ws.Cells(r, 3).NumberFormat = "#,##0"
    ws.Cells(r, 4).Value = Round(CDbl(dKg(alm)), 2)
    ws.Cells(r, 4).NumberFormat = "#,##0.00"
    ws.Cells(r, 5).Value = CLng(dCad(alm))
    ws.Cells(r, 6).Value = CLng(dProx(alm))
    ws.Cells(r, 7).Value = CLng(dSeg(alm))
    ws.Cells(r, 8).Value = CLng(dOk(alm))
    ws.Cells(r, 9).Value = CLng(dSin(alm))
    ws.Range(ws.Cells(r, 5), ws.Cells(r, 9)).NumberFormat = "#,##0"
    If CLng(dCad(alm)) > 0 Then
        ws.Cells(r, 5).Interior.Color = RGB(255, 199, 206)
        ws.Cells(r, 5).Font.Bold = True
    End If
    If CLng(dProx(alm)) > 0 Then
        ws.Cells(r, 6).Interior.Color = RGB(248, 203, 173)
        ws.Cells(r, 6).Font.Bold = True
    End If
    sheetName = "Alm " & alm
    On Error Resume Next
    ws.Hyperlinks.Add Anchor:=ws.Cells(r, 10), Address:="", SubAddress:="'" & sheetName & "'!A1", TextToDisplay:=sheetName
    On Error GoTo 0
End Sub

Private Sub RebuildAlmacenSheets()
    Dim wsD As Worksheet, wsAs As Worksheet, ws As Worksheet
    Dim dict As Object
    Dim lastRow As Long, i As Long
    Dim alm As String, sheetName As String
    Dim keys As Variant, key As Variant
    Dim lo As Object

    Set wsD = ThisWorkbook.Worksheets("Todos")
    lastRow = wsD.Cells(wsD.Rows.Count, 1).End(xlUp).Row
    If lastRow < 2 Then Exit Sub

    On Error Resume Next
    For Each lo In wsD.ListObjects
        lo.Unlist
    Next lo
    wsD.AutoFilterMode = False
    On Error GoTo 0

    Set dict = CreateObject("Scripting.Dictionary")
    For i = 2 To lastRow
        alm = Trim$(CStr(wsD.Cells(i, 1).Value))
        If Len(alm) > 0 Then
            If Not dict.Exists(alm) Then dict.Add alm, True
        End If
    Next i

    Application.DisplayAlerts = False
    For i = ThisWorkbook.Worksheets.Count To 1 Step -1
        Set ws = ThisWorkbook.Worksheets(i)
        If Left$(ws.Name, 4) = "Alm " Then ws.Delete
    Next i
    Application.DisplayAlerts = True

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("_Crit")
    If Not ws Is Nothing Then ws.Delete
    On Error GoTo 0

    keys = dict.Keys
    SortVariantArray keys
    For Each key In keys
        alm = CStr(key)
        sheetName = "Alm " & alm
        If Len(sheetName) > 31 Then sheetName = Left$(sheetName, 31)
        Application.StatusBar = "Stock ILE: dashboard " & sheetName & "..."

        Set wsAs = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        On Error Resume Next
        wsAs.Name = sheetName
        If Err.Number <> 0 Then
            Err.Clear
            wsAs.Name = "Alm_" & Replace(Replace(alm, "/", "_"), "\", "_")
        End If
        On Error GoTo 0

        BuildAlmacenDashboard wsAs, alm
    Next key

    FormatearDatos
End Sub

Private Sub BuildAlmacenDashboard(ws As Worksheet, alm As String)
    Dim wsD As Worksheet
    Dim lastRow As Long, i As Long, r As Long
    Dim item As String, prod As String, est As String, sem As String, k As String
    Dim fdesp As Variant, fcad As Variant, dias As Variant
    Dim kg As Double, cajas As Long
    Dim totCajas As Long, totKg As Double
    Dim nCad As Long, nProx As Long, nSeg As Long, nOk As Long, nSin As Long
    Dim kgCad As Double, kgProx As Double, kgSeg As Double, kgOk As Double, kgSin As Double
    Dim dCajas As Object, dKg As Object, dMeta As Object
    Dim keys As Variant, key As Variant
    Dim lo As ListObject
    Dim s As Long
    Dim fillRgb As Long, fontRgb As Long
    Dim arr() As Variant, nKeys As Long, a As Long, b As Long, tmp As Variant
    Dim prio As Long

    Set wsD = ThisWorkbook.Worksheets("Todos")
    lastRow = wsD.Cells(wsD.Rows.Count, 1).End(xlUp).Row

    On Error Resume Next
    For s = ws.Shapes.Count To 1 Step -1
        ws.Shapes(s).Delete
    Next s
    For Each lo In ws.ListObjects
        lo.Unlist
    Next lo
    ws.Cells.Clear
    ws.Cells.ClearFormats
    On Error GoTo 0

    Set dCajas = CreateObject("Scripting.Dictionary")
    Set dKg = CreateObject("Scripting.Dictionary")
    Set dMeta = CreateObject("Scripting.Dictionary")

    totCajas = 0&
    totKg = 0#
    For i = 2 To lastRow
        If StrComp(Trim$(CStr(wsD.Cells(i, 1).Value)), alm, vbTextCompare) <> 0 Then GoTo NextRow
        item = Trim$(CStr(wsD.Cells(i, 2).Value))
        prod = Trim$(CStr(wsD.Cells(i, 3).Value))
        If Len(prod) = 0 Then prod = item
        kg = CDbl(Val(Replace(CStr(wsD.Cells(i, 4).Value), ",", ".")))
        fdesp = wsD.Cells(i, 5).Value
        fcad = wsD.Cells(i, 7).Value
        cajas = CLng(Val(CStr(wsD.Cells(i, 8).Value)))
        If cajas <= 0 Then cajas = 1
        dias = wsD.Cells(i, 9).Value
        est = Trim$(CStr(wsD.Cells(i, 10).Value))
        If Len(est) = 0 Then est = "Sin fecha"

        k = item & vbTab & prod & vbTab & CStr(fdesp) & vbTab & CStr(fcad) & vbTab & est & vbTab & CStr(dias)
        If Not dCajas.Exists(k) Then
            dCajas.Add k, 0&
            dKg.Add k, 0#
            dMeta.Add k, Array(item, prod, fdesp, fcad, est, dias)
        End If
        dCajas(k) = CLng(dCajas(k)) + cajas
        dKg(k) = CDbl(dKg(k)) + kg

        Select Case est
            Case "Caducado": nCad = nCad + cajas: kgCad = kgCad + kg
            Case "Proximo a caducar": nProx = nProx + cajas: kgProx = kgProx + kg
            Case "En seguimiento": nSeg = nSeg + cajas: kgSeg = kgSeg + kg
            Case "Correcto": nOk = nOk + cajas: kgOk = kgOk + kg
            Case Else: nSin = nSin + cajas: kgSin = kgSin + kg
        End Select
        totCajas = totCajas + cajas
        totKg = totKg + kg
NextRow:
    Next i

    With ws.Range("A1:J1")
        .Merge
        .Value = "  ALMACEN " & alm & "  —  Stock y caducidad"
        .Font.Name = "Calibri"
        .Font.Size = 18
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(0, 48, 81)
        .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 32
    With ws.Range("A2:J2")
        .Merge
        .Value = "  Semaforo Stolt  |  Cajas pendientes = 1  |  Agrupado por producto, fecha despesque y fecha caducidad"
        .Font.Size = 10
        .Font.Color = RGB(220, 230, 240)
        .Interior.Color = RGB(0, 70, 110)
        .VerticalAlignment = xlCenter
    End With
    ws.Rows(2).RowHeight = 18

    ws.Range("A3").Value = "Actualizado"
    ws.Range("B3").NumberFormat = "dd/mm/aaaa hh:mm"
    ws.Range("B3").Value = Now
    ws.Range("C3").Value = "Cajas"
    ws.Range("D3").Value = totCajas
    ws.Range("D3").NumberFormat = "#,##0"
    ws.Range("E3").Value = "Kg"
    ws.Range("F3").Value = Round(totKg, 2)
    ws.Range("F3").NumberFormat = "#,##0.00"
    ws.Range("G3").Value = "Productos"
    ws.Range("H3").Value = dCajas.Count
    ws.Range("A3").Font.Bold = True
    ws.Range("C3").Font.Bold = True
    ws.Range("E3").Font.Bold = True
    ws.Range("G3").Font.Bold = True
    On Error Resume Next
    ws.Hyperlinks.Add Anchor:=ws.Range("J3"), Address:="", SubAddress:="'Resumen'!A1", TextToDisplay:="← Resumen"
    On Error GoTo 0

    ws.Range("A5").Value = "SEMAFORO DE ALERTAS"
    ws.Range("A5").Font.Size = 12
    ws.Range("A5").Font.Bold = True
    ws.Range("A5").Font.Color = RGB(0, 48, 81)

    PaintCard ws, 6, 1, "ROJO", "Caducado", nCad, kgCad, totCajas, RGB(192, 0, 0), RGB(255, 255, 255)
    PaintCard ws, 6, 3, "NARANJA", "Proximo (<=7 d)", nProx, kgProx, totCajas, RGB(237, 125, 49), RGB(255, 255, 255)
    PaintCard ws, 6, 5, "AMARILLO", "Seguimiento (8-15)", nSeg, kgSeg, totCajas, RGB(255, 192, 0), RGB(64, 64, 64)
    PaintCard ws, 6, 7, "VERDE", "Correcto (>15 d)", nOk, kgOk, totCajas, RGB(84, 130, 53), RGB(255, 255, 255)
    PaintCard ws, 6, 9, "GRIS", "Sin fecha", nSin, kgSin, totCajas, RGB(127, 127, 127), RGB(255, 255, 255)

    ws.Range("A10").Value = "Cajas por producto segun fecha de despesque y caducidad"
    ws.Range("A10").Font.Bold = True
    ws.Range("A10").Font.Size = 12
    ws.Range("A10").Font.Color = RGB(0, 48, 81)

    ws.Range("A11").Value = "Semaforo"
    ws.Range("B11").Value = "Item"
    ws.Range("C11").Value = "Producto"
    ws.Range("D11").Value = "Fecha despesque"
    ws.Range("E11").Value = "Fecha caducidad"
    ws.Range("F11").Value = "Dias"
    ws.Range("G11").Value = "Cajas"
    ws.Range("H11").Value = "Kg"
    ws.Range("I11").Value = "Estado"
    StyleHeaderRow ws, 9, 11

    keys = dCajas.Keys
    nKeys = UBound(keys) - LBound(keys) + 1
    If nKeys <= 0 Then GoTo FinFmt
    ReDim arr(1 To nKeys, 1 To 3)
    i = 1
    For Each key In keys
        est = CStr(dMeta(CStr(key))(4))
        prio = SemaforoPrioEstado(est)
        arr(i, 1) = prio
        arr(i, 2) = dMeta(CStr(key))(3)
        arr(i, 3) = CStr(key)
        i = i + 1
    Next key
    For a = 1 To nKeys - 1
        For b = a + 1 To nKeys
            If arr(b, 1) < arr(a, 1) Or (arr(b, 1) = arr(a, 1) And CStr(arr(b, 2)) < CStr(arr(a, 2))) Then
                tmp = arr(a, 1): arr(a, 1) = arr(b, 1): arr(b, 1) = tmp
                tmp = arr(a, 2): arr(a, 2) = arr(b, 2): arr(b, 2) = tmp
                tmp = arr(a, 3): arr(a, 3) = arr(b, 3): arr(b, 3) = tmp
            End If
        Next b
    Next a

    r = 12
    For a = 1 To nKeys
        k = CStr(arr(a, 3))
        item = CStr(dMeta(k)(0))
        prod = CStr(dMeta(k)(1))
        fdesp = dMeta(k)(2)
        fcad = dMeta(k)(3)
        est = CStr(dMeta(k)(4))
        dias = dMeta(k)(5)
        sem = SemFromEstado(est)
        Select Case sem
            Case "ROJO": fillRgb = RGB(255, 199, 206): fontRgb = RGB(156, 0, 6)
            Case "NARANJA": fillRgb = RGB(248, 203, 173): fontRgb = RGB(156, 87, 0)
            Case "AMARILLO": fillRgb = RGB(255, 230, 153): fontRgb = RGB(128, 96, 0)
            Case "VERDE": fillRgb = RGB(198, 239, 206): fontRgb = RGB(0, 97, 0)
            Case Else: fillRgb = RGB(217, 217, 217): fontRgb = RGB(89, 89, 89)
        End Select
        ws.Cells(r, 1).Value = sem
        ws.Cells(r, 1).Interior.Color = fillRgb
        ws.Cells(r, 1).Font.Color = fontRgb
        ws.Cells(r, 1).Font.Bold = True
        ws.Cells(r, 2).Value = item
        ws.Cells(r, 3).Value = prod
        If IsDate(fdesp) Then
            ws.Cells(r, 4).Value = CDate(fdesp)
            ws.Cells(r, 4).NumberFormat = "dd/mm/aaaa"
        End If
        If IsDate(fcad) Then
            ws.Cells(r, 5).Value = CDate(fcad)
            ws.Cells(r, 5).NumberFormat = "dd/mm/aaaa"
        End If
        If IsNumeric(dias) Then
            ws.Cells(r, 6).Value = CLng(dias)
            ws.Cells(r, 6).NumberFormat = "0"
        End If
        ws.Cells(r, 7).Value = CLng(dCajas(k))
        ws.Cells(r, 7).NumberFormat = "#,##0"
        ws.Cells(r, 7).Font.Bold = True
        ws.Cells(r, 8).Value = Round(CDbl(dKg(k)), 2)
        ws.Cells(r, 8).NumberFormat = "#,##0.00"
        ws.Cells(r, 9).Value = est
        ws.Cells(r, 9).Interior.Color = fillRgb
        ws.Cells(r, 9).Font.Color = fontRgb
        ws.Cells(r, 9).Font.Bold = True
        r = r + 1
    Next a

    Set lo = ws.ListObjects.Add(xlSrcRange, ws.Range(ws.Cells(11, 1), ws.Cells(r - 1, 9)), , xlYes)
    lo.Name = "Prod_" & Left$(Replace(Replace(alm, " ", "_"), "-", "_"), 40)
    lo.TableStyle = "TableStyleMedium2"

FinFmt:
    ws.Columns("A").ColumnWidth = 11
    ws.Columns("B").ColumnWidth = 12
    ws.Columns("C").ColumnWidth = 36
    ws.Columns("D").ColumnWidth = 14
    ws.Columns("E").ColumnWidth = 14
    ws.Columns("F").ColumnWidth = 8
    ws.Columns("G").ColumnWidth = 9
    ws.Columns("H").ColumnWidth = 11
    ws.Columns("I").ColumnWidth = 16
    ws.Activate
    On Error Resume Next
    ActiveWindow.FreezePanes = False
    ws.Range("A12").Select
    ActiveWindow.FreezePanes = True
    ActiveWindow.DisplayGridlines = False
    On Error GoTo 0
    ws.DisplayPageBreaks = False
End Sub

Private Function SemFromEstado(est As String) As String
    Select Case est
        Case "Caducado": SemFromEstado = "ROJO"
        Case "Proximo a caducar": SemFromEstado = "NARANJA"
        Case "En seguimiento": SemFromEstado = "AMARILLO"
        Case "Correcto": SemFromEstado = "VERDE"
        Case Else: SemFromEstado = "GRIS"
    End Select
End Function

Private Function SemaforoPrioEstado(est As String) As Long
    Select Case est
        Case "Caducado": SemaforoPrioEstado = 1
        Case "Proximo a caducar": SemaforoPrioEstado = 2
        Case "En seguimiento": SemaforoPrioEstado = 3
        Case "Correcto": SemaforoPrioEstado = 4
        Case Else: SemaforoPrioEstado = 5
    End Select
End Function

Private Sub RebuildPivot()
    Dim wsP As Worksheet, wsD As Worksheet
    Dim pc As PivotCache
    Dim pt As PivotTable
    Dim lastRow As Long, lastCol As Long
    Dim src As String
    Dim lo As ListObject
    Dim pf As PivotField

    Set wsD = ThisWorkbook.Worksheets("Todos")
    lastRow = wsD.Cells(wsD.Rows.Count, 1).End(xlUp).Row
    lastCol = wsD.Cells(1, wsD.Columns.Count).End(xlToLeft).Column
    If lastRow < 2 Then Exit Sub

    On Error Resume Next
    Set wsP = ThisWorkbook.Worksheets("Pivot")
    If Not wsP Is Nothing Then
        Application.DisplayAlerts = False
        wsP.Delete
        Application.DisplayAlerts = True
    End If
    On Error GoTo 0

    Set wsP = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets("Resumen"))
    wsP.Name = "Pivot"
    wsP.Range("A1").Value = "Tabla dinamica — filtra por Almacen (filtro de informe)"
    wsP.Range("A1").Font.Bold = True
    wsP.Range("A1").Font.Size = 12
    wsP.Range("A1").Font.Color = RGB(0, 48, 81)

    On Error Resume Next
    Set lo = wsD.ListObjects("StockTodos")
    On Error GoTo 0
    If Not lo Is Nothing Then
        Set pc = ThisWorkbook.PivotCaches.Create(SourceType:=xlDatabase, SourceData:=lo)
    Else
        src = "'" & wsD.Name & "'!" & wsD.Range(wsD.Cells(1, 1), wsD.Cells(lastRow, lastCol)).Address(ReferenceStyle:=xlR1C1)
        Set pc = ThisWorkbook.PivotCaches.Create(SourceType:=xlDatabase, SourceData:=src)
    End If

    Set pt = pc.CreatePivotTable(TableDestination:=wsP.Range("A3"), TableName:="PivotStockILE")
    With pt
        .PivotFields("Almacen").Orientation = xlPageField
        .PivotFields("Estado caducidad").Orientation = xlRowField
        .AddDataField .PivotFields("Stock disponible (kg)"), "Suma kg", xlSum
        .AddDataField .PivotFields("Cajas pendientes"), "Cajas", xlSum
        .AddDataField .PivotFields("Item"), "Lineas", xlCount
        .PivotFields("Suma kg").NumberFormat = "#,##0.00"
        .PivotFields("Cajas").NumberFormat = "#,##0"
        .PivotFields("Lineas").NumberFormat = "#,##0"
        .RowAxisLayout xlTabularRow
    End With
    wsP.Range("A2").Value = "Elige un Almacen en el filtro de informe (celda superior). Detalle de productos: pestañas Alm X o hoja Todos."
    wsP.Range("A2").Font.Color = RGB(89, 89, 89)
    wsP.Columns("A").ColumnWidth = 22
    wsP.Columns("B").ColumnWidth = 14
    wsP.Columns("C").ColumnWidth = 12
    wsP.Columns("D").ColumnWidth = 12
End Sub

Private Sub ApplyNumberFormats(ws As Worksheet, lastRow As Long, Optional headerRow As Long = 1)
    Dim cStock As Long, cDesp As Long, cEmp As Long, cCad As Long, cCajas As Long, cDias As Long
    Dim r0 As Long

    r0 = headerRow + 1
    If lastRow < r0 Then Exit Sub
    cStock = ColByHeader(ws, "Stock disponible (kg)", headerRow)
    cDesp = ColByHeader(ws, "Fecha despesque", headerRow)
    cEmp = ColByHeader(ws, "Fecha empaque", headerRow)
    cCad = ColByHeader(ws, "Fecha caducidad", headerRow)
    cCajas = ColByHeader(ws, "Cajas pendientes", headerRow)
    cDias = ColByHeader(ws, "Dias restantes", headerRow)

    If cStock > 0 Then ws.Range(ws.Cells(r0, cStock), ws.Cells(lastRow, cStock)).NumberFormat = "#,##0.00"
    If cDesp > 0 Then ws.Range(ws.Cells(r0, cDesp), ws.Cells(lastRow, cDesp)).NumberFormat = "dd/mm/aaaa"
    If cEmp > 0 Then ws.Range(ws.Cells(r0, cEmp), ws.Cells(lastRow, cEmp)).NumberFormat = "dd/mm/aaaa"
    If cCad > 0 Then ws.Range(ws.Cells(r0, cCad), ws.Cells(lastRow, cCad)).NumberFormat = "dd/mm/aaaa"
    If cCajas > 0 Then ws.Range(ws.Cells(r0, cCajas), ws.Cells(lastRow, cCajas)).NumberFormat = "0"
    If cDias > 0 Then ws.Range(ws.Cells(r0, cDias), ws.Cells(lastRow, cDias)).NumberFormat = "0"
End Sub

Private Sub ApplyEstadoCF(ws As Worksheet, lastRow As Long, cEst As Long, Optional headerRow As Long = 1)
    Dim rng As Range
    Dim r0 As Long
    If cEst <= 0 Or lastRow <= headerRow Then Exit Sub
    r0 = headerRow + 1
    Set rng = ws.Range(ws.Cells(r0, cEst), ws.Cells(lastRow, cEst))
    rng.FormatConditions.Delete
    AddTextCF rng, "Caducado", RGB(255, 199, 206), RGB(156, 0, 6)
    AddTextCF rng, "Proximo a caducar", RGB(244, 177, 131), RGB(198, 89, 17)
    AddTextCF rng, "En seguimiento", RGB(255, 230, 153), RGB(128, 96, 0)
    AddTextCF rng, "Correcto", RGB(198, 239, 206), RGB(0, 97, 0)
    AddTextCF rng, "Sin fecha", RGB(217, 217, 217), RGB(89, 89, 89)
End Sub

Private Sub AddTextCF(rng As Range, texto As String, fillRgb As Long, fontRgb As Long)
    Dim fc As FormatCondition
    Set fc = rng.FormatConditions.Add(Type:=xlCellValue, Operator:=xlEqual, Formula1:="=""" & texto & """")
    fc.Interior.Color = fillRgb
    fc.Font.Color = fontRgb
    fc.Font.Bold = True
End Sub

Private Sub StyleHeaderRow(ws As Worksheet, lastCol As Long, Optional rowNum As Long = 1)
    Dim c As Long
    For c = 1 To lastCol
        With ws.Cells(rowNum, c)
            .Interior.Color = RGB(0, 48, 81)
            .Font.Color = RGB(255, 255, 255)
            .Font.Bold = True
            .Font.Name = "Calibri"
        End With
    Next c
    ws.Rows(rowNum).RowHeight = 22
End Sub

Private Function SheetByName(n As String) As Worksheet
    Dim ws As Worksheet
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets(n)
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets(ThisWorkbook.Worksheets.Count))
        ws.Name = n
    End If
    Set SheetByName = ws
End Function

Private Function ColByHeader(ws As Worksheet, header As String, Optional headerRow As Long = 1) As Long
    Dim c As Long, last As Long
    last = ws.Cells(headerRow, ws.Columns.Count).End(xlToLeft).Column
    For c = 1 To last
        If StrComp(Trim$(CStr(ws.Cells(headerRow, c).Value)), header, vbTextCompare) = 0 Then
            ColByHeader = c
            Exit Function
        End If
    Next c
    ColByHeader = 0
End Function

Private Sub HideInternals()
    ApplySheetVisibility
End Sub

Private Sub ApplySheetVisibility()
    Dim ws As Worksheet
    Dim name As String
    Dim showOk As Boolean

    On Error Resume Next
    For Each ws In ThisWorkbook.Worksheets
        name = ws.Name
        showOk = False
        If name = "Actualizar" Or name = "Instrucciones" Then showOk = True
        If name = "Alm E" Or name = "Alm G" Or name = "Alm J" Or name = "Alm V3" Or name = "Alm W" Then showOk = True

        If name = "Query" Or name = "Parametros" Or name = "Todos" Or name = "_Crit" Then
            ws.Visible = xlSheetVeryHidden
        ElseIf showOk Then
            ws.Visible = xlSheetVisible
        Else
            ws.Visible = xlSheetHidden
        End If
    Next ws
    On Error Resume Next
    ThisWorkbook.Worksheets("Actualizar").Activate
    ActiveWindow.DisplayGridlines = False
    On Error GoTo 0
End Sub

Private Sub EnsureHojasControl()
    Dim ws As Worksheet

    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Actualizar")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(Before:=ThisWorkbook.Worksheets(1))
        ws.Name = "Actualizar"
    End If
    BuildHojaActualizar ws

    Set ws = Nothing
    On Error Resume Next
    Set ws = ThisWorkbook.Worksheets("Instrucciones")
    On Error GoTo 0
    If ws Is Nothing Then
        Set ws = ThisWorkbook.Worksheets.Add(After:=ThisWorkbook.Worksheets("Actualizar"))
        ws.Name = "Instrucciones"
    End If
    BuildHojaInstrucciones ws
End Sub

Private Sub BuildHojaActualizar(ws As Worksheet)
    Dim s As Long
    On Error Resume Next
    For s = ws.Shapes.Count To 1 Step -1
        ws.Shapes(s).Delete
    Next s
    ws.Cells.Clear
    On Error GoTo 0

    With ws.Range("A1:F1")
        .Merge
        .Value = "  STOCK Y CADUCIDAD  —  Actualizar informe"
        .Font.Name = "Calibri"
        .Font.Size = 20
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(0, 48, 81)
        .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 36

    ws.Range("A3").Value = "Ultima actualizacion"
    ws.Range("A3").Font.Bold = True
    ws.Range("B3").NumberFormat = "dd/mm/aaaa hh:mm"

    ws.Range("A5").Value = "Pulsa el boton para consultar Item Ledger Entry y refrescar todos los almacenes."
    ws.Range("A5").Font.Size = 11
    ws.Range("A5").Font.Color = RGB(89, 89, 89)

    ws.Range("A7").Value = "Almacenes visibles"
    ws.Range("A7").Font.Bold = True
    ws.Range("A7").Font.Color = RGB(0, 48, 81)
    ws.Range("A8").Value = "Almacen"
    ws.Range("B8").Value = "Ir a hoja"
    ws.Range("A8:B8").Interior.Color = RGB(89, 89, 89)
    ws.Range("A8:B8").Font.Color = RGB(255, 255, 255)
    ws.Range("A8:B8").Font.Bold = True

    ws.Range("A9").Value = "E"
    ws.Range("A10").Value = "G"
    ws.Range("A11").Value = "J"
    ws.Range("A12").Value = "V3"
    ws.Range("A13").Value = "W"
    On Error Resume Next
    ws.Hyperlinks.Add Anchor:=ws.Range("B9"), Address:="", SubAddress:="'Alm E'!A1", TextToDisplay:="Alm E"
    ws.Hyperlinks.Add Anchor:=ws.Range("B10"), Address:="", SubAddress:="'Alm G'!A1", TextToDisplay:="Alm G"
    ws.Hyperlinks.Add Anchor:=ws.Range("B11"), Address:="", SubAddress:="'Alm J'!A1", TextToDisplay:="Alm J"
    ws.Hyperlinks.Add Anchor:=ws.Range("B12"), Address:="", SubAddress:="'Alm V3'!A1", TextToDisplay:="Alm V3"
    ws.Hyperlinks.Add Anchor:=ws.Range("B13"), Address:="", SubAddress:="'Alm W'!A1", TextToDisplay:="Alm W"
    ws.Hyperlinks.Add Anchor:=ws.Range("A15"), Address:="", SubAddress:="'Instrucciones'!A1", TextToDisplay:="Ver instrucciones →"
    On Error GoTo 0

    ws.Range("A17").Value = "Filtro fijo: Open = 1 y Cajas pendientes (Remaining Quantity) = 1. Fuente: Item Ledger Entry."
    ws.Range("A17").Font.Size = 9
    ws.Range("A17").Font.Color = RGB(89, 89, 89)
    ws.Columns("A").ColumnWidth = 28
    ws.Columns("B").ColumnWidth = 14
    ws.DisplayPageBreaks = False
End Sub

Private Sub BuildHojaInstrucciones(ws As Worksheet)
    ws.Cells.Clear
    With ws.Range("A1:F1")
        .Merge
        .Value = "  INSTRUCCIONES  —  Informe de stock y caducidad"
        .Font.Name = "Calibri"
        .Font.Size = 18
        .Font.Bold = True
        .Font.Color = RGB(255, 255, 255)
        .Interior.Color = RGB(0, 48, 81)
        .VerticalAlignment = xlCenter
    End With
    ws.Rows(1).RowHeight = 34

    ws.Range("A3").Value = "1. Como actualizar"
    ws.Range("A3").Font.Bold = True
    ws.Range("A3").Font.Size = 12
    ws.Range("A3").Font.Color = RGB(0, 48, 81)
    ws.Range("A4").Value = "Ve a la hoja Actualizar y pulsa el boton Actualizar. La macro consulta Business Central (Item Ledger Entry),"
    ws.Range("A5").Value = "aplica Cajas pendientes = 1, recalcula dias/estado y refresca los dashboards de cada almacen visible."

    ws.Range("A7").Value = "2. Semaforo de alertas"
    ws.Range("A7").Font.Bold = True
    ws.Range("A7").Font.Size = 12
    ws.Range("A7").Font.Color = RGB(0, 48, 81)
    ws.Range("A8").Value = "ROJO"
    ws.Range("A8").Interior.Color = RGB(192, 0, 0)
    ws.Range("A8").Font.Color = RGB(255, 255, 255)
    ws.Range("A8").Font.Bold = True
    ws.Range("B8").Value = "Caducado — fecha de caducidad anterior a hoy"
    ws.Range("A9").Value = "NARANJA"
    ws.Range("A9").Interior.Color = RGB(237, 125, 49)
    ws.Range("A9").Font.Color = RGB(255, 255, 255)
    ws.Range("A9").Font.Bold = True
    ws.Range("B9").Value = "Proximo a caducar — 7 dias o menos"
    ws.Range("A10").Value = "AMARILLO"
    ws.Range("A10").Interior.Color = RGB(255, 192, 0)
    ws.Range("A10").Font.Bold = True
    ws.Range("B10").Value = "En seguimiento — entre 8 y 15 dias"
    ws.Range("A11").Value = "VERDE"
    ws.Range("A11").Interior.Color = RGB(84, 130, 53)
    ws.Range("A11").Font.Color = RGB(255, 255, 255)
    ws.Range("A11").Font.Bold = True
    ws.Range("B11").Value = "Correcto — mas de 15 dias"
    ws.Range("A12").Value = "GRIS"
    ws.Range("A12").Interior.Color = RGB(127, 127, 127)
    ws.Range("A12").Font.Color = RGB(255, 255, 255)
    ws.Range("A12").Font.Bold = True
    ws.Range("B12").Value = "Sin fecha de caducidad en ILE"

    ws.Range("A14").Value = "3. Hojas de almacen (E, G, J, V3, W)"
    ws.Range("A14").Font.Bold = True
    ws.Range("A14").Font.Size = 12
    ws.Range("A14").Font.Color = RGB(0, 48, 81)
    ws.Range("A15").Value = "Cada hoja muestra el semaforo del almacen y una tabla de cajas agrupadas por producto,"
    ws.Range("A16").Value = "fecha de despesque y fecha de caducidad. Usa los filtros de la tabla para buscar un item o estado."
    ws.Range("A17").Value = "Las demas hojas (Resumen, Todos, otros almacenes, etc.) estan ocultas a proposito."

    ws.Range("A19").Value = "4. Datos"
    ws.Range("A19").Font.Bold = True
    ws.Range("A19").Font.Size = 12
    ws.Range("A19").Font.Color = RGB(0, 48, 81)
    ws.Range("A20").Value = "Fuente unica: bc.[Item Ledger Entry]. Filtro fijo: Open = 1 y Remaining Quantity = 1 (Cajas pendientes = 1)."
    ws.Range("A21").Value = "Stock disponible = campo Kilos de la misma linea. No se usa Inventory ni otra tabla."

    ws.Range("A23").Value = "5. Credenciales"
    ws.Range("A23").Font.Bold = True
    ws.Range("A23").Font.Size = 12
    ws.Range("A23").Font.Color = RGB(0, 48, 81)
    ws.Range("A24").Value = "La conexion BC esta en la hoja Parametros (oculta). Si falla Actualizar, revisa servidor/usuario/password."

    On Error Resume Next
    ws.Hyperlinks.Add Anchor:=ws.Range("A26"), Address:="", SubAddress:="'Actualizar'!A1", TextToDisplay:="← Volver a Actualizar"
    On Error GoTo 0

    ws.Columns("A").ColumnWidth = 14
    ws.Columns("B").ColumnWidth = 70
    ws.DisplayPageBreaks = False
End Sub

Private Sub EnsureActualizarButton(res As Worksheet)
    Dim shp As Shape
    Dim found As Boolean

    found = False
    For Each shp In res.Shapes
        On Error Resume Next
        If InStr(1, CStr(shp.OnAction), "Actualizar", vbTextCompare) > 0 Then
            shp.OnAction = "StockILE.Actualizar"
            found = True
        End If
        On Error GoTo 0
    Next shp
    If found Then Exit Sub

    Set shp = res.Shapes.AddShape(msoShapeRoundedRectangle, res.Range("D3").Left, res.Range("D3").Top, 180, 40)
    With shp
        .OnAction = "StockILE.Actualizar"
        .Fill.ForeColor.RGB = RGB(0, 120, 215)
        .Line.Visible = msoFalse
        .TextFrame.Characters.Text = "Actualizar todo"
        .TextFrame.Characters.Font.Color = RGB(255, 255, 255)
        .TextFrame.Characters.Font.Bold = True
        .TextFrame.Characters.Font.Size = 14
        .TextFrame.HorizontalAlignment = xlHAlignCenter
        .TextFrame.VerticalAlignment = xlVAlignCenter
        .Name = "BtnActualizar"
    End With
End Sub

Public Sub RecalcularResumenUI()
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    RebuildResumen
    EnsureHojasControl
    EnsureActualizarButton ThisWorkbook.Worksheets("Actualizar")
    ApplySheetVisibility
    Application.Calculation = xlCalculationAutomatic
    Application.ScreenUpdating = True
End Sub

Private Sub SortVariantArray(ByRef arr As Variant)
    Dim i As Long, j As Long
    Dim tmp As Variant
    For i = LBound(arr) To UBound(arr) - 1
        For j = i + 1 To UBound(arr)
            If CStr(arr(j)) < CStr(arr(i)) Then
                tmp = arr(i)
                arr(i) = arr(j)
                arr(j) = tmp
            End If
        Next j
    Next i
End Sub
