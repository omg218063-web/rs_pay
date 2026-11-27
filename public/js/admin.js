(function () {
  "use strict";
  const { api, esc, toast, taka, dt, badge, sheet, btnBusy, setSite } = RS;
  const $ = (id) => document.getElementById(id);
  const view = $("aView");
  const A = { site: null, mode: "demo", counts: {} };

  const NAV = [
    ["dashboard", "📊", "ড্যাশবোর্ড"], ["orders", "📋", "অর্ডার"], ["deposits", "⬇️", "ডিপোজিট"], ["users", "👥", "ইউজার"],
    ["packages", "📦", "প্যাকেজ"], ["services", "🧾", "বিল সার্ভিস"], ["banners", "🖼️", "ব্যানার"], ["settings", "🎨", "সাইট সেটিংস"]
  ];
  const TYPE = { internet: "ডাটা", minute: "মিনিট", combo: "কমবো", freefire: "ফ্রি ফায়ার" };
  const OTYPE = { recharge: "রিচার্জ", package: "প্যাকেজ", freefire: "ডায়মন্ড", bill: "বিল" };
  const skeleton = (n = 4) => '<div class="skeleton" style="margin-bottom:10px"></div>'.repeat(n);
  const empty = (t) => `<div class="empty"><div class="big">📭</div>${esc(t)}</div>`;
  const errBox = (e) => `<div class="empty"><div class="big">⚠️</div>${esc(e.message)}</div>`;

  // ================= auth =================
  async function boot() {
    try {
      const me = await api("/api/admin/me");
      A.mode = me.providerMode;
      await start();
    } catch (e) {
      $("loginBox").hidden = false;
    }
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"), err = $("lerr");
    err.hidden = true; btnBusy(btn, true);
    try { await api("/api/admin/login", { method: "POST", body: { password: $("pw").value } }); location.reload(); }
    catch (x) { err.textContent = x.message; err.hidden = false; btnBusy(btn, false); }
  });

  async function start() {
    $("loginBox").hidden = true;
    $("appBox").hidden = false;
    api("/api/bootstrap").then((d) => setSite(d.site)).catch(() => {});
    $("aNav").innerHTML = NAV.map(([k, i, l]) => `<a href="#/${k}" data-k="${k}"><i>${i}</i>${l}<em hidden data-badge="${k}"></em></a>`).join("");
    $("aLogout").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST", body: {} }).catch(() => {}); location.reload(); });
    $("aMenu").addEventListener("click", () => toggleMenu());
    $("aScrim").addEventListener("click", () => toggleMenu(false));
    $("aNav").addEventListener("click", () => toggleMenu(false));
    window.addEventListener("hashchange", route);
    refreshBadges();
    setInterval(refreshBadges, 45000);
    route();
  }

  function toggleMenu(force) {
    const open = force === undefined ? !$("aSide").classList.contains("open") : force;
    $("aSide").classList.toggle("open", open);
    $("aScrim").hidden = !open;
  }

  async function refreshBadges() {
    try {
      const s = await api("/api/admin/stats");
      A.mode = s.providerMode;
      setBadge("orders", s.processing); setBadge("deposits", s.pendingDeposits);
      $("modeBadge").innerHTML = A.mode === "live" ? '<span class="badge ok">LIVE</span>' : '<span class="badge warn">DEMO মোড</span>';
    } catch (_) {}
  }
  function setBadge(k, n) { const el = document.querySelector(`[data-badge="${k}"]`); if (el) { el.hidden = !n; el.textContent = n; } }

  // ================= router =================
  const pages = { dashboard, orders, deposits, users, packages, services, banners, settings };
  async function route() {
    const k = (location.hash.replace(/^#\/?/, "") || "dashboard").split("?")[0];
    const key = pages[k] ? k : "dashboard";
    document.querySelectorAll("#aNav a").forEach((a) => a.classList.toggle("on", a.dataset.k === key));
    $("aTitle").textContent = NAV.find((n) => n[0] === key)[2];
    view.innerHTML = skeleton(4);
    window.scrollTo(0, 0);
    try { await pages[key](); } catch (e) {
      if (e.status === 401) return location.reload();
      view.innerHTML = errBox(e);
    }
  }

  // ================= generic helpers =================
  function confirmSheet(title, text, label, onYes, danger) {
    sheet(`<h3>${esc(title)}</h3><p class="muted" style="margin-bottom:16px">${esc(text)}</p>
      <div class="field"><label>নোট (ঐচ্ছিক)</label><input id="cNote" maxlength="120"></div>
      <div class="row2"><button class="btn btn-ghost" data-no>বাতিল</button><button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-yes>${esc(label)}</button></div>`,
      (el, close) => {
        el.querySelector("[data-no]").addEventListener("click", close);
        const y = el.querySelector("[data-yes]");
        y.addEventListener("click", async () => {
          btnBusy(y, true);
          try { await onYes(el.querySelector("#cNote").value); close(); } catch (e) { btnBusy(y, false); toast(e.message, "err"); }
        });
      });
  }

  function fieldHtml(f, v) {
    const val = v === undefined || v === null ? "" : v;
    const cls = f.full ? "field full" : "field";
    if (f.type === "check") return `<div class="${cls}"><label class="check"><input type="checkbox" data-k="${f.k}" ${val ? "checked" : ""}>${esc(f.label)}</label></div>`;
    if (f.type === "select") return `<div class="${cls}"><label>${esc(f.label)}</label><select data-k="${f.k}">${f.options.map(([o, l]) => `<option value="${esc(o)}" ${String(val) === String(o) ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
    if (f.type === "image") return `<div class="${cls}"><label>${esc(f.label)}</label><div class="upl"><div class="pv" data-pv="${f.k}">${val ? `<img src="/api/media/${esc(val)}" alt="">` : "নেই"}</div><input type="file" accept="image/png,image/jpeg,image/webp" data-up="${f.k}"><button type="button" class="btn btn-ghost btn-sm" data-clr="${f.k}">মুছুন</button><input type="hidden" data-k="${f.k}" value="${esc(val)}"></div><span class="hint">PNG/JPG/WEBP, সর্বোচ্চ ১.৫ MB</span></div>`;
    return `<div class="${cls}"><label>${esc(f.label)}</label><input data-k="${f.k}" type="${f.type || "text"}" value="${esc(val)}" ${f.step ? `step="${f.step}"` : ""} ${f.ph ? `placeholder="${esc(f.ph)}"` : ""}>${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ""}</div>`;
  }

  function readFields(root, fields) {
    const out = {};
    fields.forEach((f) => {
      const el = root.querySelector(`[data-k="${f.k}"]`);
      out[f.k] = f.type === "check" ? el.checked : el.value;
    });
    return out;
  }

  function bindUploads(root) {
    root.querySelectorAll("[data-up]").forEach((inp) => inp.addEventListener("change", () => {
      const f = inp.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = async () => {
        try {
          const r = await api("/api/admin/media", { method: "POST", body: { dataUrl: rd.result } });
          root.querySelector(`[data-k="${inp.dataset.up}"]`).value = r.id;
          root.querySelector(`[data-pv="${inp.dataset.up}"]`).innerHTML = `<img src="${r.url}" alt="">`;
          toast("আপলোড হয়েছে", "ok");
        } catch (e) { toast(e.message, "err"); }
      };
      rd.readAsDataURL(f);
    }));
    root.querySelectorAll("[data-clr]").forEach((b) => b.addEventListener("click", () => {
      root.querySelector(`[data-k="${b.dataset.clr}"]`).value = "";
      root.querySelector(`[data-pv="${b.dataset.clr}"]`).textContent = "নেই";
    }));
  }

  function formSheet(title, fields, values, onSave) {
    sheet(`<h3>${esc(title)}</h3><div class="form-grid">${fields.map((f) => fieldHtml(f, values[f.k])).join("")}</div>
      <button class="btn btn-primary btn-block" id="fSave" style="margin-top:6px">সেভ করুন</button>`, (el, close) => {
      bindUploads(el);
      const b = el.querySelector("#fSave");
      b.addEventListener("click", async () => {
        btnBusy(b, true);
        try { await onSave(readFields(el, fields)); close(); } catch (e) { btnBusy(b, false); toast(e.message, "err"); }
      });
    });
  }

  // ================= dashboard =================
  async function dashboard() {
    const s = await api("/api/admin/stats");
    A.mode = s.providerMode;
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000 + 6 * 3600000);
      const key = d.toISOString().slice(0, 10);
      const f = s.daily.find((x) => x._id === key);
      days.push({ key, label: key.slice(8) + "/" + key.slice(5, 7), total: f ? f.total : 0 });
    }
    const max = Math.max(1, ...days.map((d) => d.total));
    const sumByType = s.byType.reduce((a, b) => a + b.total, 0) || 1;
    view.innerHTML = `
      <div class="mode-warn ${A.mode === "live" ? "mode-live" : ""}">${A.mode === "live"
        ? "✅ <b>LIVE মোড</b> — অর্ডার সরাসরি আপনার প্রোভাইডার API-তে যাচ্ছে।"
        : "⚠️ <b>DEMO মোড</b> — এখন আসল রিচার্জ/টপআপ হচ্ছে না, অর্ডার নকলভাবে সফল হচ্ছে। Render-এ <code>PROVIDER_MODE=live</code> দিলে চালু হবে।"}</div>
      <div class="stat-grid">
        <div class="card sc"><i>👥</i><small>মোট ইউজার</small><b>${s.users}</b></div>
        <div class="card sc"><i>💰</i><small>ইউজারদের মোট ব্যালেন্স</small><b>${taka(s.walletTotal)}</b></div>
        <div class="card sc"><i>🛒</i><small>আজকের অর্ডার</small><b>${s.ordersToday}</b></div>
        <div class="card sc"><i>📈</i><small>আজকের সফল বিক্রি</small><b>${taka(s.revenueToday)}</b></div>
        <a href="#/orders?processing" class="card sc"><i>⏳</i><small>প্রসেসিং অর্ডার</small><b>${s.processing}</b></a>
        <a href="#/deposits" class="card sc"><i>⬇️</i><small>পেন্ডিং ডিপোজিট</small><b>${s.pendingDeposits}</b></a>
        <div class="card sc"><i>❌</i><small>আজকের ব্যর্থ</small><b>${s.failedToday}</b></div>
      </div>
      <div class="two">
        <div class="card"><h3 style="margin-bottom:4px">গত ৭ দিনের বিক্রি</h3><small class="muted">সফল অর্ডারের মোট</small>
          <div class="bars">${days.map((d) => `<div class="bar"><b>${d.total ? taka(d.total) : ""}</b><div style="height:${Math.max(3, Math.round((d.total / max) * 110))}px"></div>${d.label}</div>`).join("")}</div></div>
        <div class="card"><h3 style="margin-bottom:14px">সার্ভিস অনুযায়ী</h3><div class="split">${s.byType.length ? s.byType.map((t) => `
          <div class="r"><div><span>${OTYPE[t._id] || t._id} (${t.count})</span><b>${taka(t.total)}</b></div><div class="meter"><i style="width:${(t.total / sumByType) * 100}%"></i></div></div>`).join("") : '<p class="muted">এখনো কোনো সফল অর্ডার নেই</p>'}</div></div>
      </div>
      <h3 style="margin:22px 0 12px">সাম্প্রতিক অর্ডার</h3>
      ${s.recent.length ? orderTable(s.recent, false) : empty("এখনো কোনো অর্ডার নেই")}`;
  }

  // ================= orders =================
  function orderTable(items, actions) {
    return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>অর্ডার</th><th>ইউজার</th><th>সার্ভিস</th><th>টার্গেট</th><th>মোট</th><th>স্ট্যাটাস</th>${actions ? "<th></th>" : ""}</tr></thead><tbody>
      ${items.map((o) => `<tr>
        <td><b>${esc(o.orderNo)}</b><small>${dt(o.createdAt)}</small></td>
        <td>${o.user ? esc(o.user.name) + `<small>${esc(o.user.phone)}</small>` : "—"}</td>
        <td>${esc(o.title)}<small>${OTYPE[o.type]}${o.operator ? " · " + esc(o.operator.toUpperCase()) : ""}</small></td>
        <td>${esc(o.target)}</td>
        <td><b>${taka(o.total)}</b></td>
        <td>${badge(o.status)}${o.note ? `<small>${esc(o.note)}</small>` : ""}${o.providerRef ? `<small>Ref: ${esc(o.providerRef)}</small>` : ""}</td>
        ${actions ? `<td><div class="acts">${o.status === "processing" ? `<button class="btn btn-ok btn-sm" data-o="${o._id}" data-a="success">✓ সফল</button><button class="btn btn-danger btn-sm" data-o="${o._id}" data-a="fail">✗ ফেল + রিফান্ড</button>` : o.status === "success" ? `<button class="btn btn-ghost btn-sm" data-o="${o._id}" data-a="refund">রিফান্ড</button>` : ""}</div></td>` : ""}
      </tr>`).join("")}</tbody></table></div>`;
  }

  async function orders() {
    const st = { status: location.hash.includes("processing") ? "processing" : "", type: "", q: "", page: 1 };
    view.innerHTML = `
      <div class="toolbar">
        <div class="grow"><input id="oq" placeholder="অর্ডার নং বা নম্বর খুঁজুন…"></div>
        <select id="os" style="width:auto"><option value="">সব স্ট্যাটাস</option><option value="processing">প্রসেসিং</option><option value="success">সফল</option><option value="failed">ব্যর্থ</option><option value="refunded">ফেরত</option></select>
        <select id="ot" style="width:auto"><option value="">সব ধরন</option>${Object.entries(OTYPE).map(([k, l]) => `<option value="${k}">${l}</option>`).join("")}</select>
      </div><div id="ob">${skeleton(5)}</div>`;
    $("os").value = st.status;
    const load = async () => {
      const p = new URLSearchParams({ page: st.page, status: st.status, type: st.type, q: st.q });
      const r = await api("/api/admin/orders?" + p);
      $("ob").innerHTML = (r.items.length ? orderTable(r.items, true) : empty("কোনো অর্ডার নেই")) + pager(r);
      bindPager($("ob"), st, load);
      $("ob").querySelectorAll("[data-o]").forEach((b) => b.addEventListener("click", () => {
        const a = b.dataset.a, id = b.dataset.o;
        const txt = { success: ["অর্ডার সফল করবেন?", "প্রোভাইডার থেকে ডেলিভারি নিশ্চিত হলে এটি করুন।", "সফল করুন", false], fail: ["অর্ডার ব্যর্থ করে রিফান্ড দেবেন?", "ইউজারের ওয়ালেটে টাকা ফেরত যাবে।", "রিফান্ড দিন", true], refund: ["সফল অর্ডার রিফান্ড করবেন?", "ইউজারের ওয়ালেটে টাকা ফেরত যাবে।", "রিফান্ড দিন", true] }[a];
        confirmSheet(txt[0], txt[1], txt[2], async (note) => { await api("/api/admin/orders/" + id, { method: "PATCH", body: { action: a, note } }); toast("আপডেট হয়েছে", "ok"); load(); refreshBadges(); }, txt[3]);
      }));
    };
    let t; $("oq").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { st.q = $("oq").value; st.page = 1; load().catch((e) => toast(e.message, "err")); }, 350); });
    $("os").addEventListener("change", () => { st.status = $("os").value; st.page = 1; load(); });
    $("ot").addEventListener("change", () => { st.type = $("ot").value; st.page = 1; load(); });
    await load();
  }

  const pager = (r) => r.pages > 1 ? `<div class="pager"><button class="btn btn-ghost btn-sm" data-pg="-1" ${r.page <= 1 ? "disabled" : ""}>← আগে</button><span>${r.page} / ${r.pages}</span><button class="btn btn-ghost btn-sm" data-pg="1" ${r.page >= r.pages ? "disabled" : ""}>পরে →</button></div>` : "";
  function bindPager(root, st, load) {
    root.querySelectorAll("[data-pg]").forEach((b) => b.addEventListener("click", () => { st.page += +b.dataset.pg; load().catch((e) => toast(e.message, "err")); }));
  }

  // ================= deposits =================
  async function deposits() {
    let status = "pending";
    view.innerHTML = `<div class="toolbar">${[["pending", "পেন্ডিং"], ["approved", "অনুমোদিত"], ["rejected", "বাতিল"], ["", "সব"]].map(([k, l]) => `<button class="chip ${k === status ? "on" : ""}" data-s="${k}">${l}</button>`).join("")}</div><div id="db">${skeleton(4)}</div>`;
    const load = async () => {
      const { items } = await api("/api/admin/deposits?status=" + status);
      $("db").innerHTML = items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ইউজার</th><th>মাধ্যম</th><th>Trx ID</th><th>প্রেরক</th><th>পরিমাণ</th><th>স্ট্যাটাস</th><th></th></tr></thead><tbody>
        ${items.map((d) => `<tr><td>${d.user ? esc(d.user.name) + `<small>${esc(d.user.phone)}</small>` : "—"}</td><td>${esc(d.method)}<small>${dt(d.createdAt)}</small></td><td><b>${esc(d.trxId)}</b></td><td>${esc(d.sender)}</td><td><b>${taka(d.amount)}</b></td><td>${badge(d.status)}${d.note ? `<small>${esc(d.note)}</small>` : ""}</td>
        <td>${d.status === "pending" ? `<div class="acts"><button class="btn btn-ok btn-sm" data-d="${d._id}" data-a="approve">অনুমোদন</button><button class="btn btn-danger btn-sm" data-d="${d._id}" data-a="reject">বাতিল</button></div>` : ""}</td></tr>`).join("")}</tbody></table></div>` : empty("কোনো রিকোয়েস্ট নেই");
      $("db").querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
        const approve = b.dataset.a === "approve", d = items.find((x) => x._id === b.dataset.d);
        confirmSheet(approve ? `${taka(d.amount)} অনুমোদন করবেন?` : "রিকোয়েস্ট বাতিল করবেন?",
          approve ? `Trx ID ${d.trxId} মার্চেন্ট অ্যাপে মিলিয়ে দেখে নিন। অনুমোদন করলে ইউজারের ওয়ালেটে টাকা যোগ হবে।` : "ইউজারকে নোটসহ জানানো হবে।",
          approve ? "অনুমোদন করুন" : "বাতিল করুন",
          async (note) => { await api("/api/admin/deposits/" + b.dataset.d, { method: "PATCH", body: { action: b.dataset.a, note } }); toast("আপডেট হয়েছে", "ok"); load(); refreshBadges(); }, !approve);
      }));
    };
    view.querySelector(".toolbar").addEventListener("click", (e) => { const b = e.target.closest("[data-s]"); if (!b) return; status = b.dataset.s; view.querySelectorAll("[data-s]").forEach((x) => x.classList.toggle("on", x === b)); load(); });
    await load();
  }

  // ================= users =================
  async function users() {
    const st = { q: "", page: 1 };
    view.innerHTML = `<div class="toolbar"><div class="grow"><input id="uq" placeholder="নাম বা মোবাইল দিয়ে খুঁজুন…"></div></div><div id="ub">${skeleton(5)}</div>`;
    const load = async () => {
      const r = await api(`/api/admin/users?page=${st.page}&q=${encodeURIComponent(st.q)}`);
      $("ub").innerHTML = (r.items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ইউজার</th><th>ব্যালেন্স</th><th>স্ট্যাটাস</th><th>জয়েন</th><th></th></tr></thead><tbody>
        ${r.items.map((u) => `<tr><td><b>${esc(u.name)}</b><small>${esc(u.phone)}</small></td><td><b>${taka(u.balance || 0)}</b></td><td>${u.status === "blocked" ? '<span class="badge bad">ব্লক</span>' : '<span class="badge ok">সক্রিয়</span>'}</td><td>${dt(u.createdAt)}</td>
        <td><div class="acts"><button class="btn btn-ghost btn-sm" data-adj="${u._id}">ব্যালেন্স</button><button class="btn ${u.status === "blocked" ? "btn-ok" : "btn-danger"} btn-sm" data-blk="${u._id}" data-to="${u.status === "blocked" ? "active" : "blocked"}">${u.status === "blocked" ? "আনব্লক" : "ব্লক"}</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("কোনো ইউজার নেই")) + pager(r) + `<p class="muted small" style="margin-top:10px">মোট ${r.total} জন</p>`;
      bindPager($("ub"), st, load);
      $("ub").querySelectorAll("[data-blk]").forEach((b) => b.addEventListener("click", async () => {
        try { await api("/api/admin/users/" + b.dataset.blk, { method: "PATCH", body: { status: b.dataset.to } }); toast("আপডেট হয়েছে", "ok"); load(); } catch (e) { toast(e.message, "err"); }
      }));
      $("ub").querySelectorAll("[data-adj]").forEach((b) => b.addEventListener("click", () => {
        const u = r.items.find((x) => x._id === b.dataset.adj);
        sheet(`<h3>${esc(u.name)} — ব্যালেন্স অ্যাডজাস্ট</h3><p class="muted small" style="margin-bottom:12px">বর্তমান: ${taka(u.balance || 0)}. যোগ করতে ধনাত্মক, কাটতে ঋণাত্মক সংখ্যা (যেমন -100) দিন।</p>
          <div class="field"><label>পরিমাণ (৳)</label><input id="aA" type="number" step="1"></div><div class="field"><label>কারণ</label><input id="aN" maxlength="120"></div><button class="btn btn-primary btn-block" id="aGo">নিশ্চিত করুন</button>`, (el, close) => {
          const go = el.querySelector("#aGo");
          go.addEventListener("click", async () => {
            btnBusy(go, true);
            try { await api(`/api/admin/users/${u._id}/adjust`, { method: "POST", body: { amount: el.querySelector("#aA").value, note: el.querySelector("#aN").value } }); close(); toast("ব্যালেন্স আপডেট হয়েছে", "ok"); load(); }
            catch (e) { btnBusy(go, false); toast(e.message, "err"); }
          });
        });
      }));
    };
    let t; $("uq").addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { st.q = $("uq").value; st.page = 1; load().catch((e) => toast(e.message, "err")); }, 350); });
    await load();
  }

  // ================= CRUD pages =================
  async function ensureSite() { if (!A.site) A.site = (await api("/api/admin/site")).site; return A.site; }

  async function packages() {
    const site = await ensureSite();
    const opts = [["", "— কোনো অপারেটর নয় —"], ...site.operators.map((o) => [o.id, o.name])];
    const fields = [
      { k: "type", label: "ধরন", type: "select", options: Object.entries(TYPE) },
      { k: "operator", label: "অপারেটর", type: "select", options: opts },
      { k: "title", label: "টাইটেল", full: true, ph: "যেমন: ১২ GB / ১১০ 💎 ডায়মন্ড" },
      { k: "detail", label: "বিবরণ (ঐচ্ছিক)", full: true },
      { k: "validity", label: "মেয়াদ", ph: "৩০ দিন" },
      { k: "tag", label: "ট্যাগ", ph: "Hot / Popular" },
      { k: "price", label: "বিক্রয় মূল্য (৳)", type: "number" },
      { k: "oldPrice", label: "আগের দাম (ঐচ্ছিক)", type: "number" },
      { k: "code", label: "প্রোভাইডার কোড", hint: "API অর্ডারে এই কোড যাবে" },
      { k: "sort", label: "সিরিয়াল", type: "number" },
      { k: "active", label: "চালু আছে", type: "check" }
    ];
    let filter = "all";
    view.innerHTML = `<div class="toolbar"><button class="btn btn-primary btn-sm" id="addP">+ নতুন প্যাকেজ</button>
      ${[["all", "সব"], ...Object.entries(TYPE)].map(([k, l]) => `<button class="chip ${k === filter ? "on" : ""}" data-f="${k}">${l}</button>`).join("")}</div><div id="pb">${skeleton(5)}</div>`;
    let items = [];
    const draw = () => {
      const list = items.filter((p) => filter === "all" || p.type === filter);
      $("pb").innerHTML = list.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>প্যাকেজ</th><th>ধরন</th><th>অপারেটর</th><th>দাম</th><th>স্ট্যাটাস</th><th></th></tr></thead><tbody>
        ${list.map((p) => `<tr><td><b>${esc(p.title)}</b><small>${esc([p.validity, p.tag].filter(Boolean).join(" · "))}</small></td><td>${TYPE[p.type]}</td><td>${esc((site.operators.find((o) => o.id === p.operator) || {}).name || "—")}</td><td><b>${taka(p.price)}</b></td><td>${p.active ? '<span class="badge ok">চালু</span>' : '<span class="badge">বন্ধ</span>'}</td>
        <td><div class="acts"><button class="btn btn-ghost btn-sm" data-e="${p._id}">এডিট</button><button class="btn btn-danger btn-sm" data-x="${p._id}">ডিলিট</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("কোনো প্যাকেজ নেই");
      $("pb").querySelectorAll("[data-e]").forEach((b) => b.addEventListener("click", () => { const p = items.find((x) => x._id === b.dataset.e); formSheet("প্যাকেজ এডিট", fields, p, async (v) => { await api("/api/admin/packages/" + p._id, { method: "PUT", body: v }); toast("সেভ হয়েছে", "ok"); load(); }); }));
      $("pb").querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => confirmSheet("প্যাকেজ ডিলিট করবেন?", "এটি ফিরিয়ে আনা যাবে না। অস্থায়ী বন্ধ করতে এডিট করে ‘চালু আছে’ বন্ধ করুন।", "ডিলিট", async () => { await api("/api/admin/packages/" + b.dataset.x, { method: "DELETE", body: {} }); toast("ডিলিট হয়েছে", "ok"); load(); }, true)));
    };
    const load = async () => { items = (await api("/api/admin/packages")).items; draw(); };
    $("addP").addEventListener("click", () => formSheet("নতুন প্যাকেজ", fields, { type: filter === "all" ? "internet" : filter, active: true, sort: items.length }, async (v) => { await api("/api/admin/packages", { method: "POST", body: v }); toast("যোগ হয়েছে", "ok"); load(); }));
    view.querySelector(".toolbar").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (!b) return; filter = b.dataset.f; view.querySelectorAll("[data-f]").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
    await load();
  }

  async function services() {
    const fields = [
      { k: "name", label: "নাম (বাংলা)", ph: "বিদ্যুৎ বিল" },
      { k: "nameEn", label: "নাম (English)", ph: "Electricity" },
      { k: "key", label: "কী (ইংরেজি, ইউনিক)", ph: "electricity", hint: "a-z, 0-9, - _" },
      { k: "icon", label: "আইকন (ইমোজি)", ph: "💡" },
      { k: "accountLabel", label: "ইনপুটের লেবেল", full: true, ph: "মিটার / অ্যাকাউন্ট নম্বর" },
      { k: "min", label: "সর্বনিম্ন (৳)", type: "number" },
      { k: "max", label: "সর্বোচ্চ (৳)", type: "number" },
      { k: "feePercent", label: "সার্ভিস চার্জ (%)", type: "number", step: "0.1" },
      { k: "code", label: "প্রোভাইডার কোড" },
      { k: "sort", label: "সিরিয়াল", type: "number" },
      { k: "active", label: "চালু আছে", type: "check" }
    ];
    view.innerHTML = `<div class="toolbar"><button class="btn btn-primary btn-sm" id="addS">+ নতুন সার্ভিস</button></div><div id="sb">${skeleton(4)}</div>`;
    let items = [];
    const draw = () => {
      $("sb").innerHTML = items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>সার্ভিস</th><th>লিমিট</th><th>চার্জ</th><th>স্ট্যাটাস</th><th></th></tr></thead><tbody>
        ${items.map((s) => `<tr><td>${esc(s.icon)} <b>${esc(s.name)}</b><small>${esc(s.key)}</small></td><td>৳${s.min} - ৳${s.max}</td><td>${s.feePercent}%</td><td>${s.active ? '<span class="badge ok">চালু</span>' : '<span class="badge">বন্ধ</span>'}</td>
        <td><div class="acts"><button class="btn btn-ghost btn-sm" data-e="${s._id}">এডিট</button><button class="btn btn-danger btn-sm" data-x="${s._id}">ডিলিট</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("কোনো সার্ভিস নেই");
      $("sb").querySelectorAll("[data-e]").forEach((b) => b.addEventListener("click", () => { const s = items.find((x) => x._id === b.dataset.e); formSheet("সার্ভিস এডিট", fields, s, async (v) => { await api("/api/admin/services/" + s._id, { method: "PUT", body: v }); toast("সেভ হয়েছে", "ok"); load(); }); }));
      $("sb").querySelectorAll("[data-x]").forEach((b) => b.addEventListener("click", () => confirmSheet("সার্ভিস ডিলিট করবেন?", "এটি ফিরিয়ে আনা যাবে না।", "ডিলিট", async () => { await api("/api/admin/services/" + b.dataset.x, { method: "DELETE", body: {} }); toast("ডিলিট হয়েছে", "ok"); load(); }, true)));
    };
    const load = async () => { items = (await api("/api/admin/services")).items; draw(); };
    $("addS").addEventListener("click", () => formSheet("নতুন সার্ভিস", fields, { icon: "💡", min: 10, max: 50000, feePercent: 0, active: true, sort: items.length }, async (v) => { await api("/api/admin/services", { method: "POST", body: v }); toast("যোগ হয়েছে", "ok"); load(); }));
    await load();
  }

  async function banners() {
    const fields = [
      { k: "title", label: "টাইটেল", full: true },
      { k: "text", label: "সাবটাইটেল", full: true },
      { k: "imageId", label: "ছবি (ঐচ্ছিক — না দিলে গ্রেডিয়েন্ট)", type: "image", full: true },
      { k: "style", label: "গ্রেডিয়েন্ট স্টাইল", type: "select", options: [[1, "১ — পার্পল-পিংক"], [2, "২ — নীল"], [3, "৩ — কমলা-লাল"], [4, "৪ — সবুজ-নীল"], [5, "৫ — ডার্ক"]] },
      { k: "placement", label: "কোথায় দেখাবে", type: "select", options: [["app", "ইউজার অ্যাপ"], ["landing", "ল্যান্ডিং পেজ"]] },
      { k: "link", label: "লিংক (ঐচ্ছিক)", ph: "/app#/freefire", full: true, hint: "/ দিয়ে শুরু বা https:// লিংক" },
      { k: "sort", label: "সিরিয়াল", type: "number" },
      { k: "active", label: "চালু আছে", type: "check" }
    ];
    view.innerHTML = `<div class="toolbar"><button class="btn btn-primary btn-sm" id="addB">+ নতুন ব্যানার</button></div><div id="bb">${skeleton(3)}</div>`;
    let items = [];
    const draw = () => {
      $("bb").innerHTML = items.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>ব্যানার</th><th>জায়গা</th><th>স্ট্যাটাস</th><th></th></tr></thead><tbody>
        ${items.map((b) => `<tr><td><b>${esc(b.title)}</b><small>${esc(b.text)}</small></td><td>${b.placement === "app" ? "ইউজার অ্যাপ" : "ল্যান্ডিং"}</td><td>${b.active ? '<span class="badge ok">চালু</span>' : '<span class="badge">বন্ধ</span>'}</td>
        <td><div class="acts"><button class="btn btn-ghost btn-sm" data-e="${b._id}">এডিট</button><button class="btn btn-danger btn-sm" data-x="${b._id}">ডিলিট</button></div></td></tr>`).join("")}</tbody></table></div>` : empty("কোনো ব্যানার নেই");
      $("bb").querySelectorAll("[data-e]").forEach((x) => x.addEventListener("click", () => { const b = items.find((i) => i._id === x.dataset.e); formSheet("ব্যানার এডিট", fields, b, async (v) => { await api("/api/admin/banners/" + b._id, { method: "PUT", body: v }); toast("সেভ হয়েছে", "ok"); load(); }); }));
      $("bb").querySelectorAll("[data-x]").forEach((x) => x.addEventListener("click", () => confirmSheet("ব্যানার ডিলিট করবেন?", "এটি ফিরিয়ে আনা যাবে না।", "ডিলিট", async () => { await api("/api/admin/banners/" + x.dataset.x, { method: "DELETE", body: {} }); toast("ডিলিট হয়েছে", "ok"); load(); }, true)));
    };
    const load = async () => { items = (await api("/api/admin/banners")).items; draw(); };
    $("addB").addEventListener("click", () => formSheet("নতুন ব্যানার", fields, { style: 1, placement: "app", active: true, sort: items.length }, async (v) => { await api("/api/admin/banners", { method: "POST", body: v }); toast("যোগ হয়েছে", "ok"); load(); }));
    await load();
  }

  // ================= site settings =================
  function listEditor(id, items, spec, max) {
    const row = (it) => `<div class="lrow">${spec.layout(it)}<button type="button" class="btn btn-danger btn-sm rm" data-rm>মুছুন</button></div>`;
    return {
      html: `<div id="${id}">${items.map(row).join("")}</div><button type="button" class="btn btn-ghost btn-sm" data-add="${id}">+ যোগ করুন</button>`,
      bind(root) {
        const box = root.querySelector("#" + id);
        box.addEventListener("click", (e) => { if (e.target.closest("[data-rm]")) e.target.closest(".lrow").remove(); });
        root.querySelector(`[data-add="${id}"]`).addEventListener("click", () => {
          if (box.children.length >= max) return toast("সর্বোচ্চ " + max + "টি", "err");
          box.insertAdjacentHTML("beforeend", row(spec.blank));
        });
      },
      read(root) { return [...root.querySelectorAll("#" + id + " .lrow")].map(spec.read); }
    };
  }
  const iv = (row, k) => row.querySelector(`[data-f="${k}"]`);

  async function settings() {
    A.site = (await api("/api/admin/site")).site;
    const s = A.site;
    const TABS = [["gen", "সাধারণ"], ["theme", "থিম ও কালার"], ["land", "ল্যান্ডিং কনটেন্ট"], ["pay", "পেমেন্ট ও লিমিট"], ["ops", "অপারেটর"], ["contact", "যোগাযোগ"]];
    let tab = "gen";

    const feats = listEditor("feats", s.features, {
      blank: { icon: "⭐", title: "", text: "" },
      layout: (f) => `<div class="g2"><input data-f="icon" placeholder="ইমোজি" value="${esc(f.icon)}"><input data-f="title" placeholder="টাইটেল" value="${esc(f.title)}"></div><textarea data-f="text" placeholder="বিবরণ">${esc(f.text)}</textarea>`,
      read: (r) => ({ icon: iv(r, "icon").value, title: iv(r, "title").value, text: iv(r, "text").value })
    }, 8);
    const faqs = listEditor("faqs", s.faq, {
      blank: { q: "", a: "" },
      layout: (f) => `<input data-f="q" placeholder="প্রশ্ন" value="${esc(f.q)}"><textarea data-f="a" placeholder="উত্তর">${esc(f.a)}</textarea>`,
      read: (r) => ({ q: iv(r, "q").value, a: iv(r, "a").value })
    }, 10);
    const stats = listEditor("stats", s.stats, {
      blank: { value: "", label: "" },
      layout: (f) => `<div class="g2"><input data-f="value" placeholder="মান (যেমন 24/7)" value="${esc(f.value)}"><input data-f="label" placeholder="লেবেল" value="${esc(f.label)}"></div>`,
      read: (r) => ({ value: iv(r, "value").value, label: iv(r, "label").value })
    }, 4);
    const methods = listEditor("methods", s.payment.methods, {
      blank: { name: "", number: "", kind: "Personal", note: "", active: true },
      layout: (m) => `<div class="g2"><input data-f="name" placeholder="নাম (bKash)" value="${esc(m.name)}"><input data-f="number" placeholder="নম্বর" value="${esc(m.number)}"></div><div class="g2"><input data-f="kind" placeholder="Personal / Agent / Merchant" value="${esc(m.kind)}"><input data-f="note" placeholder="নির্দেশনা" value="${esc(m.note)}"></div><label class="check"><input type="checkbox" data-f="active" ${m.active ? "checked" : ""}>চালু আছে</label>`,
      read: (r) => ({ name: iv(r, "name").value, number: iv(r, "number").value, kind: iv(r, "kind").value, note: iv(r, "note").value, active: iv(r, "active").checked })
    }, 8);
    const opsE = listEditor("opsl", s.operators, {
      blank: { id: "", name: "", short: "", color: "#888888", active: true },
      layout: (o) => `<div class="g2"><input data-f="id" placeholder="আইডি (gp, robi…)" value="${esc(o.id)}"><input data-f="name" placeholder="নাম" value="${esc(o.name)}"></div><div class="g2"><input data-f="short" placeholder="সংক্ষিপ্ত নাম" value="${esc(o.short)}"><input data-f="color" type="color" value="${esc(o.color)}" style="height:42px;padding:3px"></div><label class="check"><input type="checkbox" data-f="active" ${o.active ? "checked" : ""}>চালু আছে</label>`,
      read: (r) => ({ id: iv(r, "id").value, name: iv(r, "name").value, short: iv(r, "short").value, color: iv(r, "color").value, active: iv(r, "active").checked })
    }, 10);

    const THEMES = [["royal", "Royal Dark", "linear-gradient(135deg,#0b0718,#3b1a8a)"], ["aurora", "Aurora Teal", "linear-gradient(135deg,#04131a,#0e7490)"], ["light", "Clean Light", "linear-gradient(135deg,#f4f3fb,#c4b5fd)"]];
    const tx = (id, label, v, extra = "") => `<div class="field"><label for="${id}">${label}</label><input id="${id}" value="${esc(v)}" ${extra}></div>`;
    const ta = (id, label, v) => `<div class="field full"><label for="${id}">${label}</label><textarea id="${id}">${esc(v)}</textarea></div>`;
    const ck = (id, label, v) => `<div class="field"><label class="check"><input type="checkbox" id="${id}" ${v ? "checked" : ""}>${label}</label></div>`;

    const panels = {
      gen: () => `
        <div class="card sec"><h3>ব্র্যান্ড</h3><div class="form-grid">
          ${tx("bName", "সাইটের নাম", s.brand.name, 'maxlength="40"')}${tx("bTag", "ট্যাগলাইন", s.brand.tagline)}
          <div class="field full"><label>লোগো</label><div class="upl"><div class="pv" data-pv="logoId">${s.brand.logoId ? `<img src="/api/media/${esc(s.brand.logoId)}" alt="">` : "নেই"}</div><input type="file" accept="image/png,image/jpeg,image/webp" data-up="logoId"><button type="button" class="btn btn-ghost btn-sm" data-clr="logoId">মুছুন</button><input type="hidden" data-k="logoId" value="${esc(s.brand.logoId)}"></div><span class="hint">বর্গাকার ছবি ভালো দেখায়</span></div>
        </div></div>
        <div class="card sec"><h3>ঘোষণা বার</h3><div class="form-grid">${ck("anOn", "ঘোষণা দেখান", s.announcement.active)}${tx("anTx", "ঘোষণার লেখা", s.announcement.text)}</div></div>
        <div class="card sec"><h3>ফুটার</h3>${tx("foot", "ফুটার লেখা", s.footer)}</div>
        <div class="card sec"><h3>মেইনটেন্যান্স মোড <small>— চালু করলে ইউজাররা অর্ডার/রেজিস্ট্রেশন করতে পারবে না</small></h3><div class="form-grid">${ck("mOn", "মেইনটেন্যান্স চালু", s.maintenance.active)}${tx("mTx", "বার্তা", s.maintenance.message)}</div></div>`,
      theme: () => `
        <div class="card sec"><h3>থিম নির্বাচন</h3>
          <div class="themes">${THEMES.map(([k, l, g]) => `<button type="button" class="th ${s.theme.preset === k ? "on" : ""}" data-th="${k}"><i style="background:${g}"></i>${l}</button>`).join("")}</div>
          <div class="form-grid">
            <div class="field"><label>প্রধান কালার (Brand)</label><div class="colorf"><input type="color" id="cBrand" value="${esc(s.theme.brand)}"><input id="cBrandT" value="${esc(s.theme.brand)}" maxlength="7"></div></div>
            <div class="field"><label>অ্যাকসেন্ট কালার (Gold)</label><div class="colorf"><input type="color" id="cAcc" value="${esc(s.theme.accent)}"><input id="cAccT" value="${esc(s.theme.accent)}" maxlength="7"></div></div>
          </div><p class="muted small">পরিবর্তন সাথে সাথে এই পেজে প্রিভিউ হবে। ‘সেভ’ চাপলে পুরো সাইটে কার্যকর হবে।</p></div>`,
      land: () => `
        <div class="card sec"><h3>হিরো সেকশন</h3><div class="form-grid">
          ${tx("hBadge", "ব্যাজ", s.hero.badge)}${tx("hTitle", "হেডলাইন", s.hero.title)}
          ${ta("hSub", "সাবটাইটেল", s.hero.subtitle)}${tx("hC1", "প্রধান বাটন", s.hero.cta1)}${tx("hC2", "দ্বিতীয় বাটন", s.hero.cta2)}</div></div>
        <div class="card sec"><h3>স্ট্যাটস <small>(সর্বোচ্চ ৪টি)</small></h3>${stats.html}</div>
        <div class="card sec"><h3>সুবিধা সমূহ <small>(সর্বোচ্চ ৮টি)</small></h3>${feats.html}</div>
        <div class="card sec"><h3>প্রশ্নোত্তর (FAQ)</h3>${faqs.html}</div>`,
      pay: () => `
        <div class="card sec"><h3>পেমেন্ট নম্বর <small>— ইউজার এই নম্বরে টাকা পাঠিয়ে ওয়ালেটে যোগ করবে</small></h3>${methods.html}</div>
        <div class="card sec"><h3>লিমিট ও বোনাস</h3><div class="form-grid">
          ${tx("dMin", "সর্বনিম্ন ডিপোজিট (৳)", s.payment.minDeposit, 'type="number"')}${tx("dMax", "সর্বোচ্চ ডিপোজিট (৳)", s.payment.maxDeposit, 'type="number"')}
          ${tx("rMin", "সর্বনিম্ন রিচার্জ (৳)", s.orders.minRecharge, 'type="number"')}${tx("rMax", "সর্বোচ্চ রিচার্জ (৳)", s.orders.maxRecharge, 'type="number"')}
          ${tx("refB", "রেফার বোনাস (৳)", s.referral.bonus, 'type="number"')}</div>
          <p class="muted small">রেফার বোনাস: বন্ধুর প্রথম ডিপোজিট অনুমোদন হলে রেফারার পাবে। ০ দিলে বন্ধ।</p></div>`,
      ops: () => `<div class="card sec"><h3>অপারেটর তালিকা</h3>${opsE.html}</div>`,
      contact: () => `<div class="card sec"><h3>যোগাযোগ</h3><div class="form-grid">
          ${tx("cPh", "ফোন", s.contact.phone)}${tx("cWa", "WhatsApp নম্বর", s.contact.whatsapp, 'placeholder="8801XXXXXXXXX"')}
          ${tx("cEm", "ইমেইল", s.contact.email)}${tx("cAd", "ঠিকানা", s.contact.address)}
          ${tx("cFb", "Facebook লিংক", s.contact.facebook, 'placeholder="https://"')}${tx("cTg", "Telegram লিংক", s.contact.telegram, 'placeholder="https://"')}</div></div>`
    };

    // keep unsaved edits when switching tabs
    const draft = JSON.parse(JSON.stringify(s));
    const collect = () => {
      const g = (id) => { const e = $(id); return e ? e : null; };
      const v = (id, cur) => { const e = g(id); return e ? e.value : cur; };
      const c = (id, cur) => { const e = g(id); return e ? e.checked : cur; };
      if (tab === "gen") {
        draft.brand = { name: v("bName"), tagline: v("bTag"), logoId: view.querySelector('[data-k="logoId"]').value };
        draft.announcement = { active: c("anOn"), text: v("anTx") };
        draft.footer = v("foot");
        draft.maintenance = { active: c("mOn"), message: v("mTx") };
      } else if (tab === "land") {
        draft.hero = { badge: v("hBadge"), title: v("hTitle"), subtitle: v("hSub"), cta1: v("hC1"), cta2: v("hC2") };
        draft.stats = stats.read(view); draft.features = feats.read(view); draft.faq = faqs.read(view);
      } else if (tab === "pay") {
        draft.payment = { minDeposit: v("dMin"), maxDeposit: v("dMax"), methods: methods.read(view) };
        draft.orders = { minRecharge: v("rMin"), maxRecharge: v("rMax") };
        draft.referral = { bonus: v("refB") };
      } else if (tab === "ops") {
        draft.operators = opsE.read(view);
      } else if (tab === "contact") {
        draft.contact = { phone: v("cPh"), whatsapp: v("cWa"), email: v("cEm"), address: v("cAd"), facebook: v("cFb"), telegram: v("cTg") };
      }
    };

    const paint = () => {
      view.innerHTML = `
        <div class="set-tabs">${TABS.map(([k, l]) => `<button class="chip ${k === tab ? "on" : ""}" data-t="${k}">${l}</button>`).join("")}</div>
        <div id="panel">${panels[tab]()}</div>
        <div class="savebar"><button class="btn btn-primary" id="saveAll">💾 সব পরিবর্তন সেভ করুন</button></div>`;
      view.querySelector(".set-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b || b.dataset.t === tab) return; collect(); Object.assign(s, draft); tab = b.dataset.t; paint(); });
      bindUploads(view);
      if (tab === "land") { stats.bind(view); feats.bind(view); faqs.bind(view); }
      if (tab === "pay") methods.bind(view);
      if (tab === "ops") opsE.bind(view);
      if (tab === "theme") bindTheme();
      $("saveAll").addEventListener("click", save);
    };

    function bindTheme() {
      const apply = () => RS.applyTheme(draft.theme);
      view.querySelectorAll("[data-th]").forEach((b) => b.addEventListener("click", () => { draft.theme.preset = b.dataset.th; view.querySelectorAll("[data-th]").forEach((x) => x.classList.toggle("on", x === b)); apply(); }));
      [["cBrand", "cBrandT", "brand"], ["cAcc", "cAccT", "accent"]].forEach(([pi, ti, key]) => {
        $(pi).addEventListener("input", () => { $(ti).value = $(pi).value; draft.theme[key] = $(pi).value; apply(); });
        $(ti).addEventListener("input", () => { if (/^#[0-9a-fA-F]{6}$/.test($(ti).value)) { $(pi).value = $(ti).value; draft.theme[key] = $(ti).value; apply(); } });
      });
    }

    async function save() {
      collect();
      const b = $("saveAll");
      btnBusy(b, true);
      try {
        const r = await api("/api/admin/site", { method: "PUT", body: draft });
        A.site = r.site; Object.assign(s, r.site);
        Object.assign(draft, JSON.parse(JSON.stringify(r.site)));
        setSite(r.site);
        toast("সেভ হয়েছে ✓", "ok");
        paint();
      } catch (e) { btnBusy(b, false); toast(e.message, "err"); }
    }
    paint();
  }

  boot();
})();
