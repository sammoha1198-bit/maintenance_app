import os, sqlite3, sys

db = os.getenv("DB_PATH", "maintenance.db")
con = sqlite3.connect(db)
cur = con.cursor()

def table_has_column(table, col):
    cur.execute(f'PRAGMA table_info("{table}")')
    return any(r[1].lower() == col.lower() for r in cur.fetchall())

# حاول على عدة أسماء محتملة للجدول
candidate_tables = []
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
for (tname,) in cur.fetchall():
    if 'asset' in tname.lower():
        candidate_tables.append(tname)

if not candidate_tables:
    print("لم يتم العثور على جدول للأصول (asset). تأكد من تشغيل التطبيق مرة واحدة لإنشاء الجداول.")
    sys.exit(0)

added_any = False
for t in candidate_tables:
    if not table_has_column(t, "rehab_date"):
        cur.execute(f'ALTER TABLE "{t}" ADD COLUMN rehab_date DATE')
        print(f"تم إضافة rehab_date إلى الجدول: {t}")
        added_any = True
    else:
        print(f"العمود rehab_date موجود مسبقاً في: {t}")

if added_any:
    con.commit()
con.close()
print("انتهى.")
