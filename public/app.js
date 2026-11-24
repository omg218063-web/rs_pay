const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

let currentUser = null;

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong");
  return data;
}

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2600);
}

function showScreen(screen) {
  ["#landingScreen", "#authScreen", "#appScreen"].forEach(id =>
    $(id).classList.add("hidden")
  );
  $(screen).classList.remove("hidden");
}

function showAuth(mode = "login") {
  showScreen("#authScreen");
  $("#loginForm").classList.toggle("hidden", mode !== "login");
  $("#registerForm").classList.toggle("hidden", mode !== "register");
  $("#loginTab").classList.toggle("active", mode === "login");
  $("#registerTab").classList.toggle("active", mode === "register");
}

function showApp(user) {
  currentUser = user;
  showScreen("#appScreen");
  $("#welcomeName").textContent = user.name;
  $("#profileName").value = user.name;
  $("#profilePhone").value = user.phone;
  $("#themeSelect").value = user.theme || "purple";
  $("#verificationStatus").textContent =
    "Verification status: " + (user.verificationStatus || "unverified");
  $("#accountShortcut").textContent =
    user.name.split(" ").map(x => x[0]).join("").slice(0, 2).toUpperCase();
  document.body.dataset.theme = user.theme || "purple";
  openPage("homePage");
  loadServices();
}

function openPage(pageId) {
  $$(".page").forEach(page => page.classList.add("hidden"));
  $("#" + pageId).classList.remove("hidden");

  $$(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });
}

async function loadServices() {
  try {
    const data = await apiRequest("/api/services");
    const html = data.services.map(service => `
      <article class="service-card">
        <h3>${escapeHtml(service.name)}</h3>
        <p class="muted">Preview only</p>
      </article>
    `).join("");

    $("#dashboardServices").innerHTML = html;
    $("#servicesList").innerHTML = html;
  } catch {
    showToast("Could not load services");
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  })[char]);
}

async function loadSiteContent() {
  try {
    const data = await apiRequest("/api/site-content");
    const landing = data.content.landing || {};

    if (landing.title) $("#landingTitle").textContent = landing.title;
    if (landing.subtitle) $("#landingSubtitle").textContent = landing.subtitle;
    if (landing.buttonText) $("#getStarted").textContent = landing.buttonText;

    const bannerHtml = (data.banners || []).map(banner => `
      <article class="banner">
        ${banner.imageUrl ? `<img src="${escapeHtml(banner.imageUrl)}" alt="">` : ""}
        <h3>${escapeHtml(banner.title)}</h3>
        <p>${escapeHtml(banner.description)}</p>
        ${banner.linkUrl ? `<a href="${escapeHtml(banner.linkUrl)}" target="_blank" rel="noopener"> ${escapeHtml(banner.buttonText || "View")} </a>` : ""}
      </article>
    `).join("");

    $("#landingBanners").innerHTML = bannerHtml;
    $("#dashboardBanners").innerHTML = bannerHtml;
  } catch {
    console.log("Using default site content");
  }
}

$("#headerLogin").addEventListener("click", () => showAuth("login"));
$("#getStarted").addEventListener("click", () => showAuth("register"));
$("#backHome").addEventListener("click", () => showScreen("#landingScreen"));
$("#loginTab").addEventListener("click", () => showAuth("login"));
$("#registerTab").addEventListener("click", () => showAuth("register"));
$("#accountShortcut").addEventListener("click", () => openPage("accountPage"));

$$(".nav-item").forEach(button => {
  button.addEventListener("click", () => openPage(button.dataset.page));
});

$("#loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    showApp(data.user);
    showToast("Login successful");
  } catch (error) {
    showToast(error.message);
  }
});

$("#registerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    showApp(data.user);
    showToast("Account created");
  } catch (error) {
    showToast(error.message);
  }
});

$("#saveProfile").addEventListener("click", async () => {
  try {
    const data = await apiRequest("/api/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: $("#profileName").value,
        theme: $("#themeSelect").value
      })
    });
    showApp(data.user);
    showToast("Profile saved");
  } catch (error) {
    showToast(error.message);
  }
});

$("#themeSelect").addEventListener("change", event => {
  document.body.dataset.theme = event.target.value;
});

$("#verificationButton").addEventListener("click", async () => {
  try {
    const data = await apiRequest("/api/verification/request", {
      method: "POST",
      body: JSON.stringify({})
    });
    $("#verificationStatus").textContent = "Verification status: pending";
    showToast(data.message);
  } catch (error) {
    showToast(error.message);
  }
});

$("#logoutButton").addEventListener("click", async () => {
  try {
    await apiRequest("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
  } finally {
    currentUser = null;
    showScreen("#landingScreen");
    showToast("Logged out");
  }
});

async function checkSession() {
  try {
    const data = await apiRequest("/api/auth/me");
    showApp(data.user);
  } catch {
    showScreen("#landingScreen");
  }
}

loadSiteContent();
checkSession();
