"use strict";

// ========================================
// RS PAY - MAIN APPLICATION
// Existing server API compatible version
// ========================================

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const landingView = $("#landingView");
const dashboardView = $("#dashboardView");
const modal = $("#authModal");
const authForm = $("#authForm");

let authMode = "login";
let currentUser = null;
let serviceCache = [];

// ========================================
// API HELPER
// ========================================

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "অনুরোধটি সম্পন্ন হয়নি।");
  }

  return data;
}

// ========================================
// SAFE TEXT
// ========================================

function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// ========================================
// AUTH MODAL
// ========================================

function setMode(mode) {
  authMode = mode;
  const registering = mode === "register";

  $("#authTitle").textContent = registering
    ? "নতুন অ্যাকাউন্ট তৈরি করুন"
    : "অ্যাকাউন্টে প্রবেশ করুন";

  $("#authIntro").textContent = registering
    ? "নিচের তথ্য দিয়ে RS PAY অ্যাকাউন্ট খুলুন।"
    : "আপনার অ্যাকাউন্টে প্রবেশ করতে তথ্য দিন।";

  $("#nameLabel").classList.toggle("hidden", !registering);
  $("#nameInput").required = registering;
  $("#verifyNote").classList.toggle("hidden", !registering);

  $("#passwordInput").autocomplete = registering
    ? "new-password"
    : "current-password";

  $("#submitAuth").textContent = registering
    ? "অ্যাকাউন্ট তৈরি করুন →"
    : "লগইন করুন →";

  $("#loginTab").classList.toggle("active", !registering);
  $("#registerTab").classList.toggle("active", registering);
  $("#formMessage").textContent = "";
}

function openModal(mode) {
  setMode(mode);
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

$$("[data-open]").forEach(button => {
  button.addEventListener("click", () => {
    openModal(button.dataset.open);
  });
});

$("#closeModal").addEventListener("click", closeModal);

$("#loginTab").addEventListener("click", () => setMode("login"));
$("#registerTab").addEventListener("click", () => setMode("register"));

modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !modal.classList.contains("hidden")) {
    closeModal();
  }
});

// ========================================
// LOGIN AND REGISTRATION
// ========================================

authForm.addEventListener("submit", async event => {
  event.preventDefault();

  const message = $("#formMessage");
  const submit = $("#submitAuth");

  message.textContent = "অনুগ্রহ করে অপেক্ষা করুন…";
  submit.disabled = true;

  const payload = {
    phone: $("#phoneInput").value.trim(),
    password: $("#passwordInput").value
  };

  if (authMode === "register") {
    payload.name = $("#nameInput").value.trim();
  }

  try {
    const endpoint = authMode === "register"
      ? "/api/auth/register"
      : "/api/auth/login";

    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    authForm.reset();
    showDashboard(result.user);

  } catch (error) {
    message.textContent = error.message;

  } finally {
    submit.disabled = false;
  }
});

// ========================================
// USER DASHBOARD
// ========================================

function getSavedPhoto() {
  try {
    return localStorage.getItem("rsPayProfilePhoto") || "";
  } catch {
    return "";
  }
}

function updateAvatar(element, name, photo) {
  if (!element) return;

  if (photo) {
    element.innerHTML = "";
    const image = document.createElement("img");
    image.src = photo;
    image.alt = "Profile";
    element.appendChild(image);
  } else {
    element.textContent = (name || "U").trim().charAt(0).toUpperCase();
  }
}

function updateProfilePhotoUI() {
  const photo = getSavedPhoto();
  const name = currentUser?.name || "User";

  updateAvatar($("#userInitial"), name, photo);
  updateAvatar($("#accountInitial"), name, photo);

  const preview = $("#profilePhotoPreview");

  if (photo) {
    preview.src = photo;
    preview.classList.remove("hidden");
  } else {
    preview.removeAttribute("src");
    preview.classList.add("hidden");
  }
}

function showDashboard(user) {
  currentUser = user || {};

  landingView.classList.add("hidden");
  dashboardView.classList.remove("hidden");

  const name = currentUser.name || "User";
  const phone = currentUser.phone || "মোবাইল নম্বর যোগ করা হয়নি";

  $("#welcomeName").textContent = name;
  $("#sideName").textContent = name;
  $("#sideEmail").textContent = phone;
  $("#accountDisplayName").textContent = name;
  $("#accountDisplayEmail").textContent = phone;
  $("#profileName").value = name;
  $("#profileEmail").value = currentUser.phone || "";
  $("#dashboardPhone").textContent = phone;

  updateProfilePhotoUI();

  closeModal();
  showDashTab("overview");

  loadCategories();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLanding() {
  currentUser = null;
  dashboardView.classList.add("hidden");
  landingView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ========================================
// DASHBOARD TAB NAVIGATION
// ========================================

function showDashTab(tab) {
  const panels = {
    overview: $("#overview"),
    categories: $("#categoriesPanel"),
    account: $("#accountPanel")
  };

  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle("hidden", key !== tab);
  });

  $$("[data-dash-tab]").forEach(button => {
    button.classList.toggle("active", button.dataset.dashTab === tab);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$("[data-dash-tab]").forEach(button => {
  button.addEventListener("click", event => {
    event.preventDefault();
    showDashTab(button.dataset.dashTab);
  });
});

// ========================================
// LOGOUT
// ========================================

async function logout() {
  try {
    await api("/api/auth/logout", {
      method: "POST",
      body: "{}"
    });
  } catch (error) {
    console.warn("Logout request:", error.message);
  }

  showLanding();
}

$("#logoutBtn").addEventListener("click", logout);

// ========================================
// MOBILE MENU
// ========================================

$("#mobileMenu").addEventListener("click", () => {
  $(".topbar").classList.toggle("mobile-open");
});

$$(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    $(".topbar").classList.remove("mobile-open");
  });
});

// ========================================
// RESTORE LOGIN SESSION
// ========================================

async function restoreSession() {
  try {
    const result = await api("/api/auth/me");
    showDashboard(result.user);
  } catch {
    showLanding();
  }
}

// ========================================
// WEBSITE CONTENT AND SERVICES
// ========================================

async function loadManagedContent() {
  try {
    const [contentResult, serviceResult] = await Promise.all([
      api("/api/site-content"),
      api("/api/services")
    ]);

    const content = contentResult.content || {};
    const landing = content.landing || {};

    if (landing.title) {
      $("#managedLandingTitle").textContent = landing.title;
    }

    if (landing.subtitle) {
      $("#managedLandingSubtitle").textContent = landing.subtitle;
    }

    if (landing.buttonText) {
      $("#landingCta").textContent = `${landing.buttonText} →`;
      $("#howCta").textContent = `${landing.buttonText} →`;
    }

    renderBanners(contentResult.banners || []);

    serviceCache = (serviceResult.services || [])
      .filter(service => service.enabled !== false);

    renderServices(serviceCache);
    updateDemoStatistics(serviceCache);

    if (currentUser) {
      loadCategories();
    }

  } catch (error) {
    console.warn("RS PAY content load error:", error.message);
  }
}

// ========================================
// BANNERS
// ========================================

function renderBanners(banners) {
  const slots = {
    landing_top: $("#landingTopBanners"),
    landing_middle: $("#landingMiddleBanners"),
    dashboard_home: $("#dashboardBanners")
  };

  Object.entries(slots).forEach(([slot, host]) => {
    if (!host) return;

    const selected = banners.filter(banner =>
      (banner.slot || banner.position) === slot &&
      banner.enabled !== false
    );

    if (!selected.length) {
      host.classList.add("hidden");
      host.innerHTML = "";
      return;
    }

    host.classList.remove("hidden");

    host.innerHTML = selected.map(banner => {
      const image = banner.imageUrl
        ? `<img src="${safeText(banner.imageUrl)}" alt="${safeText(banner.title)}" loading="lazy">`
        : "";

      const link = banner.linkUrl || banner.link;

      const button = link
        ? `<a class="btn btn-gold" href="${safeText(link)}" target="_blank" rel="noopener noreferrer">${safeText(banner.buttonText || "বিস্তারিত দেখুন")} ↗</a>`
        : "";

      return `
        <article class="managed-banner">
          <div>
            <span class="section-kicker">RS PAY UPDATE</span>
            <h3>${safeText(banner.title)}</h3>
            <p>${safeText(banner.description)}</p>
            ${button}
          </div>
          ${image}
        </article>
      `;
    }).join("");
  });
}

// ========================================
// SERVICE CARDS
// ========================================

function renderServices(services) {
  const landingGrid = $("#landingServiceGrid");
  const dashboardGrid = $("#dashboardServiceGrid");

  if (landingGrid) {
    if (!services.length) {
      landingGrid.innerHTML = `
        <div class="service-card service-card-muted">
          <div class="service-icon">◇</div>
          <h3>এখনো সার্ভিস যোগ করা হয়নি</h3>
          <p>পরবর্তীতে এখানে সার্ভিস দেখা যাবে।</p>
        </div>
      `;
    } else {
      landingGrid.innerHTML = services.map(service => `
        <article class="service-card managed-service-card">
          <div class="service-icon">${safeText(service.icon || "◇")}</div>
          <h3>${safeText(service.name)}</h3>
          <p>${safeText(service.description || "সেবা বিভাগ")}</p>
          <span class="card-arrow">↗</span>
        </article>
      `).join("");
    }
  }

  if (dashboardGrid) {
    if (!services.length) {
      dashboardGrid.innerHTML = `
        <div><b>কোনো সার্ভিস পাওয়া যায়নি</b><small>অ্যাডমিন প্যানেল থেকে সার্ভিস যোগ করা যাবে।</small></div>
      `;
    } else {
      dashboardGrid.innerHTML = services.map(service => `
        <div>
          ${safeText(service.icon || "◇")}
          <b>${safeText(service.name)}</b>
          <small>${safeText(service.description || "সেবা বিভাগ")}</small>
        </div>
      `).join("");
    }
  }
}

// ========================================
// CATEGORIES
// Existing service records only.
// No new categories are created.
// ========================================

function loadCategories() {
  const host = $("#categoryGrid");
  if (!host) return;

  if (!serviceCache.length) {
    host.innerHTML = `<div class="empty-state">এখনো কোনো সার্ভিস পাওয়া যায়নি।</div>`;
    return;
  }

  const categories = new Map();

  serviceCache.forEach(service => {
    const categoryName =
      service.category ||
      service.categoryName ||
      service.group ||
      "অন্যান্য";

    if (!categories.has(categoryName)) {
      categories.set(categoryName, []);
    }

    categories.get(categoryName).push(service);
  });

  host.innerHTML = [...categories.entries()].map(([name, items]) => `
    <article class="category-card">
      <strong>${safeText(name)}</strong>
      <small>${items.length} টি সার্ভিস</small>
    </article>
  `).join("");
}

// ========================================
// DEMO STATISTICS
// These values are illustrative only.
// They are NOT real user or business data.
// ========================================

function updateDemoStatistics(services) {
  const categories = new Set(
    services.map(service =>
      service.category || service.categoryName || service.group || "অন্যান্য"
    )
  );

  const randomBetween = (min, max) =>
    Math.floor(Math.random() * (max - min + 1)) + min;

  $("#statUsers").textContent =
    randomBetween(850, 1450).toLocaleString("bn-BD") + "+";

  $("#statServices").textContent =
    randomBetween(services.length, Math.max(services.length, services.length + 5))
      .toLocaleString("bn-BD") + "+";

  $("#statActive").textContent =
    services.length.toLocaleString("bn-BD");

  $("#statCategories").textContent =
    categories.size.toLocaleString("bn-BD");
}

// ========================================
// PROFILE UPDATE
// Existing server endpoint.
// ========================================

$("#profileForm").addEventListener("submit", async event => {
  event.preventDefault();

  const message = $("#profileMessage");
  const button = event.currentTarget.querySelector('button[type="submit"]');

  button.disabled = true;
  message.textContent = "সংরক্ষণ হচ্ছে…";

  try {
    const result = await api("/api/account/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: $("#profileName").value.trim()
      })
    });

    currentUser = result.user;

    const name = currentUser.name || "User";

    $("#welcomeName").textContent = name;
    $("#sideName").textContent = name;
    $("#accountDisplayName").textContent = name;
    $("#profileName").value = name;

    updateAvatar($("#userInitial"), name, getSavedPhoto());
    updateAvatar($("#accountInitial"), name, getSavedPhoto());

    message.textContent = "প্রোফাইল আপডেট হয়েছে।";

  } catch (error) {
    message.textContent = error.message;

  } finally {
    button.disabled = false;
  }
});

// ========================================
// PROFILE PHOTO
// Saved locally in this browser only.
// Image is resized before saving.
// ========================================

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();

    reader.onload = () => {
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const maxSize = 420;

        let width = image.width;
        let height = image.height;

        if (width > height && width > maxSize) {
          height = Math.round(height * maxSize / width);
          width = maxSize;
        } else if (height > maxSize) {
          width = Math.round(width * maxSize / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, width, height);

        resolve(canvas.toDataURL("image/jpeg", 0.78));
      };

      image.onerror = () => reject(new Error("ছবিটি পড়া যায়নি।"));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("ছবি লোড করা যায়নি।"));
    reader.readAsDataURL(file);
  });
}

$("#profilePhotoInput").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  const message = $("#photoMessage");

  if (!file) return;

  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    message.textContent = "JPG, PNG অথবা WEBP ছবি নির্বাচন করুন।";
    event.target.value = "";
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    message.textContent = "ছবির সাইজ ৫ MB-এর কম হতে হবে।";
    event.target.value = "";
    return;
  }

  message.textContent = "ছবি প্রস্তুত হচ্ছে…";

  try {
    const compressed = await compressImage(file);
    localStorage.setItem("rsPayProfilePhoto", compressed);
    updateProfilePhotoUI();
    message.textContent = "প্রোফাইল ছবি সংরক্ষণ হয়েছে।";

  } catch (error) {
    message.textContent = error.message ||
      "ছবি সংরক্ষণ করা যায়নি।";

  } finally {
    event.target.value = "";
  }
});

$("#removePhotoBtn").addEventListener("click", () => {
  try {
    localStorage.removeItem("rsPayProfilePhoto");
    updateProfilePhotoUI();
    $("#photoMessage").textContent = "প্রোফাইল ছবি সরানো হয়েছে।";
  } catch {
    $("#photoMessage").textContent = "ছবি সরানো যায়নি।";
  }
});

// ========================================
// THEME COLOR
// Saved locally in this browser only.
// ========================================

function applyTheme(color) {
  document.documentElement.style.setProperty("--accent", color);

  try {
    localStorage.setItem("rsPayTheme", color);
  } catch {}

  $$(".theme-choice").forEach(button => {
    button.classList.toggle(
      "selected",
      button.dataset.theme === color
    );
  });
}

$$(".theme-choice").forEach(button => {
  button.addEventListener("click", () => {
    applyTheme(button.dataset.theme);
  });
});

try {
  const savedTheme = localStorage.getItem("rsPayTheme");
  if (savedTheme) applyTheme(savedTheme);
} catch {}

// ========================================
// FOOTER YEAR
// ========================================

$("#year").textContent = new Date().getFullYear();

// ========================================
// START APPLICATION
// ========================================

loadManagedContent();
restoreSession();
