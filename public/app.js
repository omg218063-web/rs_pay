
const API = "";
const $ = (id) => document.getElementById(id);

let currentUser = null;
let authMode = "login";
let serviceItems = [];

async function request(url, options = {}) {
  const response = await fetch(API + url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "অনুরোধ সম্পন্ন হয়নি");
  return data;
}

function toast(message) {
  const el = $("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function showLanding() {
  $("landingPage").classList.remove("hidden");
  $("dashboardPage").classList.add("hidden");
}

function showDashboard(user) {
  currentUser = user;
  $("landingPage").classList.add("hidden");
  $("dashboardPage").classList.remove("hidden");
  $("welcomeText").textContent = `স্বাগতম, ${user.name || "User"}`;
  $("profileName").value = user.name || "";
  $("profileEmail").value = user.email || "";
  $("adminShortcut").classList.toggle("hidden", user.role !== "admin");
  openTab("home");
}

function openTab(tab) {
  document.querySelectorAll(".dash-tab").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".side-link[data-tab]").forEach(el => el.classList.remove("active"));
  $(`tab-${tab}`)?.classList.remove("hidden");
  document.querySelector(`.side-link[data-tab="${tab}"]`)?.classList.add("active");
}

function openAuth(mode) {
  authMode = mode;
  $("authModal").classList.remove("hidden");
  $("authTitle").textContent = mode === "login" ? "লগইন করুন" : "অ্যাকাউন্ট তৈরি করুন";
  $("authSubmit").textContent = mode === "login" ? "লগইন" : "রেজিস্ট্রেশন";
  $("nameField").classList.toggle("hidden", mode === "login");
  $("authName").required = mode === "register";
  $("authPassword").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("authMessage").textContent = "";
}

function closeAuth() {
  $("authModal").classList.add("hidden");
  $("authForm").reset();
}

function renderServices(items, targetId) {
  const target = $(targetId);
  if (!target) return;

  target.innerHTML = "";
  if (!items.length) {
    target.innerHTML = '<p class="empty-state">এখন কোনো সার্ভিস পাওয়া যাচ্ছে না।</p>';
    return;
  }

  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "service-card";

    const icon = document.createElement("div");
    icon.className = "service-icon";
    icon.textContent = item.icon || "✦";

    const title = document.createElement("h3");
    title.textContent = item.name || "Service";

    const description = document.createElement("p");
    description.textContent = item.description || "ডিজিটাল সার্ভিস";

    const button = document.createElement("button");
    button.className = "btn btn-outline";
    button.textContent = "বিস্তারিত";
    button.addEventListener("click", () => {
      toast("এই সার্ভিসটি বর্তমানে শুধু তথ্য দেখানোর জন্য রয়েছে।");
    });

    card.append(icon, title, description, button);
    target.appendChild(card);
  });
}

async function loadServices() {
  try {
    const data = await request("/api/services");
    serviceItems = (data.services || data || []).filter(item => item.enabled !== false);
    renderServices(serviceItems, "serviceGrid");
    renderServices(serviceItems, "dashServiceGrid");
  } catch {
    $("serviceGrid").innerHTML = '<p class="empty-state">সার্ভিস লোড করা যায়নি।</p>';
  }
}

function renderBanners(banners, targetId) {
  const target = $(targetId);
  if (!target) return;
  target.innerHTML = "";

  (banners || []).filter(b => b.enabled !== false).forEach(banner => {
    const card = document.createElement("a");
    card.className = "managed-banner";
    card.href = banner.link || "#";
    card.target = banner.link ? "_blank" : "_self";
    card.rel = "noopener noreferrer";

    if (banner.imageUrl) {
      const image = document.createElement("img");
      image.src = banner.imageUrl;
      image.alt = banner.title || "RS PAY banner";
      image.loading = "lazy";
      card.appendChild(image);
    } else {
      const heading = document.createElement("h3");
      heading.textContent = banner.title || "RS PAY";
      card.appendChild(heading);
      const description = document.createElement("p");
      description.textContent = banner.description || "";
      card.appendChild(description);
    }
    target.appendChild(card);
  });
}

async function loadContent() {
  try {
    const data = await request("/api/content");
    const content = data.content || data;
    if (content.heroTitle) $("heroTitle").textContent = content.heroTitle;
    if (content.heroSubtitle) $("heroSubtitle").textContent = content.heroSubtitle;
  } catch {}

  try {
    const data = await request("/api/banners");
    const banners = data.banners || data || [];
    renderBanners(banners.filter(b => b.position === "landing_top" || b.position === "landing_middle"), "landingBanners");
    renderBanners(banners.filter(b => b.position === "dashboard_home"), "dashboardBanners");
  } catch {}
}

async function checkSession() {
  try {
    const data = await request("/api/me");
    if (data.user) showDashboard(data.user);
    else showLanding();
  } catch {
    showLanding();
  }
}

async function logout() {
  try {
    await request("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {}
  currentUser = null;
  showLanding();
  toast("আপনি লগআউট করেছেন।");
}

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();
  const payload = {
    email: $("authEmail").value.trim(),
    password: $("authPassword").value
  };

  if (authMode === "register") payload.name = $("authName").value.trim();

  $("authSubmit").disabled = true;
  $("authMessage").textContent = "অপেক্ষা করুন...";

  try {
    const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
    const data = await request(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    closeAuth();
    if (data.user) showDashboard(data.user);
    else await checkSession();
    toast("সফলভাবে সম্পন্ন হয়েছে।");
  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    $("authSubmit").disabled = false;
  }
});

$("profileForm").addEventListener("submit", async event => {
  event.preventDefault();
  try {
    const data = await request("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ name: $("profileName").value.trim() })
    });
    if (data.user) showDashboard(data.user);
    $("profileMessage").textContent = "প্রোফাইল আপডেট হয়েছে।";
  } catch (error) {
    $("profileMessage").textContent = error.message;
  }
});

$("loginOpen").addEventListener("click", () => openAuth("login"));
$("registerOpen").addEventListener("click", () => openAuth("register"));
$("heroRegister").addEventListener("click", () => openAuth("register"));
$("modalClose").addEventListener("click", closeAuth);
$("authSwitch").addEventListener("click", () => openAuth(authMode === "login" ? "register" : "login"));
$("logoutBtn").addEventListener("click", logout);
$("dashLogout").addEventListener("click", logout);

document.querySelectorAll(".side-link[data-tab]").forEach(button => {
  button.addEventListener("click", () => openTab(button.dataset.tab));
});

$("menuToggle").addEventListener("click", () => {
  document.querySelector(".topbar nav").classList.toggle("nav-open");
});

$("authModal").addEventListener("click", event => {
  if (event.target === $("authModal")) closeAuth();
});

$("year").textContent = new Date().getFullYear();

loadServices();
loadContent();
checkSession();
