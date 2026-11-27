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

  function render({ site, banners, services }) {
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

    const core = [
      { icon: "📱", name: "মোবাইল রিচার্জ", text: "সব অপারেটরে প্রিপেইড ও পোস্টপেইড রিচার্জ।" },
      { icon: "📦", name: "ডাটা ও মিনিট", text: "জিপি, রবি, বাংলালিংক, এয়ারটেল, টেলিটক অফার।" },
      { icon: "💎", name: "ফ্রি ফায়ার ডায়মন্ড", text: "UID দিয়ে ইনস্ট্যান্ট ডায়মন্ড ও মেম্বারশিপ।" }
    ].concat(services.map((s) => ({ icon: s.icon, name: s.name, text: s.accountLabel + " দিয়ে পরিশোধ করুন।" })));
    $("svcGrid").innerHTML = core.map((s) =>
      `<a href="/login#register" class="card svc reveal"><div class="ic">${esc(s.icon)}</div><h3>${esc(s.name)}</h3><p>${esc(s.text)}</p></a>`).join("");

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
