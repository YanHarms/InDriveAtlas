from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd
import random
import requests
import io
import uuid
import json
import warnings

warnings.filterwarnings("ignore")  # скрывает InsecureRequestWarning

app = FastAPI()

# ---------- ЗАГРУЗКА CSV ----------
CSV_ID = "1kDfy_hhFBPdmYb4qyY68EyT9dRHA4gPS"
CSV_URL = f"https://drive.google.com/uc?id={CSV_ID}"

try:
    csv_response = requests.get(CSV_URL, verify=False)
    df = pd.read_csv(io.StringIO(csv_response.text))
    # если нет randomized_id — создаём
    if "randomized_id" not in df.columns:
        df["randomized_id"] = [str(uuid.uuid4()) for _ in range(len(df))]
except Exception as e:
    print(f"⚠️ Ошибка при загрузке CSV: {e}")
    df = pd.DataFrame(columns=["latitude", "longitude", "timestamp", "randomized_id"])

# ---------- ЗАГРУЗКА JSON ----------
JSON_ID = "1FkHtwdzjCwzRhOoM1zRBUt68RA5xZKE7"
JSON_URL = f"https://drive.google.com/uc?id={JSON_ID}"

try:
    json_response = requests.get(JSON_URL, verify=False)
    data_json = json_response.json()
except Exception as e:
    print(f"⚠️ Ошибка при загрузке JSON: {e}")
    data_json = {}

# ---------- СТАТИКА И ШАБЛОНЫ ----------
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# ---------- ГЛАВНАЯ ----------
@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

# ---------- СЛУЧАЙНЫЙ ID ----------
@app.get("/random_trip_id")
def random_trip_id():
    if len(df) == 0:
        return {"error": "no data"}
    trip_id = random.choice(df["randomized_id"].tolist())
    return {"trip_id": trip_id}

# ---------- ПРОГНОЗ СПРОСА ----------
@app.get("/demand_forecast")
def demand_forecast():
    if len(df) == 0:
        return []
    d = df.copy()
    d["timestamp"] = pd.to_datetime(d["timestamp"], errors="coerce")
    d["hour"] = d["timestamp"].dt.hour
    grouped = (
        d.groupby("hour")["randomized_id"]
        .nunique()
        .reset_index(name="count")
        .sort_values("hour")
    )
    return grouped.to_dict(orient="records")

# ---------- ПОЕЗДКА ПО ID ----------
@app.get("/trip/{trip_id}")
def trip_by_id(trip_id: str):
    if len(df) == 0:
        return []
    trip = df[df["randomized_id"] == trip_id][["latitude", "longitude", "timestamp"]]
    return trip.to_dict(orient="records")

# ---------- ГОРЯЧИЕ ЗОНЫ ----------
@app.get("/hotzones")
def hotzones():
    if len(df) == 0:
        return []
    sample = (
        df[["latitude", "longitude"]]
        .sample(min(200, len(df)))
        .rename(columns={"latitude": "lat", "longitude": "lon"})
        .to_dict(orient="records")
    )
    return sample
