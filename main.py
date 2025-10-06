from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd
import requests
import io
import random
from datetime import datetime

app = FastAPI()

# --- Подключаем статику (CSS, JS, картинки) ---
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- Подключаем шаблоны ---
templates = Jinja2Templates(directory="templates")


# === 1. Загружаем CSV из Google Drive ===
CSV_FILE_ID = "1kDfy_hhFBPdmYb4qyY68EyT9dRHA4gPS"
CSV_URL = f"https://drive.google.com/uc?id={CSV_FILE_ID}"

try:
    response = requests.get(CSV_URL, verify=False)
    response.raise_for_status()
    df = pd.read_csv(io.StringIO(response.text))
    if "randomized_id" not in df.columns:
        df["randomized_id"] = [f"trip_{i}" for i in range(len(df))]
    if "timestamp" not in df.columns:
        df["timestamp"] = [datetime.now() for _ in range(len(df))]
except Exception as e:
    print(f"[ERROR] Не удалось загрузить CSV: {e}")
    df = pd.DataFrame(columns=["latitude", "longitude", "timestamp", "randomized_id"])


# === 2. Загружаем JSON (если нужно) ===
JSON_FILE_ID = "1FkHtwdzjCwzRhOoM1zRBUt68RA5xZKE7"
JSON_URL = f"https://drive.google.com/uc?id={JSON_FILE_ID}"

try:
    response_json = requests.get(JSON_URL, verify=False)
    response_json.raise_for_status()
    data_json = response_json.json()
except Exception as e:
    print(f"[ERROR] Не удалось загрузить JSON: {e}")
    data_json = {}


# === 3. Главная страница ===
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("InDriveAtlas.html", {"request": request})


# === 4. Случайный trip_id ===
@app.get("/random_trip_id")
def get_random_trip_id():
    if df.empty:
        return {"error": "Данные не загружены"}
    trip_id = random.choice(df["randomized_id"].tolist())
    return {"trip_id": trip_id}


# === 5. Прогноз спроса (по часам) ===
@app.get("/demand_forecast")
def demand_forecast():
    if df.empty:
        return {"error": "Нет данных"}
    df_local = df.copy()
    df_local["timestamp"] = pd.to_datetime(df_local["timestamp"], errors="coerce")
    df_local["hour"] = df_local["timestamp"].dt.hour.fillna(0).astype(int)
    grouped = (
        df_local.groupby("hour")["randomized_id"]
        .nunique()
        .reset_index(name="count")
    )
    return grouped.to_dict(orient="records")


# === 6. Получить поездку по ID ===
@app.get("/trip/{trip_id}")
def get_trip(trip_id: str):
    if df.empty:
        return {"error": "Нет данных"}
    trip = df[df["randomized_id"] == trip_id][["latitude", "longitude", "timestamp"]]
    if trip.empty:
        return {"error": f"Trip ID '{trip_id}' не найден"}
    return trip.to_dict(orient="records")


# === 7. Горячие зоны ===
@app.get("/hotzones")
def hotzones():
    if df.empty:
        return {"error": "Нет данных"}
    sample = (
        df[["latitude", "longitude"]]
        .dropna()
        .sample(min(200, len(df)))
        .rename(columns={"latitude": "lat", "longitude": "lon"})
        .to_dict(orient="records")
    )
    return sample


# === 8. Симуляция поездки (новая функция для фронта) ===
@app.get("/simulate_trip")
def simulate_trip():
    if df.empty:
        return {"error": "Нет данных"}
    random_trip = df.sample(1).iloc[0].to_dict()
    random_trip["timestamp"] = datetime.now().isoformat()
    return random_trip
