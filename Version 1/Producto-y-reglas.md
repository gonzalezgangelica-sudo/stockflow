# Producto y reglas de negocio — V1

## Para quién

Operación de almacén / stock de Stolt Sea Farm (Bergondo). Contrasta lo que hay ahora en BC con la foto de las 05:00.

## Pantallas

| Vista | Para qué |
|---|---|
| Dashboard | Resumen vivo vs última foto OK |
| Stock vivo | ILE abierto ahora (se refresca solo cada 5 min) |
| Stock histórico | Fotos guardadas (una por día, inmutable) |
| Evolución | Serie temporal de las fotos |
| Caducidades | Semáforo de fechas de caducidad |
| Cajas repetidas | Detector de lotes duplicados |
| Análisis | Empaque / antigüedad |
| Comparación | Foto inicial del día vs vivo |
| Configuración | Almacenes y parámetros (admin) |
| Logs | Ejecuciones del job |
| Excel | Exportación desde la web |

Idiomas: español e inglés (conmutador en la UI). Marca Stolt (MUI).

## Definición de stock (obligatoria)

Fuente única: **Item Ledger Entry** de Business Central.

```
Open = 1
AND Remaining Quantity <> 0
AND Location Code IN ('E', 'G', 'V3', 'J', 'W', 'Z')
```

| Métrica | Campo BC |
|---|---|
| Cajas | `Remaining Quantity` |
| Kg | `Kilos` |
| Lote | `Lot No.` |
| Almacén | `Location Code` |
| Producto | `Item No.` + `Description` |
| Despesque | `Fecha despesque` |
| Empaque | `Fecha empaque` |
| Caducidad | `Expiration Date` |

Almacenes **D** y **L** quedan fuera.

Nombres en código (`server/src/warehouses.js`):

- E Empaque  
- G Bergondo  
- V3, J, W, Z

## Lote = número de caja

Premisa de operación: **un lote no debe repetirse**. Número de lotes distintos ≈ número de cajas.

La vista **Cajas repetidas** marca un `Lot No.` si tiene **más de 1 línea** o **más de 1 caja**.

## Semáforo de caducidad

Igual que el informe Power BI / Excel de caducidad:

| Estado | Criterio |
|---|---|
| Caducado | fecha &lt; hoy |
| Próximo a caducar | 0–7 días |
| En seguimiento | 8–15 días (aviso + 8, mínimo 15) |
| Correcto | más de 15 días |
| Sin fecha | sin `Expiration Date` (o fecha BC anterior a 1900) |

Días de aviso por defecto: **7** (`EXPIRY_WARNING_DAYS` / `app_config`).

## Foto fija 05:00

- Se toma **una vez al día**.
- Si ese día ya hay foto **OK**, el job **no la pisa** (queda `SKIPPED`).
- Vive en Azure SQL, no en el PC.
- El vivo **no** se guarda: se lee en el momento.
- En la UI **no** hay botones “Actualizar” ni “Fotografiar ahora”. El vivo se refresca cada 5 minutos; la foto solo a las 05:00 (o un Run del pipeline / admin).

## Usuarios (V1)

Roles: `admin` y `consulta`. Contraseñas con scrypt. Hay solicitud de acceso desde la portada.

Usuarios semilla (solo demo, creados si la tabla está vacía):

- `admin@ssf.demo` — Administrador  
- `consulta@ssf.demo` — Consulta stock  

Contraseña demo: la del seed en `server/src/store.js` (`Demo1234!`). Cambiarla en V2 si hay usuarios reales.

Login: `POST /api/auth/login`. El resto de `/api` (salvo health, login, request de acceso y job con clave) exige sesión.
