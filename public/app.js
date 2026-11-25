"use strict";

/* =========================================
   RS PAY - FRONTEND APP
   Existing API compatible version
========================================= */

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
let selectedPhoto = "";

/* =========================================
   HELPERS
========================================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value), location.origin);

    if (
      url.protocol === "https:" ||
      url.protocol === "http:"
    ) {
      return url.href;
    }

    return "";
  } catch {
    return "";
  }
}

function showToast(message) {
  let toast = $("#appToast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "appToast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message || "অনুরোধ সম্পন্ন হয়নি।"
    );
  }

  return data;
}

function showElement(selector) {
  const element = $(selector);
  if (element) element.classList.remove("hidden");
}

function hideElement(selector) {
  const element = $(selector);
  if (element) element.classList.add("hidden");
}

/* =========================================
   PAGE VIEW CONTROL
========================================= */

function showLanding() {
  showElement("#landingView");
  hideElement("#authView");
  hideElement("#appView");
}

function showAuth(mode = "login") {
  authMode = mode;

  hideElement("#landingView");
  showElement("#authView");
  hideElement("#appView");

  updateAuthTabs();
}

function showApp() {
  hideElement("#landingView");
  hideElement("#authView");
  showElement("#appView");

  openTab("home");
}

/* =========================================
   AUTH TABS
========================================= */

function updateAuthTabs() {
  const loginTab = $("#loginTab");
  const registerTab = $("#registerTab");

  if (loginTab) {
    loginTab.classList.toggle(
      "active",
      authMode === "login"
    );
  }

  if (registerTab) {
    registerTab.classList.toggle(
      "active",
      authMode === "register"
    );
  }

  const nameField = $(
    '#authForm input[name="name"]'
  );

  const submitButton = $(
    '#authForm button[type="submit"]'
  );

  if (nameField) {
    nameField.closest(".form-group")?.classList.toggle(
      "hidden",
      authMode === "login"
    );

    nameField.required = authMode === "register";
  }

  if (submitButton) {
    submitButton.textContent =
      authMode === "login"
        ? "লগইন করুন"
        : "অ্যাকাউন্ট তৈরি করুন";
  }
}

function setAuthMode(mode) {
  authMode = mode === "register" ? "register" : "login";
  updateAuthTabs();

  const heading = $("#authView h2");

  if (heading) {
    heading.textContent =
      authMode === "login"
        ? "আপনার অ্যাকাউন্টে লগইন করুন"
        : "নতুন অ্যাকাউন্ট তৈরি করুন";
  }
}

/* =========================================
   LOGIN / REGISTER
========================================= */

async function handleAuthSubmit(event) {
  event.preventDefault();

  const form = event.currentTarget;

  const name = form.querySelector(
    '[name="name"]'
  )?.value.trim() || "";

  const phone = form.querySelector(
    '[name="phone"]'
  )?.value.trim() || "";

  const password = form.querySelector(
    '[name="password"]'
  )?.value || "";

  if (!phone || !password) {
    showToast("মোবাইল নম্বর ও পাসওয়ার্ড দিন।");
    return;
  }

  if (authMode === "register" && name.length < 2) {
    showToast("আপনার নাম লিখুন।");
    return;
  }

  const submitButton = form.querySelector(
    'button[type="submit"]'
  );

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "অপেক্ষা করুন...";
  }

  try {
    const endpoint =
      authMode === "login"
        ? API.login
        : API.register;

    const payload = {
      phone,
      password
    };

    if (authMode === "register") {
      payload.name = name;
    }

    const result = await apiRequest(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    currentUser = result.user || null;

    if (!currentUser) {
      throw new Error("অ্যাকাউন্ট তথ্য পাওয়া যায়নি।");
    }

    form.reset();

    updateUserUI();
    showApp();

    showToast(
      authMode === "login"
        ? "সফলভাবে লগইন হয়েছে।"
        : "অ্যাকাউন্ট তৈরি হয়েছে।"
    );

  } catch (error) {
    showToast(error.message);
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent =
        authMode === "login"
          ? "লগইন করুন"
          : "অ্যাকাউন্ট তৈরি করুন";
    }
  }
}

/* =========================================
   USER PROFILE DISPLAY
========================================= */

function updateUserUI() {
  if (!currentUser) return;

  const name = currentUser.name || "ব্যবহারকারী";
  const phone = currentUser.phone || "";

  const nameTargets = [
    "#welcomeName",
    "#accountName",
    "#profileNameText",
    "#headerUserName"
  ];

  nameTargets.forEach(selector => {
    const element = $(selector);
    if (element) element.textContent = name;
  });

  const phoneTargets = [
    "#accountPhone",
    "#profilePhoneText"
  ];

  phoneTargets.forEach(selector => {
    const element = $(selector);
    if (element) element.textContent = phone;
  });

  const nameInput = $("#profileName");
  if (nameInput) nameInput.value = name;

  const phoneInput = $("#profilePhone");

  if (phoneInput) {
    phoneInput.value = phone;

    // বর্তমান সার্ভার API মোবাইল নম্বর পরিবর্তন করে না।
    phoneInput.readOnly = true;
    phoneInput.title =
      "মোবাইল নম্বর পরিবর্তনের সুবিধা এখনো সার্ভারে যুক্ত হয়নি।";
  }

  const avatar = $("#profileAvatar");

  if (avatar) {
    avatar.textContent = name.charAt(0).toUpperCase();
  }

  const savedPhoto = selectedPhoto;

  if (savedPhoto && avatar) {
    avatar.innerHTML = "";
    const img = document.createElement("img");
    img.src = savedPhoto;
    img.alt = "Profile";
    img.className = "profile-avatar";
    avatar.replaceWith(img);
    img.id = "profileAvatar";
  }
}

/* =========================================
   ACCOUNT EDIT
========================================= */

function openEditAccount() {
  showElement("#profileForm");

  const nameInput = $("#profileName");

  if (nameInput && currentUser) {
    nameInput.value = currentUser.name || "";
  }

  const phoneInput = $("#profilePhone");

  if (phoneInput && currentUser) {
    phoneInput.value = currentUser.phone || "";
    phoneInput.readOnly = true;
  }
}

function closeEditAccount() {
  hideElement("#profileForm");
}

async function saveProfile(event) {
  event.preventDefault();

  const name = $("#profileName")?.value.trim() || "";

  if (name.length < 2) {
    showToast("সঠিক নাম লিখুন।");
    return;
  }

  const button = $(
    '#profileForm button[type="submit"]'
  );

  if (button) {
    button.disabled = true;
    button.textContent = "সংরক্ষণ হচ্ছে...";
  }

  try {
    const result = await apiRequest(API.profile, {
      method: "PUT",
      body: JSON.stringify({ name })
    });

    currentUser = result.user || {
      ...currentUser,
      name
    };

    updateUserUI();
    closeEditAccount();

    showToast("নাম সফলভাবে আপডেট হয়েছে।");

  } catch (error) {
    showToast(error.message);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "পরিবর্তন সংরক্ষণ করুন";
    }
  }
}

/* =========================================
   PROFILE PHOTO PREVIEW
========================================= */

function previewProfilePhoto(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("শুধু ছবি নির্বাচন করুন।");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showToast("ছবির সাইজ ২ MB-এর কম রাখুন।");
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    selectedPhoto = String(reader.result || "");

    const avatar = $("#profileAvatar");

    if (avatar) {
      const img = document.createElement("img");
      img.id = "profileAvatar";
      img.className = "profile-avatar";
      img.src = selectedPhoto;
      img.alt = "Profile preview";

      avatar.replaceWith(img);
    }

    showToast(
      "ছবির প্রিভিউ দেখানো হয়েছে। সার্ভারে সংরক্ষণ হচ্ছে না।"
    );
  };

  reader.readAsDataURL(file);
}

/* =========================================
   NAVIGATION
========================================= */

function openTab(tabName) {
  const panels = {
    home: "#homePanel",
    categories: "#categoriesPanel",
    account: "#accountPanel"
  };

  Object.values(panels).forEach(selector => {
    hideElement(selector);
  });

  if (panels[tabName]) {
    showElement(panels[tabName]);
  }

  $$(".bottom-nav button[data-tab]").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tabName
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

/* =========================================
   LOAD SERVICES
========================================= */

function getServiceName(service) {
  return (
    service.name ||
    service.title ||
    service.serviceName ||
    "সার্ভিস"
  );
}

function getServiceIcon(service) {
  return (
    service.icon ||
    service.emoji ||
    "✨"
  );
}

function getServiceCategory(service) {
  return (
    service.categoryName ||
    service.category ||
    service.group ||
    "অন্যান্য"
  );
}

function renderServices() {
  const homeGrid = $("#homeServiceGrid");
  const categoryGrid = $("#allCategories");

  if (!allServices.length) {
    const empty = `
      <div class="about-box">
        বর্তমানে কোনো সার্ভিস পাওয়া যায়নি।
      </div>
    `;

    if (homeGrid) homeGrid.innerHTML = empty;
    if (categoryGrid) categoryGrid.innerHTML = empty;

    return;
  }

  const serviceHTML = allServices.map((service, index) => {
    const name = escapeHTML(getServiceName(service));
    const icon = escapeHTML(getServiceIcon(service));
    const description = escapeHTML(
      service.description || ""
    );

    return `
      <button
        class="service-card"
        type="button"
        data-service-index="${index}"
      >
        <div class="service-icon">${icon}</div>
        <h3>${name}</h3>
        <p>${description}</p>
      </button>
    `;
  }).join("");

  if (homeGrid) {
    homeGrid.innerHTML = serviceHTML;
  }

  if (categoryGrid) {
    categoryGrid.innerHTML = serviceHTML;
  }

  renderServiceCategories();
}

function renderServiceCategories() {
  const container = $("#categoryList");

  if (!container) return;

  const categories = [
    ...new Set(
      allServices.map(getServiceCategory)
    )
  ];

  if (!categories.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = categories.map(category => `
    <button
      class="btn btn-light category-filter"
      type="button"
      data-category="${escapeHTML(category)}"
    >
      ${escapeHTML(category)}
    </button>
  `).join("");
}

async function loadServices() {
  try {
    const result = await apiRequest(API.services);

    allServices = Array.isArray(result.services)
      ? result.services
      : [];

    renderServices();

  } catch (error) {
    console.error("Services load error:", error);
    showToast("সার্ভিস লোড করা যায়নি।");
  }
}

/* =========================================
   SERVICE DETAILS
========================================= */

function openService(index) {
  const service = allServices[index];

  if (!service) return;

  const name = escapeHTML(getServiceName(service));
  const description = escapeHTML(
    service.description ||
    "এই সার্ভিসের বিস্তারিত তথ্য শিগগিরই যুক্ত করা হবে।"
  );

  openPopup(`
    <div class="popup-header">
      <h2>${name}</h2>
      <button class="popup-close" data-close-popup type="button">×</button>
    </div>

    <div class="popup-note">
      ${description}
    </div>

    <p class="muted small" style="margin-top:14px">
      সার্ভিসের বিস্তারিত ও ব্যবহারযোগ্য সুবিধা
      অ্যাডমিন কর্তৃক যুক্ত হলে এখানে দেখা যাবে।
    </p>
  `);
}

/* =========================================
   LOAD BANNERS
========================================= */

function renderBanners(banners) {
  const container = $("#homeBanners");

  if (!container) return;

  const list = Array.isArray(banners)
    ? banners.filter(item => item.enabled !== false)
    : [];

  if (!list.length) {
    container.innerHTML = `
      <div class="banner-card">
        <div class="banner-placeholder">
          <h3>RS PAY</h3>
          <p>নতুন অফার ও আপডেট এখানে দেখতে পাবেন।</p>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(banner => {
    const title = escapeHTML(banner.title || "নতুন অফার");
    const description = escapeHTML(
      banner.description || ""
    );

    const image = safeImageUrl(banner.imageUrl);

    if (image) {
      return `
        <div class="banner-card">
          <img
            src="${escapeHTML(image)}"
            alt="${title}"
            loading="lazy"
          >
        </div>
      `;
    }

    return `
      <div class="banner-card">
        <div class="banner-placeholder">
          <h3>${title}</h3>
          <p>${description}</p>
        </div>
      </div>
    `;
  }).join("");
}

async function loadSiteContent() {
  try {
    const result = await apiRequest(API.content);

    renderBanners(result.banners || []);

    const landing = result.content?.landing || {};

    const heroTitle = $("#heroTitle");
    const heroSubtitle = $("#heroSubtitle");

    if (heroTitle && landing.title) {
      heroTitle.textContent = landing.title;
    }

    if (heroSubtitle && landing.subtitle) {
      heroSubtitle.textContent = landing.subtitle;
    }

  } catch (error) {
    console.error("Content load error:", error);
    renderBanners([]);
  }
}

/* =========================================
   POPUP SYSTEM
========================================= */

function openPopup(content) {
  const overlay = $("#popupOverlay");
  const popupContent = $("#popupContent");

  if (!overlay || !popupContent) return;

  popupContent.innerHTML = content;
  overlay.classList.remove("hidden");
}

function closePopup() {
  hideElement("#popupOverlay");
}

function showDemoPopup(type) {
  const popups = {
    balance: `
      <div class="popup-header">
        <h2>ব্যালেন্স তথ্য</h2>
        <button class="popup-close" data-close-popup type="button">×</button>
      </div>

      <div class="popup-note">
        এটি শুধু ডেমো প্রদর্শন। এখানে কোনো প্রকৃত
        আর্থিক ব্যালেন্স বা লেনদেন দেখানো হচ্ছে না।
      </div>

      <h2 style="margin-top:20px">৳ ০.০০</h2>
      <p class="muted small">ডেমো ব্যালেন্স</p>
    `,

    deposit: `
      <div class="popup-header">
        <h2>ডিপোজিট হিস্টোরি</h2>
        <button class="popup-close" data-close-popup type="button">×</button>
      </div>

      <div class="popup-note">
        ডিপোজিট ইতিহাস দেখানোর সুবিধা এখনো ডেমো অবস্থায়।
        এখানে কোনো প্রকৃত জমা বা পেমেন্ট করা হচ্ছে না।
      </div>

      <p style="margin-top:18px;text-align:center">
        কোনো ডেমো রেকর্ড নেই।
      </p>
    `,

    recharge: `
      <div class="popup-header">
        <h2>রিচার্জ হিস্টোরি</h2>
        <button class="popup-close" data-close-popup type="button">×</button>
      </div>

      <div class="popup-note">
        এটি ডেমো হিস্টোরি প্যানেল। কোনো প্রকৃত রিচার্জ
        বা আর্থিক লেনদেন এখানে সম্পন্ন হয় না।
      </div>

      <p style="margin-top:18px;text-align:center">
        কোনো রেকর্ড নেই।
      </p>
    `,

    settings: `
      <div class="popup-header">
        <h2>অ্যাকাউন্ট সেটিংস</h2>
        <button class="popup-close" data-close-popup type="button">×</button>
      </div>

      <p class="muted">
        অ্যাকাউন্ট সেটিংসের অতিরিক্ত সুবিধা
        পরবর্তী আপডেটে যুক্ত করা হবে।
      </p>
    `
  };

  openPopup(
    popups[type] || popups.settings
  );
}

/* =========================================
   LOGOUT
========================================= */

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
  selectedPhoto = "";

  showLanding();
  showToast("আপনি লগআউট করেছেন।");
}

/* =========================================
   EVENT LISTENERS
========================================= */

function setupEvents() {
  // Landing page buttons

  $("#landingLogin")?.addEventListener("click", () => {
    showAuth("login");
  });

  $("#landingRegister")?.addEventListener("click", () => {
    showAuth("register");
  });

  $("#heroGetStarted")?.addEventListener("click", () => {
    showAuth("register");
  });

  $("#heroLogin")?.addEventListener("click", () => {
    showAuth("login");
  });

  $("#bottomGetStarted")?.addEventListener("click", () => {
    showAuth("register");
  });

  // Auth page

  $("#backToLanding")?.addEventListener("click", showLanding);

  $("#loginTab")?.addEventListener("click", () => {
    setAuthMode("login");
  });

  $("#registerTab")?.addEventListener("click", () => {
    setAuthMode("register");
  });

  $("#authForm")?.addEventListener(
    "submit",
    handleAuthSubmit
  );

  // Navigation

  $$("[data-tab]").forEach(button => {
    button.addEventListener("click", () => {
      openTab(button.dataset.tab);
    });
  });

  $("#brandHome")?.addEventListener("click", () => {
    openTab("home");
  });

  $("#headerAccount")?.addEventListener("click", () => {
    openTab("account");
  });

  // Account editing

  $("#editAccountBtn")?.addEventListener(
    "click",
    openEditAccount
  );

  $("#cancelEditBtn")?.addEventListener(
    "click",
    closeEditAccount
  );

  $("#profileForm")?.addEventListener(
    "submit",
    saveProfile
  );

  $("#profilePhoto")?.addEventListener(
    "change",
    previewProfilePhoto
  );

  // Account popup buttons

  $$("[data-popup]").forEach(button => {
    button.addEventListener("click", () => {
      showDemoPopup(button.dataset.popup);
    });
  });

  // Service cards

  document.addEventListener("click", event => {
    const serviceButton = event.target.closest(
      "[data-service-index]"
    );

    if (serviceButton) {
      openService(
        Number(serviceButton.dataset.serviceIndex)
      );
    }

    const categoryButton = event.target.closest(
      "[data-category]"
    );

    if (categoryButton) {
      const category = categoryButton.dataset.category;

      const filtered = allServices.filter(service => {
        return getServiceCategory(service) === category;
      });

      const grid = $("#allCategories");

      if (grid) {
        grid.innerHTML = filtered.map(service => {
          const index = allServices.indexOf(service);

          return `
            <button
              class="service-card"
              type="button"
              data-service-index="${index}"
            >
              <div class="service-icon">
                ${escapeHTML(getServiceIcon(service))}
              </div>
              <h3>${escapeHTML(getServiceName(service))}</h3>
              <p>${escapeHTML(service.description || "")}</p>
            </button>
          `;
        }).join("");
      }
    }

    // Popup close buttons

    if (event.target.closest("[data-close-popup]")) {
      closePopup();
    }
  });

  // Popup outside click

  $("#popupOverlay")?.addEventListener("click", event => {
    if (event.target.id === "popupOverlay") {
      closePopup();
    }
  });

  $("#closePopup")?.addEventListener(
    "click",
    closePopup
  );

  // Logout

  $("#logoutBtn")?.addEventListener(
    "click",
    logout
  );
}

/* =========================================
   SESSION CHECK
========================================= */

async function checkExistingSession() {
  try {
    const result = await apiRequest(API.me);

    currentUser = result.user || null;

    if (currentUser) {
      updateUserUI();
      showApp();
      return;
    }

  } catch {
    // Not logged in
  }

  showLanding();
}

/* =========================================
   START APP
========================================= */

async function startApp() {
  setupEvents();

  setAuthMode("login");

  await Promise.all([
    loadSiteContent(),
    loadServices()
  ]);

  await checkExistingSession();
}

document.addEventListener("DOMContentLoaded", startApp);
