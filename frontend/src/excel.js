function xml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sheetXml(name, headers, rows) {
  const safe = String(name || "Hoja").replace(/[:\\/?*\[\]]/g, " ").slice(0, 31);
  const headerRow = `<Row>${headers.map((h) => `<Cell><Data ss:Type="String">${xml(h)}</Data></Cell>`).join("")}</Row>`;
  const body = rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => {
            const v = cell ?? "";
            const num = typeof v === "number" && Number.isFinite(v);
            return `<Cell><Data ss:Type="${num ? "Number" : "String"}">${xml(v)}</Data></Cell>`;
          })
          .join("")}</Row>`
    )
    .join("");
  return `<Worksheet ss:Name="${xml(safe)}"><Table>${headerRow}${body}</Table></Worksheet>`;
}

export function downloadExcel(filename, sheets) {
  const book = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
${sheets.map((s) => sheetXml(s.name, s.headers, s.rows)).join("\n")}
</Workbook>`;
  const blob = new Blob([book], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function warehouseSheets(sections, headers, mapRow) {
  return (sections || []).map((section) => ({
    name: `Alm ${section.warehouse}`,
    headers,
    rows: (section.rows || []).map(mapRow),
  }));
}
