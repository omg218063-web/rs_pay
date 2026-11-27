(function () {
  "use strict";
  const { api, setSite, btnBusy } = RS;
  const $ = (id) => document.getElementById(id);
  const loginForm = $("loginForm"), regForm = $("regForm"), err = $("err");

  // already logged in?
  api("/api/me").then(() => (location.href = "/app")).catch(() => {});
  api("/api/bootstrap").then((d) => setSite(d.site)).catch(() => {});

  function showTab(name) {
    const reg = name === "register";
    loginForm.hidden = reg;
    regForm.hidden = !reg;
    err.hidden = true;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === name));
    $("title").textContent = reg ? "নতুন অ্যাকাউন্ট" : "স্বাগতম 👋";
    $("sub").textContent = reg ? "১ মিনিটে ফ্রি অ্যাকাউন্ট খুলুন" : "আপনার অ্যাকাউন্টে লগইন করুন";
    history.replaceState(null, "", reg ? "#register" : location.pathname);
  }
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));
  if (location.hash === "#register") showTab("register");
  const ref = new URLSearchParams(location.search).get("ref");
  if (ref) { $("rr").value = ref.toUpperCase(); showTab("register"); }

  document.querySelectorAll("[data-eye]").forEach((b) => b.addEventListener("click", () => {
    const i = b.previousElementSibling;
    i.type = i.type === "password" ? "text" : "password";
  }));

  function showErr(m) { err.textContent = m; err.hidden = false; }

  async function submit(form, url) {
    err.hidden = true;
    const btn = form.querySelector("button[type=submit]");
    btnBusy(btn, true);
    try {
      await api(url, { method: "POST", body: Object.fromEntries(new FormData(form)) });
      location.href = "/app";
    } catch (e) {
      showErr(e.message);
      btnBusy(btn, false);
    }
  }
  loginForm.addEventListener("submit", (e) => { e.preventDefault(); submit(loginForm, "/api/auth/login"); });
  regForm.addEventListener("submit", (e) => { e.preventDefault(); submit(regForm, "/api/auth/register"); });
})();
