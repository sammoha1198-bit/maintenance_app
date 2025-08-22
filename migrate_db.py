# migrate_db.py
import os, sqlite3, sys

db = os.environ.get("DB_PATH", "maintenance.db")
print(f"Using DB: {db}")
con = sqlite3.connect(db)
cur = con.cursor()

def has_column(table, col):
    cur.execute(f"PRAGMA table_info({table})")
    return any(r[1] == col for r in cur.fetchall())

def ensure(table, col, ddl):
    if not has_column(table, col):
        cur.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
        print(f"ADDED {table}.{col}")
    else:
        print(f"OK   {table}.{col} exists")

try:
    # أهم عمود جديد للأصول:
    ensure("assetrehab", "rehab_date", "rehab_date DATE")
    # أعمدة اختيارية إذا نسختك قديمة:
    ensure("assetrehab", "lifted", "lifted BOOLEAN")
    ensure("assetrehab", "tested", "tested BOOLEAN")
    # للتأكد للكّبائن وقطع الغيار:
    ensure("cabinetrehab", "rehab_date", "rehab_date DATE")
    ensure("sparepartrehab", "rehab_date", "rehab_date DATE")
    con.commit()
    print("Migration OK")
except Exception as e:
    print("Migration FAILED:", e)
    sys.exit(1)
finally:
    con.close()
