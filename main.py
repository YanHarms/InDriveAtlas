from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

import pandas as pd
import re
import json
import requests
import io
import random
from datetime import datetime

app = FastAPI(title="InDrive Atlas", version="1.0")

# --- Static + templates ---
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")




def _gdrive_download_bytes(file_id: str, timeout: int = 25) -> bytes:
    session = requests.Session()
    base = "https://drive.google.com"
    url = f"{base}/uc?export=download&id={file_id}"

    r = session.get(url, timeout=timeout, allow_redirects=True)
    r.raise_for_status()

    ctype = (r.headers.get("Content-Type") or "").lower()
    if "text/html" not in ctype:
        return r.content

    html = r.text

    # 1) Try download-form action + hidden inputs (most reliable for virus scan warning)
    form_action = None
    m = re.search(r'<form[^>]+id="download-form"[^>]+action="([^"]+)"', html)
    if m:
        form_action = m.group(1).replace("&amp;", "&")
    else:
        # sometimes form has no id but action contains /uc?export=download
        m = re.search(r'<form[^>]+action="([^"]+/uc\?export=download[^"]*)"', html)
        if m:
            form_action = m.group(1).replace("&amp;", "&")

    if form_action:
        # Collect hidden inputs
        inputs = dict(re.findall(r'<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]+value="([^"]*)"', html))
        # Ensure id is present
        inputs.setdefault("id", file_id)

        # Build download url
        if form_action.startswith("http"):
            download_url = form_action
        else:
            download_url = base + form_action

        r2 = session.get(download_url, params=inputs, timeout=timeout, allow_redirects=True)
        r2.raise_for_status()

        # If still html, fallthrough to other strategies
        if "text/html" not in (r2.headers.get("Content-Type") or "").lower():
            return r2.content

    # 2) Try href="/uc?export=download..."
    m = re.search(r'href="(/uc\?export=download[^"]+)"', html)
    if m:
        download_url = base + m.group(1).replace("&amp;", "&")
        r2 = session.get(download_url, timeout=timeout, allow_redirects=True)
        r2.raise_for_status()
        if "text/html" not in (r2.headers.get("Content-Type") or "").lower():
            return r2.content

    # 3) Try confirm token from hidden input
    m = re.search(r'name="confirm"\s*value="([^"]+)"', html)
    if m:
        confirm = m.group(1)
        r2 = session.get(
            f"{base}/uc?export=download&id={file_id}&confirm={confirm}",
            timeout=timeout,
            allow_redirects=True
        )
        r2.raise_for_status()
        if "text/html" not in (r2.headers.get("Content-Type") or "").lower():
            return r2.content

    # 4) Try cookie token download_warning
    confirm = None
    for k, v in r.cookies.items():
        if k.startswith("download_warning"):
            confirm = v
            break
    if confirm:
        r2 = session.get(
            f"{base}/uc?export=download&id={file_id}&confirm={confirm}",
            timeout=timeout,
            allow_redirects=True
        )
        r2.raise_for_status()
        if "text/html" not in (r2.headers.get("Content-Type") or "").lower():
            return r2.content

    raise RuntimeError("Google Drive returned HTML (virus scan warning) and download could not be resolved. Check sharing or move data to local/GitHub raw.")


# === Safe loaders ===
def load_csv_from_gdrive():
    CSV_FILE_ID = "1kDfy_hhFBPdmYb4qyY68EyT9dRHA4gPS"
    try:
        print("[INFO] Loading CSV...")
        content = _gdrive_download_bytes(CSV_FILE_ID)

        print("[DEBUG] bytes:", len(content))

        text = content.decode("utf-8-sig", errors="replace")
        print("[DEBUG] first-120:", text[:120])

        if "<html" in text.lower():
            raise RuntimeError("Still got HTML instead of CSV. Make the file public (Anyone with the link).")

        df_local = pd.read_csv(io.StringIO(text))

        if "randomized_id" not in df_local.columns:
            df_local["randomized_id"] = [f"trip_{i}" for i in range(len(df_local))]
        if "timestamp" not in df_local.columns:
            df_local["timestamp"] = [datetime.now().isoformat() for _ in range(len(df_local))]

        print(f"[INFO] CSV loaded: {len(df_local)} rows")
        return df_local

    except Exception as e:
        print(f"[WARN] CSV load failed: {e}")
        return pd.DataFrame(columns=["latitude", "longitude", "timestamp", "randomized_id"])


def load_json_from_gdrive():
    JSON_FILE_ID = "1FkHtwdzjCwzRhOoM1zRBUt68RA5xZKE7"
    try:
        print("[INFO] Loading JSON...")
        content = _gdrive_download_bytes(JSON_FILE_ID)

        text = content.decode("utf-8-sig", errors="replace")
        if "<html" in text.lower():
            raise RuntimeError("Got HTML instead of JSON. Make the file public (Anyone with the link).")

        return json.loads(text)

    except Exception as e:
        print(f"[WARN] JSON load failed: {e}")
        return {}

# === Global data ===
df = load_csv_from_gdrive()
data_json = load_json_from_gdrive()  # (пока не используешь — ок)


# =========================
# Pages (UI)
# =========================
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/dashboard", response_class=HTMLResponse)
async def dashboard(request: Request):
    return templates.TemplateResponse("dashboard.html", {"request": request})


@app.get("/map", response_class=HTMLResponse)
async def map_page(request: Request):
    return templates.TemplateResponse("map.html", {"request": request})


@app.get("/trips", response_class=HTMLResponse)
async def trips_page(request: Request):
    return templates.TemplateResponse("trips.html", {"request": request})


# =========================
# Core API (business logic)
# =========================

@app.get("/api/health")
def api_health():
    return {"status": "ok", "rows": int(len(df))}


@app.get("/api/random-trip-id")
def api_random_trip_id():
    if df.empty:
        return JSONResponse({"error": "Данные не загружены"}, status_code=503)
    trip_id = random.choice(df["randomized_id"].astype(str).tolist())
    return {"trip_id": trip_id}


@app.get("/api/demand-forecast")
def api_demand_forecast():
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)

    df_local = df.copy()
    df_local["timestamp"] = pd.to_datetime(df_local["timestamp"], errors="coerce")
    df_local["hour"] = df_local["timestamp"].dt.hour.fillna(0).astype(int)

    grouped = (
        df_local.groupby("hour")["randomized_id"]
        .nunique()
        .reset_index(name="count")
        .sort_values("hour")
    )

    return grouped.to_dict(orient="records")


@app.get("/api/trips")
def api_list_trips(limit: int = 50, offset: int = 0):
    """
    Плоская таблица поездок для /trips.
    """
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)

    limit = max(1, min(int(limit), 500))
    offset = max(0, int(offset))

    df_local = df.copy()
    df_local["timestamp"] = pd.to_datetime(df_local["timestamp"], errors="coerce")

    cols = ["randomized_id", "timestamp", "latitude", "longitude"]
    for c in cols:
        if c not in df_local.columns:
            df_local[c] = None

    view = (
        df_local[cols]
        .dropna(subset=["randomized_id"])
        .sort_values("timestamp", ascending=False)
    )

    total = int(len(view))
    page = view.iloc[offset: offset + limit].copy()

    page["timestamp"] = page["timestamp"].dt.strftime("%Y-%m-%d %H:%M:%S")

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": page.to_dict(orient="records"),
    }


@app.get("/api/trips/{trip_id}")
def api_trip_by_id(trip_id: str):
    """
    Возвращает точки поездки.
    """
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)

    df_local = df.copy()
    df_local["randomized_id"] = df_local["randomized_id"].astype(str)

    trip = df_local[df_local["randomized_id"] == str(trip_id)][["latitude", "longitude", "timestamp"]]
    if trip.empty:
        return JSONResponse({"error": f"Trip ID '{trip_id}' не найден"}, status_code=404)

    return trip.to_dict(orient="records")


@app.get("/api/hotzones")
def api_hotzones():
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)

    sample = (
        df[["latitude", "longitude"]]
        .dropna()
        .sample(min(200, len(df)))
        .rename(columns={"latitude": "lat", "longitude": "lon"})
        .to_dict(orient="records")
    )
    return sample


@app.get("/api/simulate-trip")
def api_simulate_trip():
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)

    random_trip = df.sample(1).iloc[0].to_dict()
    random_trip["timestamp"] = datetime.now().isoformat()
    return random_trip


# =========================
# Legacy routes (backward compatibility)
# =========================
# Оставляем, чтобы не ломать старые ссылки/код.
# Можно удалить позже, когда убедишься, что всё фронтом использует /api/*

@app.get("/health")
def health_legacy():
    return api_health()


@app.get("/random_trip_id")
def random_trip_id_legacy():
    return api_random_trip_id()


@app.get("/demand_forecast")
def demand_forecast_legacy():
    return api_demand_forecast()


@app.get("/hotzones")
def hotzones_legacy():
    return api_hotzones()


@app.get("/simulate_trip")
def simulate_trip_legacy():
    return api_simulate_trip()


@app.get("/trip/{trip_id}")
def trip_legacy(trip_id: str):
    return api_trip_by_id(trip_id)


# === Local run ===
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
