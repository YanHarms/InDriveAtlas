const toastEl = document.getElementById("toast");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const noteBox = document.getElementById("noteBox");

const segBtns = document.querySelectorAll(".seg-btn");
const tripField = document.getElementById("tripField");
const hotzonesField = document.getElementById("hotzonesField");
const simulateField = document.getElementById("simulateField");

const btnLoadHotzones = document.getElementById("btnLoadHotzones");
const btnClear = document.getElementById("btnClear");
const btnHeat = document.getElementById("btnHeat");
const btnPoints = document.getElementById("btnPoints");
const btnFit = document.getElementById("btnFit");

const btnRandomId = document.getElementById("btnRandomId");
const btnLoadTrip = document.getElementById("btnLoadTrip");
const tripIdInput = document.getElementById("tripId");

const btnSimulate = document.getElementById("btnSimulate");

let currentMode = "hotzones";
let layerMode = "points"; // points | heat

function setStatus(type, text){
  const map = { idle:"#999", ok:"#3bb54a", loading:"#e0a800", error:"#d9534f" };
  statusDot.style.background = map[type] || "#999";
  statusText.textContent = text || "Idle";
}

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=>toastEl.classList.remove("show"), 2200);
}

function showNote(msg){
  noteBox.style.display = "block";
  noteBox.textContent = msg;
}
function hideNote(){
  noteBox.style.display = "none";
  noteBox.textContent = "";
}

function setMode(mode){
  currentMode = mode;
  segBtns.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  tripField.style.display = (mode === "trip") ? "block" : "none";
  hotzonesField.style.display = (mode === "hotzones") ? "block" : "none";
  simulateField.style.display = (mode === "simulate") ? "block" : "none";
  hideNote();
}

function setLayerMode(m){
  layerMode = m;
  btnPoints.classList.toggle("btn-primary", m === "points");
  btnHeat.classList.toggle("btn-primary", m === "heat");
}

segBtns.forEach(btn => btn.addEventListener("click", () => setMode(btn.dataset.mode)));
btnPoints.addEventListener("click", () => setLayerMode("points"));
btnHeat.addEventListener("click", () => setLayerMode("heat"));

/* Map init */
const map = L.map("map", { zoomControl: true }).setView([43.2389, 76.8897], 11); // Алматы по умолчанию
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let pointsLayer = L.layerGroup().addTo(map);
let heatLayer = null;

function clearLayers(){
  pointsLayer.clearLayers();
  if (heatLayer){
    map.removeLayer(heatLayer);
    heatLayer = null;
  }
}

function fitToBounds(){
  const layers = [];
  pointsLayer.eachLayer(l => layers.push(l));
  if (!layers.length) return;
  const group = new L.featureGroup(layers);
  map.fitBounds(group.getBounds().pad(0.2));
}

btnFit.addEventListener("click", fitToBounds);
btnClear.addEventListener("click", () => {
  clearLayers();
  setStatus("idle", "Cleared");
  showToast("Cleared");
});

function toHeatPoints(list){
  // leaflet-heat expects [lat, lng, intensity?]
  return list
    .filter(p => typeof p.lat === "number" && typeof p.lon === "number")
    .map(p => [p.lat, p.lon, 0.6]);
}

function addPoints(list){
  for (const p of list){
    if (typeof p.lat !== "number" || typeof p.lon !== "number") continue;
    L.circleMarker([p.lat, p.lon], {
      radius: 4,
      weight: 1,
      opacity: 0.9,
      fillOpacity: 0.35
    }).addTo(pointsLayer);
  }
}

function renderList(list){
  clearLayers();

  if (!list.length){
    showNote("No data for this request.");
    return;
  }

  if (layerMode === "heat"){
    heatLayer = L.heatLayer(toHeatPoints(list), { radius: 22, blur: 18, maxZoom: 16 });
    heatLayer.addTo(map);
  } else {
    addPoints(list);
  }

  fitToBounds();
}

async function loadHotzones(){
  hideNote();
  setStatus("loading", "Loading hotzones…");
  try{
    const res = await fetch("/api/hotzones");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const list = await res.json();
    renderList(list);
    setStatus("ok", `Hotzones: ${list.length}`);
    showToast("Hotzones loaded");
  }catch(e){
    console.error(e);
    setStatus("error", "Error");
    showNote("Не удалось загрузить hotzones. Проверь /api/hotzones и доступность CSV.");
    showToast("API error");
  }
}

btnLoadHotzones.addEventListener("click", loadHotzones);

async function getRandomTripId(){
  setStatus("loading", "Fetching random ID…");
  try{
    const res = await fetch("/api/random-trip-id");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.trip_id){
      tripIdInput.value = data.trip_id;
      setStatus("ok", "Random ID ready");
      showToast("Random ID");
    } else {
      throw new Error("No trip_id");
    }
  }catch(e){
    console.error(e);
    setStatus("error", "Error");
    showToast("API error");
  }
}

btnRandomId.addEventListener("click", getRandomTripId);

async function loadTripById(){
  const id = (tripIdInput.value || "").trim();
  if (!id){
    showToast("Enter trip id");
    return;
  }
  hideNote();
  setStatus("loading", `Loading trip ${id}…`);
  try{
    const res = await fetch(`/api/trips/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();

    // your API returns [{latitude, longitude, timestamp}, ...]
    const list = rows
      .filter(r => typeof r.latitude === "number" && typeof r.longitude === "number")
      .map(r => ({ lat: r.latitude, lon: r.longitude }));

    renderList(list);
    setStatus("ok", `Trip points: ${list.length}`);
    showToast("Trip loaded");
  }catch(e){
    console.error(e);
    setStatus("error", "Error");
    showNote("Trip ID не найден или ошибка API.");
    showToast("API error");
  }
}

btnLoadTrip.addEventListener("click", loadTripById);

async function simulateTrip(){
  hideNote();
  setStatus("loading", "Simulating…");
  try{
    const res = await fetch("/api/simulate-trip");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const obj = await res.json();

    // If your simulated object has latitude/longitude -> show single point
    const lat = obj.latitude;
    const lon = obj.longitude;

    if (typeof lat === "number" && typeof lon === "number"){
      renderList([{lat, lon}]);
      setStatus("ok", "Simulated 1 point");
      showToast("Simulated");
    } else {
      showNote("Simulate-trip вернул объект без latitude/longitude. Можно расширить датасет или логику симуляции.");
      setStatus("ok", "Simulated");
    }
  }catch(e){
    console.error(e);
    setStatus("error", "Error");
    showToast("API error");
  }
}

btnSimulate.addEventListener("click", simulateTrip);

function getQueryParam(name){
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

async function autoLoadFromQuery(){
  const tripId = getQueryParam("trip_id");
  if (tripId){
    setMode("trip");
    tripIdInput.value = tripId;
    await loadTripById();
    return;
  }
  // default
  setMode("hotzones");
  setLayerMode("points");
  loadHotzones();
}

autoLoadFromQuery();

