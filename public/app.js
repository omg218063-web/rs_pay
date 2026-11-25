
"use strict";

const API = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  profile: "/api/account/profile",
  content: "/api/site-content",
  services: "/api/services"
};

let currentUser = null;
let allServices = [];
let authMode = "login";
let selectedCategory = "সব";
let photoPreviewUrl = "";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  })[c]);
}

function safeImageUrl(value) {
  if (!value) return "";

  try {
    const url = new URL(String(value), location.origin);

    if (
      url.origin !== location.origin &&
      url.protocol !== "https:"
    ) return "";

    if (!["http:", "https:"].includes(url.protocol)) return "";

    return url.href;
  } catch {
    return "";
  }
}

function showToast(text) {
  const el = $("#appToast");
  if (!el) return;

  el.textContent = text;
  el.classList.remove("hidden");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    el.classList.add("hidden");
  }, 3000);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "অনুরোধ সম্পন্ন হয়নি।");
  }

  return data;
}

function showElement(selector) {
  $(selector)?.classList.remove("hidden");
}

function hideElement(selector) {
  $(selector)?.classList.add("hidden");
}

// ============================================
// HEADER + PAGE VIEW
// ============================================

function updateHeader() {
  const loggedIn = Boolean(currentUser);

  if (loggedIn) {
    hideElement("#landingLogin");
    hideElement("#landingRegister");
    showElement("#headerAccount");
    hideElement("#landingNav");
  } else {
    showElement("#landingLogin");
    showElement("#landingRegister");
    hideElement("#headerAccount");
    showElement("#landingNav");
  }
}

function showLanding() {
  showElement("#landingView");
  hideElement("#authView");
  hideElement("#appView");
  updateHeader();
  window.scrollTo(0, 0);
}

function showAuth(mode = "login") {
  hideElement("#landingView");
  showElement("#authView");
  hideElement("#appView");
  setAuthMode(mode);
  updateHeader();
  window.scrollTo(0, 0);
}

function showApp() {
  hideElement("#landingView");
  hideElement("#authView");
  showElement("#appView");
  updateHeader();
  openTab("home");
  window.scrollTo(0, 0);
}

// ============================================
// AUTH MODE
// ============================================

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";

  $("#loginTab")?.classList.toggle("active", authMode === "login");
  $("#registerTab")?.classList.toggle("active", authMode === "register");

  if ($("#nameField")) {
    $("#nameField").classList.toggle("hidden", authMode !== "register");
  }

  if ($("#nameInput")) {
    $("#nameInput").required = authMode === "register";
  }

  if ($("#authTitle")) {
    $("#authTitle").textContent = authMode === "login"
      ? "অ্যাকাউন্টে লগইন করুন"
      : "নতুন অ্যাকাউন্ট তৈরি করুন";
  }

  if ($("#authIntro")) {
    $("#authIntro").textContent = authMode === "login"
      ? "আপনার মোবাইল নম্বর ও পাসওয়ার্ড দিন।"
      : "আপনার নাম, মোবাইল নম্বর ও পাসওয়ার্ড দিন।";
  }

  if ($("#authSubmit")) {
    $("#authSubmit").textContent = authMode === "login"
      ? "Login"
      : "Create Account";
  }

  if ($("#authMessage")) $("#authMessage").textContent = "";
}

// ============================================
// LOGIN / REGISTER
// ============================================

async function handleAuthSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;
  const name = $("#nameInput")?.value.trim() || "";
  const phone = $("#phoneInput")?.value.trim() || "";
  const password = $("#passwordInput")?.value || "";
  const message = $("#authMessage");
  const submit = $("#authSubmit");

  if (!phone || !password) {
    message.textContent = "মোবাইল নম্বর ও পাসওয়ার্ড দিন।";
    return;
  }

  if (authMode === "register" && name.length < 2) {
    message.textContent = "আপনার সঠিক নাম লিখুন।";
    return;
  }

  if (authMode === "register" && password.length < 10) {
    message.textContent = "পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।";
    return;
  }

  submit.disabled = true;
  submit.textContent = "অপেক্ষা করুন...";
  message.textContent = "";

  try {
    const result = await apiRequest(
      authMode === "login" ? API.login : API.register,
      {
        method: "POST",
        body: JSON.stringify({
          name,
          phone,
          password
        })
      }
    );

    currentUser = result.user || null;

    if (!currentUser) {
      throw new Error("অ্যাকাউন্ট তথ্য পাওয়া যায়নি।");
    }

    form.reset();
    updateAccountUI();
    showApp();

    showToast(authMode === "login"
      ? "সফলভাবে লগইন হয়েছে।"
      : "অ্যাকাউন্ট তৈরি হয়েছে।");

  } catch (error) {
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = authMode === "login"
      ? "Login"
      : "Create Account";
  }
}

// ============================================
// ACCOUNT DISPLAY
// ============================================

function updateAccountUI() {
  if (!currentUser) return;

  const name = currentUser.name || "User";
  const phone = currentUser.phone || "";

  if ($("#welcomeName")) $("#welcomeName").textContent = name;
  if ($("#accountName")) $("#accountName").textContent = name;
  if ($("#accountPhone")) $("#accountPhone").textContent = phone;
  if ($("#profileName")) $("#profileName").value = name;
  if ($("#profilePhone")) $("#profilePhone").value = phone;

  const avatar = $("#accountAvatar");

  if (avatar) {
    avatar.replaceChildren();

    if (photoPreviewUrl) {
      const image = document.createElement("img");
      image.src = photoPreviewUrl;
      image.alt = "Profile preview";
      avatar.appendChild(image);
    } else {
      avatar.textContent = name.charAt(0).toUpperCase();
    }
  }

  updateHeader();
}

function openEditAccount() {
  if (!currentUser) return;

  showElement("#accountEditForm");
  $("#profileName").value = currentUser.name || "";
  $("#profilePhone").value = currentUser.phone || "";
  $("#profileMessage").textContent = "";
}

function closeEditAccount() {
  hideElement("#accountEditForm");
  if ($("#profileMessage")) $("#profileMessage").textContent = "";
}

async function saveProfile(event) {
  event.preventDefault();

  if (!currentUser) return;

  const name = $("#profileName").value.trim();
  const message = $("#profileMessage");
  const submit = $('#profileForm button[type="submit"]');

  if (name.length < 2) {
    message.textContent = "সঠিক নাম লিখুন।";
    return;
  }

  submit.disabled = true;
  submit.textContent = "সংরক্ষণ হচ্ছে...";
  message.textContent = "";

  try {
    const result = await apiRequest(API.profile, {
      method: "PUT",
      body: JSON.stringify({ name })
    });

    currentUser = result.user || { ...currentUser, name };
    updateAccountUI();
    closeEditAccount();
    showToast("নাম সফলভাবে আপডেট হয়েছে।");
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
    submit.textContent = "Save Changes";
  }
}

// Profile photo remains preview-only in this version.
function handlePhotoPreview(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showToast("JPG, PNG অথবা WEBP ছবি নির্বাচন করুন।");
    event.target.value = "";
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast("ছবির সাইজ ২ MB-এর কম রাখুন।");
    event.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    photoPreviewUrl = String(reader.result || "");
    updateAccountUI();
    showToast("প্রোফাইল ছবির প্রিভিউ দেখানো হয়েছে।");
  };

  reader.readAsDataURL(file);
}

// ============================================
// MAIN NAVIGATION
// ============================================

function openTab(tabName) {
  const panels = {
    home: "#homePanel",
    categories: "#categoriesPanel",
    account: "#accountPanel"
  };

  Object.values(panels).forEach(hideElement);

  if (panels[tabName]) showElement(panels[tabName]);

  $$(".nav-item[data-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.tab === tabName);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============================================
// SERVICES + CATEGORY
// ============================================

function serviceName(service) {
  return service.name || service.title || service.serviceName || "সার্ভিস";
}

function serviceIcon(service) {
  return service.icon || service.emoji || "✦";
}

function serviceCategory(service) {
  return service.categoryName || service.category || service.group || "অন্যান্য";
}

function serviceDescription(service) {
  return service.description || "";
}

function renderServiceCard(service) {
  const index = allServices.indexOf(service);
  const imageUrl = safeImageUrl(service.imageUrl);

  const visual = imageUrl
    ? `
      <div class="service-icon service-image-icon">
        <img
          src="${escapeHTML(imageUrl)}"
          alt="${escapeHTML(serviceName(service))}"
          loading="lazy"
          onerror="this.style.display='none';this.parentElement.textContent='${escapeHTML(serviceIcon(service))}'"
        >
      </div>
    `
    : `
      <div class="service-icon">${escapeHTML(serviceIcon(service))}</div>
    `;

  return `
    <button class="service-card" type="button"
      data-service-index="${index}">
      ${visual}
      <h3>${escapeHTML(serviceName(service))}</h3>
      <p>${escapeHTML(serviceDescription(service))}</p>
    </button>
  `;
}

function renderServiceGrids() {
  const homeGrid = $("#homeServiceGrid");
  const allGrid = $("#allCategories");

  if (!allServices.length) {
    const empty = '<div class="loading-card">বর্তমানে কোনো সার্ভিস পাওয়া যায়নি।</div>';
    if (homeGrid) homeGrid.innerHTML = empty;
    if (allGrid) allGrid.innerHTML = empty;
    renderCategoryFilters();
    return;
  }

  if (homeGrid) {
    homeGrid.innerHTML = allServices.slice(0, 12)
      .map(renderServiceCard).join("");
  }

  renderCategoryFilters();
  renderFilteredServices();
}

function renderCategoryFilters() {
  const container = $("#categoryFilters");
  if (!container) return;

  const categories = [
    "সব",
    ...new Set(allServices.map(serviceCategory))
  ];

  container.innerHTML = categories.map(category => `
    <button type="button"
      class="category-filter ${selectedCategory === category ? "active" : ""}"
      data-category-filter="${escapeHTML(category)}">
      ${escapeHTML(category)}
    </button>
  `).join("");
}

function renderFilteredServices() {
  const grid = $("#allCategories");
  if (!grid) return;

  const filtered = selectedCategory === "সব"
    ? allServices
    : allServices.filter(s => serviceCategory(s) === selectedCategory);

  if (!filtered.length) {
    grid.innerHTML = '<div class="loading-card">এই ক্যাটাগরিতে কোনো সার্ভিস নেই।</div>';
    return;
  }

  grid.innerHTML = filtered.map(renderServiceCard).join("");
}

async function loadServices() {
  try {
    const result = await apiRequest(API.services);
    allServices = Array.isArray(result.services) ? result.services : [];
    renderServiceGrids();
  } catch (error) {
    console.error("Services load error:", error);

    const empty = '<div class="loading-card">সার্ভিস লোড করা যায়নি। পরে আবার চেষ্টা করুন।</div>';

    if ($("#homeServiceGrid")) $("#homeServiceGrid").innerHTML = empty;
    if ($("#allCategories")) $("#allCategories").innerHTML = empty;
  }
}

function openService(index) {
  const service = allServices[index];
  if (!service) return;

  const imageUrl = safeImageUrl(service.imageUrl);
  const imageMarkup = imageUrl
    ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(serviceName(service))}" style="width:100%;max-height:190px;object-fit:cover;border-radius:14px;margin-bottom:14px">`
    : "";

  openPopup(`
    ${imageMarkup}
    <h2>${escapeHTML(serviceName(service))}</h2>
    <div class="popup-note">${escapeHTML(
      serviceDescription(service) ||
      "এই সার্ভিসের বিস্তারিত তথ্য শিগগিরই যুক্ত করা হবে।"
    )}</div>
    <p style="margin-top:15px;color:#81788f;font-size:13px">
      ক্যাটাগরি: ${escapeHTML(serviceCategory(service))}
    </p>
  `);
}

// ============================================
// BANNERS
// ============================================

function createBannerElement(banner) {
  const card = document.createElement("div");
  card.className = "offer-card";

  const imageUrl = safeImageUrl(banner.imageUrl);

  function fallback() {
    card.replaceChildren();
    card.className = "offer-placeholder";

    const label = document.createElement("span");
    label.textContent = "RS PAY OFFER";

    const title = document.createElement("h3");
    title.textContent = banner.title || "নতুন অফার";

    const description = document.createElement("p");
    description.textContent = banner.description || "";

    card.append(label, title, description);
  }

  if (!imageUrl) {
    fallback();
    return card;
  }

  const image = document.createElement("img");
  image.src = imageUrl;
  image.alt = banner.title || "RS PAY Offer";
  image.loading = "lazy";
  image.onerror = fallback;

  card.appendChild(image);

  if (banner.link || banner.linkUrl) {
    card.style.cursor = "pointer";
    card.addEventListener("click", () => {
      const link = safeImageUrl(banner.link || banner.linkUrl);
      if (link) window.open(link, "_blank", "noopener,noreferrer");
    });
  }

  return card;
}

function renderBanners(banners) {
  const container = $("#homeBanners");
  if (!container) return;

  container.replaceChildren();

  const list = Array.isArray(banners)
    ? banners.filter(b => b.enabled !== false)
    : [];

  const dashboard = list.filter(b => {
    return (b.slot || b.position) === "dashboard_home";
  });

  const visible = dashboard.length ? dashboard : list;

  if (!visible.length) {
    const placeholder = document.createElement("div");
    placeholder.className = "offer-placeholder";

    const label = document.createElement("span");
    label.textContent = "RS PAY OFFERS";

    const title = document.createElement("h3");
    title.textContent = "আপনার অফার এখানে দেখানো হবে";

    const desc = document.createElement("p");
    desc.textContent = "অ্যাডমিন থেকে ব্যানার যুক্ত হলে এখানে দেখা যাবে।";

    placeholder.append(label, title, desc);
    container.appendChild(placeholder);
    return;
  }

  visible.forEach(banner => {
    container.appendChild(createBannerElement(banner));
  });
}

async function loadSiteContent() {
  try {
    const result = await apiRequest(API.content);
    renderBanners(result.banners || []);

    const landing = result.content?.landing || {};

    if (landing.title) {
      const title = $("#landingView .hero-content h1");
      if (title) title.textContent = landing.title;
    }

    if (landing.subtitle) {
      const subtitle = $("#landingView .hero-content > p");
      if (subtitle) subtitle.textContent = landing.subtitle;
    }
  } catch (error) {
    console.error("Site content error:", error);
    renderBanners([]);
  }
}

// ============================================
// POPUPS
// ============================================

function openPopup(content) {
  const overlay = $("#popupOverlay");
  const popupContent = $("#popupContent");
  if (!overlay || !popupContent) return;

  popupContent.innerHTML = content;
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closePopup() {
  hideElement("#popupOverlay");
  document.body.style.overflow = "";
}

function showInfoPopup(type) {
  const content = {
    balance: `
      <h2>ব্যালেন্স তথ্য</h2>
      <div class="popup-note">এটি ডেমো প্রদর্শন। প্রকৃত আর্থিক ব্যালেন্স বা লেনদেন দেখানো হচ্ছে না।</div>
      <h2 style="margin-top:20px">৳ ০.০০</h2>
      <p style="color:#81788f;font-size:12px">ডেমো ডিসপ্লে</p>
    `,
    deposit: `
      <h2>ডিপোজিট হিস্টোরি</h2>
      <div class="popup-note">এটি ডেমো প্যানেল। এখানে প্রকৃত পেমেন্ট বা জমা করা হচ্ছে না।</div>
      <p style="margin-top:18px;text-align:center">কোনো রেকর্ড নেই।</p>
    `,
    recharge: `
      <h2>রিচার্জ হিস্টোরি</h2>
      <div class="popup-note">এটি ডেমো হিস্টোরি প্যানেল। কোনো প্রকৃত রিচার্জ হচ্ছে না।</div>
      <p style="margin-top:18px;text-align:center">কোনো রেকর্ড নেই।</p>
    `,
    settings: `
      <h2>অ্যাকাউন্ট সেটিংস</h2>
      <div class="popup-note">অতিরিক্ত সেটিংস পরবর্তী আপডেটে যুক্ত করা হবে।</div>
    `
  };

  openPopup(content[type] || content.settings);
}

// ============================================
// LOGOUT
// ============================================

async function logout() {
  try {
    await apiRequest(API.logout, {
      method: "POST",
      body: JSON.stringify({})
    });
  } catch (error) {
    console.error("Logout error:", error);
  }

  currentUser = null;
  photoPreviewUrl = "";
  selectedCategory = "সব";

  closePopup();
  showLanding();
  showToast("আপনি লগআউট করেছেন।");
}

// ============================================
// EVENTS
// ============================================

function setupEvents() {
  $("#landingLogin")?.addEventListener("click", () => showAuth("login"));
  $("#landingRegister")?.addEventListener("click", () => showAuth("register"));
  $("#headerAccount")?.addEventListener("click", () => {
    showApp();
    openTab("account");
  });

  $("#brandHome")?.addEventListener("click", event => {
    event.preventDefault();
    if (currentUser) {
      showApp();
      openTab("home");
    } else {
      showLanding();
    }
  });

  $("#heroGetStarted")?.addEventListener("click", () => showAuth("register"));
  $("#heroLogin")?.addEventListener("click", () => showAuth("login"));
  $("#bottomGetStarted")?.addEventListener("click", () => showAuth("register"));

  $("#backToLanding")?.addEventListener("click", showLanding);
  $("#loginTab")?.addEventListener("click", () => setAuthMode("login"));
  $("#registerTab")?.addEventListener("click", () => setAuthMode("register"));

  $("#authForm")?.addEventListener("submit", handleAuthSubmit);

  $$("[data-tab]").forEach(button => {
    button.addEventListener("click", () => openTab(button.dataset.tab));
  });

  $("#editAccountBtn")?.addEventListener("click", openEditAccount);
  $("#cancelEditBtn")?.addEventListener("click", closeEditAccount);
  $("#profileForm")?.addEventListener("submit", saveProfile);
  $("#profilePhoto")?.addEventListener("change", handlePhotoPreview);
  $("#logoutBtn")?.addEventListener("click", logout);

  document.addEventListener("click", event => {
    const popupButton = event.target.closest("[data-popup]");
    if (popupButton) showInfoPopup(popupButton.dataset.popup);

    const serviceButton = event.target.closest("[data-service-index]");
    if (serviceButton) openService(Number(serviceButton.dataset.serviceIndex));

    const categoryButton = event.target.closest("[data-category-filter]");
    if (categoryButton) {
      selectedCategory = categoryButton.dataset.categoryFilter;
      renderCategoryFilters();
      renderFilteredServices();
    }
  });

  $("#closePopup")?.addEventListener("click", closePopup);

  $("#popupOverlay")?.addEventListener("click", event => {
    if (event.target === $("#popupOverlay")) closePopup();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closePopup();
  });
}

// ============================================
// SESSION CHECK
// ============================================

async function checkExistingSession() {
  try {
    const result = await apiRequest(API.me);
    currentUser = result.user || null;

    if (currentUser) {
      updateAccountUI();
      showApp();
      return;
    }
  } catch {}

  currentUser = null;
  showLanding();
}

// ============================================
// START
// ============================================

async function startApp() {
  if ($("#year")) {
    $("#year").textContent = new Date().getFullYear();
  }

  setupEvents();
  setAuthMode("login");

  await Promise.all([
    loadSiteContent(),
    loadServices()
  ]);

  await checkExistingSession();
}

document.addEventListener("DOMContentLoaded", startApp);

// ============================================
// CUSTOMER ONLINE HEARTBEAT
// ============================================

async function rsPayHeartbeat() {
  if (document.visibilityState !== "visible") return;

  try {
    await fetch("/api/auth/heartbeat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: "{}"
    });
  } catch {
    // Heartbeat can retry on the next interval.
  }
}

document.addEventListener("DOMContentLoaded", () => {
  rsPayHeartbeat();
  setInterval(rsPayHeartbeat, 60 * 1000);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) rsPayHeartbeat();
  });
});
