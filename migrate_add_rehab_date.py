# migrate_add_rehab_date.py
import os, sqlite3

db = os.getenv("DB_PATH", "maintenance.db")
print("Using DB:", db)

con = sqlite3.connect(db)
cur = con.cursor()

# تأكد أن جدول الأصول موجود
cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='assetrehab'")
if not cur.fetchone():
    raise SystemExit("جدول assetrehab غير موجود. شغّل التطبيق مرة واحدة ليُنشئ الجداول أولاً.")

# هل العمود موجود؟
cols = {row[1] for row in cur.execute("PRAGMA table_info(assetrehab)")}
if "rehab_date" not in cols:
    print("Adding column assetrehab.rehab_date ...")
    cur.execute("ALTER TABLE assetrehab ADD COLUMN rehab_date DATE")
    con.commit()
    print("✅ Column rehab_date added.")
else:
    print("✅ Column rehab_date already exists. No action.")

con.close()
print("Migration OK")
