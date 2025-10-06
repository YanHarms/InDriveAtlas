// ================= HEADER =================
const header = document.getElementById('header');
let wasScrolled = false;
let dropping = false;

function applyHeaderState() {
  const scrolled = window.scrollY > 30;

  if (scrolled && !wasScrolled) {
    header.classList.add('scrolled');

    if (!dropping) {
      dropping = true;
      header.style.transform = 'translateY(-24px)';
      requestAnimationFrame(() => {
        header.style.transform = 'translateY(0)';
        setTimeout(() => { dropping = false; }, 400);
      });
    }

    wasScrolled = true;
    return;
  }

  if (!scrolled && wasScrolled) {
    header.classList.remove('scrolled');
    header.style.transform = 'translateY(0)';
    wasScrolled = false;
  }
}

window.addEventListener('scroll', applyHeaderState);
window.addEventListener('load', applyHeaderState);


// ================= FAQ =================
document.querySelectorAll(".faq-question").forEach(button => {
  button.addEventListener("click", () => {
    const item = button.parentElement;
    const icon = button.querySelector(".faq-icon");

    item.classList.toggle("active");
    icon.textContent = item.classList.contains("active") ? "–" : "+";
  });
});


// ================= SCROLL BUTTONS =================
document.querySelector('.more-btn').addEventListener('click', function() {
  document.querySelector('.features').scrollIntoView({ behavior: 'smooth' });
});

document.querySelector('.demo-btn').addEventListener('click', function() {
  document.querySelector('.atlas').scrollIntoView({ behavior: 'smooth' });
});


// ================= MAPBOX DARK =================
const map = L.map('map').setView([51.1694, 71.4491], 12);

L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token={accessToken}', {
    attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> © <a href="https://www.mapbox.com/">Mapbox</a>',
    tileSize: 512,
    zoomOffset: -1,
    id: 'mapbox/dark-v10',
    accessToken: 'pk.eyJ1IjoieWFuZy1oYXJtcyIsImEiOiJjbWZ3dTRhbnowM2hoMmtzNm4xeXpuanVwIn0.wz_ifyQybStztYnk5oHUgg' // твой токен
}).addTo(map);


// ================= ANIMATION: TRIP =================
function animateTrip(tripId) {
  clearMap();

  fetch(`/trip/${tripId}`)
    .then(res => res.json())
    .then(trip => {
      if (!trip || trip.length < 2) {
        console.log("Недостаточно данных по поездке:", tripId);
        return;
      }

      trip.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      let latlngs = trip.map(d => [d.latitude, d.longitude]);

      window.simulationLayer = L.layerGroup().addTo(map);

      let marker = L.circleMarker(latlngs[0], { radius: 6, color: "green" }).addTo(window.simulationLayer);
      let polyline = L.polyline([latlngs[0]], { color: "blue", weight: 3 }).addTo(window.simulationLayer);

      let segmentIndex = 0;
      let step = 0;
      let requestId;

      document.querySelectorAll(".skip-btn").forEach(btn => btn.remove());

      let skipBtn = document.createElement("button");
      skipBtn.innerText = "Пропустить";
      skipBtn.classList.add("skip-btn");
      document.querySelector(".atlas-map").appendChild(skipBtn);

      skipBtn.addEventListener("click", finishSimulation);

      function animate() {
        if (segmentIndex >= latlngs.length - 1) {
          finishSimulation();
          return;
        }

        let [lat1, lon1] = latlngs[segmentIndex];
        let [lat2, lon2] = latlngs[segmentIndex + 1];

        let t1 = new Date(trip[segmentIndex].timestamp).getTime();
        let t2 = new Date(trip[segmentIndex + 1].timestamp).getTime();
        let dt = Math.max((t2 - t1) / 1000, 1);

        let dynamicSteps = Math.min(dt * 5, 100);
        let lat = lat1 + (lat2 - lat1) * (step / dynamicSteps);
        let lon = lon1 + (lon2 - lon1) * (step / dynamicSteps);

        marker.setLatLng([lat, lon]);
        polyline.addLatLng([lat, lon]);

        step++;
        if (step > dynamicSteps) {
          step = 0;
          segmentIndex++;
        }

        requestId = requestAnimationFrame(animate);
      }

      function finishSimulation() {
        cancelAnimationFrame(requestId);
        polyline.setLatLngs(latlngs);
        L.circleMarker(latlngs[latlngs.length - 1], { radius: 6, color: "red" }).addTo(window.simulationLayer);
        map.fitBounds(polyline.getBounds());
        skipBtn.remove();
      }

      animate();
      map.fitBounds(L.polyline(latlngs).getBounds());
    });
}


// ================= GLOBAL LAYERS =================
function clearMap() {
  if (window.simulationLayer) {
    map.removeLayer(window.simulationLayer);
    window.simulationLayer = null;
  }
  if (window.hotzonesLayer) {
    map.removeLayer(window.hotzonesLayer);
    window.hotzonesLayer = null;
  }
}


// ================= HOTZONES =================
function showHotzones() {
  clearMap();

  fetch("/hotzones")
    .then(res => res.json())
    .then(data => {
      console.log("🔥 Горячие зоны:", data);

      window.hotzonesLayer = L.heatLayer(
        data.map(p => [p.lat, p.lon, 0.6]),
        {
          radius: 25,
          blur: 15,
          maxZoom: 17,
          gradient: {
            0.2: "blue",
            0.4: "lime",
            0.6: "orange",
            0.8: "red"
          }
        }
      ).addTo(map);

      map.fitBounds(window.hotzonesLayer.getBounds());
    });
}


// ================= TOGGLE VIEW =================
function toggleView(mode) {
  const mapContainer = document.getElementById("mapContainer");
  const chartContainer = document.getElementById("chartContainer");

  if (mode === "map") {
    mapContainer.style.display = "block";
    chartContainer.style.display = "none";
  } else if (mode === "chart") {
    mapContainer.style.display = "none";
    chartContainer.style.display = "block";
  }
}


// ================= CLICK HANDLERS =================
document.querySelectorAll(".capability-card").forEach(card => {
  card.addEventListener("click", () => {
    const title = card.querySelector("h3").innerText;

    // 🚕 Симуляция поездки
    if (title.includes("Симуляция поездки")) {
      fetch("/random_trip_id")
        .then(res => res.json())
        .then(data => animateTrip(data.trip_id.toString()));
    }

    // 🔥 Горячие зоны
    if (title.includes("Горячие зоны")) {
      showHotzones();
    }

    // 📊 Прогноз спроса
    if (title.includes("Прогноз спроса")) {
      document.getElementById("mapContainer").style.display = "none";
      document.getElementById("chartContainer").style.display = "block";

      fetch("/demand_forecast")
        .then(res => res.json())
        .then(data => {
          const oldChart = Chart.getChart("demandChart");
          if (oldChart) oldChart.destroy();

          const ctx = document.getElementById("demandChart").getContext("2d");
          new Chart(ctx, {
            type: "bar",
            data: {
              labels: data.map(d => d.hour + ":00"),
              datasets: [{
                label: "Количество поездок",
                data: data.map(d => d.count),
                backgroundColor: "#B8FF3B"
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { display: false } }
            }
          });
        });
    }
  });
});

// === Кнопка Назад к карте ===
document.getElementById("backToMap").addEventListener("click", () => {
  document.getElementById("mapContainer").style.display = "block";
  document.getElementById("chartContainer").style.display = "none";
});

