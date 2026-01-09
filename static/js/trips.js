const tableBody = document.querySelector("#tripsTable tbody");
const metaText = document.getElementById("metaText");

const btnPrev = document.getElementById("btnPrev");
const btnNext = document.getElementById("btnNext");
const btnExport = document.getElementById("btnExport");
const btnRefresh = document.getElementById("btnRefresh");

const qInput = document.getElementById("q");
const limitSelect = document.getElementById("limit");

const toastEl = document.getElementById("toast");

let offset = 0;
let lastData = null;

function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  setTimeout(()=>toastEl.classList.remove("show"), 2200);
}

function esc(s){
  return String(s ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function renderRows(items){
  tableBody.innerHTML = "";
  if (!items || !items.length){
    tableBody.innerHTML = `<tr><td colspan="4" class="muted">No data</td></tr>`;
    return;
  }

  for (const it of items){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
            <a class="trip-link" href="/map?trip_id=${encodeURIComponent(it.randomized_id)}">
        <code>${esc(it.randomized_id)}</code>
        </a>
      </td>

      <td>${esc(it.timestamp)}</td>
      <td class="right">${(it.latitude ?? "—")}</td>
      <td class="right">${(it.longitude ?? "—")}</td>
    `;
    tableBody.appendChild(tr);
  }
}

function toCSV(items){
  const headers = ["randomized_id","timestamp","latitude","longitude"];
  const lines = [headers.join(",")];
  for (const it of (items || [])){
    const row = headers.map(h => {
      const v = it[h];
      const s = (v === null || v === undefined) ? "" : String(v);
      // basic CSV escaping
      if (s.includes('"') || s.includes(",") || s.includes("\n")){
        return `"${s.replaceAll('"','""')}"`;
      }
      return s;
    }).join(",");
    lines.push(row);
  }
  return lines.join("\n");
}

function download(filename, text){
  const blob = new Blob([text], {type: "text/csv;charset=utf-8"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function load(){
  tableBody.innerHTML = `<tr><td colspan="4" class="muted">Loading…</td></tr>`;
  const limit = Number(limitSelect.value || 50);
  const q = (qInput.value || "").trim();

  try{
    const res = await fetch(`/api/trips?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    lastData = data;

    // optional client-side filter by trip id
    let items = data.items || [];
    if (q){
      const qLower = q.toLowerCase();
      items = items.filter(x => String(x.randomized_id || "").toLowerCase().includes(qLower));
    }

    renderRows(items);

    const shown = items.length;
    metaText.textContent = `Total: ${data.total} • Offset: ${data.offset} • Limit: ${data.limit} • Shown: ${shown}`;

    btnPrev.disabled = offset <= 0;
    btnNext.disabled = (offset + limit) >= (data.total || 0);

  }catch(e){
    console.error(e);
    tableBody.innerHTML = `<tr><td colspan="4" class="muted">Error loading /api/trips</td></tr>`;
    metaText.textContent = "API error";
    showToast("API error");
  }
}

btnPrev.addEventListener("click", () => {
  const limit = Number(limitSelect.value || 50);
  offset = Math.max(0, offset - limit);
  load();
});

btnNext.addEventListener("click", () => {
  const limit = Number(limitSelect.value || 50);
  offset = offset + limit;
  load();
});

btnRefresh.addEventListener("click", () => load());
limitSelect.addEventListener("change", () => { offset = 0; load(); });
qInput.addEventListener("input", () => { offset = 0; load(); });

btnExport.addEventListener("click", () => {
  const items = (lastData && lastData.items) ? lastData.items : [];
  const csv = toCSV(items);
  download(`indriveatlas_trips_offset_${offset}.csv`, csv);
  showToast("CSV exported");
});

load();
