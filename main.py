# main.py (backend with search + edit + dedupe + RTL Excel + month-to-date filters + stats)
import io
import os
db_path = os.getenv("DB_PATH", "./maintenance.db")  # default local file
engine = create_engine(f"sqlite:///{db_path}")

from datetime import date, datetime
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from sqlmodel import SQLModel, Field, Session, create_engine, select
import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill, Border, Side
from openpyxl.chart import PieChart, BarChart, Reference
from openpyxl.chart.label import DataLabelList

from openpyxl.utils import get_column_letter


# =========================
# Database models
# =========================

class Issue(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    item_name: str
    model: Optional[str] = None
    serial: Optional[str] = None
    status: str            # "مؤهلة" أو "جديدة"
    quantity: int = 1
    location: Optional[str] = None
    requester: Optional[str] = None    # جهة الطلب
    issue_date: date
    qualified_by: Optional[str] = None # المؤهل
    receiver: Optional[str] = None     # المستلم


class CabinetRehab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    cabinet_type: str                  # ATS / AMF / HYBRID / حماية انفرتر / ظفيرة تحكم
    code: Optional[str] = None         # الترميز (Unique)
    rehab_date: date
    qualified_by: Optional[str] = None
    location: Optional[str] = None
    receiver: Optional[str] = None
    issue_date: Optional[date] = None
    notes: Optional[str] = None


class AssetRehab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    asset_type: str                    # بطاريات، موحدات، محركات، مولدات، مكيفات، أصول أخرى
    model: Optional[str] = None
    serial_or_code: Optional[str] = None   # Unique
    quantity: int = 1
    prev_location: Optional[str] = None
    supply_date: date
    qualified_by: Optional[str] = None
    lifted: Optional[bool] = None          # الرفع (نعم/لا)
    inspector: Optional[str] = None
    tested: Optional[bool] = None          # الفحص (نعم/لا)
    issue_date: Optional[date] = None
    current_location: Optional[str] = None
    requester: Optional[str] = None
    receiver: Optional[str] = None
    notes: Optional[str] = None


class SparePartRehab(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    part_category: str                 # مضخات الديزل، النوزلات، ...، أخرى
    part_name: Optional[str] = None
    part_model: Optional[str] = None
    quantity: int = 1
    serial: Optional[str] = None
    source: Optional[str] = None
    qualified_by: Optional[str] = None
    rehab_date: date
    tested: Optional[bool] = None
    notes: Optional[str] = None


# =========================
# App init
# =========================

app = FastAPI(title="Maintenance Tracker (Arabic)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

engine = create_engine("sqlite:///./maintenance.db")
SQLModel.metadata.create_all(engine)

# خدمة ملفات الواجهة
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
def root():
    return FileResponse("static/index.html")


# =========================
# Helpers
# =========================
# أسماء الشهور العربية
AR_MONTHS = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]

# تلوين/تنسيق خلايا جدول عربي مثل الصور
def style_table_like_sample(ws, top_row:int, left_col:int, rows:int, cols:int, header_rows:int=1, header_fill="F2C9B5"):
    ws.sheet_view.rightToLeft = True
    thin = Side(border_style="thin", color="000000")
    thick = Side(border_style="medium", color="000000")  # إطار أوضح
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    bold = Font(bold=True)

    # حدود كاملة
    for r in range(top_row, top_row+rows):
        for c in range(left_col, left_col+cols):
            cell = ws.cell(row=r, column=c)
            cell.border = Border(top=thin, left=thin, right=thin, bottom=thin)
            cell.alignment = center

    # إطار خارجي أثخن
    for c in range(left_col, left_col+cols):
        ws.cell(row=top_row, column=c).border = Border(top=thick, left=ws.cell(row=top_row, column=c).border.left, right=ws.cell(row=top_row, column=c).border.right, bottom=ws.cell(row=top_row, column=c).border.bottom)
        ws.cell(row=top_row+rows-1, column=c).border = Border(top=ws.cell(row=top_row+rows-1, column=c).border.top, left=ws.cell(row=top_row+rows-1, column=c).border.left, right=ws.cell(row=top_row+rows-1, column=c).border.right, bottom=thick)
    for r in range(top_row, top_row+rows):
        ws.cell(row=r, column=left_col).border = Border(top=ws.cell(row=r, column=left_col).border.top, left=thick, right=ws.cell(row=r, column=left_col).border.right, bottom=ws.cell(row=r, column=left_col).border.bottom)
        ws.cell(row=r, column=left_col+cols-1).border = Border(top=ws.cell(row=r, column=left_col+cols-1).border.top, left=ws.cell(row=r, column=left_col+cols-1).border.left, right=thick, bottom=ws.cell(row=r, column=left_col+cols-1).border.bottom)

    # ترويسة ملونة عريضة
    fill = PatternFill("solid", fgColor=header_fill)
    for r in range(top_row, top_row+header_rows):
        for c in range(left_col, left_col+cols):
            ws.cell(row=r, column=c).fill = fill
            ws.cell(row=r, column=c).font = bold

    # عرض أعمدة مناسب
    for c in range(left_col, left_col+cols):
        ws.column_dimensions[get_column_letter(c)].width = 18

def _to_date(s: str) -> date:
    return datetime.fromisoformat(s).date()

def _to_bool(v: Any) -> Optional[bool]:
    if v in (None, "", "null"): return None
    if isinstance(v, bool): return v
    s = str(v).strip().lower()
    if s in ("true","1","yes","y","نعم"): return True
    if s in ("false","0","no","n","لا"): return False
    return None

def _apply_header_style(ws):
    """Header style + RTL + borders + auto width."""
    ws.sheet_view.rightToLeft = True
    # Header row style
    header_fill = PatternFill("solid", fgColor="BFE3FF")  # سماوي
    bold_font = Font(bold=True)
    center = Alignment(horizontal="center", vertical="center", wrap_text=True)
    thin = Side(border_style="thin", color="999999")

    for cell in ws[1]:
        cell.font = bold_font
        cell.fill = header_fill
        cell.alignment = center
        cell.border = Border(top=thin, left=thin, right=thin, bottom=thin)

    # Column widths
    for col in ws.columns:
        max_len = 0
        col_letter = col[0].column_letter
        for c in col:
            try:
                max_len = max(max_len, len(str(c.value)) if c.value is not None else 0)
            except Exception:
                pass
        ws.column_dimensions[col_letter].width = min(40, max(10, max_len + 2))

def _wb_from_df(df: pd.DataFrame, sheet_name: str = "Sheet1") -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_name

    # dump dataframe
    rows = [list(df.columns)] + df.values.tolist()
    for r_idx, row in enumerate(rows, start=1):
        for c_idx, val in enumerate(row, start=1):
            ws.cell(row=r_idx, column=c_idx, value=val)

    _apply_header_style(ws)

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf.getvalue()

def _month_filter(d: Optional[date], year: int, month: int) -> bool:
    return bool(d) and d.year == year and d.month == month

def _filter_month_records(objs, date_attr: str, year: Optional[int], month: Optional[int]):
    if not (year and month):
        return objs
    out = []
    for r in objs:
        d: Optional[date] = getattr(r, date_attr)
        if _month_filter(d, year, month):
            out.append(r)
    return out


# =========================
# CRUD — Issue (صرف/طارئ)
# =========================

@app.post("/api/issue", response_model=dict)
def create_issue(payload: dict):
    try:
        obj = Issue(
            item_name=payload["item_name"],
            model=payload.get("model"),
            serial=payload.get("serial"),
            status=payload["status"],
            quantity=int(payload.get("quantity", 1)),
            location=payload.get("location"),
            requester=payload.get("requester"),
            issue_date=_to_date(payload["issue_date"]),
            qualified_by=payload.get("qualified_by"),
            receiver=payload.get("receiver"),
        )
        with Session(engine) as s:
            s.add(obj); s.commit(); s.refresh(obj)
        return {"ok": True, "id": obj.id}
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/api/issue", response_model=List[dict])
def list_issues():
    with Session(engine) as s:
        rows = s.exec(select(Issue).order_by(Issue.issue_date.desc(), Issue.id.desc())).all()
        return [r.dict() for r in rows]


# =========================
# CRUD + Search + Update — Cabinets
# =========================

@app.post("/api/cabinets", response_model=dict)
def create_cabinet(payload: dict):
    try:
        with Session(engine) as s:
            # منع تكرار الترميز
            code = (payload.get("code") or "").strip()
            if code:
                exists = s.exec(select(CabinetRehab).where(CabinetRehab.code == code)).first()
                if exists:
                    raise HTTPException(409, "الترميز موجود مسبقًا في الكبائن.")

            obj = CabinetRehab(
                cabinet_type=payload["cabinet_type"],
                code=code or None,
                rehab_date=_to_date(payload["rehab_date"]),
                qualified_by=payload.get("qualified_by"),
                location=payload.get("location"),
                receiver=payload.get("receiver"),
                issue_date=_to_date(payload["issue_date"]) if payload.get("issue_date") else None,
                notes=payload.get("notes"),
            )
            s.add(obj); s.commit(); s.refresh(obj)
            return {"ok": True, "id": obj.id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/api/cabinets", response_model=List[dict])
def list_cabinets():
    with Session(engine) as s:
        rows = s.exec(select(CabinetRehab).order_by(CabinetRehab.rehab_date.desc(), CabinetRehab.id.desc())).all()
        return [r.dict() for r in rows]

@app.get("/api/cabinets/find", response_model=dict)
def find_cabinet(code: str = Query(..., description="الترميز")):
    with Session(engine) as s:
        r = s.exec(select(CabinetRehab).where(CabinetRehab.code == code)).first()
        if not r:
            raise HTTPException(404, "لم يتم العثور على الكبينة بهذا الترميز.")
        return r.dict()

@app.put("/api/cabinets/{cab_id}", response_model=dict)
def update_cabinet(cab_id: int, payload: dict):
    with Session(engine) as s:
        r = s.get(CabinetRehab, cab_id)
        if not r:
            raise HTTPException(404, "السجل غير موجود.")
        # منع تكرار الترميز عند التعديل
        new_code = (payload.get("code") or "").strip() or None
        if new_code:
            dup = s.exec(select(CabinetRehab).where(CabinetRehab.code == new_code, CabinetRehab.id != cab_id)).first()
            if dup:
                raise HTTPException(409, "الترميز مستخدم من سجل آخر.")
        # حدث الحقول
        for k, v in payload.items():
            if k in {"rehab_date", "issue_date"} and v:
                setattr(r, k, _to_date(v))
            else:
                setattr(r, k, v if v != "" else None)
        s.add(r); s.commit()
        return {"ok": True}


# =========================
# CRUD + Search + Update — Assets
# =========================

@app.post("/api/assets", response_model=dict)
def create_asset(payload: dict):
    try:
        with Session(engine) as s:
            serial = (payload.get("serial_or_code") or "").strip()
            curr_loc = (payload.get("current_location") or "").strip()

            # 1) منع تكرار الرقم التسلسلي/الترميز على الإطلاق
            if serial:
                exists = s.exec(select(AssetRehab).where(AssetRehab.serial_or_code == serial)).first()
                if exists:
                    raise HTTPException(409, "الرقم التسلسلي/الترميز موجود مسبقًا في الأصول.")

            # 2) منع تكرار (السيريال × الموقع الحالي) — يحمي حالة المحركات خصوصًا
            if serial and curr_loc:
                pair = s.exec(
                    select(AssetRehab).where(
                        AssetRehab.serial_or_code == serial,
                        AssetRehab.current_location == curr_loc
                    )
                ).first()
                if pair:
                    raise HTTPException(409, "هذا الأصل مُسجّل بالفعل بهذا الموقع الحالي.")

            obj = AssetRehab(
                asset_type=payload["asset_type"],
                model=payload.get("model"),
                serial_or_code=serial or None,
                quantity=int(payload.get("quantity", 1)),
                prev_location=payload.get("prev_location"),
                supply_date=_to_date(payload["supply_date"]),
                qualified_by=payload.get("qualified_by"),
                lifted=_to_bool(payload.get("lifted")),
                inspector=payload.get("inspector"),
                tested=_to_bool(payload.get("tested")),
                issue_date=_to_date(payload["issue_date"]) if payload.get("issue_date") else None,
                current_location=curr_loc or None,
                requester=payload.get("requester"),
                receiver=payload.get("receiver"),
                notes=payload.get("notes"),
            )
            s.add(obj); s.commit(); s.refresh(obj)
            return {"ok": True, "id": obj.id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/api/assets", response_model=List[dict])
def list_assets():
    with Session(engine) as s:
        rows = s.exec(select(AssetRehab).order_by(AssetRehab.supply_date.desc(), AssetRehab.id.desc())).all()
        return [r.dict() for r in rows]

@app.get("/api/assets/find", response_model=dict)
def find_asset(serial: str = Query(..., description="الرقم التسلسلي/الترميز")):
    with Session(engine) as s:
        r = s.exec(select(AssetRehab).where(AssetRehab.serial_or_code == serial)).first()
        if not r:
            raise HTTPException(404, "لم يتم العثور على الأصل بهذا الرقم.")
        return r.dict()

@app.put("/api/assets/{asset_id}", response_model=dict)
def update_asset(asset_id: int, payload: dict):
    with Session(engine) as s:
        r = s.get(AssetRehab, asset_id)
        if not r:
            raise HTTPException(404, "السجل غير موجود.")
        new_serial = (payload.get("serial_or_code") or "").strip() or None
        new_loc = (payload.get("current_location") or "").strip() or None

        # 1) منع تكرار السيريال مع سجلات أخرى
        if new_serial:
            dup = s.exec(select(AssetRehab).where(AssetRehab.serial_or_code == new_serial, AssetRehab.id != asset_id)).first()
            if dup:
                raise HTTPException(409, "الرقم التسلسلي/الترميز مستخدم من سجل آخر.")

        # 2) منع تكرار (سيريال × موقع حالي)
        if new_serial and new_loc:
            dup2 = s.exec(
                select(AssetRehab).where(
                    AssetRehab.serial_or_code == new_serial,
                    AssetRehab.current_location == new_loc,
                    AssetRehab.id != asset_id
                )
            ).first()
            if dup2:
                raise HTTPException(409, "هذا الأصل مُسجّل بالفعل بهذا الموقع الحالي.")

        # تحديث الحقول
        for k, v in payload.items():
            if k in {"supply_date", "issue_date"} and v:
                setattr(r, k, _to_date(v))
            elif k in {"lifted", "tested"}:
                setattr(r, k, _to_bool(v))
            else:
                setattr(r, k, v if v != "" else None)
        s.add(r); s.commit()
        return {"ok": True}


# =========================
# CRUD + Search + Update — Spares
# =========================

@app.post("/api/spares", response_model=dict)
def create_spare(payload: dict):
    try:
        with Session(engine) as s:
            serial = (payload.get("serial") or "").strip()
            source = (payload.get("source") or "").strip()
            # منع تكرار (السيريال × المصدر) إذا وُجد سيريال
            if serial and source:
                dup = s.exec(
                    select(SparePartRehab).where(
                        SparePartRehab.serial == serial,
                        SparePartRehab.source == source
                    )
                ).first()
                if dup:
                    raise HTTPException(409, "هذه القطعة مُسجّلة بنفس الرقم والمصدر.")

            obj = SparePartRehab(
                part_category=payload["part_category"],
                part_name=payload.get("part_name"),
                part_model=payload.get("part_model"),
                quantity=int(payload.get("quantity", 1)),
                serial=serial or None,
                source=source or None,
                qualified_by=payload.get("qualified_by"),
                rehab_date=_to_date(payload["rehab_date"]),
                tested=_to_bool(payload.get("tested")),
                notes=payload.get("notes"),
            )
            s.add(obj); s.commit(); s.refresh(obj)
            return {"ok": True, "id": obj.id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, str(e))

@app.get("/api/spares", response_model=List[dict])
def list_spares():
    with Session(engine) as s:
        rows = s.exec(select(SparePartRehab).order_by(SparePartRehab.rehab_date.desc(), SparePartRehab.id.desc())).all()
        return [r.dict() for r in rows]

@app.get("/api/spares/find", response_model=dict)
def find_spare(serial: str = Query(..., description="الرقم التسلسلي (إن وُجد)")):
    with Session(engine) as s:
        r = s.exec(select(SparePartRehab).where(SparePartRehab.serial == serial)).first()
        if not r:
            raise HTTPException(404, "لم يتم العثور على قطعة الغيار بهذا الرقم.")
        return r.dict()

@app.put("/api/spares/{spare_id}", response_model=dict)
def update_spare(spare_id: int, payload: dict):
    with Session(engine) as s:
        r = s.get(SparePartRehab, spare_id)
        if not r:
            raise HTTPException(404, "السجل غير موجود.")
        # منع تكرار (سيريال × مصدر) عند التعديل
        new_serial = (payload.get("serial") or "").strip() or None
        new_source = (payload.get("source") or "").strip() or None
        if new_serial and new_source:
            dup = s.exec(
                select(SparePartRehab).where(
                    SparePartRehab.serial == new_serial,
                    SparePartRehab.source == new_source,
                    SparePartRehab.id != spare_id
                )
            ).first()
            if dup:
                raise HTTPException(409, "هذه القطعة مُسجّلة بالفعل بنفس الرقم والمصدر.")
        for k, v in payload.items():
            if k == "rehab_date" and v:
                setattr(r, k, _to_date(v))
            elif k == "tested":
                setattr(r, k, _to_bool(v))
            else:
                setattr(r, k, v if v != "" else None)
        s.add(r); s.commit()
        return {"ok": True}


# =========================
# Excel Exports (RTL + Header style) + month-to-date
# =========================

_DEF_HEADERS_AR = {
    "issue_full": [
        "اسم القطعة","المودل","الرقم التسلسلي","الحالة","العدد","الموقع",
        "جهة الطلب","تاريخ الصرف","المؤهل","المستلم",
    ],
    "issue_summary": [
        "اسم القطعة","العدد","الرقم التسلسلي","الموقع الحالي","المستلم",
    ],
}

@app.get("/api/export/issue/full.xlsx")
def export_issue_full():
    with Session(engine) as s:
        rows = s.exec(select(Issue)).all()
        data = [[r.item_name, r.model, r.serial, r.status, r.quantity, r.location,
                 r.requester, r.issue_date.isoformat(), r.qualified_by, r.receiver] for r in rows]
    df = pd.DataFrame(data, columns=_DEF_HEADERS_AR["issue_full"]) if data else pd.DataFrame(columns=_DEF_HEADERS_AR["issue_full"])
    payload = _wb_from_df(df, "Issue-Full")
    return StreamingResponse(io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=issue_full.xlsx"})

@app.get("/api/export/issue/summary.xlsx")
def export_issue_summary():
    with Session(engine) as s:
        rows = s.exec(select(Issue)).all()
        data = [[r.item_name, r.quantity, r.serial, r.location, r.receiver] for r in rows]
    df = pd.DataFrame(data, columns=_DEF_HEADERS_AR["issue_summary"]) if data else pd.DataFrame(columns=_DEF_HEADERS_AR["issue_summary"])
    payload = _wb_from_df(df, "Issue-Summary")
    return StreamingResponse(io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition":"attachment; filename=issue_summary.xlsx"})

@app.get("/api/export/cabinets.xlsx")
def export_cabinets(year: Optional[int] = None, month: Optional[int] = None):
    with Session(engine) as s:
        rows = s.exec(select(CabinetRehab)).all()
        rows = _filter_month_records(rows, "rehab_date", year, month)
        cols = ["نوع الكبينة","الترميز","تاريخ التأهيل","المؤهل","الموقع","المستلم","تاريخ الصرف","ملاحظات"]
        data = [[r.cabinet_type, r.code, r.rehab_date.isoformat(), r.qualified_by, r.location,
                 r.receiver, r.issue_date.isoformat() if r.issue_date else None, r.notes] for r in rows]
    df = pd.DataFrame(data, columns=cols) if data else pd.DataFrame(columns=cols)
    payload = _wb_from_df(df, "Cabinets")
    fname = f"cabinets_{year or 'all'}_{month or 'all'}.xlsx"
    return StreamingResponse(io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"})

@app.get("/api/export/assets.xlsx")
def export_assets(year: Optional[int] = None, month: Optional[int] = None):
    with Session(engine) as s:
        rows = s.exec(select(AssetRehab)).all()
        rows = _filter_month_records(rows, "supply_date", year, month)
        cols = ["نوع الأصل","المودل","الرقم التسلسلي/الترميز","العدد","الموقع السابق","تاريخ التوريد",
                "المؤهل","الرفع","الفاحص","الفحص","تاريخ الصرف","الموقع الحالي","جهة الطلب","المستلم","ملاحظات"]
        data = [[r.asset_type, r.model, r.serial_or_code, r.quantity, r.prev_location,
                 r.supply_date.isoformat(), r.qualified_by, r.lifted, r.inspector, r.tested,
                 r.issue_date.isoformat() if r.issue_date else None, r.current_location,
                 r.requester, r.receiver, r.notes] for r in rows]
    df = pd.DataFrame(data, columns=cols) if data else pd.DataFrame(columns=cols)
    payload = _wb_from_df(df, "Assets")
    fname = f"assets_{year or 'all'}_{month or 'all'}.xlsx"
    return StreamingResponse(io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"})

@app.get("/api/export/spares.xlsx")
def export_spares(year: Optional[int] = None, month: Optional[int] = None):
    with Session(engine) as s:
        rows = s.exec(select(SparePartRehab)).all()
        rows = _filter_month_records(rows, "rehab_date", year, month)
        cols = ["نوع القطعة","اسم القطعة","موديل القطعة","العدد","الرقم التسلسلي","المصدر","المؤهل","تاريخ التأهيل","الفحص","ملاحظات"]
        data = [[r.part_category, r.part_name, r.part_model, r.quantity, r.serial, r.source,
                 r.qualified_by, r.rehab_date.isoformat(), r.tested, r.notes] for r in rows]
    df = pd.DataFrame(data, columns=cols) if data else pd.DataFrame(columns=cols)
    payload = _wb_from_df(df, "Spares")
    fname = f"spares_{year or 'all'}_{month or 'all'}.xlsx"
    return StreamingResponse(io.BytesIO(payload),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={fname}"})


# =========================
# Monthly / Quarterly Summaries
# =========================

_ACTIVITY_LABELS = {
    "ATS": "تجميع كبائن تحكم ATS",
    "AMF": "تجميع كبائن تحكم AMF",
    "HYBRID": "تجميع كبائن تحكم ATS HYBRID",
    "حماية انفرتر": "تجميع كبائن حماية انفرتر",
    "ظفيرة تحكم": "تجميع ظفائر مولدات",
    "بطاريات": "تأهيل بطاريات",
    "موحدات": "تأهيل موحدات",
    "محركات": "تأهيل محركات",
    "مولدات": "تأهيل مولدات",
    "مكيفات": "تأهيل مكيفات",
    "أصول أخرى": "تأهيل أصول أخرى",
    "صرف": "صرف مواد/قطع/أصول",
}

@app.get("/api/export/monthly_summary.xlsx")
def export_monthly_summary(year: int, month: int):
    # ترتيب الصفوف والأسماء بالضبط كما بالصورة
    rows_map = [
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

    # حصر شهري
    cab_cnt = {"ATS":0,"AMF":0,"HYBRID":0,"حماية انفرتر":0,"ظفيرة تحكم":0}
    ast_cnt = {"بطاريات":0,"موحدات":0,"محركات":0,"مولدات":0,"مكيفات":0,"أصول أخرى":0}
    spa_cnt = {"مضخات الديزل":0,"النوزلات":0,"سلف":0,"دينمو شحن":0,"كروت وشواحن":0,"موديولات":0,"منظمات وانفرترات":0,"تسييخ":0,"أخرى":0}

    with Session(engine) as s:
        for r in s.exec(select(CabinetRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.cabinet_type in cab_cnt:
                cab_cnt[r.cabinet_type] += 1
        for r in s.exec(select(AssetRehab)).all():
            if _month_filter(r.supply_date, year, month) and r.asset_type in ast_cnt:
                ast_cnt[r.asset_type] += (r.quantity or 1)
        for r in s.exec(select(SparePartRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.part_category in spa_cnt:
                spa_cnt[r.part_category] += (r.quantity or 1)

    # إنشاء المصنف
    wb = Workbook()
    ws = wb.active
    ws.title = "ملخص شهري"
    ws.sheet_view.rightToLeft = True

    # عنوان علوي مثل الصورة
    mname = AR_MONTHS[month-1]
    title = f"أهم الإنجازات التي تمت في مركز الإصلاحات الفنية خلال شهر {mname} {year} م:"
    ws.merge_cells("A1:E1")
    ws["A1"].value = title
    ws["A1"].font = Font(bold=True, size=14, color="003366")
    ws["A1"].alignment = Alignment(horizontal="right")

    # رأس الأعمدة: م | الصنف | الشهر
    start_row = 3
    ws.cell(row=start_row,   column=1, value="م")
    ws.cell(row=start_row,   column=2, value="الصنف")
    ws.cell(row=start_row,   column=3, value=mname)

    # تعبئة الصفوف وترقيم
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

    # صف الإجمالي
    ws.cell(row=r, column=2, value="الإجمالي").font = Font(bold=True)
    total_cell = ws.cell(row=r, column=3, value=total)
    total_cell.font = Font(bold=True, color="C00000")  # أحمر

    # تنسيق الجدول مثل الصورة (ترويسة سلمونية وحدود كاملة)
    rows_count = (len(rows_map) + 2)  # + رأس + إجمالي
    style_table_like_sample(ws, top_row=start_row, left_col=1, rows=rows_count, cols=3, header_rows=1, header_fill="EFC9B8")

    # تضييق عمود (م) وتوسيع (الصنف)
    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 12

    # إخراج
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=monthly_{year}_{month:02d}.xlsx"}
    )


@app.get("/api/export/quarterly_summary.xlsx")
def export_quarterly_summary(start_year: int, start_month: int):
    # سننشئ ثلاثة أشهر متتالية (مثلاً 4,5,6) مع عمود "الربع"
    months = []
    y, m = start_year, start_month
    for _ in range(3):
        months.append((y, m))
        m += 1
        if m == 13: m = 1; y += 1

    # نفس ترتيب الصفوف مثل الشهري
    rows_map = [
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

    # تجميع للأشهر الثلاثة
    def count_for_month(y,m):
        cab_cnt = {"ATS":0,"AMF":0,"HYBRID":0,"حماية انفرتر":0,"ظفيرة تحكم":0}
        ast_cnt = {"بطاريات":0,"موحدات":0,"محركات":0,"مولدات":0,"مكيفات":0,"أصول أخرى":0}
        spa_cnt = {"مضخات الديزل":0,"النوزلات":0,"سلف":0,"دينمو شحن":0,"كروت وشواحن":0,"موديولات":0,"منظمات وانفرترات":0,"تسييخ":0,"أخرى":0}
        with Session(engine) as s:
            for r in s.exec(select(CabinetRehab)).all():
                if _month_filter(r.rehab_date, y, m) and r.cabinet_type in cab_cnt: cab_cnt[r.cabinet_type]+=1
            for r in s.exec(select(AssetRehab)).all():
                if _month_filter(r.supply_date, y, m) and r.asset_type in ast_cnt: ast_cnt[r.asset_type]+= (r.quantity or 1)
            for r in s.exec(select(SparePartRehab)).all():
                if _month_filter(r.rehab_date, y, m) and r.part_category in spa_cnt: spa_cnt[r.part_category]+= (r.quantity or 1)
        return cab_cnt, ast_cnt, spa_cnt

    monthly_nums = {}  # (label, month_index) -> value
    for idx, (yy,mm) in enumerate(months):
        cab, ast, spa = count_for_month(yy,mm)
        for label, (kind,key) in rows_map:
            val = (cab if kind=="cab" else ast if kind=="ast" else spa).get(key,0)
            monthly_nums[(label, idx)] = val

    # إنشاء المصنف
    wb = Workbook()
    ws = wb.active
    ws.title = "ملخص ربع سنوي"
    ws.sheet_view.rightToLeft = True

    # عنوان علوي
    months_names = "، ".join(AR_MONTHS[m-1] for (_,m) in months[::-1])  # للعرض فقط
    quarter_title = f"أهم الإنجازات التي تمت في مركز الإصلاحات الفنية خلال الربع ({months_names}) لعام {months[0][0]} م:"
    ws.merge_cells("A1:G1")
    ws["A1"].value = quarter_title
    ws["A1"].font = Font(bold=True, size=14, color="003366")
    ws["A1"].alignment = Alignment(horizontal="right")

    # رأس الأعمدة: م | الصنف | (شهور) | الربع
    start_row = 3
    headers = ["م","الصنف"] + [AR_MONTHS[m-1] for (_,m) in months] + ["الربع"]
    for c,h in enumerate(headers, start=1):
        ws.cell(row=start_row, column=c, value=h)

    # صفوف البيانات
    totals_per_month = [0,0,0]
    grand_total = 0
    r = start_row + 1
    for i,(label,_) in enumerate(rows_map, start=1):
        ws.cell(row=r, column=1, value=i)
        ws.cell(row=r, column=2, value=label)
        row_sum = 0
        for mi in range(3):
            v = monthly_nums[(label, mi)]
            ws.cell(row=r, column=3+mi, value=v)
            row_sum += v
            totals_per_month[mi] += v
        ws.cell(row=r, column=6, value=row_sum)  # عمود "الربع"
        grand_total += row_sum
        r += 1

    # صف إجمالي أسفل
    ws.cell(row=r, column=2, value="الإجمالي").font = Font(bold=True)
    for mi in range(3):
        ws.cell(row=r, column=3+mi, value=totals_per_month[mi]).font = Font(bold=True)
    total_cell = ws.cell(row=r, column=6, value=grand_total)
    total_cell.font = Font(bold=True, color="C00000")

    # تنسيق الجدول مثل الصورة
    rows_count = (len(rows_map) + 2)
    style_table_like_sample(ws, top_row=start_row, left_col=1, rows=rows_count, cols=6, header_rows=1, header_fill="EFC9B8")

    # عروض الأعمدة
    ws.column_dimensions["A"].width = 6
    ws.column_dimensions["B"].width = 34
    for col in ["C","D","E","F"]:
        ws.column_dimensions[col].width = 12

    # إخراج
    buf = io.BytesIO(); wb.save(buf); buf.seek(0)
    return StreamingResponse(
        buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=quarterly_{months[0][0]}_{months[0][1]:02d}.xlsx"}
    )


# =========================
# Stats endpoints for charts (per month)
# =========================

@app.get("/api/stats/cabinets")
def stats_cabinets(year: int, month: int):
    cats = ["ATS", "AMF", "HYBRID", "حماية انفرتر", "ظفيرة تحكم"]
    counts = {c: 0 for c in cats}
    with Session(engine) as s:
        for r in s.exec(select(CabinetRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.cabinet_type in counts:
                counts[r.cabinet_type] += 1
    return counts

@app.get("/api/stats/assets")
def stats_assets(year: int, month: int):
    cats = ["بطاريات","موحدات","محركات","مولدات","مكيفات","أصول أخرى"]
    counts = {c: 0 for c in cats}
    with Session(engine) as s:
        for r in s.exec(select(AssetRehab)).all():
            if _month_filter(r.supply_date, year, month) and r.asset_type in counts:
                counts[r.asset_type] += r.quantity or 1
    return counts

@app.get("/api/stats/spares")
def stats_spares(year: int, month: int):
    cats = ["مضخات الديزل","النوزلات","سلف","دينمو شحن","كروت وشواحن","موديولات","منظمات وانفرترات","تسييخ","أخرى"]
    counts = {c: 0 for c in cats}
    with Session(engine) as s:
        for r in s.exec(select(SparePartRehab)).all():
            if _month_filter(r.rehab_date, year, month) and r.part_category in counts:
                counts[r.part_category] += r.quantity or 1
    return counts


# =========================
# Duplicate checker endpoint
# =========================

@app.get("/api/validate/duplicates")
def validate_duplicates():
    out: Dict[str, Any] = {"cabinets_codes": [], "assets_serials": [], "assets_serial_loc_pairs": [], "spares_serial_src_pairs": []}
    with Session(engine) as s:
        # cabinets codes
        codes: Dict[str, int] = {}
        for r in s.exec(select(CabinetRehab)).all():
            if r.code:
                codes[r.code] = codes.get(r.code, 0) + 1
        out["cabinets_codes"] = [k for k,v in codes.items() if v > 1]

        # assets serials + (serial,current_location)
        serials: Dict[str, int] = {}
        pairs: Dict[tuple, int] = {}
        for r in s.exec(select(AssetRehab)).all():
            if r.serial_or_code:
                serials[r.serial_or_code] = serials.get(r.serial_or_code, 0) + 1
                if r.current_location:
                    key = (r.serial_or_code, r.current_location)
                    pairs[key] = pairs.get(key, 0) + 1
        out["assets_serials"] = [k for k,v in serials.items() if v > 1]
        out["assets_serial_loc_pairs"] = [f"{k[0]} @ {k[1]}" for k,v in pairs.items() if v > 1]

        # spares (serial, source)
        sp_pairs: Dict[tuple, int] = {}
        for r in s.exec(select(SparePartRehab)).all():
            if r.serial and r.source:
                key = (r.serial, r.source)
                sp_pairs[key] = sp_pairs.get(key, 0) + 1
        out["spares_serial_src_pairs"] = [f"{k[0]} | {k[1]}" for k,v in sp_pairs.items() if v > 1]

    return out
