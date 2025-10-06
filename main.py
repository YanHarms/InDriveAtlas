from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import pandas as pd
import random

# --- CSV из Google Drive ---
file_id = "1kDfy_hhFBPdmYb4qyY68EyT9dRHA4gPS"
csv_url = f"https://drive.google.com/uc?id={file_id}"

df = pd.read_csv(csv_url)
df["randomized_id"] = df["randomized_id"].astype(str)

# --- JSON из Google Drive ---
json_id = "1FkHtwdzjCwzRhOoM1zRBUt68RA5xZKE7"
json_url = f"https://drive.google.com/uc?id={json_id}"

# Скачиваем JSON через requests (чтобы избежать ошибок при чтении напрямую)
response = requests.get(json_url)
data_json = response.json()

app = FastAPI()

# Статика (CSS, JS, картинки)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Шаблоны
templates = Jinja2Templates(directory="templates")


# === Главная страница ===
@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("InDriveAtlas.html", {"request": request})

# === Случайный trip_id ===
@app.get("/random_trip_id")
def get_random_trip_id():
    trip_id = random.choice(df["randomized_id"].unique().tolist())
    return {"trip_id": trip_id}
@app.get("/demand_forecast")
def demand_forecast():
    df_local = df.copy()
    df_local["timestamp"] = pd.to_datetime(df_local["timestamp"])
    df_local["hour"] = df_local["timestamp"].dt.hour

    grouped = (
        df_local.groupby("hour")["randomized_id"]
        .nunique()
        .reset_index(name="count")
    )

    return grouped.to_dict(orient="records")


# === Поездка по id ===
@app.get("/trip/{trip_id}")
def get_trip(trip_id: str):
    trip = df[df["randomized_id"] == trip_id][["latitude", "longitude", "timestamp"]]
    return trip.to_dict(orient="records")

# === Горячие зоны ===
@app.get("/hotzones")
def hotzones():
    sample = df[['latitude', 'longitude']].sample(200).rename(
        columns={"latitude": "lat", "longitude": "lon"}
    ).to_dict(orient="records")
    return sample
