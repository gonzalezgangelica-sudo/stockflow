-- Stock Flow — tablas de aplicación en SSF_APP_StockFlow
-- Foto fija por almacén: stock_snapshot + stock_snapshot_line + stock_snapshot_warehouse
-- Esas tablas alimentan análisis, comparativas y gráficos temporales.
-- El stock vivo NO se guarda aquí: se lee de BC (ILE Open=1 AND Remaining Quantity <> 0).

IF OBJECT_ID(N'dbo.warehouse', N'U') IS NULL
CREATE TABLE dbo.warehouse (
  code NVARCHAR(20) NOT NULL PRIMARY KEY,
  name NVARCHAR(120) NOT NULL CONSTRAINT DF_warehouse_name DEFAULT N'',
  active BIT NOT NULL CONSTRAINT DF_warehouse_active DEFAULT 1
);

IF OBJECT_ID(N'dbo.app_config', N'U') IS NULL
CREATE TABLE dbo.app_config (
  [key] NVARCHAR(80) NOT NULL PRIMARY KEY,
  value NVARCHAR(400) NOT NULL CONSTRAINT DF_app_config_value DEFAULT N''
);

IF OBJECT_ID(N'dbo.stock_snapshot', N'U') IS NULL
CREATE TABLE dbo.stock_snapshot (
  id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  snapshot_date DATE NOT NULL,
  snapshot_time NVARCHAR(8) NOT NULL,
  status NVARCHAR(20) NOT NULL CONSTRAINT DF_snapshot_status DEFAULT N'OK',
  records_processed INT NOT NULL CONSTRAINT DF_snapshot_records DEFAULT 0,
  error_message NVARCHAR(MAX) NOT NULL CONSTRAINT DF_snapshot_error DEFAULT N'',
  created_at DATETIME2 NOT NULL CONSTRAINT DF_snapshot_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_snapshot_date UNIQUE (snapshot_date)
);

IF OBJECT_ID(N'dbo.stock_snapshot_line', N'U') IS NULL
CREATE TABLE dbo.stock_snapshot_line (
  id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  snapshot_id INT NOT NULL,
  warehouse NVARCHAR(20) NOT NULL,
  product_no NVARCHAR(40) NOT NULL,
  product_description NVARCHAR(200) NOT NULL CONSTRAINT DF_line_desc DEFAULT N'',
  lot_no NVARCHAR(50) NOT NULL CONSTRAINT DF_line_lot DEFAULT N'',
  packing_date DATE NULL,
  harvest_date DATE NULL,
  expiry_date DATE NULL,
  quantity FLOAT NOT NULL CONSTRAINT DF_line_qty DEFAULT 0,
  remaining_quantity FLOAT NOT NULL CONSTRAINT DF_line_rq DEFAULT 0,
  boxes FLOAT NOT NULL CONSTRAINT DF_line_boxes DEFAULT 0,
  kg FLOAT NOT NULL CONSTRAINT DF_line_kg DEFAULT 0,
  CONSTRAINT FK_line_snapshot FOREIGN KEY (snapshot_id) REFERENCES dbo.stock_snapshot(id)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'IX_line_snap_wh' AND object_id = OBJECT_ID(N'dbo.stock_snapshot_line'))
CREATE INDEX IX_line_snap_wh ON dbo.stock_snapshot_line (snapshot_id, warehouse, product_no);

IF OBJECT_ID(N'dbo.stock_snapshot_warehouse', N'U') IS NULL
CREATE TABLE dbo.stock_snapshot_warehouse (
  id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  snapshot_id INT NOT NULL,
  warehouse NVARCHAR(20) NOT NULL,
  kg FLOAT NOT NULL CONSTRAINT DF_swh_kg DEFAULT 0,
  boxes FLOAT NOT NULL CONSTRAINT DF_swh_boxes DEFAULT 0,
  products INT NOT NULL CONSTRAINT DF_swh_products DEFAULT 0,
  caducado_kg FLOAT NOT NULL CONSTRAINT DF_swh_cad DEFAULT 0,
  proximo_kg FLOAT NOT NULL CONSTRAINT DF_swh_prox DEFAULT 0,
  seguimiento_kg FLOAT NOT NULL CONSTRAINT DF_swh_seg DEFAULT 0,
  CONSTRAINT FK_swh_snapshot FOREIGN KEY (snapshot_id) REFERENCES dbo.stock_snapshot(id),
  CONSTRAINT UQ_swh UNIQUE (snapshot_id, warehouse)
);

IF OBJECT_ID(N'dbo.execution_log', N'U') IS NULL
CREATE TABLE dbo.execution_log (
  id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  execution_date DATE NOT NULL,
  execution_time NVARCHAR(8) NOT NULL,
  status NVARCHAR(20) NOT NULL,
  records_processed INT NOT NULL CONSTRAINT DF_log_records DEFAULT 0,
  error_message NVARCHAR(MAX) NOT NULL CONSTRAINT DF_log_error DEFAULT N'',
  created_at DATETIME2 NOT NULL CONSTRAINT DF_log_created DEFAULT SYSUTCDATETIME()
);

IF OBJECT_ID(N'dbo.app_user', N'U') IS NULL
CREATE TABLE dbo.app_user (
  id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  email NVARCHAR(200) NOT NULL,
  name NVARCHAR(120) NOT NULL CONSTRAINT DF_user_name DEFAULT N'',
  password_hash NVARCHAR(200) NOT NULL,
  role NVARCHAR(20) NOT NULL CONSTRAINT DF_user_role DEFAULT N'consulta',
  active BIT NOT NULL CONSTRAINT DF_user_active DEFAULT 1,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_user_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_user_email UNIQUE (email)
);

IF OBJECT_ID(N'dbo.app_session', N'U') IS NULL
CREATE TABLE dbo.app_session (
  token NVARCHAR(80) NOT NULL PRIMARY KEY,
  user_id INT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at DATETIME2 NOT NULL CONSTRAINT DF_session_created DEFAULT SYSUTCDATETIME(),
  CONSTRAINT FK_session_user FOREIGN KEY (user_id) REFERENCES dbo.app_user(id)
);

IF OBJECT_ID(N'dbo.access_request', N'U') IS NULL
CREATE TABLE dbo.access_request (
  id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
  name NVARCHAR(120) NOT NULL CONSTRAINT DF_req_name DEFAULT N'',
  email NVARCHAR(200) NOT NULL,
  note NVARCHAR(400) NOT NULL CONSTRAINT DF_req_note DEFAULT N'',
  status NVARCHAR(20) NOT NULL CONSTRAINT DF_req_status DEFAULT N'pending',
  created_at DATETIME2 NOT NULL CONSTRAINT DF_req_created DEFAULT SYSUTCDATETIME()
);
