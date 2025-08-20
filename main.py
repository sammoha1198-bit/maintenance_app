# -*- coding: utf-8 -*-
from __future__ import annotations

import os
import io
from datetime import date
from typing import Optional, Dict, List, Tuple

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from sqlmodel import SQLModel, Field, Session, select, create_engine
from sqlalchemy import func

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.chart import PieChart, BarChart, Reference
try:
    from openpyxl.chart.label import DataLabelList  # openpyxl 3.1+
except Exception:
    DataLabelList = None
from openpyxl.utils import get_column_letter


# -----------------------------------------------------------------------------
# DB engine
# -----------------------------------------------------------------------------
def _normalize_database_url(url: str) -> str:
    """Render/Heroku style postgres URLs → SQLAlchemy driver form."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg2" not in url:
        return "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()
if DATABASE_URL:
    DATABASE_URL = _normalize_database_url(DATABASE_URL)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
else:
    DB_PATH = os.getenv("DB_PATH", "./maintenance.db")  # Render free plan: /tmp/maintenance.db
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False},
        pool_pre_ping=True,
    )


# -----------------------------------------------------------------------------
# App & static
# -----------------------------------------------------------------------------
app = FastAPI(title="Maintenance Tracker")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
def root():
    return FileResponse("static/index.html")


# -----------------------------------------------------------------------------
# Helpers & styling
# -----------------------------------------------------------------------------
def _month_filter(d: Optional[date], year: int, month: int) -> bool:
    return bool(d and d.year == year and d.month == month)


AR_MONTHS = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
]


def style_table_like_sample(
    ws, top_row: int, left_col: int, rows: int, cols: int,
    header_rows: int = 1, header_fill: str = "EFC9B8"
):
    """Arabic RTL table styling similar to screenshots."""
    ws.sheet_view.rightToLeft = True
    thin = Side(border_style="thin", color="000000")
    thick = Side(border_style="medium", color="000000")
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    bold = Font(bold=True)

    for r in range(top_row, top_row + rows):
        for c in range(left_col, left_col + cols):
            cell = ws.cell(row=r, column=c)
            cell.border = Border(top=thin, left=thin, right=thin, bottom=thin)
            cell.alignment = center

    # thick outer border
    for c in range(left_col, left_col + cols):
        ws.cell(row=top_row, column=c).border = Border(
            top=thick, left=ws.cell(row=top_row, column=c).border.left,
            right=ws.cell(row=top_row, column=c).border.right,
            bottom=ws.cell(row=top_row, column=c).border.bottom
        )
        ws.cell(row=top_row + rows - 1, column=c).border = Border(
            top=ws.cell(row=top_row + rows - 1, column=c).border.top,
            left=ws.cell(row=top_row + rows - 1, column=c).border.left,
            right=ws.cell(row=top_row + rows - 1, column=c).border.right,
            bottom=thick
        )
    for r in range(top_row, top_row + rows):
        ws.cell(row=r, column=left_col).border = Border(
            top=ws.cell(row=r, column=left_col).border.top,
            left=thick,
            right=ws.cell(row=r, column=left_col).border.right,
            bottom=ws.cell(row=r, column=left_col).border.bottom
        )
        ws.cell(row=r, column=left_col + cols - 1).border = Border(
            top=ws.cell(row=r, column=left_col + cols - 1).border.top,
            left=ws.cell(row=r, column=left_col + cols - 1).border.left,
            right=thick,
            bottom=ws.cell(row=r, column=left_col + cols - 1).border.bottom
        )

    # header fill + bold
    fill = PatternFill("solid", fgColor=header_fill)
    for r in range(top_row, top_row + header_rows):
        for c in range(left_col, left_col + cols):
            cell = ws.cell(row=r, column=c)
            cell.fill = fill
            cell.font = bold

    # widths
    for c in range(left_col, left_col + cols):
        ws.column_dimensions[get_column_letter(c)].width = 18


# -----------------------------------------------------------------------------
# Models
# -----------------------------------------------------------------------------
class Issue(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    item_name: str
    model: Optional[str] = None
    serial: Optional[str] = None
    status: Optional[str] = None      # مؤهلة/جديدة
    quantity: int = 1
    location: Optional[str] = None
    requester: Optional[str] = None
    issue_date: date
    qualified_by: Optional[str] = None
    receiver: Optional[str] = None


class CabinetRehab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    cabinet_type: str                  # ATS, AMF, HYBRID, حماية انفرتر, ظفيرة تحكم
    code: Optional[str] = Field(default=None, index=True)
    rehab_date: date
    qualified_by: Optional[str] = None
    location: Optional[str] = None
    receiver: Optional[str] = None
    issue_date: Optional[date] = None
    notes: Optional[str] = None


class AssetRehab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    asset_type: str                    # بطاريات, موحدات, محركات, مولدات, مكيفات, أصول أخرى
    model: Optional[str] = None
    serial_or_code: Optional[str] = Field(default=None, index=True)
    quantity: int = 1
    prev_location: Optional[str] = None

    # أهم تحديث: تاريخ التأهيل للأصول
    rehab_date: Optional[date] = Field(default=None, index=True)

    supply_date: Optional[date] = Field(default=None, index=True)
    qualified_by: Optional[str] = None
    lifted: Optional[bool] = None
    inspector: Optional[str] = None
    tested: Optional[bool] = None
    issue_date: Optional[date] = None
    current_location: Optional[str] = None
    requester: Optional[str] = None
    receiver: Optional[str] = None
    notes: Optional[str] = None


class SparePartRehab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    part_category: str                 # مضخات الديزل, النوزلات, ...
    part_name: Optional[str] = None
    part_model: Optional[str] = None
    quantity: int = 1
    serial: Optional[str] = Field(default=None, index=True)
    source: Optional[str] = None
    qualified_by: Optional[str] = None
    rehab_date: date
    tested: Optional[bool] = None
    notes: Optional[str] = None


# Create tables
SQLModel.metadata.create_all(engine)


# -----------------------------------------------------------------------------
# Issue (صرف)
# -----------------------------------------------------------------------------
@app.post("/api/issue")
def add_issue(data: Issue):
    with Session(engine) as s:
        s.add(data)
        s.commit()
        s.refresh(data)
        return data


@app.get("/api/issue")
def list_issue():
    with Session(engine) as s:
        return s.exec(
            select(Issue).order_by(Issue.issue_date.desc(), Issue.id.desc())
        ).all()


@app.get("/api/export/issue/full.xlsx")
def export_issue_full():
    with Session(engine) as s:
        rows = s.exec(select(Issue).order_by(Issue.issue_date, Issue.id)).all()

    wb = Workbook(); ws = wb.active; ws.title = "الصرف"; ws.sheet_view.rightToLeft = True
    headers = ["اسم القطعة","المودل","الرقم التسلسلي","الحالة","العدد","الموقع","جهة الطلب","تاريخ الصرف","المؤهل","المستلم"]
    ws.append(headers)
    for h in ws[1]:
        h.font = Font(bold=True); h.fill = PatternFill("solid", fgColor="BFE3FF"); h.alignment = Alignment(horizontal="center")
    for r in rows:
        ws.append([r.item_name, r.model, r.serial, r.status, r.quantity, r.location, r.requester, r.issue_date, r.qualified_by, r.receiver])

    thin = Side(border_style="thin", color="999999")
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=len(headers)):
        for c in row:
            c.border = Border(top=thin, left=thin, right=thin, bottom=thin)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=issue_full.xlsx"},
    )


@app.get("/api/export/issue/summary.xlsx")
def export_issue_summary():
    with Session(engine) as s:
        rows = s.exec(select(Issue).order_by(Issue.issue_date, Issue.id)).all()

    wb = Workbook(); ws = wb.active; ws.title = "ملخص الصرف"; ws.sheet_view.rightToLeft = True
    headers = ["اسم القطعة","العدد","الرقم التسلسلي","الموقع الحالي","المستلم"]
    ws.append(headers)
    for h in ws[1]:
        h.font = Font(bold=True); h.fill = PatternFill("solid", fgColor="BFE3FF"); h.alignment = Alignment(horizontal="center")
    for r in rows:
        ws.append([r.item_name, r.quantity, r.serial, r.location, r.receiver])

    thin = Side(border_style="thin", color="999999")
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=len(headers)):
        for c in row:
            c.border = Border(top=thin, left=thin, right=thin, bottom=thin)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=issue_summary.xlsx"},
    )


# -----------------------------------------------------------------------------
# Cabinets
# -----------------------------------------------------------------------------
@app.post("/api/cabinets")
def add_cabinet(data: CabinetRehab):
    if data.code:
        with Session(engine) as s:
            exists = s.exec(
                select(CabinetRehab).where(CabinetRehab.code == data.code)
            ).first()
            if exists:
                raise HTTPException(400, "الترميز موجود مسبقًا")
    with Session(engine) as s:
        s.add(data)
        s.commit()
        s.refresh(data)
        return data


@app.get("/api/cabinets")
def list_cabinets():
    with Session(engine) as s:
        return s.exec(
            select(CabinetRehab).order_by(CabinetRehab.rehab_date.desc(), CabinetRehab.id.desc())
        ).all()


@app.get("/api/cabinets/find")
def find_cabinet(code: str = Query(...)):
    with Session(engine) as s:
        obj = s.exec(select(CabinetRehab).where(CabinetRehab.code == code)).first()
        if not obj:
            raise HTTPException(404, "غير موجود")
        return obj


@app.put("/api/cabinets/{cid}")
def update_cabinet(cid: int, data: CabinetRehab):
    with Session(engine) as s:
        obj = s.get(CabinetRehab, cid)
        if not obj:
            raise HTTPException(404, "غير موجود")
        if data.code and data.code != obj.code:
            dup = s.exec(select(CabinetRehab).where(CabinetRehab.code == data.code)).first()
            if dup:
                raise HTTPException(400, "الترميز موجود مسبقًا")
        for k, v in data.dict().items():
            if k == "id":
                continue
            setattr(obj, k, v)
        s.add(obj)
        s.commit()
        s.refresh(obj)
        return obj


@app.get("/api/stats/cabinets")
def stats_cabinets(year: int, month: int):
    cats = ["ATS", "AMF", "HYBRID", "حماية انفرتر", "ظفيرة تحكم"]
    res = {k: 0 for k in cats}
    with Session(engine) as s:
        for r in s.exec(select(CabinetRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.cabinet_type in res:
                res[r.cabinet_type] += 1
    return res


@app.get("/api/export/cabinets.xlsx")
def export_cabinets(year: int, month: int):
    with Session(engine) as s:
        rows = [
            r for r in s.exec(select(CabinetRehab)).all()
            if _month_filter(r.rehab_date, year, month)
        ]

    wb = Workbook(); ws = wb.active; ws.title = "الكبائن"; ws.sheet_view.rightToLeft = True
    headers = ["نوع الكبينة","الترميز","تاريخ التأهيل","المؤهل","الموقع","المستلم","تاريخ الصرف","ملاحظات"]
    ws.append(headers)
    for h in ws[1]:
        h.font = Font(bold=True); h.fill = PatternFill("solid", fgColor="BFE3FF"); h.alignment = Alignment(horizontal="center")
    for r in rows:
        ws.append([r.cabinet_type, r.code, r.rehab_date, r.qualified_by, r.location, r.receiver, r.issue_date, r.notes])

    thin = Side(border_style="thin", color="999999")
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=len(headers)):
        for c in row:
            c.border = Border(top=thin, left=thin, right=thin, bottom=thin)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=cabinets_{year}_{month:02d}.xlsx"},
    )


# -----------------------------------------------------------------------------
# Assets (توريد/تأهيل)  ← **All defaults use rehab_date**
# -----------------------------------------------------------------------------
@app.post("/api/assets")
def add_asset(data: AssetRehab):
    if data.serial_or_code:
        with Session(engine) as s:
            exists = s.exec(
                select(AssetRehab).where(AssetRehab.serial_or_code == data.serial_or_code)
            ).first()
            if exists:
                raise HTTPException(400, "الرقم التسلسلي/الترميز موجود مسبقًا")
    with Session(engine) as s:
        s.add(data)
        s.commit()
        s.refresh(data)
        return data


@app.get("/api/assets")
def list_assets():
    with Session(engine) as s:
        return s.exec(
            select(AssetRehab).order_by(AssetRehab.rehab_date.desc(), AssetRehab.id.desc())
        ).all()


@app.get("/api/assets/find")
def find_asset(serial: str = Query(...)):
    with Session(engine) as s:
        obj = s.exec(
            select(AssetRehab).where(AssetRehab.serial_or_code == serial)
        ).first()
        if not obj:
            raise HTTPException(404, "غير موجود")
        return obj


@app.put("/api/assets/{aid}")
def update_asset(aid: int, data: AssetRehab):
    with Session(engine) as s:
        obj = s.get(AssetRehab, aid)
        if not obj:
            raise HTTPException(404, "غير موجود")
        if data.serial_or_code and data.serial_or_code != obj.serial_or_code:
            dup = s.exec(select(AssetRehab).where(AssetRehab.serial_or_code == data.serial_or_code)).first()
            if dup:
                raise HTTPException(400, "الرقم التسلسلي/الترميز موجود مسبقًا")
        for k, v in data.dict().items():
            if k == "id":
                continue
            setattr(obj, k, v)
        s.add(obj)
        s.commit()
        s.refresh(obj)
        return obj


@app.get("/api/stats/assets")
def stats_assets(
    year: int = Query(..., description="السنة"),
    month: int = Query(..., ge=1, le=12, description="الشهر 1..12"),
    date_field: str = Query("rehab_date", description="rehab_date (افتراضي) أو supply_date")
):
    """Monthly aggregation by asset_type. Defaults to rehab_date."""
    col = AssetRehab.rehab_date if date_field == "rehab_date" else AssetRehab.supply_date
    yy, mm = f"{year:04d}", f"{month:02d}"

    with Session(engine) as s:
        stmt = (
            select(AssetRehab.asset_type, func.count(AssetRehab.id))
            .where(
                col.is_not(None),
                func.strftime("%Y", col) == yy,
                func.strftime("%m", col) == mm,
            )
            .group_by(AssetRehab.asset_type)
        )
        rows = s.exec(stmt).all()

    counts = {k: v for (k, v) in rows}
    return {
        "بطاريات":   int(counts.get("بطاريات", 0)),
        "موحدات":    int(counts.get("موحدات", 0)),
        "محركات":    int(counts.get("محركات", 0)),
        "مولدات":    int(counts.get("مولدات", 0)),
        "مكيفات":    int(counts.get("مكيفات", 0)),
        "أصول أخرى": int(counts.get("أصول أخرى", 0)),
    }


@app.get("/api/export/assets.xlsx")
def export_assets(
    year: int,
    month: int,
    date_field: str = Query("rehab_date", description="rehab_date (افتراضي) أو supply_date")
):
    """Excel export; default filter is rehab_date."""
    with Session(engine) as s:
        all_rows = s.exec(select(AssetRehab)).all()
        if date_field == "supply_date":
            rows = [r for r in all_rows if _month_filter(r.supply_date, year, month)]
        else:
            rows = [r for r in all_rows if _month_filter(r.rehab_date, year, month)]

    wb = Workbook(); ws = wb.active; ws.title = "الأصول"; ws.sheet_view.rightToLeft = True
    headers = [
        "نوع الأصل","المودل","الرقم التسلسلي/الترميز","العدد","الموقع السابق",
        "تاريخ التأهيل","تاريخ التوريد","المؤهل","الرفع","الفاحص","الفحص",
        "تاريخ الصرف","الموقع الحالي","جهة الطلب","المستلم","ملاحظات"
    ]
    ws.append(headers)
    for h in ws[1]:
        h.font = Font(bold=True); h.fill = PatternFill("solid", fgColor="BFE3FF"); h.alignment = Alignment(horizontal="center")
    for r in rows:
        ws.append([
            r.asset_type, r.model, r.serial_or_code, r.quantity, r.prev_location,
            r.rehab_date, r.supply_date, r.qualified_by, r.lifted, r.inspector, r.tested,
            r.issue_date, r.current_location, r.requester, r.receiver, r.notes
        ])

    thin = Side(border_style="thin", color="999999")
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=len(headers)):
        for c in row:
            c.border = Border(top=thin, left=thin, right=thin, bottom=thin)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=assets_{year}_{month:02d}.xlsx"},
    )


# -----------------------------------------------------------------------------
# Spares
# -----------------------------------------------------------------------------
@app.post("/api/spares")
def add_spare(data: SparePartRehab):
    with Session(engine) as s:
        s.add(data)
        s.commit()
        s.refresh(data)
        return data


@app.get("/api/spares")
def list_spares():
    with Session(engine) as s:
        return s.exec(
            select(SparePartRehab).order_by(SparePartRehab.rehab_date.desc(), SparePartRehab.id.desc())
        ).all()


@app.get("/api/spares/find")
def find_spare(serial: str = Query(...)):
    with Session(engine) as s:
        obj = s.exec(select(SparePartRehab).where(SparePartRehab.serial == serial)).first()
        if not obj:
            raise HTTPException(404, "غير موجود")
        return obj


@app.put("/api/spares/{sid}")
def update_spare(sid: int, data: SparePartRehab):
    with Session(engine) as s:
        obj = s.get(SparePartRehab, sid)
        if not obj:
            raise HTTPException(404, "غير موجود")
        for k, v in data.dict().items():
            if k == "id":
                continue
            setattr(obj, k, v)
        s.add(obj)
        s.commit()
        s.refresh(obj)
        return obj


@app.get("/api/stats/spares")
def stats_spares(year: int, month: int):
    cats = ["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"]
    res = {k: 0 for k in cats}
    with Session(engine) as s:
        for r in s.exec(select(SparePartRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.part_category in res:
                res[r.part_category] += (r.quantity or 1)
    return res


@app.get("/api/export/spares.xlsx")
def export_spares(year: int, month: int):
    with Session(engine) as s:
        rows = [r for r in s.exec(select(SparePartRehab)).all() if _month_filter(r.rehab_date, year, month)]

    wb = Workbook(); ws = wb.active; ws.title = "قطع الغيار"; ws.sheet_view.rightToLeft = True
    headers = ["نوع القطعة","اسم القطعة","موديل القطعة","العدد","الرقم التسلسلي","المصدر","المؤهل","تاريخ التأهيل","الفحص","ملاحظات"]
    ws.append(headers)
    for h in ws[1]:
        h.font = Font(bold=True); h.fill = PatternFill("solid", fgColor="BFE3FF"); h.alignment = Alignment(horizontal="center")
    for r in rows:
        ws.append([r.part_category, r.part_name, r.part_model, r.quantity, r.serial, r.source, r.qualified_by, r.rehab_date, r.tested, r.notes])

    thin = Side(border_style="thin", color="999999")
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row, min_col=1, max_col=len(headers)):
        for c in row:
            c.border = Border(top=thin, left=thin, right=thin, bottom=thin)

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=spares_{year}_{month:02d}.xlsx"},
    )


# -----------------------------------------------------------------------------
# Duplicates validator
# -----------------------------------------------------------------------------
@app.get("/api/validate/duplicates")
def validate_duplicates():
    with Session(engine) as s:
        # cabinets: duplicate codes
        codes: Dict[str, int] = {}
        for r in s.exec(select(CabinetRehab)).all():
            if r.code:
                codes[r.code] = codes.get(r.code, 0) + 1
        cabinets_codes = [k for k, v in codes.items() if v > 1]

        # assets: duplicate serials and (serial, current_location) pairs
        ser: Dict[str, int] = {}
        ser_loc: Dict[Tuple[str, str], int] = {}
        for r in s.exec(select(AssetRehab)).all():
            if r.serial_or_code:
                ser[r.serial_or_code] = ser.get(r.serial_or_code, 0) + 1
                key = (r.serial_or_code, r.current_location or "")
                ser_loc[key] = ser_loc.get(key, 0) + 1
        assets_serials = [k for k, v in ser.items() if v > 1]
        assets_serial_loc_pairs = [f"{a}@{b}" for (a, b), v in ser_loc.items() if v > 1]

        # spares: duplicate (serial, source)
        ss: Dict[Tuple[str, str], int] = {}
        for r in s.exec(select(SparePartRehab)).all():
            key = (r.serial or "", r.source or "")
            ss[key] = ss.get(key, 0) + 1
        spares_serial_src_pairs = [f"{a}@{b}" for (a, b), v in ss.items() if v > 1]

    return {
        "cabinets_codes": cabinets_codes,
        "assets_serials": assets_serials,
        "assets_serial_loc_pairs": assets_serial_loc_pairs,
        "spares_serial_src_pairs": spares_serial_src_pairs,
    }


# -----------------------------------------------------------------------------
# Monthly Summary (styled like your screenshots)
# -----------------------------------------------------------------------------
@app.get("/api/export/monthly_summary.xlsx")
def export_monthly_summary(year: int, month: int):
    rows_map: List[Tuple[str, Tuple[str, str]]] = [
        ("تجميع كبائن تحكم ATS",         ("cab", "ATS")),
        ("تجميع كبائن تحكم ATS HYBRID",  ("cab", "HYBRID")),
        ("تجميع كبائن تحكم AMF",         ("cab", "AMF")),
        ("تجميع ظفائر مولدات",           ("cab", "ظفيرة تحكم")),
        ("تأهيل موحدات",                  ("ast", "موحدات")),
        ("تأهيل بطاريات",                 ("ast", "بطاريات")),
        ("تأهيل محركات",                  ("ast", "محركات")),
        ("تأهيل مولدات",                  ("ast", "مولدات")),
        ("تأهيل مكيفات",                  ("ast", "مكيفات")),
        ("تأهيل أصول أخرى",               ("ast", "أصول أخرى")),
        ("إصلاح موديولات",                ("spa", "موديولات")),
        ("إصلاح دينامو شحن",              ("spa", "دينمو شحن")),
        ("إصلاح سلف مولد",                ("spa", "سلف")),
        ("إصلاح منظمات شمسية وإنفرترات", ("spa", "منظمات وانفرترات")),
        ("إصلاح كروت وشواحن",            ("spa", "كروت وشواحن")),
        ("إصلاح قطع غيار أخرى",           ("spa", "أخرى")),
    ]

    cab_cnt = {"ATS":0,"AMF":0,"HYBRID":0,"حماية انفرتر":0,"ظفيرة تحكم":0}
    ast_cnt = {"بطاريات":0,"موحدات":0,"محركات":0,"مولدات":0,"مكيفات":0,"أصول أخرى":0}
    spa_cnt = {"مضخات الديزل":0,"النوزلات":0,"سلف":0,"دينمو شحن":0,"كروت وشواحن":0,"موديولات":0,"منظمات وانفرترات":0,"تسييخ":0,"أخرى":0}

    with Session(engine) as s:
        for r in s.exec(select(CabinetRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.cabinet_type in cab_cnt:
                cab_cnt[r.cabinet_type] += 1
        for r in s.exec(select(AssetRehab)).all():
            # **اعتماد تاريخ التأهيل**
            if _month_filter(r.rehab_date, year, month) and r.asset_type in ast_cnt:
                ast_cnt[r.asset_type] += (r.quantity or 1)
        for r in s.exec(select(SparePartRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.part_category in spa_cnt:
                spa_cnt[r.part_category] += (r.quantity or 1)

    wb = Workbook(); ws = wb.active; ws.title = "ملخص شهري"; ws.sheet_view.rightToLeft = True
    mname = AR_MONTHS[month-1]
    title = f"أهم الإنجازات التي تمت في مركز الإصلاحات الفنية خلال شهر {mname} {year} م:"
    ws.merge_cells("A1:E1")
    ws["A1"].value = title
    ws["A1"].font = Font(bold=True, size=14, color="003366")
    ws["A1"].alignment = Alignment(horizontal="right")

    start_row = 3
    ws.cell(row=start_row, column=1, value="م")
    ws.cell(row=start_row, column=2, value="الصنف")
    ws.cell(row=start_row, column=3, value=mname)

    total = 0
    r = start_row + 1
    for i, (label, (kind, key)) in enumerate(rows_map, start=1):
        ws.cell(row=r, column=1, value=i)
        ws.cell(row=r, column=2, value=label)
        if kind == "cab":
            val = cab_cnt.get(key, 0)
        elif kind == "ast":
            val = ast_cnt.get(key, 0)
        else:
            val = spa_cnt.get(key, 0)
        ws.cell(row=r, column=3, value=val)
        total += val
        r += 1

    ws.cell(row=r, column=2, value="الإجمالي").font = Font(bold=True)
    ws.cell(row=r, column=3, value=total).font = Font(bold=True, color="C00000")

    rows_count = len(rows_map) + 2
    style_table_like_sample(ws, top_row=start_row, left_col=1, rows=rows_count, cols=3, header_rows=1, header_fill="EFC9B8")
    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 12

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=monthly_{year}_{month:02d}.xlsx"},
    )


# -----------------------------------------------------------------------------
# Quarterly Summary (styled)
# -----------------------------------------------------------------------------
@app.get("/api/export/quarterly_summary.xlsx")
def export_quarterly_summary(start_year: int, start_month: int):
    months: List[Tuple[int, int]] = []
    y, m = start_year, start_month
    for _ in range(3):
        months.append((y, m))
        m += 1
        if m == 13:
            m = 1
            y += 1

    rows_map: List[Tuple[str, Tuple[str, str]]] = [
        ("تجميع كبائن تحكم ATS",         ("cab", "ATS")),
        ("تجميع كبائن تحكم ATS HYBRID",  ("cab", "HYBRID")),
        ("تجميع كبائن تحكم AMF",         ("cab", "AMF")),
        ("تجميع ظفائر مولدات",           ("cab", "ظفيرة تحكم")),
        ("تأهيل موحدات",                  ("ast", "موحدات")),
        ("تأهيل بطاريات",                 ("ast", "بطاريات")),
        ("تأهيل محركات",                  ("ast", "محركات")),
        ("تأهيل مولدات",                  ("ast", "مولدات")),
        ("تأهيل مكيفات",                  ("ast", "مكيفات")),
        ("تأهيل أصول أخرى",               ("ast", "أصول أخرى")),
        ("إصلاح موديولات",                ("spa", "موديولات")),
        ("إصلاح دينامو شحن",              ("spa", "دينمو شحن")),
        ("إصلاح سلف مولد",                ("spa", "سلف")),
        ("إصلاح منظمات شمسية وإنفرترات", ("spa", "منظمات وانفرترات")),
        ("إصلاح كروت وشواحن",            ("spa", "كروت وشواحن")),
        ("إصلاح قطع غيار أخرى",           ("spa", "أخرى")),
    ]

    def month_counts(y: int, m: int):
        cab_cnt = {"ATS":0,"AMF":0,"HYBRID":0,"حماية انفرتر":0,"ظفيرة تحكم":0}
        ast_cnt = {"بطاريات":0,"موحدات":0,"محركات":0,"مولدات":0,"مكيفات":0,"أصول أخرى":0}
        spa_cnt = {"مضخات الديزل":0,"النوزلات":0,"سلف":0,"دينمو شحن":0,"كروت وشواحن":0,"موديولات":0,"منظمات وانفرترات":0,"تسييخ":0,"أخرى":0}
        with Session(engine) as s:
            for r in s.exec(select(CabinetRehab)).all():
                if _month_filter(r.rehab_date, y, m) and r.cabinet_type in cab_cnt:
                    cab_cnt[r.cabinet_type] += 1
            for r in s.exec(select(AssetRehab)).all():
                # **اعتماد تاريخ التأهيل**
                if _month_filter(r.rehab_date, y, m) and r.asset_type in ast_cnt:
                    ast_cnt[r.asset_type] += (r.quantity or 1)
            for r in s.exec(select(SparePartRehab)).all():
                if _month_filter(r.rehab_date, y, m) and r.part_category in spa_cnt:
                    spa_cnt[r.part_category] += (r.quantity or 1)
        return cab_cnt, ast_cnt, spa_cnt

    monthly_nums: Dict[Tuple[str, int], int] = {}
    for idx, (yy, mm) in enumerate(months):
        cab, ast, spa = month_counts(yy, mm)
        for label, (kind, key) in rows_map:
            monthly_nums[(label, idx)] = (cab if kind == "cab" else ast if kind == "ast" else spa).get(key, 0)

    wb = Workbook(); ws = wb.active; ws.title = "ملخص ربع سنوي"; ws.sheet_view.rightToLeft = True
    months_names = "، ".join(AR_MONTHS[m-1] for (_, m) in months[::-1])
    title = f"أهم الإنجازات التي تمت في مركز الإصلاحات الفنية خلال الربع ({months_names}) لعام {months[0][0]} م:"
    ws.merge_cells("A1:G1")
    ws["A1"].value = title
    ws["A1"].font = Font(bold=True, size=14, color="003366")
    ws["A1"].alignment = Alignment(horizontal="right")

    start_row = 3
    headers = ["م", "الصنف"] + [AR_MONTHS[m-1] for (_, m) in months] + ["الربع"]
    for c, h in enumerate(headers, start=1):
        ws.cell(row=start_row, column=c, value=h)

    totals_per_month = [0, 0, 0]; grand_total = 0
    r = start_row + 1
    for i, (label, _) in enumerate(rows_map, start=1):
        ws.cell(row=r, column=1, value=i)
        ws.cell(row=r, column=2, value=label)
        row_sum = 0
        for mi in range(3):
            v = monthly_nums[(label, mi)]
            ws.cell(row=r, column=3 + mi, value=v)
            row_sum += v
            totals_per_month[mi] += v
        ws.cell(row=r, column=6, value=row_sum)
        grand_total += row_sum
        r += 1

    ws.cell(row=r, column=2, value="الإجمالي").font = Font(bold=True)
    for mi in range(3):
        ws.cell(row=r, column=3 + mi, value=totals_per_month[mi]).font = Font(bold=True)
    ws.cell(row=r, column=6, value=grand_total).font = Font(bold=True, color="C00000")

    rows_count = len(rows_map) + 2
    style_table_like_sample(ws, top_row=start_row, left_col=1, rows=rows_count, cols=6, header_rows=1, header_fill="EFC9B8")
    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 34
    for col in ["C", "D", "E", "F"]:
        ws.column_dimensions[col].width = 12

    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=quarterly_{months[0][0]}_{months[0][1]:02d}.xlsx"},
    )
# ===================== end main.py =====================
