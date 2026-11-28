(function () {
  "use strict";
  const { api, esc, setSite } = RS;
  const $ = (id) => document.getElementById(id);

  const nav = $("nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 10);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  function bannerStyle(b) {
    return b.imageId ? ` style="background-image:url('/api/media/${esc(b.imageId)}')"` : "";
  }

  function render({ site, banners, services, categories = [] }) {
    setSite(site);
    document.title = site.brand.name + " — " + site.brand.tagline;

    if (site.announcement.active && site.announcement.text) {
      $("announce").hidden = false;
      $("announceText").textContent = site.announcement.text;
    }

    $("heroBadge").textContent = site.hero.badge;
    $("heroTitle").textContent = site.hero.title;
    $("heroSub").textContent = site.hero.subtitle;
    $("heroCta1").textContent = site.hero.cta1;
    $("heroCta2").textContent = site.hero.cta2;

    $("heroOps").innerHTML = site.operators.filter((o) => o.active).map((o) =>
      `<span class="op-chip"><i style="background:${esc(o.color)}"></i>${esc(o.short || o.name)}</span>`).join("");

    $("stats").innerHTML = site.stats.map((s) =>
      `<div class="card stat reveal"><b class="grad-text">${esc(s.value)}</b><span>${esc(s.label)}</span></div>`).join("");

    const img = (id, icon) => (id ? `<img src="/api/media/${esc(id)}" alt="" loading="lazy">` : esc(icon));
    const core = categories.filter((c) => c.landing).map((c) => ({ icon: c.icon, image: c.image, name: c.title, text: "" }))
      .concat(services.map((s) => ({ icon: s.icon, image: s.image, name: s.name, text: s.accountLabel + " দিয়ে পরিশোধ করুন।" })));
    $("svcGrid").innerHTML = core.map((s) =>
      `<a href="/login#register" class="card svc reveal"><div class="ic">${img(s.image, s.icon)}</div><h3>${esc(s.name)}</h3>${s.text ? `<p>${esc(s.text)}</p>` : ""}</a>`).join("");

    // sections the admin can switch off
    const sec = site.sections || {};
    [["stats", "stats"], ["services", "services"], ["features", "features"], ["steps", "how"], ["faq", "faq"]].forEach(([k, id]) => { $(id).hidden = sec[k] === false; });
    $("stepsList").innerHTML = (site.steps || []).map((s, i) =>
      `<div class="step reveal"><b>${i + 1}</b><h3>${esc(s.title)}</h3><p class="muted">${esc(s.text)}</p></div>`).join("");

    // hero banner image / video
    const hm = site.heroMedia || {};
    const box = $("heroMedia");
    let node = null;
    if (hm.type === "image" && hm.image) {
      node = document.createElement("img"); node.src = "/api/media/" + hm.image; node.alt = "";
    } else if (hm.type === "video" && hm.videoUrl) {
      const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(hm.videoUrl);
      if (yt) {
        node = document.createElement("iframe");
        node.src = "https://www.youtube-nocookie.com/embed/" + yt[1] + "?rel=0";
        node.allow = "autoplay; encrypted-media; picture-in-picture"; node.allowFullscreen = true; node.title = "video";
      } else {
        node = document.createElement("video");
        node.src = hm.videoUrl; node.muted = true; node.loop = true; node.autoplay = true; node.playsInline = true; node.controls = true;
        if (hm.image) node.poster = "/api/media/" + hm.image;
      }
    }
    if (node) { box.innerHTML = ""; box.appendChild(node); box.hidden = false; $("heroArt").hidden = true; }

    const lb = banners.filter((b) => b.placement === "landing");
    if (lb.length) {
      $("bannerSect").hidden = false;
      $("bannerRow").innerHTML = lb.map((b) => {
        const tag = b.link ? "a" : "div";
        const href = b.link ? ` href="${esc(b.link)}"` : "";
        return `<${tag}${href} class="bn s${b.style}${b.imageId ? " img" : ""}"${bannerStyle(b)}><b>${esc(b.title)}</b><span>${esc(b.text)}</span></${tag}>`;
      }).join("");
    }

    $("featGrid").innerHTML = site.features.map((f) =>
      `<div class="card feat reveal"><div class="ic">${esc(f.icon)}</div><div><h3>${esc(f.title)}</h3><p>${esc(f.text)}</p></div></div>`).join("");

    $("faqList").innerHTML = site.faq.map((f) =>
      `<details class="faq reveal"><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("");

    $("footTag").textContent = site.brand.tagline;
    const c = site.contact;
    const safeUrl = (u) => (/^https:\/\//.test(u) ? u : "");
    const lines = [];
    if (c.phone) lines.push(`<a href="tel:${esc(c.phone)}">📞 ${esc(c.phone)}</a>`);
    if (c.whatsapp) lines.push(`<a href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ""))}" rel="noopener">💬 WhatsApp</a>`);
    if (c.email) lines.push(`<a href="mailto:${esc(c.email)}">✉️ ${esc(c.email)}</a>`);
    if (safeUrl(c.facebook)) lines.push(`<a href="${esc(c.facebook)}" rel="noopener">📘 Facebook</a>`);
    if (safeUrl(c.telegram)) lines.push(`<a href="${esc(c.telegram)}" rel="noopener">✈️ Telegram</a>`);
    if (c.address) lines.push(`<span class="muted">📍 ${esc(c.address)}</span>`);
    $("footContact").innerHTML = lines.join("");
    $("footCopy").textContent = site.footer;

    // scroll reveal
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  }

  api("/api/bootstrap").then(render).catch(() => {
    // Fallback: show static page even if API is unreachable
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  });
})();
