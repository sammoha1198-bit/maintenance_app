# apply_sql.py — applies schema.sql to maintenance.db
import os, sqlite3, time
DB_PATH = os.getenv("DB_PATH", os.path.abspath("./maintenance.db"))
with open("schema.sql","r",encoding="utf-8") as f:
    ddl = f.read()
if os.path.exists(DB_PATH):
    bak = DB_PATH + "." + time.strftime("%Y%m%d_%H%M%S") + ".bak"
    os.replace(DB_PATH, bak)
con = sqlite3.connect(DB_PATH)
con.executescript(ddl)
con.commit()
con.close()
print("OK")
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

CREATE TABLE issue (
  id INTEGER PRIMARY KEY,
  item_name TEXT NOT NULL,
  model TEXT,
  serial TEXT,
  status TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  location TEXT,
  requester TEXT,
  issue_date DATE NOT NULL,
  qualified_by TEXT,
  receiver TEXT
);

CREATE TABLE cabinetrehab (
  id INTEGER PRIMARY KEY,
  cabinet_type TEXT NOT NULL,
  code TEXT,
  rehab_date DATE NOT NULL,
  qualified_by TEXT,
  location TEXT,
  receiver TEXT,
  issue_date DATE,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_cabinetrehab_code ON cabinetrehab (code);

CREATE TABLE assetrehab (
  id INTEGER PRIMARY KEY,
  asset_type TEXT NOT NULL,
  model TEXT,
  serial_or_code TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  prev_location TEXT,
  supply_date DATE NOT NULL,
  qualified_by TEXT,
  lifted INTEGER,
  inspector TEXT,
  tested INTEGER,
  issue_date DATE,
  current_location TEXT,
  requester TEXT,
  receiver TEXT,
  notes TEXT,
  rehab_date DATE
);
CREATE INDEX IF NOT EXISTS ix_assetrehab_serial ON assetrehab (serial_or_code);
CREATE INDEX IF NOT EXISTS ix_assetrehab_rehab_date ON assetrehab (rehab_date);

CREATE TABLE sparepartrehab (
  id INTEGER PRIMARY KEY,
  part_category TEXT NOT NULL,
  part_name TEXT,
  part_model TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  serial TEXT,
  source TEXT,
  qualified_by TEXT,
  rehab_date DATE NOT NULL,
  tested INTEGER,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_sparepartrehab_serial ON sparepartrehab (serial);

VACUUM;
