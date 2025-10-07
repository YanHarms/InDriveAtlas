// === InDriveAtlas JS (полная стабильная версия) ===
// Работает с FastAPI API через endpoints: /hotzones, /trip/{id}, /random_trip_id, /demand_forecast

// === 0. Инициализация карты ===
// Используем темную тему от CartoDB
const map = L.map("map").setView([51.1694, 71.4491], 11);

L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
  attribution: "", // Убираем подпись "Leaflet"
  subdomains: "abcd",
  maxZoom: 19
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
        color: "orange",
        fillColor: "#ffb703",
        fillOpacity: 0.6
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
    tripLayer = L.polyline(latlngs, { color: "#00b4d8", weight: 4 }).addTo(map);

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
          backgroundColor: "rgba(184, 255, 59, 0.6)"
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

// === 4. Эффект белого хедера при скролле ===
window.addEventListener("scroll", () => {
  const header = document.querySelector("header");
  if (window.scrollY > 50) {
    header.classList.add("scrolled");
  } else {
    header.classList.remove("scrolled");
  }
});

// === 5. Плавный скролл по кнопкам ===
document.querySelector(".more-btn")?.addEventListener("click", () => {
  document.querySelector(".features")?.scrollIntoView({ behavior: "smooth" });
});

document.querySelector(".demo-btn")?.addEventListener("click", () => {
  document.querySelector(".atlas")?.scrollIntoView({ behavior: "smooth" });
});

// === 6. Плавное появление секций при скролле ===
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("fade-in");
    }
  });
}, { threshold: 0.2 });

document.querySelectorAll(".feature, .capability, .faq-item, .atlas, .features, .capabilities").forEach(el => {
  observer.observe(el);
});

// === 7. Навешиваем обработчики на кнопки карты ===
document.getElementById("hotzonesBtn")?.addEventListener("click", loadHotZones);
document.getElementById("simulateTripBtn")?.addEventListener("click", simulateRandomTrip);
document.getElementById("forecastBtn")?.addEventListener("click", loadDemandForecast);

// === 8. Лог при загрузке ===
console.log("✅ InDriveAtlas script fully loaded (dark mode + animations)!");
