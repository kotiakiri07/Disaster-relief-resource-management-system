/* ReliefLink – disaster relief resource coordination
   Data is stored in the browser (localStorage). */

const KEY = "reliefLinkData";
const PRIORITY_WEIGHT = { Critical: 0, High: 1, Medium: 2, Low: 3 };  // lower = served first
const LOW_STOCK = 100;                                                  // warning level

let state = load();

/* ---------- Sample data ---------- */
function seed() {
  return {
    nextId: 20,
    areas: [
      { id: 1, name: "Riverside Colony", type: "Flood", severity: "Severe", people: 1800 },
      { id: 2, name: "Hill View Village", type: "Landslide", severity: "Moderate", people: 650 },
      { id: 3, name: "Coastal Ward 4", type: "Cyclone", severity: "Mild", people: 420 }
    ],
    inventory: [
      { id: 4, name: "Water", qty: 3000, unit: "litres" },
      { id: 5, name: "Food Packets", qty: 1200, unit: "packs" },
      { id: 6, name: "Medicines", qty: 80, unit: "kits" },
      { id: 7, name: "Tents", qty: 150, unit: "units" }
    ],
    requests: [
      { id: 8, areaId: 1, resource: "Water", qty: 2000, allocated: 0, priority: "Critical", delivered: false, notes: "Contact: Ravi 98xxxxxx01", created: Date.now() - 5000 },
      { id: 9, areaId: 1, resource: "Medicines", qty: 120, allocated: 0, priority: "Critical", delivered: false, notes: "Fever, injuries", created: Date.now() - 4000 },
      { id: 10, areaId: 2, resource: "Tents", qty: 60, allocated: 0, priority: "High", delivered: false, notes: "Homes damaged", created: Date.now() - 3000 },
      { id: 11, areaId: 3, resource: "Food Packets", qty: 400, allocated: 0, priority: "Medium", delivered: false, notes: "", created: Date.now() - 2000 }
    ],
    volunteers: [
      { id: 12, name: "Anita Sharma", skill: "Medical", phone: "9800000001", requestId: null },
      { id: 13, name: "Gurpreet Singh", skill: "Logistics", phone: "9800000002", requestId: null },
      { id: 14, name: "Mohan Das", skill: "Rescue", phone: "9800000003", requestId: null }
    ]
  };
}

/* ---------- Saving and loading ---------- */
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.areas) return s;
  } catch (e) {}
  return seed();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

/* ---------- Small helpers ---------- */
const uid = () => state.nextId++;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const areaName = (id) => (state.areas.find((a) => a.id === id) || { name: "(removed)" }).name;

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* A request's status is worked out from how much has been allocated */
function statusOf(r) {
  if (r.delivered) return "Delivered";
  if (r.allocated <= 0) return "Pending";
  if (r.allocated < r.qty) return "Partially Allocated";
  return "Allocated";
}
const statusClass = (s) => "s-" + s.split(" ")[0];

/* ---------- Allocation logic ---------- */
// Take stock from the matching inventory item and give it to one request.
function allocate(req) {
  const need = req.qty - req.allocated;
  if (need <= 0) return 0;
  const item = state.inventory.find((i) => i.name.toLowerCase() === req.resource.toLowerCase());
  if (!item || item.qty <= 0) return 0;
  const give = Math.min(need, item.qty);
  item.qty -= give;
  req.allocated += give;
  return give;
}

// Serve open requests in priority order (Critical first, then oldest first).
function autoAllocate() {
  const open = state.requests
    .filter((r) => !r.delivered && r.allocated < r.qty)
    .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.created - b.created);
  let total = 0;
  open.forEach((r) => (total += allocate(r)));
  save();
  renderAll();
  toast(total > 0 ? "Allocated " + total + " units by priority" : "Nothing could be allocated (check stock)");
}

/* ---------- Drawing each screen ---------- */
function renderDashboard() {
  const open = state.requests.filter((r) => !r.delivered);
  const people = state.areas.reduce((n, a) => n + Number(a.people), 0);
  const freeVol = state.volunteers.filter((v) => !v.requestId).length;
  const cards = [
    ["Affected areas", state.areas.length],
    ["People affected", people.toLocaleString()],
    ["Open requests", open.length],
    ["Critical open", open.filter((r) => r.priority === "Critical").length],
    ["Volunteers available", freeVol + " / " + state.volunteers.length]
  ];
  $("statCards").innerHTML = cards.map((c) => `<div class="card"><div class="num">${c[1]}</div><div class="lbl">${c[0]}</div></div>`).join("");

  const bars = (labels, counts) => {
    const max = Math.max(1, ...counts);
    return labels.map((l, i) => `<div class="bar-row"><span class="name">${l}</span><div class="bar"><span style="width:${(counts[i] / max) * 100}%"></span></div><span class="val">${counts[i]}</span></div>`).join("");
  };
  const pr = ["Critical", "High", "Medium", "Low"];
  $("priorityBars").innerHTML = bars(pr, pr.map((p) => state.requests.filter((r) => r.priority === p).length));
  const st = ["Pending", "Partially Allocated", "Allocated", "Delivered"];
  $("statusBars").innerHTML = bars(st, st.map((s) => state.requests.filter((r) => statusOf(r) === s).length));

  // Available stock: what is left in inventory, and how much open requests still need
  const needOf = (name) => open
    .filter((r) => r.resource.toLowerCase() === name.toLowerCase())
    .reduce((n, r) => n + (r.qty - r.allocated), 0);
  const maxQty = Math.max(1, ...state.inventory.map((i) => i.qty));
  $("stockList").innerHTML = state.inventory.length
    ? state.inventory.map((i) => {
        const need = needOf(i.name);
        return `<div class="stock-row">
          <span>${esc(i.name)}</span>
          <div class="bar"><span class="${i.qty < LOW_STOCK ? "low" : ""}" style="width:${(i.qty / maxQty) * 100}%"></span></div>
          <span class="stock-val">${i.qty.toLocaleString()} ${esc(i.unit)}</span>
          <span class="stock-need">${need ? "open need: " + need.toLocaleString() : "no open need"}</span>
        </div>`;
      }).join("")
    : `<div class="empty">No stock recorded yet. Add resources in Resource Inventory.</div>`;

  const low = state.inventory.filter((i) => i.qty < LOW_STOCK);
  $("alerts").innerHTML = low.length
    ? low.map((i) => `<li>⚠️ <b>${esc(i.name)}</b> is low: ${i.qty} ${esc(i.unit)} left</li>`).join("")
    : `<li class="empty">All resources above the low-stock level.</li>`;

  const urgent = open.slice().sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.created - b.created).slice(0, 5);
  $("urgentList").innerHTML = urgent.length
    ? `<ul class="plain">` + urgent.map((r) => `<li><span class="badge b-${r.priority}">${r.priority}</span> ${esc(r.resource)} × ${r.qty} – ${esc(areaName(r.areaId))}</li>`).join("") + `</ul>`
    : `<div class="empty">No open requests.</div>`;
}

function renderRequests() {
  $("reqArea").innerHTML = state.areas.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join("");
  $("resourceList").innerHTML = state.inventory.map((i) => `<option value="${esc(i.name)}">`).join("");

  const f = $("reqFilter").value;
  const list = state.requests
    .filter((r) => f === "all" || statusOf(r) === f)
    .sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority] || a.created - b.created);

  if (!list.length) { $("reqTable").innerHTML = `<tr><td class="empty">No requests to show.</td></tr>`; return; }
  $("reqTable").innerHTML =
    `<tr><th>Priority</th><th>Area</th><th>Resource</th><th>Fulfilment</th><th>Status</th><th>Notes</th><th>Actions</th></tr>` +
    list.map((r) => {
      const st = statusOf(r);
      const pct = Math.min(100, Math.round((r.allocated / r.qty) * 100));
      const actions =
        (!r.delivered && r.allocated < r.qty ? `<button class="small" data-act="alloc" data-id="${r.id}">Allocate</button>` : "") +
        (!r.delivered && r.allocated >= r.qty ? `<button class="small" data-act="deliver" data-id="${r.id}">Mark delivered</button>` : "") +
        `<button class="small danger" data-act="delReq" data-id="${r.id}">Delete</button>`;
      return `<tr>
        <td><span class="badge b-${r.priority}">${r.priority}</span></td>
        <td>${esc(areaName(r.areaId))}</td>
        <td>${esc(r.resource)}</td>
        <td>${r.allocated} / ${r.qty}<div class="progress"><span style="width:${pct}%"></span></div></td>
        <td><span class="badge ${statusClass(st)}">${st}</span></td>
        <td>${esc(r.notes)}</td>
        <td>${actions}</td></tr>`;
    }).join("");
}

function renderInventory() {
  if (!state.inventory.length) { $("invTable").innerHTML = `<tr><td class="empty">No resources yet.</td></tr>`; return; }
  $("invTable").innerHTML =
    `<tr><th>Resource</th><th>Available</th><th>Unit</th><th>Actions</th></tr>` +
    state.inventory.map((i) => `<tr>
      <td>${esc(i.name)} ${i.qty < LOW_STOCK ? "⚠️" : ""}</td><td>${i.qty}</td><td>${esc(i.unit)}</td>
      <td><button class="small danger" data-act="delInv" data-id="${i.id}">Remove</button></td></tr>`).join("");
}

function renderAreas() {
  if (!state.areas.length) { $("areaTable").innerHTML = `<tr><td class="empty">No areas recorded.</td></tr>`; return; }
  $("areaTable").innerHTML =
    `<tr><th>Area</th><th>Disaster</th><th>Severity</th><th>People affected</th><th>Open requests</th><th>Actions</th></tr>` +
    state.areas.map((a) => `<tr>
      <td>${esc(a.name)}</td><td>${esc(a.type)}</td>
      <td><span class="badge sev-${a.severity}">${a.severity}</span></td>
      <td>${Number(a.people).toLocaleString()}</td>
      <td>${state.requests.filter((r) => r.areaId === a.id && !r.delivered).length}</td>
      <td><button class="small danger" data-act="delArea" data-id="${a.id}">Remove</button></td></tr>`).join("");
}

function renderVolunteers() {
  if (!state.volunteers.length) { $("volTable").innerHTML = `<tr><td class="empty">No volunteers registered.</td></tr>`; return; }
  const open = state.requests.filter((r) => !r.delivered);
  $("volTable").innerHTML =
    `<tr><th>Name</th><th>Skill</th><th>Phone</th><th>Status</th><th>Assign to request</th><th></th></tr>` +
    state.volunteers.map((v) => {
      const st = v.requestId ? "Assigned" : "Available";
      const opts = `<option value="">— unassigned —</option>` +
        open.map((r) => `<option value="${r.id}" ${v.requestId === r.id ? "selected" : ""}>${esc(areaName(r.areaId))}: ${esc(r.resource)} (${r.priority})</option>`).join("");
      return `<tr>
        <td>${esc(v.name)}</td><td>${esc(v.skill)}</td><td>${esc(v.phone)}</td>
        <td><span class="badge s-${st}">${st}</span></td>
        <td><select data-vol="${v.id}">${opts}</select></td>
        <td><button class="small danger" data-act="delVol" data-id="${v.id}">Remove</button></td></tr>`;
    }).join("");
}

function renderAll() {
  renderDashboard(); renderRequests(); renderInventory(); renderAreas(); renderVolunteers();
}

/* ---------- Events: tabs ---------- */
document.querySelectorAll(".tab").forEach((btn) =>
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
    renderAll();
  })
);

/* ---------- Events: forms ---------- */
$("requestForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!state.areas.length) return toast("Add an affected area first");
  state.requests.push({
    id: uid(), areaId: Number($("reqArea").value), resource: $("reqResource").value.trim(),
    qty: Number($("reqQty").value), allocated: 0, priority: $("reqPriority").value,
    delivered: false, notes: $("reqNotes").value.trim(), created: Date.now()
  });
  e.target.reset(); save(); renderAll(); toast("Request added");
});

$("invForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("invName").value.trim(), qty = Number($("invQty").value), unit = $("invUnit").value.trim();
  const existing = state.inventory.find((i) => i.name.toLowerCase() === name.toLowerCase());
  if (existing) { existing.qty += qty; existing.unit = unit; } else state.inventory.push({ id: uid(), name, qty, unit });
  e.target.reset(); save(); renderAll(); toast("Inventory updated");
});

$("areaForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.areas.push({ id: uid(), name: $("areaName").value.trim(), type: $("areaType").value, severity: $("areaSeverity").value, people: Number($("areaPop").value) });
  e.target.reset(); save(); renderAll(); toast("Area recorded");
});

$("volForm").addEventListener("submit", (e) => {
  e.preventDefault();
  state.volunteers.push({ id: uid(), name: $("volName").value.trim(), skill: $("volSkill").value, phone: $("volPhone").value.trim(), requestId: null });
  e.target.reset(); save(); renderAll(); toast("Volunteer registered");
});

/* ---------- Events: filter, auto-allocate, reset ---------- */
$("reqFilter").addEventListener("change", renderRequests);
$("autoAllocate").addEventListener("click", autoAllocate);


/* ---------- Events: buttons inside tables ---------- */
document.body.addEventListener("click", (e) => {
  const b = e.target.closest("button[data-act]");
  if (!b) return;
  const id = Number(b.dataset.id), act = b.dataset.act;
  if (act === "alloc") {
    const r = state.requests.find((x) => x.id === id);
    const given = allocate(r);
    toast(given ? "Allocated " + given + " units" : "No matching stock available");
  } else if (act === "deliver") {
    state.requests.find((x) => x.id === id).delivered = true;
    state.volunteers.forEach((v) => { if (v.requestId === id) v.requestId = null; });
  } else if (act === "delReq") {
    state.requests = state.requests.filter((x) => x.id !== id);
    state.volunteers.forEach((v) => { if (v.requestId === id) v.requestId = null; });
  } else if (act === "delInv") state.inventory = state.inventory.filter((x) => x.id !== id);
  else if (act === "delArea") {
    state.areas = state.areas.filter((x) => x.id !== id);
    state.requests = state.requests.filter((x) => x.areaId !== id);
  } else if (act === "delVol") state.volunteers = state.volunteers.filter((x) => x.id !== id);
  save(); renderAll();
});

/* ---------- Events: volunteer assignment dropdown ---------- */
document.body.addEventListener("change", (e) => {
  const sel = e.target.closest("select[data-vol]");
  if (!sel) return;
  const v = state.volunteers.find((x) => x.id === Number(sel.dataset.vol));
  v.requestId = sel.value ? Number(sel.value) : null;
  save(); renderAll(); toast(v.requestId ? "Volunteer assigned" : "Volunteer unassigned");
});

renderAll();