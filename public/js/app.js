(function () {
  "use strict";
  const { api, esc, toast, taka, dt, badge, sheet, btnBusy, copy, setSite } = RS;
  const $ = (id) => document.getElementById(id);
  const view = $("view");

  const S = { me: null, site: null, banners: [], services: [], packs: null, phone: "", packType: "internet", packOp: "all" };
  try { S.phone = localStorage.getItem("rs_phone") || ""; S.uid = localStorage.getItem("rs_uid") || ""; } catch (_) {}

  const NAV = [
    ["home", "🏠", "হোম"], ["recharge", "📱", "রিচার্জ"], ["packs", "📦", "প্যাকেজ"],
    ["freefire", "🎮", "গেম টপআপ"], ["bills", "🧾", "বিল পে"], ["wallet", "💰", "ওয়ালেট"],
    ["orders", "📋", "অর্ডার"], ["profile", "👤", "প্রোফাইল"]
  ];
  const TAB = ["home", "recharge", "packs", "freefire", "profile"];
  const TYPE_ICON = { recharge: "📱", package: "📦", freefire: "💎", bill: "🧾" };
  const TX_ICON = { deposit: "⬇️", purchase: "🛒", refund: "↩️", adjust: "⚙️", bonus: "🎁" };
  const TX_LABEL = { deposit: "ডিপোজিট", purchase: "কেনাকাটা", refund: "ফেরত", adjust: "অ্যাডজাস্টমেন্ট", bonus: "বোনাস" };
  const PREFIX = { "017": "gp", "013": "gp", "019": "bl", "014": "bl", "018": "robi", "016": "airtel", "015": "teletalk" };

  const ops = () => S.site.operators.filter((o) => o.active);
  const op = (id) => S.site.operators.find((o) => o.id === id);
  const media = (id) => `/api/media/${esc(id)}`;
  // image if the admin uploaded one, otherwise the emoji
  const vis = (image, icon) => image ? `<img class="vis" src="${media(image)}" alt="" loading="lazy">` : esc(icon || "⭐");
  const opDot = (id) => {
    const o = op(id);
    if (!o) return `<div class="op-dot" style="background:var(--brand)">•</div>`;
    if (o.image) return `<div class="op-dot img"><img src="${media(o.image)}" alt=""></div>`;
    return `<div class="op-dot" style="background:${esc(o.color)}">${esc((o.short || o.name).slice(0, 5))}</div>`;
  };
  const cbOf = (p) => {
    if (p.cashbackType === "fixed") return Math.min(p.cashbackValue, p.price);
    if (p.cashbackType === "percent") return Math.floor(p.price * Math.min(p.cashbackValue, 100)) / 100;
    return 0;
  };
  const cbBadge = (p) => { const c = cbOf(p); return c > 0 ? `<span class="cb">💰 +${taka(c)} ক্যাশব্যাক</span>` : ""; };
  const tagOf = (p) => (p.hot ? "🔥 HOT" : p.tag || "");
  // shrink a phone photo before upload so it never hits the size limit
  function shrink(file, max, quality) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error("ছবি পড়া যায়নি"));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("ছবি পড়া যায়নি"));
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  const validPhone = (p) => /^01[3-9]\d{8}$/.test(p);
  const cleanPhone = (v) => { let s = String(v).replace(/[^\d+]/g, ""); if (s.startsWith("+880")) s = "0" + s.slice(4); else if (s.startsWith("880")) s = "0" + s.slice(3); return s.slice(0, 11); };
  const skeleton = (n = 4) => `<div class="list">${'<div class="skeleton"></div>'.repeat(n)}</div>`;
  const empty = (icon, text) => `<div class="empty"><div class="big">${icon}</div>${esc(text)}</div>`;
  const setBal = (b) => { S.me.balance = b; $("balTop").textContent = taka(b); const w = document.querySelector("[data-bal]"); if (w) w.textContent = taka(b); };

  // ================= boot =================
  async function boot() {
    try {
      const [me, boot] = await Promise.all([api("/api/me"), api("/api/bootstrap")]);
      S.me = me.user; S.site = boot.site; S.banners = boot.banners; S.services = boot.services; S.games = boot.games || []; S.cats = boot.categories || [];
    } catch (e) {
      if (e.status === 401) return (location.href = "/login");
      view.innerHTML = empty("📡", e.message);
      return;
    }
    setSite(S.site);
    document.title = S.site.brand.name;
    applyMyColor();
    $("balTop").textContent = taka(S.me.balance);

    $("sideNav").innerHTML = NAV.map(([k, i, l]) => `<a href="#/${k}" data-nav="${k}"><i>${i}</i>${l}</a>`).join("");
    $("tabBar").innerHTML = TAB.map((k) => { const n = NAV.find((x) => x[0] === k); return `<a href="#/${k}" data-nav="${k}"><i>${n[1]}</i><span>${n[2]}</span></a>`; }).join("");

    const m = S.site.maintenance;
    if (m.active) { const n = $("notice"); n.hidden = false; n.className = "notice warn"; n.textContent = m.message; }
    else if (S.site.announcement.active && S.site.announcement.text) { const n = $("notice"); n.hidden = false; n.textContent = S.site.announcement.text; }

    const logout = async () => { await api("/api/auth/logout", { method: "POST", body: {} }).catch(() => {}); location.href = "/login"; };
    $("logoutSide").addEventListener("click", logout);
    S.logout = logout;

    window.addEventListener("hashchange", route);
    route();
    setInterval(() => api("/api/me").then((d) => setBal(d.user.balance)).catch(() => {}), 60000);
  }

  function applyMyColor() {
    if (S.me.themeColor) RS.applyTheme({ preset: S.site.theme.preset, brand: S.me.themeColor, accent: S.site.theme.accent });
    else RS.applyTheme(S.site.theme);
  }

  // ================= router =================
  const pages = { home, recharge, packs, freefire, bills, wallet, orders, profile };
  async function route() {
    const name = (location.hash.replace(/^#\/?/, "") || "home").split("?")[0];
    const key = pages[name] ? name : "home";
    document.querySelectorAll("[data-nav]").forEach((a) => a.classList.toggle("on", a.dataset.nav === key));
    $("pageTitle").textContent = (NAV.find((n) => n[0] === key) || [])[2] || "";
    view.innerHTML = skeleton(3);
    window.scrollTo(0, 0);
    try { await pages[key](); } catch (e) { view.innerHTML = empty("⚠️", e.message); }
  }

  // ================= checkout =================
  function checkout({ title, rows, amount, fee = 0, cashback = 0, payload }) {
    const total = amount + fee;
    const short = S.me.balance < total;
    sheet(`
      <h3>অর্ডার কনফার্ম করুন</h3>
      <div class="kv">
        <div><span>সার্ভিস</span><b>${esc(title)}</b></div>
        ${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}
        ${fee ? `<div><span>পরিমাণ</span><b>${taka(amount)}</b></div><div><span>চার্জ</span><b>${taka(fee)}</b></div>` : ""}
        <div><span>মোট</span><b style="color:var(--accent);font-size:17px">${taka(total)}</b></div>
        ${cashback > 0 ? `<div><span>ক্যাশব্যাক</span><b style="color:var(--ok)">+${taka(cashback)}</b></div>` : ""}
        <div><span>বর্তমান ব্যালেন্স</span><b>${taka(S.me.balance)}</b></div>
      </div>
      ${short ? `<p class="small" style="color:var(--bad);margin-bottom:12px">ব্যালেন্স কম। আরও ${taka(total - S.me.balance)} যোগ করুন।</p>
        <button class="btn btn-gold btn-block" id="goWallet">ওয়ালেটে টাকা যোগ করুন</button>`
        : `<button class="btn btn-primary btn-block" id="confirmBtn">কনফার্ম — ${taka(total)}</button>`}
    `, (el, close) => {
      const gw = el.querySelector("#goWallet");
      if (gw) gw.addEventListener("click", () => { close(); location.hash = "#/wallet"; });
      const cb = el.querySelector("#confirmBtn");
      if (cb) cb.addEventListener("click", async () => {
        btnBusy(cb, true);
        try {
          const r = await api("/api/orders", { method: "POST", body: payload });
          setBal(r.balance);
          close();
          receipt(r.order);
          if (location.hash.startsWith("#/orders") || location.hash === "#/home" || location.hash === "" ) route();
        } catch (e) {
          btnBusy(cb, false);
          toast(e.message, "err");
          if (e.status === 402) { close(); location.hash = "#/wallet"; }
        }
      });
    });
  }

  function receipt(o) {
    const st = { success: ["✅", "ok", "অর্ডার সফল হয়েছে"], processing: ["⏳", "warn", "অর্ডার প্রসেস হচ্ছে"], failed: ["❌", "bad", "অর্ডার ব্যর্থ — টাকা ফেরত দেওয়া হয়েছে"], refunded: ["↩️", "bad", "টাকা ফেরত দেওয়া হয়েছে"] }[o.status] || ["ℹ️", "", o.status];
    sheet(`
      <div class="rcpt">
        <div class="big ${st[1]}">${st[0]}</div>
        <h3 style="margin-bottom:2px">${st[2]}</h3>
        <p class="muted small">${o.status === "processing" ? "সাধারণত কিছুক্ষণের মধ্যে সম্পন্ন হয়। স্ট্যাটাস অর্ডার পেজে দেখুন।" : dt(o.createdAt)}</p>
        <div class="kv">
          <div><span>অর্ডার নং</span><b>${esc(o.orderNo)}</b></div>
          <div><span>সার্ভিস</span><b>${esc(o.title)}</b></div>
          <div><span>${o.type === "freefire" ? "Player ID" : o.type === "bill" ? "অ্যাকাউন্ট" : "নম্বর"}</span><b>${esc(o.target)}</b></div>
          ${o.fee ? `<div><span>চার্জ</span><b>${taka(o.fee)}</b></div>` : ""}
          <div><span>মোট</span><b>${taka(o.total)}</b></div>
          ${o.cashback > 0 ? `<div><span>ক্যাশব্যাক</span><b style="color:var(--ok)">${o.cashbackPaid ? "+" + taka(o.cashback) + " যোগ হয়েছে ✓" : taka(o.cashback) + " (সফল হলে পাবেন)"}</b></div>` : ""}
          ${o.providerRef ? `<div><span>রেফারেন্স</span><b>${esc(o.providerRef)}</b></div>` : ""}
          ${o.note && o.status !== "success" ? `<div><span>নোট</span><b>${esc(o.note)}</b></div>` : ""}
        </div>
        <div class="row2">
          <button class="btn btn-ghost" data-copy>অর্ডার নং কপি</button>
          <button class="btn btn-primary" data-close>ঠিক আছে</button>
        </div>
      </div>`, (el, close) => {
      el.querySelector("[data-close]").addEventListener("click", close);
      el.querySelector("[data-copy]").addEventListener("click", () => copy(o.orderNo));
    });
  }

  // ================= HOME =================
  async function home() {
    const first = S.me.name.split(" ")[0];
    const banners = S.banners.filter((b) => b.placement === "app");
    const cats = S.cats.length ? S.cats : [
      { title: "রিচার্জ", icon: "📱", link: "#/recharge" }, { title: "ডাটা/মিনিট", icon: "📦", link: "#/packs" },
      { title: "গেম টপআপ", icon: "🎮", link: "#/freefire" }, { title: "বিল পে", icon: "🧾", link: "#/bills" },
      { title: "টাকা যোগ", icon: "➕", link: "#/wallet?add" }, { title: "অর্ডার", icon: "📋", link: "#/orders" },
      { title: "হিস্ট্রি", icon: "🧮", link: "#/wallet" }, { title: "রেফার", icon: "🎁", link: "#/profile" }
    ];
    view.innerHTML = `
      <div class="hello"><small>স্বাগতম 👋</small><h2>${esc(first)}</h2></div>
      <div class="wallet-card"><span class="shine"></span>
        <small>ওয়ালেট ব্যালেন্স</small>
        <div class="amt" data-bal>${taka(S.me.balance)}</div>
        <div class="acts"><a class="btn solid" href="#/wallet">+ টাকা যোগ করুন</a><a class="btn" href="#/orders">অর্ডার হিস্ট্রি</a></div>
      </div>
      <div class="quick">${cats.map((c) => `<a class="q" href="${esc(c.link)}"><i${c.color ? ` style="background:color-mix(in srgb, ${esc(c.color)} 24%, transparent)"` : ""}>${vis(c.image, c.icon)}</i>${esc(c.title)}</a>`).join("")}</div>
      ${banners.length ? `<div class="sec-title"><h3>অফার</h3></div><div class="banners">${banners.map((b) => {
        const tag = b.link ? "a" : "div";
        return `<${tag}${b.link ? ` href="${esc(b.link)}"` : ""} class="bn s${b.style}${b.imageId ? " img" : ""}"${b.imageId ? ` style="background-image:url('/api/media/${esc(b.imageId)}')"` : ""}><b>${esc(b.title)}</b><span>${esc(b.text)}</span></${tag}>`;
      }).join("")}</div>` : ""}
      ${S.services.length ? `<div class="sec-title"><h3>বিল পেমেন্ট</h3><a href="#/bills">সব দেখুন</a></div>
        <div class="bill-grid">${S.services.slice(0, 4).map((s) => `<button class="bill" data-bill="${esc(s.key)}"><i>${vis(s.image, s.icon)}</i><b>${esc(s.name)}</b></button>`).join("")}</div>` : ""}
      <div class="sec-title"><h3>সাম্প্রতিক অর্ডার</h3><a href="#/orders">সব দেখুন</a></div>
      <div id="recent">${skeleton(2)}</div>`;
    view.querySelectorAll("[data-bill]").forEach((b) => b.addEventListener("click", () => billSheet(b.dataset.bill)));
    try {
      const { items } = await api("/api/orders?limit=3");
      $("recent").innerHTML = items.length ? `<div class="list">${items.map(orderItem).join("")}</div>` : empty("🛍️", "এখনো কোনো অর্ডার নেই");
      bindOrders($("recent"), items);
    } catch (_) { $("recent").innerHTML = ""; }
  }

  function orderItem(o) {
    return `<button class="item click" data-order="${o._id}"><div class="ic">${TYPE_ICON[o.type]}</div>
      <div class="tx"><b>${esc(o.title)}</b><small>${esc(o.target)} · ${dt(o.createdAt)}</small></div>
      <div class="rt"><span>${taka(o.total)}</span>${badge(o.status)}</div></button>`;
  }
  function bindOrders(root, items) {
    root.querySelectorAll("[data-order]").forEach((b) => b.addEventListener("click", () => receipt(items.find((o) => o._id === b.dataset.order))));
  }

  // ================= RECHARGE =================
  async function recharge() {
    const { minRecharge: min, maxRecharge: max } = S.site.orders;
    const quick = [20, 50, 100, 200, 300, 500, 1000, 2000].filter((a) => a >= min && a <= max).slice(0, 8);
    let sim = "prepaid", opId = "", amount = 0;
    view.innerHTML = `
      <div class="card panel">
        <div class="seg" id="sim"><button class="on" data-v="prepaid">প্রিপেইড</button><button data-v="postpaid">পোস্টপেইড</button></div>
        <div class="field"><label for="num">মোবাইল নম্বর</label>
          <input id="num" type="tel" inputmode="numeric" maxlength="14" placeholder="01XXXXXXXXX" value="${esc(S.phone)}"></div>
        <div class="lbl" style="margin-bottom:8px">অপারেটর</div>
        <div class="scroll-x" id="opChips" style="margin-bottom:16px">${ops().map((o) => `<button class="chip" data-op="${esc(o.id)}"><i style="background:${esc(o.color)}"></i>${esc(o.short || o.name)}</button>`).join("")}</div>
        <div class="lbl" style="margin-bottom:8px">পরিমাণ (৳${min} - ৳${max})</div>
        <div class="amounts" id="amts">${quick.map((a) => `<button data-a="${a}">৳${a}</button>`).join("")}</div>
        <div class="field"><input id="amt" type="number" inputmode="numeric" min="${min}" max="${max}" placeholder="অন্য পরিমাণ লিখুন"></div>
        <button class="btn btn-primary btn-block" id="go">এগিয়ে যান</button>
      </div>`;
    const num = $("num"), amt = $("amt");
    const selOp = (id) => { opId = id; view.querySelectorAll("[data-op]").forEach((c) => c.classList.toggle("on", c.dataset.op === id)); };
    const detect = () => { const p = cleanPhone(num.value); if (p.length >= 3 && PREFIX[p.slice(0, 3)] && ops().some((o) => o.id === PREFIX[p.slice(0, 3)])) selOp(PREFIX[p.slice(0, 3)]); };
    num.addEventListener("input", () => { num.value = cleanPhone(num.value); detect(); });
    detect();
    view.querySelectorAll("[data-op]").forEach((c) => c.addEventListener("click", () => selOp(c.dataset.op)));
    $("sim").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; sim = b.dataset.v; $("sim").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); });
    $("amts").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; amount = +b.dataset.a; amt.value = amount; $("amts").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); });
    amt.addEventListener("input", () => { $("amts").querySelectorAll("button").forEach((x) => x.classList.toggle("on", +x.dataset.a === +amt.value)); });
    $("go").addEventListener("click", () => {
      const phone = cleanPhone(num.value), a = Math.floor(+amt.value);
      if (!validPhone(phone)) return toast("সঠিক মোবাইল নম্বর দিন", "err");
      if (!opId) return toast("অপারেটর নির্বাচন করুন", "err");
      if (!(a >= min && a <= max)) return toast(`পরিমাণ ৳${min} - ৳${max} এর মধ্যে দিন`, "err");
      S.phone = phone; try { localStorage.setItem("rs_phone", phone); } catch (_) {}
      checkout({
        title: "মোবাইল রিচার্জ", amount: a,
        rows: [["নম্বর", phone], ["অপারেটর", op(opId).name], ["ধরন", sim === "prepaid" ? "প্রিপেইড" : "পোস্টপেইড"]],
        payload: { type: "recharge", target: phone, operator: opId, simType: sim, amount: a }
      });
    });
  }

  // ================= PACKS =================
  async function loadPacks() {
    if (!S.packs) S.packs = (await api("/api/packages")).items;
    return S.packs;
  }

  async function packs() {
    await loadPacks();
    const TABS = [["internet", "ডাটা"], ["minute", "মিনিট"], ["combo", "কমবো"]];
    view.innerHTML = `
      <div class="card panel">
        <div class="field" style="margin-bottom:0"><label for="num">মোবাইল নম্বর</label>
          <input id="num" type="tel" inputmode="numeric" maxlength="14" placeholder="01XXXXXXXXX" value="${esc(S.phone)}"></div>
      </div>
      <div class="seg" id="ptabs">${TABS.map(([k, l]) => `<button data-t="${k}" class="${S.packType === k ? "on" : ""}">${l}</button>`).join("")}</div>
      <div class="scroll-x" id="pops" style="margin-bottom:14px"></div>
      <div class="list" id="plist"></div>`;
    const num = $("num");
    const draw = () => {
      $("pops").innerHTML = `<button class="chip ${S.packOp === "all" ? "on" : ""}" data-o="all">সব</button>` +
        ops().map((o) => `<button class="chip ${S.packOp === o.id ? "on" : ""}" data-o="${esc(o.id)}"><i style="background:${esc(o.color)}"></i>${esc(o.short || o.name)}</button>`).join("");
      const list = S.packs.filter((p) => p.type === S.packType && (S.packOp === "all" || p.operator === S.packOp));
      $("plist").innerHTML = list.length ? list.map((p) => `
        <button class="pk" data-id="${p._id}">${tagOf(p) ? `<span class="tag${p.hot ? " hot" : ""}">${esc(tagOf(p))}</span>` : ""}
          ${p.image ? `<div class="op-dot img"><img src="${media(p.image)}" alt=""></div>` : opDot(p.operator)}
          <div class="info"><b>${esc(p.title)}</b><small>${esc([p.validity, p.detail].filter(Boolean).join(" · "))}</small>${cbBadge(p)}</div>
          <div class="price">${p.oldPrice > p.price ? `<s>${taka(p.oldPrice)}</s>` : ""}${taka(p.price)}</div>
        </button>`).join("") : empty("📭", "এই ক্যাটাগরিতে কোনো প্যাকেজ নেই");
    };
    draw();
    num.addEventListener("input", () => { num.value = cleanPhone(num.value); const o = PREFIX[num.value.slice(0, 3)]; if (num.value.length === 11 && o && ops().some((x) => x.id === o)) { S.packOp = o; draw(); } });
    $("ptabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S.packType = b.dataset.t; $("ptabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); draw(); });
    $("pops").addEventListener("click", (e) => { const b = e.target.closest("[data-o]"); if (!b) return; S.packOp = b.dataset.o; draw(); });
    $("plist").addEventListener("click", (e) => {
      const b = e.target.closest("[data-id]"); if (!b) return;
      const p = S.packs.find((x) => x._id === b.dataset.id);
      const phone = cleanPhone(num.value);
      if (!validPhone(phone)) { num.focus(); return toast("আগে সঠিক মোবাইল নম্বর দিন", "err"); }
      S.phone = phone; try { localStorage.setItem("rs_phone", phone); } catch (_) {}
      checkout({
        title: p.title, amount: p.price, cashback: cbOf(p),
        rows: [["নম্বর", phone], ["অপারেটর", (op(p.operator) || {}).name || "—"], ["মেয়াদ", p.validity || "—"]],
        payload: { type: "package", packageId: p._id, target: phone }
      });
    });
  }

  // ================= GAMES (Free Fire, PUBG, ...) =================
  async function freefire() {
    await loadPacks();
    const gid = new URLSearchParams((location.hash.split("?")[1]) || "").get("g");
    const game = gid && S.games.find((g) => g._id === gid);
    if (!game) return gamePicker();
    gameDetail(game);
  }

  function gamePicker() {
    view.innerHTML = `
      <div class="sec-title" style="margin-top:6px"><h3>গেম বেছে নিন</h3></div>
      ${S.games.length ? `<div class="game-grid">${S.games.map((g) => {
        const n = S.packs.filter((p) => p.type === "freefire" && p.gameId === g._id).length;
        return `<a class="game" href="#/freefire?g=${esc(g._id)}"><div class="gimg">${vis(g.image, g.icon)}</div><b>${esc(g.name)}</b><small>${n} টি প্যাকেজ</small></a>`;
      }).join("")}</div>` : empty("🎮", "এখন কোনো গেম চালু নেই")}`;
  }

  function gameDetail(g) {
    const list = S.packs.filter((p) => p.type === "freefire" && p.gameId === g._id);
    const key = "rs_uid_" + g.key;
    let saved = ""; try { saved = localStorage.getItem(key) || ""; } catch (_) {}
    view.innerHTML = `
      <a href="#/freefire" class="back-link">← সব গেম</a>
      <div class="game-head"><div class="gimg">${vis(g.image, g.icon)}</div><div><h2>${esc(g.name)}</h2><small class="muted">${esc(g.currency)} টপআপ</small></div></div>
      <div class="card panel">
        <div class="field" style="margin-bottom:6px"><label for="uid">${esc(g.idLabel)}</label>
          <input id="uid" inputmode="numeric" maxlength="15" placeholder="আপনার ${esc(g.idLabel)} লিখুন" value="${esc(saved)}"></div>
        <p class="small muted">ভুল ID দিলে ${esc(g.currency)} ফেরত পাওয়া যাবে না। ভালোভাবে মিলিয়ে নিন।</p>
      </div>
      <div class="dgrid">${list.length ? list.map((p) => `
        <button class="dg" data-id="${p._id}">${tagOf(p) ? `<span class="tag${p.hot ? " hot" : ""}">${esc(tagOf(p))}</span>` : ""}
          <div class="gem">${p.image ? `<img class="vis" src="${media(p.image)}" alt="" loading="lazy">` : esc(g.icon)}</div>
          <b>${esc(p.title)}</b>
          ${p.validity ? `<small class="muted">${esc(p.validity)}</small>` : ""}
          <div class="price">${p.oldPrice > p.price ? `<s>${taka(p.oldPrice)}</s> ` : ""}${taka(p.price)}</div>
          ${cbBadge(p)}</button>`).join("") : ""}</div>
      ${list.length ? "" : empty("🎮", "এই গেমে এখন কোনো প্যাকেজ নেই")}`;
    const uid = $("uid");
    uid.addEventListener("input", () => { uid.value = uid.value.replace(/\D/g, ""); });
    view.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => {
      const p = list.find((x) => x._id === b.dataset.id);
      if (!/^\d{5,15}$/.test(uid.value)) { uid.focus(); return toast("সঠিক " + g.idLabel + " দিন", "err"); }
      try { localStorage.setItem(key, uid.value); } catch (_) {}
      checkout({ title: g.name + " — " + p.title, amount: p.price, cashback: cbOf(p), rows: [[g.idLabel, uid.value]], payload: { type: "freefire", packageId: p._id, target: uid.value } });
    }));
  }

  // ================= BILLS =================
  async function bills() {
    view.innerHTML = S.services.length
      ? `<div class="bill-grid">${S.services.map((s) => `<button class="bill" data-bill="${esc(s.key)}"><i>${vis(s.image, s.icon)}</i><b>${esc(s.name)}</b><small>৳${s.min} - ৳${s.max}${s.feePercent ? ` · চার্জ ${s.feePercent}%` : ""}</small></button>`).join("")}</div>`
      : empty("🧾", "এখন কোনো বিল সার্ভিস চালু নেই");
    view.querySelectorAll("[data-bill]").forEach((b) => b.addEventListener("click", () => billSheet(b.dataset.bill)));
  }

  function billSheet(key) {
    const s = S.services.find((x) => x.key === key);
    if (!s) return;
    sheet(`
      <h3>${vis(s.image, s.icon)} ${esc(s.name)}</h3>
      <div class="field"><label>${esc(s.accountLabel)}</label><input id="bAcc" maxlength="40" autocomplete="off"></div>
      <div class="field"><label>পরিমাণ (৳${s.min} - ৳${s.max})</label><input id="bAmt" type="number" inputmode="numeric" min="${s.min}" max="${s.max}"></div>
      <div class="field"><label>যোগাযোগের মোবাইল (ঐচ্ছিক)</label><input id="bCon" type="tel" inputmode="numeric" maxlength="11" value="${esc(S.me.phone)}"></div>
      <p class="small muted" id="bFee" style="margin:-4px 0 12px"></p>
      <button class="btn btn-primary btn-block" id="bGo">এগিয়ে যান</button>`, (el, close) => {
      const amt = el.querySelector("#bAmt");
      amt.addEventListener("input", () => {
        const a = Math.floor(+amt.value) || 0, f = Math.round(a * s.feePercent) / 100;
        el.querySelector("#bFee").textContent = a && s.feePercent ? `চার্জ ${taka(f)} · মোট ${taka(a + f)}` : "";
      });
      el.querySelector("#bGo").addEventListener("click", () => {
        const acc = el.querySelector("#bAcc").value.trim(), a = Math.floor(+amt.value);
        if (acc.length < 3) return toast(s.accountLabel + " দিন", "err");
        if (!(a >= s.min && a <= s.max)) return toast(`পরিমাণ ৳${s.min} - ৳${s.max} এর মধ্যে দিন`, "err");
        const contact = el.querySelector("#bCon").value.trim();
        close();
        checkout({
          title: s.name, amount: a, fee: Math.round(a * s.feePercent) / 100,
          rows: [[s.accountLabel, acc]],
          payload: { type: "bill", service: s.key, target: acc, amount: a, contact }
        });
      });
    });
  }

  // ================= WALLET =================
  async function wallet() {
    view.innerHTML = `
      <div class="wallet-card"><span class="shine"></span><small>ওয়ালেট ব্যালেন্স</small><div class="amt" data-bal>${taka(S.me.balance)}</div>
        <div class="acts"><button class="btn solid" id="addBtn">+ টাকা যোগ করুন</button></div></div>
      <div class="seg" id="wtabs"><button class="on" data-t="tx">লেনদেন</button><button data-t="dep">ডিপোজিট রিকোয়েস্ট</button></div>
      <div id="wbody">${skeleton(4)}</div>`;
    $("addBtn").addEventListener("click", addMoney);
    let tab = "tx";
    const load = async () => {
      $("wbody").innerHTML = skeleton(4);
      if (tab === "tx") {
        const { items } = await api("/api/wallet/history");
        $("wbody").innerHTML = items.length ? `<div class="list">${items.map((t) => `
          <div class="item"><div class="ic">${TX_ICON[t.kind]}</div>
            <div class="tx"><b>${TX_LABEL[t.kind]}</b><small>${esc(t.note || t.ref || "")} · ${dt(t.createdAt)}</small></div>
            <div class="rt"><span class="${t.amount > 0 ? "plus" : "minus"}">${t.amount > 0 ? "+" : "−"}${taka(Math.abs(t.amount))}</span><small class="muted">${taka(t.balanceAfter)}</small></div></div>`).join("")}</div>` : empty("🧾", "এখনো কোনো লেনদেন নেই");
      } else {
        const { items } = await api("/api/deposits");
        $("wbody").innerHTML = items.length ? `<div class="list">${items.map((d) => `
          <div class="item"><div class="ic">⬇️</div>
            <div class="tx"><b>${esc(d.method)} · ${esc(d.trxId)}</b><small>${dt(d.createdAt)}${d.note ? " · " + esc(d.note) : ""}</small></div>
            <div class="rt"><span>${taka(d.amount)}</span>${badge(d.status)}</div></div>`).join("")}</div>` : empty("📭", "কোনো রিকোয়েস্ট নেই");
      }
    };
    $("wtabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; tab = b.dataset.t; $("wtabs").querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); load().catch((er) => ($("wbody").innerHTML = empty("⚠️", er.message))); });
    await load();
    if (location.hash.includes("add")) addMoney();
  }

  async function addMoney() {
    let m;
    try { m = await api("/api/wallet/methods"); } catch (e) { return toast(e.message, "err"); }
    if (!m.methods.length) return toast("এখন কোনো পেমেন্ট মাধ্যম চালু নেই", "err");
    sheet(`
      <h3>ওয়ালেটে টাকা যোগ করুন</h3>
      <p class="small muted" style="margin-bottom:12px">১) নিচের যেকোনো নম্বরে টাকা পাঠান ২) Transaction ID সহ ফর্মটি জমা দিন। যাচাইয়ের পর ব্যালেন্স যোগ হবে।</p>
      ${m.methods.map((x) => `<div class="pay-method"><div><small class="muted">${esc(x.name)} · ${esc(x.kind)}</small><br><b>${esc(x.number)}</b>${x.note ? `<br><small class="muted">${esc(x.note)}</small>` : ""}</div><button class="btn btn-ghost btn-sm" data-copy="${esc(x.number)}">কপি</button></div>`).join("")}
      <div class="field" style="margin-top:14px"><label>পেমেন্ট মাধ্যম</label><select id="dM">${m.methods.map((x) => `<option>${esc(x.name)}</option>`).join("")}</select></div>
      <div class="field"><label>যে নম্বর থেকে পাঠিয়েছেন</label><input id="dS" type="tel" inputmode="numeric" maxlength="11" value="${esc(S.me.phone)}"></div>
      <div class="row2">
        <div class="field"><label>Transaction ID</label><input id="dT" autocapitalize="characters" maxlength="30" placeholder="8N7A6D5E"></div>
        <div class="field"><label>পরিমাণ (৳${m.min}+)</label><input id="dA" type="number" inputmode="numeric" min="${m.min}" max="${m.max}"></div>
      </div>
      <button class="btn btn-gold btn-block" id="dGo">জমা দিন</button>`, (el, close) => {
      el.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copy(b.dataset.copy)));
      const go = el.querySelector("#dGo");
      go.addEventListener("click", async () => {
        btnBusy(go, true);
        try {
          await api("/api/deposits", { method: "POST", body: { method: el.querySelector("#dM").value, sender: el.querySelector("#dS").value, trxId: el.querySelector("#dT").value, amount: el.querySelector("#dA").value } });
          close(); toast("রিকোয়েস্ট জমা হয়েছে। যাচাইয়ের পর ব্যালেন্স যোগ হবে।", "ok");
          if (location.hash.startsWith("#/wallet")) route();
        } catch (e) { btnBusy(go, false); toast(e.message, "err"); }
      });
    });
  }

  // ================= ORDERS =================
  async function orders() {
    const T = [["", "সব"], ["recharge", "রিচার্জ"], ["package", "প্যাকেজ"], ["freefire", "ডায়মন্ড"], ["bill", "বিল"]];
    let type = "";
    view.innerHTML = `<div class="scroll-x" id="of" style="margin-bottom:14px">${T.map(([k, l]) => `<button class="chip ${k === "" ? "on" : ""}" data-t="${k}">${l}</button>`).join("")}</div><div id="ol">${skeleton(5)}</div>`;
    const load = async () => {
      const { items } = await api("/api/orders?limit=60" + (type ? "&type=" + type : ""));
      $("ol").innerHTML = items.length ? `<div class="list">${items.map(orderItem).join("")}</div>` : empty("🛍️", "কোনো অর্ডার পাওয়া যায়নি");
      bindOrders($("ol"), items);
    };
    $("of").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; type = b.dataset.t; $("of").querySelectorAll(".chip").forEach((x) => x.classList.toggle("on", x === b)); load().catch((er) => toast(er.message, "err")); });
    await load();
  }

  // ================= PROFILE =================
  async function profile() {
    const u = S.me, c = S.site.contact;
    const link = `${location.origin}/login?ref=${u.referralCode}`;
    view.innerHTML = `
      <div class="profile-top"><div class="avatar">${u.avatar ? `<img src="${media(u.avatar)}" alt="">` : esc(u.name.slice(0, 1).toUpperCase())}</div><h2>${esc(u.name)}</h2><p class="muted">${esc(u.phone)}</p></div>
      <div class="ref-box"><div><small class="muted">আপনার রেফার কোড</small><br><b>${esc(u.referralCode)}</b>${S.site.referral.bonus ? `<br><small class="muted">বন্ধু প্রথম ডিপোজিট করলে ${taka(S.site.referral.bonus)} বোনাস</small>` : ""}</div>
        <button class="btn btn-gold btn-sm" id="refCopy">লিংক কপি</button></div>
      <div class="menu" style="margin-top:10px">
        <a href="#/wallet"><i>💰</i>ওয়ালেট ও লেনদেন</a>
        <a href="#/orders"><i>📋</i>অর্ডার হিস্ট্রি</a>
        <a href="#/bills"><i>🧾</i>বিল পে</a>
        <button id="editP"><i>✏️</i>প্রোফাইল, ছবি ও কালার</button>
        <button id="pwP"><i>🔑</i>পাসওয়ার্ড পরিবর্তন</button>
        ${c.whatsapp ? `<a href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ""))}" target="_blank" rel="noopener"><i>💬</i>WhatsApp সাপোর্ট</a>` : ""}
        ${c.phone ? `<a href="tel:${esc(c.phone)}"><i>📞</i>কল করুন: ${esc(c.phone)}</a>` : ""}
        <button id="outP" style="color:var(--bad)"><i>🚪</i>লগআউট</button>
      </div>
      <div class="admin-entry"><button id="admP">🔐 অ্যাডমিন প্যানেল</button></div>`;
    $("refCopy").addEventListener("click", () => copy(link));
    $("outP").addEventListener("click", S.logout);
    $("admP").addEventListener("click", () => sheet(`
      <h3>🔐 অ্যাডমিন প্যানেল</h3>
      <p class="muted small" style="margin-bottom:12px">অ্যাডমিন পাসওয়ার্ড দিন।</p>
      <div class="field"><label>পাসওয়ার্ড</label><input id="aPw" type="password" autocomplete="current-password"></div>
      <button class="btn btn-primary btn-block" id="aGo">প্রবেশ করুন</button>`, (el, close) => {
      const go = el.querySelector("#aGo"), pw = el.querySelector("#aPw");
      const submit = async () => {
        btnBusy(go, true);
        try { await api("/api/admin/login", { method: "POST", body: { password: pw.value } }); location.href = "/admin"; }
        catch (e) { btnBusy(go, false); toast(e.message, "err"); }
      };
      go.addEventListener("click", submit);
      pw.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
      setTimeout(() => pw.focus(), 250);
    }));
    $("editP").addEventListener("click", () => {
      const SW = ["#7c3aed", "#ec4899", "#ef4444", "#f97316", "#eab308", "#22c55e", "#0ea5e9", "#6366f1"];
      let color = u.themeColor || "", avatar = u.avatar || "";
      sheet(`
        <h3>প্রোফাইল, ছবি ও কালার</h3>
        <div class="upl-row"><div class="avatar sm" id="eAv">${avatar ? `<img src="${media(avatar)}" alt="">` : esc(u.name.slice(0, 1).toUpperCase())}</div>
          <label class="btn btn-ghost btn-sm">📷 ছবি বদলান<input type="file" id="eFile" accept="image/*" hidden></label></div>
        <div class="field"><label>নাম</label><input id="eN" value="${esc(u.name)}" maxlength="60"></div>
        <div class="field"><label>ইমেইল</label><input id="eE" type="email" value="${esc(u.email)}"></div>
        <div class="lbl" style="margin-bottom:8px">আমার অ্যাপের কালার</div>
        <div class="swatches" id="eSw">${SW.map((c) => `<button type="button" class="sw ${c === color ? "on" : ""}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join("")}
          <input type="color" id="eCol" value="${color || S.site.theme.brand}" title="নিজের পছন্দ">
          <button type="button" class="btn btn-ghost btn-sm" id="eRst">ডিফল্ট</button></div>
        <button class="btn btn-primary btn-block" id="eGo" style="margin-top:16px">সেভ করুন</button>`, (el, close) => {
        const setColor = (c) => { color = c; el.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x.dataset.c === c)); S.me.themeColor = c; applyMyColor(); };
        el.querySelector("#eSw").addEventListener("click", (e) => { const b = e.target.closest(".sw"); if (b) { setColor(b.dataset.c); el.querySelector("#eCol").value = b.dataset.c; } });
        el.querySelector("#eCol").addEventListener("input", (e) => setColor(e.target.value));
        el.querySelector("#eRst").addEventListener("click", () => setColor(""));
        el.querySelector("#eFile").addEventListener("change", async (e) => {
          const f = e.target.files[0]; if (!f) return;
          try {
            const dataUrl = await shrink(f, 320, 0.85);
            const r = await api("/api/me/avatar", { method: "POST", body: { dataUrl } });
            avatar = r.user.avatar; S.me = r.user; applyMyColor();
            el.querySelector("#eAv").innerHTML = `<img src="${media(avatar)}" alt="">`;
            toast("ছবি আপলোড হয়েছে", "ok");
          } catch (er) { toast(er.message, "err"); }
        });
        const go = el.querySelector("#eGo");
        go.addEventListener("click", async () => {
          btnBusy(go, true);
          try {
            const r = await api("/api/me", { method: "PUT", body: { name: el.querySelector("#eN").value, email: el.querySelector("#eE").value, themeColor: color, avatar } });
            S.me = r.user; applyMyColor(); close(); toast("সেভ হয়েছে", "ok"); route();
          } catch (er) { btnBusy(go, false); toast(er.message, "err"); }
        });
      });
    });
    $("pwP").addEventListener("click", () => sheet(`
      <h3>পাসওয়ার্ড পরিবর্তন</h3>
      <div class="field"><label>বর্তমান পাসওয়ার্ড</label><input id="pC" type="password" autocomplete="current-password"></div>
      <div class="field"><label>নতুন পাসওয়ার্ড</label><input id="pN" type="password" autocomplete="new-password" minlength="6"></div>
      <button class="btn btn-primary btn-block" id="pGo">পরিবর্তন করুন</button>`, (el, close) => {
      const go = el.querySelector("#pGo");
      go.addEventListener("click", async () => {
        btnBusy(go, true);
        try { await api("/api/me/password", { method: "PUT", body: { current: el.querySelector("#pC").value, next: el.querySelector("#pN").value } }); close(); toast("পাসওয়ার্ড বদলেছে", "ok"); }
        catch (e) { btnBusy(go, false); toast(e.message, "err"); }
      });
    }));
  }

  boot();
})();
