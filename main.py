from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd
import requests
import io
import random

# === CSV из Google Drive ===
csv_id = "1kDfy_hhFBPdmYb4qyY68EyT9dRHA4gPS"
csv_url = f"https://drive.google.com/uc?id={csv_id}"

try:
    response = requests.get(csv_url, verify=False, timeout=20)
    response.raise_for_status()
    df = pd.read_csv(io.StringIO(response.text))
    if "randomized_id" not in df.columns:
        df["randomized_id"] = range(1, len(df) + 1)
except Exception as e:
    print(f"[ERROR] Не удалось загрузить CSV: {e}")
    df = pd.DataFrame(columns=["randomized_id", "latitude", "longitude", "timestamp"])

# === JSON из Google Drive ===
json_id = "1FkHtwdzjCwzRhOoM1zRBUt68RA5xZKE7"
json_url = f"https://drive.google.com/uc?id={json_id}"

try:
    r_json = requests.get(json_url, verify=False, timeout=20)
    r_json.raise_for_status()
    data_json = r_json.json()
except Exception as e:
    print(f"[ERROR] Не удалось загрузить JSON: {e}")
    data_json = {}

# === FastAPI ===
app = FastAPI()

# статика и шаблоны
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/random_trip_id")
def get_random_trip_id():
    if df.empty:
        return {"trip_id": "no_data"}
    trip_id = random.choice(df["randomized_id"].astype(str).tolist())
    return {"trip_id": trip_id}

@app.get("/demand_forecast")
def demand_forecast():
    if "timestamp" not in df.columns or df.empty:
        return []
    df_local = df.copy()
    df_local["timestamp"] = pd.to_datetime(df_local["timestamp"], errors="coerce")
    df_local = df_local.dropna(subset=["timestamp"])
    df_local["hour"] = df_local["timestamp"].dt.hour
    grouped = df_local.groupby("hour")["randomized_id"].nunique().reset_index(name="count")
    return grouped.to_dict(orient="records")

@app.get("/trip/{trip_id}")
def get_trip(trip_id: str):
    if "randomized_id" not in df.columns or df.empty:
        return []
    trip = df[df["randomized_id"].astype(str) == trip_id][["latitude", "longitude", "timestamp"]]
    return trip.to_dict(orient="records")

@app.get("/hotzones")
def hotzones():
    if df.empty:
        return []
    sample = (
        df[["latitude", "longitude"]]
        .dropna()
        .sample(min(200, len(df)))
        .rename(columns={"latitude": "lat", "longitude": "lon"})
        .to_dict(orient="records")
    )
    return sample
