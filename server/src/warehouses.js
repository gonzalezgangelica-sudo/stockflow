export const ACTIVE_WAREHOUSES = ["E", "G", "V3", "J", "W", "Z"];

export const WAREHOUSE_NAMES = {
  E: "Empaque",
  G: "Bergondo",
  V3: "V3",
  J: "J",
  W: "W",
  Z: "Z",
};

export function isActiveWarehouse(code) {
  return ACTIVE_WAREHOUSES.includes(String(code || "").trim());
}

export function filterActiveWarehouses(rows) {
  return rows.filter((r) => isActiveWarehouse(r.warehouse));
}
