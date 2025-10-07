// === InDriveAtlas JS ===
// Работает с FastAPI API через endpoints: /hotzones, /trip/{id}, /random_trip_id, /demand_forecast

// === 0. Инициализация карты ===
const map = L.map("map").setView([51.1694, 71.4491], 11);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap"
}).addTo(map);

let tripLayer = null;
let hotzonesLayer = null;

// === 1. Горячие зоны ===
async function loadHotZones() {
  try {
    const response = await fetch("/hotzones");
    const data = await response.json();

    if (hotzonesLayer) map.removeLayer(hotzonesLayer);

    hotzonesLayer = L.layerGroup(
      data.map(p => L.circleMarker([p.lat, p.lon], {
        radius: 5,
        color: "red",
        fillColor: "#f03",
        fillOpacity: 0.5
      }))
    );

    hotzonesLayer.addTo(map);
  } catch (err) {
    console.error("Ошибка при загрузке горячих зон:", err);
  }
}

// === 2. Случайная поездка ===
async function simulateRandomTrip() {
  try {
    const resId = await fetch("/random_trip_id");
    const { trip_id } = await resId.json();

    const resTrip = await fetch(`/trip/${trip_id}`);
    const points = await resTrip.json();

    if (!points.length) {
      alert("Поездка не найдена!");
      return;
    }

    if (tripLayer) map.removeLayer(tripLayer);

    const latlngs = points.map(p => [p.latitude, p.longitude]);
    tripLayer = L.polyline(latlngs, { color: "blue", weight: 4 }).addTo(map);

    map.fitBounds(tripLayer.getBounds());
  } catch (err) {
    console.error("Ошибка при симуляции поездки:", err);
  }
}

// === 3. Прогноз спроса ===
async function loadDemandForecast() {
  try {
    const response = await fetch("/demand_forecast");
    const data = await response.json();

    const ctx = document.getElementById("forecastChart")?.getContext("2d");
    if (!ctx) return console.warn("forecastChart canvas not found");

    new Chart(ctx, {
      type: "bar",
      data: {
        labels: data.map(item => item.hour),
        datasets: [{
          label: "Количество поездок по часам",
          data: data.map(item => item.count),
          backgroundColor: "rgba(75, 192, 192, 0.6)"
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: "Часы" } },
          y: { title: { display: true, text: "Количество поездок" } }
        }
      }
    });
  } catch (err) {
    console.error("Ошибка прогноза спроса:", err);
  }
}

// === 4. Скролл-хедер ===
window.addEventListener("scroll", () => {
  const header = document.querySelector("header");
  const bg = document.querySelector(".header-bg");

  if (window.scrollY > 50) {
    header.classList.add("scrolled");
    bg.classList.add("visible");
  } else {
    header.classList.remove("scrolled");
    bg.classList.remove("visible");
  }
});

// === 5. Плавный скролл по кнопкам ===
document.querySelector(".more-btn")?.addEventListener("click", () => {
  document.querySelector(".features")?.scrollIntoView({ behavior: "smooth" });
});

document.querySelector(".demo-btn")?.addEventListener("click", () => {
  document.querySelector(".atlas")?.scrollIntoView({ behavior: "smooth" });
});

// === 6. Навешиваем обработчики на кнопки карты ===
document.getElementById("hotzonesBtn")?.addEventListener("click", loadHotZones);
document.getElementById("simulateTripBtn")?.addEventListener("click", simulateRandomTrip);
document.getElementById("forecastBtn")?.addEventListener("click", loadDemandForecast);

// === 7. Лог при загрузке ===
console.log("✅ InDriveAtlas script loaded!");
