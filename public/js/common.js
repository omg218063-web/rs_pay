/* Shared helpers: API client, escaping, theme, toast, formatting */
(function () {
  "use strict";

  // ---- theme (applied immediately from cache to avoid a flash) ----
  function applyTheme(t) {
    if (!t) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", t.preset || "royal");
    if (t.brand) root.style.setProperty("--brand", t.brand);
    if (t.accent) root.style.setProperty("--accent", t.accent);
  }
  try { applyTheme(JSON.parse(localStorage.getItem("rs_theme"))); } catch (_) {}
  if (!document.documentElement.getAttribute("data-theme")) {
    document.documentElement.setAttribute("data-theme", "royal");
  }

  function setSite(site) {
    try { localStorage.setItem("rs_theme", JSON.stringify(site.theme)); } catch (_) {}
    applyTheme(site.theme);
    document.querySelectorAll("[data-brand-name]").forEach((el) => (el.textContent = site.brand.name));
    document.querySelectorAll("[data-logo]").forEach((el) => {
      if (site.brand.logoId) {
        el.innerHTML = "";
        const img = document.createElement("img");
        img.src = "/api/media/" + site.brand.logoId;
        img.alt = site.brand.name;
        el.appendChild(img);
      } else {
        el.textContent = site.brand.name.replace(/[^A-Za-z0-9ঀ-৿]/g, "").slice(0, 2).toUpperCase();
      }
    });
  }

  // ---- escaping ----
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- API ----
  async function api(url, opts = {}) {
    const init = { method: opts.method || "GET", headers: { "X-Requested-With": "rspay" }, credentials: "same-origin" };
    if (opts.body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    let res;
    try { res = await fetch(url, init); }
    catch (_) { throw Object.assign(new Error("ইন্টারনেট সংযোগ চেক করুন"), { status: 0 }); }
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) throw Object.assign(new Error(data.error || "কিছু একটা সমস্যা হয়েছে"), { status: res.status });
    return data;
  }

  // ---- toast ----
  function toast(msg, type) {
    let box = document.getElementById("toasts");
    if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; }, 3200);
    setTimeout(() => t.remove(), 3600);
  }

  // ---- formatting ----
  const taka = (n) => "৳" + (Math.round(Number(n || 0) * 100) / 100).toLocaleString("en-IN");
  const dt = (d) => new Date(d).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true });
  const STATUS = {
    processing: ["প্রসেসিং", "warn"], success: ["সফল", "ok"], failed: ["ব্যর্থ", "bad"],
    refunded: ["ফেরত", "bad"], pending: ["পেন্ডিং", "warn"], approved: ["অনুমোদিত", "ok"], rejected: ["বাতিল", "bad"]
  };
  const badge = (s) => { const [t, c] = STATUS[s] || [s, ""]; return `<span class="badge ${c}">${t}</span>`; };

  // ---- sheet (bottom modal) ----
  function sheet(html, onMount) {
    const ov = document.createElement("div");
    ov.className = "overlay";
    ov.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
    const close = () => ov.remove();
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    document.body.appendChild(ov);
    if (onMount) onMount(ov.querySelector(".sheet"), close);
    return close;
  }

  function btnBusy(btn, busy, label) {
    if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    else { btn.disabled = false; btn.innerHTML = label || btn.dataset.label; }
  }

  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); toast("কপি হয়েছে", "ok"); }
    catch (_) { toast("কপি করা যায়নি", "err"); }
  };

  window.RS = { api, esc, toast, taka, dt, badge, sheet, btnBusy, copy, setSite, applyTheme };
})();
