const toastEl = document.getElementById("toast");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");
const noteBox = document.getElementById("noteBox");

const kpiTotalTrips = document.getElementById("kpiTotalTrips");
const kpiPeakHour = document.getElementById("kpiPeakHour");
const kpiAvgPerHour = document.getElementById("kpiAvgPerHour");

const badgeTrips = document.getElementById("badgeTrips");
const badgePeak = document.getElementById("badgePeak");
const badgeAvg = document.getElementById("badgeAvg");

const btnRefresh = document.getElementById("btnRefresh");
const btnCopy = document.getElementById("btnCopy");

let chart = null;
let lastJson = null;

function setStatus(type, text){
  // type: idle | ok | loading | error
  const map = {
    idle: "#999",
    ok: "#3bb54a",
    loading: "#e0a800",
    error: "#d9534f",
  };
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

function fmtInt(n){
  if (typeof n !== "number") return "—";
  return n.toLocaleString("ru-RU");
}

function computeKpis(rows){
  const total = rows.reduce((acc, r)=> acc + (r.count || 0), 0);
  const avg = rows.length ? total / rows.length : 0;

  let peak = { hour: null, count: -1 };
  for (const r of rows){
    if ((r.count ?? -1) > peak.count) peak = { hour: r.hour, count: r.count };
  }
  return { total, avg, peakHour: peak.hour, peakCount: peak.count };
}

function renderTableTop(rows){
  const tbody = document.querySelector("#topTable tbody");
  tbody.innerHTML = "";

  const top = [...rows].sort((a,b)=>(b.count||0)-(a.count||0)).slice(0,8);
  for (const r of top){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${String(r.hour).padStart(2,"0")}:00</td>
      <td class="right">${fmtInt(r.count || 0)}</td>
    `;
    tbody.appendChild(tr);
  }
  if (!top.length){
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="2" class="muted">No data</td>`;
    tbody.appendChild(tr);
  }
}

function renderChart(rows){
  const labels = rows.map(r => String(r.hour).padStart(2,"0"));
  const values = rows.map(r => r.count || 0);

  const ctx = document.getElementById("demandChart").getContext("2d");

  if (chart) chart.destroy();

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Trips",
        data: values,
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
        fill: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false }
      },
      scales: {
        x: { title: { display: true, text: "Hour" } },
        y: { title: { display: true, text: "Trips" }, beginAtZero: true }
      }
    }
  });
}

async function loadDemand(){
  hideNote();
  setStatus("loading", "Loading…");

  try{
    const res = await fetch("/api/demand-forecast");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();

    lastJson = rows;

    // normalize sort by hour
    rows.sort((a,b)=>(a.hour ?? 0) - (b.hour ?? 0));

    const kpis = computeKpis(rows);

    kpiTotalTrips.textContent = fmtInt(kpis.total);
    kpiPeakHour.textContent = (kpis.peakHour === null ? "—" : String(kpis.peakHour).padStart(2,"0") + ":00");
    kpiAvgPerHour.textContent = (rows.length ? kpis.avg.toFixed(1) : "—");

    badgeTrips.textContent = "OK";
    badgePeak.textContent = (kpis.peakCount >= 0 ? `${fmtInt(kpis.peakCount)} trips` : "—");
    badgeAvg.textContent = (rows.length ? `${rows.length} hours` : "—");

    renderChart(rows);
    renderTableTop(rows);

    setStatus("ok", "Up to date");
  }catch(e){
    console.error(e);
    setStatus("error", "Error");
    showNote("Не удалось загрузить данные. Проверь /api/demand-forecast и доступность CSV.");
    showToast("API error");
  }
}

btnRefresh.addEventListener("click", () => {
  loadDemand();
  showToast("Refreshing…");
});

btnCopy.addEventListener("click", async () => {
  try{
    const text = JSON.stringify(lastJson ?? {}, null, 2);
    await navigator.clipboard.writeText(text);
    showToast("Copied");
  }catch{
    showToast("Copy failed");
  }
});

loadDemand();
