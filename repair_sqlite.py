# repair_sqlite.py — إضافة rehab_date لجدول assetrehab إن كان مفقودًا (SQLite فقط)
import os, sqlite3

DB_PATH = os.getenv("DB_PATH", os.path.abspath("./maintenance.db"))
print("Using DB:", DB_PATH)

con = sqlite3.connect(DB_PATH)
cur = con.cursor()

# هل الجدول موجود؟
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='assetrehab';")
if not cur.fetchone():
    print("Table 'assetrehab' does not exist yet (fresh DB). Nothing to repair.")
    con.close()
    raise SystemExit(0)

# التحقق من الأعمدة
cur.execute("PRAGMA table_info('assetrehab')")
cols = [r[1] for r in cur.fetchall()]
if "rehab_date" not in cols:
    print("Adding column rehab_date ...")
    cur.execute("ALTER TABLE assetrehab ADD COLUMN rehab_date DATE;")
    try:
        cur.execute("CREATE INDEX IF NOT EXISTS ix_assetrehab_rehab_date ON assetrehab (rehab_date);")
    except Exception:
        pass
    con.commit()
    print("Done.")
else:
    print("Column rehab_date already exists (no action).")

con.close()
print("OK")
