# new_db.py  — creates a fresh maintenance.db with the correct schema
import os, sqlite3, time

DB_PATH = os.getenv("DB_PATH", os.path.abspath("./maintenance.db"))

# Backup old DB if present
if os.path.exists(DB_PATH):
    bak = DB_PATH + "." + time.strftime("%Y%m%d_%H%M%S") + ".bak"
    os.replace(DB_PATH, bak)
    print(f"Old DB found. Backed up to: {bak}")

ddl = """
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;

-- ================== ISSUE ==================
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

-- ================= CABINET REHAB =================
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

-- ================== ASSET REHAB ==================
CREATE TABLE assetrehab (
  id INTEGER PRIMARY KEY,
  asset_type TEXT NOT NULL,
  model TEXT,
  serial_or_code TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  prev_location TEXT,
  supply_date DATE NOT NULL,
  qualified_by TEXT,
  lifted INTEGER,         -- boolean (0/1)
  inspector TEXT,
  tested INTEGER,         -- boolean (0/1)
  issue_date DATE,
  current_location TEXT,
  requester TEXT,
  receiver TEXT,
  notes TEXT,
  rehab_date DATE         -- REQUIRED for reports
);
CREATE INDEX IF NOT EXISTS ix_assetrehab_serial ON assetrehab (serial_or_code);
CREATE INDEX IF NOT EXISTS ix_assetrehab_rehab_date ON assetrehab (rehab_date);

-- =============== SPARE PART REHAB ===============
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
  tested INTEGER,         -- boolean (0/1)
  notes TEXT
);
CREATE INDEX IF NOT EXISTS ix_sparepartrehab_serial ON sparepartrehab (serial);

VACUUM;
"""

os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
con = sqlite3.connect(DB_PATH)
con.executescript(ddl)
con.commit()
con.close()
print(f"Created fresh database at: {DB_PATH}")
