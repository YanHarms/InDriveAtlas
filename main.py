from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd
import requests
import io
import random
from datetime import datetime

app = FastAPI(title="InDrive Atlas", version="1.0")

# --- Подключаем статику и шаблоны ---
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# === Функция безопасной загрузки CSV ===
def load_csv_from_gdrive():
    CSV_FILE_ID = "1kDfy_hhFBPdmYb4qyY68EyT9dRHA4gPS"
    CSV_URL = f"https://drive.google.com/uc?id={CSV_FILE_ID}"
    try:
        print("[INFO] Загрузка CSV...")
        r = requests.get(CSV_URL, timeout=10)
        r.raise_for_status()
        df = pd.read_csv(io.StringIO(r.text))
        if "randomized_id" not in df.columns:
            df["randomized_id"] = [f"trip_{i}" for i in range(len(df))]
        if "timestamp" not in df.columns:
            df["timestamp"] = [datetime.now() for _ in range(len(df))]
        print(f"[INFO] CSV успешно загружен: {len(df)} строк")
        return df
    except Exception as e:
        print(f"[WARN] Ошибка загрузки CSV: {e}")
        return pd.DataFrame(columns=["latitude", "longitude", "timestamp", "randomized_id"])


# === Функция безопасной загрузки JSON ===
def load_json_from_gdrive():
    JSON_FILE_ID = "1FkHtwdzjCwzRhOoM1zRBUt68RA5xZKE7"
    JSON_URL = f"https://drive.google.com/uc?id={JSON_FILE_ID}"
    try:
        print("[INFO] Загрузка JSON...")
        r = requests.get(JSON_URL, timeout=10)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[WARN] Ошибка загрузки JSON: {e}")
        return {}


# === Глобальные данные ===
df = load_csv_from_gdrive()
data_json = load_json_from_gdrive()


# === Главная страница ===
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


# === 1. Вернуть случайный trip_id ===
@app.get("/random_trip_id")
def get_random_trip_id():
    if df.empty:
        return JSONResponse({"error": "Данные не загружены"}, status_code=503)
    trip_id = random.choice(df["randomized_id"].tolist())
    return {"trip_id": trip_id}


# === 2. Прогноз спроса по часам ===
@app.get("/demand_forecast")
def demand_forecast():
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)
    df_local = df.copy()
    df_local["timestamp"] = pd.to_datetime(df_local["timestamp"], errors="coerce")
    df_local["hour"] = df_local["timestamp"].dt.hour.fillna(0).astype(int)
    grouped = (
        df_local.groupby("hour")["randomized_id"]
        .nunique()
        .reset_index(name="count")
    )
    return grouped.to_dict(orient="records")


# === 3. Получить поездку по ID ===
@app.get("/trip/{trip_id}")
def get_trip(trip_id: str):
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)
    trip = df[df["randomized_id"] == trip_id][["latitude", "longitude", "timestamp"]]
    if trip.empty:
        return JSONResponse({"error": f"Trip ID '{trip_id}' не найден"}, status_code=404)
    return trip.to_dict(orient="records")


# === 4. Горячие зоны ===
@app.get("/hotzones")
def hotzones():
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


# === 5. Симуляция одной случайной поездки ===
@app.get("/simulate_trip")
def simulate_trip():
    if df.empty:
        return JSONResponse({"error": "Нет данных"}, status_code=503)
    random_trip = df.sample(1).iloc[0].to_dict()
    random_trip["timestamp"] = datetime.now().isoformat()
    return random_trip


# === 6. Проверка статуса (для Render ping) ===
@app.get("/health")
def health_check():
    return {"status": "ok", "rows": len(df)}


# === 7. Автообновление данных каждые N часов (опционально) ===
# Можно добавить cron или Render Background Worker для обновления данных

# === Старт (локально) ===
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000)
