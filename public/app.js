
"use strict";

/* =========================================
   RS PAY - FRONTEND APPLICATION
   Existing backend API assumptions:
   /api/auth/register
   /api/auth/login
   /api/auth/logout
   /api/auth/me
   /api/services
   /api/site-content
   /api/account/profile
========================================= */

const API = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  services: "/api/services",
  content: "/api/site-content",
  profile: "/api/account/profile"
};

const $ = (selector) => document.querySelector(selector);

const state = {
  user: null,
  services: [],
  banners: [],
  authMode: "login",
  activeTab: "home"
};

/* ---------- SAFE HELPERS ---------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function getInitial(name) {
  const value = String(name || "U").trim();
  return value ? value.charAt(0).toUpperCase() : "U";
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

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.message ||
      data.error ||
      `Request failed (${response.status})`
    );
  }

  return data;
}

function showMessage(element, message, success = false) {
  if (!element) return;

  element.textContent = message || "";
  element.classList.toggle("success", Boolean(success));
}

function setButtonLoading(button, loading, normalText) {
  if (!button) return;

  button.disabled = loading;
  button.textContent = loading ? "অপেক্ষা করুন..." : normalText;
}

/* ---------- AUTH VIEW ---------- */

function setAuthMode(mode) {
  state.authMode = mode;

  const isRegister = mode === "register";

  $("#loginTab").classList.toggle("active", !isRegister);
  $("#registerTab").classList.toggle("active", isRegister);

  $("#nameField").classList.toggle("hidden", !isRegister);

  $("#authTitle").textContent = isRegister
    ? "নতুন অ্যাকাউন্ট তৈরি করুন"
    : "অ্যাকাউন্টে প্রবেশ করুন";

  $("#authIntro").textContent = isRegister
    ? "আপনার তথ্য দিয়ে RS PAY অ্যাকাউন্ট তৈরি করুন।"
    : "মোবাইল নম্বর ও পাসওয়ার্ড দিয়ে লগইন করুন।";

  $("#authSubmit").textContent = isRegister
    ? "রেজিস্ট্রেশন করুন"
    : "লগইন করুন";

  $("#passwordInput").setAttribute(
    "autocomplete",
    isRegister ? "new-password" : "current-password"
  );

  showMessage($("#authMessage"), "");
}

function showAuth() {
  $("#authView").classList.remove("hidden");
  $("#appView").classList.add("hidden");
}

function showApp() {
  $("#authView").classList.add("hidden");
  $("#appView").classList.remove("hidden");

  updateAccountUI();
  openTab("home");
}

/* ---------- AUTH SUBMIT ---------- */

$("#loginTab").addEventListener("click", () => {
  setAuthMode("login");
});

$("#registerTab").addEventListener("click", () => {
  setAuthMode("register");
});

$("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const isRegister = state.authMode === "register";

  const name = $("#nameInput").value.trim();
  const phone = $("#phoneInput").value.trim();
  const password = $("#passwordInput").value;

  if (isRegister && !name) {
    showMessage($("#authMessage"), "আপনার নাম লিখুন।");
    return;
  }

  if (!phone) {
    showMessage($("#authMessage"), "মোবাইল নম্বর লিখুন।");
    return;
  }

  if (password.length < 10) {
    showMessage(
      $("#authMessage"),
      "পাসওয়ার্ড কমপক্ষে ১০ অক্ষরের হতে হবে।"
    );
    return;
  }

  const button = $("#authSubmit");

  setButtonLoading(button, true, isRegister
    ? "রেজিস্ট্রেশন করুন"
    : "লগইন করুন"
  );

  showMessage($("#authMessage"), "");

  try {
    const result = await apiRequest(
      isRegister ? API.register : API.login,
      {
        method: "POST",
        body: JSON.stringify(
          isRegister
            ? { name, phone, password }
            : { phone, password }
        )
      }
    );

    state.user = result.user || result.data?.user || null;

    if (!state.user) {
      throw new Error(
        "সার্ভার থেকে ইউজার তথ্য পাওয়া যায়নি। API response পরীক্ষা করুন।"
      );
    }

    $("#passwordInput").value = "";
    $("#nameInput").value = "";

    showApp();
    await loadServicesAndBanners();

  } catch (error) {
    showMessage(
      $("#authMessage"),
      error.message || "লগইন করা যায়নি। আবার চেষ্টা করুন।"
    );
  } finally {
    setButtonLoading(
      button,
      false,
      isRegister ? "রেজিস্ট্রেশন করুন" : "লগইন করুন"
    );
  }
});

/* ---------- SESSION RESTORE ---------- */

async function restoreSession() {
  try {
    const result = await apiRequest(API.me);

    state.user = result.user || result.data?.user || null;

    if (state.user) {
      showApp();
      await loadServicesAndBanners();
      return;
    }

  } catch (error) {
    console.info("No active session:", error.message);
  }

  showAuth();
}

/* ---------- NAVIGATION ---------- */

const tabPanels = {
  home: "homePanel",
  categories: "categoriesPanel",
  account: "accountPanel",
  balance: "balancePanel",
  deposits: "depositsPanel",
  history: "historyPanel"
};

function openTab(tab) {
  if (!tabPanels[tab]) {
    tab = "home";
  }

  state.activeTab = tab;

  Object.entries(tabPanels).forEach(([key, panelId]) => {
    const panel = document.getElementById(panelId);

    if (panel) {
      panel.classList.toggle("hidden", key !== tab);
    }
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.tab === tab
    );
  });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    openTab(button.dataset.tab);
  });
});

document.querySelectorAll("[data-open-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    openTab(button.dataset.openTab);
  });
});

$("#headerAccountBtn").addEventListener("click", () => {
  if (state.user) {
    openTab("account");
  }
});

/* ---------- USER PROFILE ---------- */

function updateAccountUI() {
  const user = state.user || {};

  const name = user.name || user.fullName || "User";
  const phone = user.phone || user.mobile || "";

  $("#welcomeName").textContent = name;
  $("#accountName").textContent = name;
  $("#accountPhone").textContent = phone;
  $("#profileName").value = name;
  $("#profilePhone").value = phone;

  const initial = getInitial(name);

  $("#accountAvatar").textContent = initial;

  const savedImage = localStorage.getItem("rs_pay_profile_image");

  if (savedImage) {
    setAvatarImage(savedImage);
  }

  $("#year").textContent = new Date().getFullYear();
}

function setAvatarImage(imageData) {
  const avatar = $("#accountAvatar");

  avatar.innerHTML = "";

  const image = document.createElement("img");
  image.src = imageData;
  image.alt = "Profile image";

  avatar.appendChild(image);
}

/* ---------- PROFILE UPDATE ---------- */

$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = $("#profileName").value.trim();

  if (!name) {
    showMessage($("#profileMessage"), "নাম লিখুন।");
    return;
  }

  const button = $("#profileForm button");

  button.disabled = true;
  button.textContent = "সংরক্ষণ হচ্ছে...";

  try {
    const result = await apiRequest(API.profile, {
      method: "PUT",
      body: JSON.stringify({ name })
    });

    state.user = result.user || result.data?.user || {
      ...state.user,
      name
    };

    updateAccountUI();

    showMessage(
      $("#profileMessage"),
      "প্রোফাইলের নাম আপডেট হয়েছে।",
      true
    );

  } catch (error) {
    showMessage(
      $("#profileMessage"),
      error.message || "প্রোফাইল আপডেট করা যায়নি।"
    );
  } finally {
    button.disabled = false;
    button.textContent = "নাম সংরক্ষণ করুন";
  }
});

/* ---------- PROFILE IMAGE ---------- */

$("#profilePhoto").addEventListener("change", (event) => {
  const file = event.target.files?.[0];

  if (!file) return;

  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];

  if (!allowedTypes.includes(file.type)) {
    showMessage(
      $("#photoMessage"),
      "শুধু JPG, PNG অথবা WEBP ছবি ব্যবহার করুন।"
    );
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    showMessage(
      $("#photoMessage"),
      "ছবির সাইজ ২ MB-এর কম হতে হবে।"
    );
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    try {
      const imageData = reader.result;

      localStorage.setItem(
        "rs_pay_profile_image",
        imageData
      );

      setAvatarImage(imageData);

      showMessage(
        $("#photoMessage"),
        "ছবি এই ডিভাইসে সংরক্ষণ হয়েছে।",
        true
      );

    } catch {
      showMessage(
        $("#photoMessage"),
        "ছবি সংরক্ষণ করা যায়নি। ছোট ছবি ব্যবহার করুন।"
      );
    }
  };

  reader.onerror = () => {
    showMessage(
      $("#photoMessage"),
      "ছবি পড়া যায়নি। আবার চেষ্টা করুন।"
    );
  };

  reader.readAsDataURL(file);
});

/* ---------- THEME COLOR ---------- */

document.querySelectorAll("[data-theme]").forEach((button) => {
  button.addEventListener("click", () => {
    const color = button.dataset.theme;

    document.documentElement.style.setProperty(
      "--primary",
      color
    );

    document.documentElement.style.setProperty(
      "--primary-light",
      color
    );

    localStorage.setItem("rs_pay_theme", color);

    document.querySelectorAll("[data-theme]").forEach((item) => {
      item.classList.toggle("selected", item === button);
    });
  });
});

function restoreTheme() {
  const savedColor = localStorage.getItem("rs_pay_theme");

  if (!savedColor) return;

  document.documentElement.style.setProperty(
    "--primary",
    savedColor
  );

  document.documentElement.style.setProperty(
    "--primary-light",
    savedColor
  );

  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.classList.toggle(
      "selected",
      button.dataset.theme === savedColor
    );
  });
}

/* ---------- LOGOUT ---------- */

$("#logoutBtn").addEventListener("click", async () => {
  const button = $("#logoutBtn");

  button.disabled = true;
  button.textContent = "লগআউট হচ্ছে...";

  try {
    await apiRequest(API.logout, {
      method: "POST",
      body: JSON.stringify({})
    });

  } catch (error) {
    console.warn("Logout request:", error.message);
  }

  state.user = null;
  state.services = [];
  state.banners = [];

  showAuth();
  setAuthMode("login");

  button.disabled = false;
  button.textContent = "লগআউট";
});

/* ---------- SERVICES ---------- */

function getServiceList(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.services)) return result.services;
  if (Array.isArray(result.data)) return result.data;
  if (Array.isArray(result.data?.services)) return result.data.services;

  return [];
}

function getCategoryName(service) {
  return (
    service.categoryName ||
    service.category ||
    service.group ||
    "অন্যান্য সার্ভিস"
  );
}

function getServiceIcon(service) {
  return service.icon || "✦";
}

function isServiceEnabled(service) {
  return service.enabled !== false &&
    service.active !== false;
}

async function loadServicesAndBanners() {
  await Promise.allSettled([
    loadServices(),
    loadBanners()
  ]);
}

async function loadServices() {
  const homeGrid = $("#homeCategoryGrid");
  const allCategories = $("#allCategories");

  try {
    const result = await apiRequest(API.services);

    state.services = getServiceList(result)
      .filter(isServiceEnabled);

    renderHomeCategories();
    renderAllCategories();

  } catch (error) {
    console.error("Services load error:", error);

    homeGrid.innerHTML =
      '<div class="loading-card">সার্ভিস লোড করা যায়নি। সার্ভার API পরীক্ষা করুন।</div>';

    allCategories.innerHTML =
      '<div class="loading-card">ক্যাটাগরি লোড করা যায়নি।</div>';
  }
}

function renderHomeCategories() {
  const container = $("#homeCategoryGrid");

  const categories = [];

  state.services.forEach((service) => {
    const name = getCategoryName(service);

    if (!categories.includes(name)) {
      categories.push(name);
    }
  });

  if (!categories.length) {
    container.innerHTML =
      '<div class="loading-card">এখনো কোনো সক্রিয় সার্ভিস পাওয়া যায়নি।</div>';
    return;
  }

  container.innerHTML = categories.map((name) => {
    const count = state.services.filter(
      (service) => getCategoryName(service) === name
    ).length;

    const firstService = state.services.find(
      (service) => getCategoryName(service) === name
    );

    return `
      <article class="category-card">
        <div class="category-icon">
          ${escapeHTML(getServiceIcon(firstService || {}))}
        </div>

        <h3>${escapeHTML(name)}</h3>

        <p>${count}টি সার্ভিস</p>
      </article>
    `;
  }).join("");
}

function renderAllCategories() {
  const container = $("#allCategories");

  const grouped = {};

  state.services.forEach((service) => {
    const category = getCategoryName(service);

    if (!grouped[category]) {
      grouped[category] = [];
    }

    grouped[category].push(service);
  });

  const names = Object.keys(grouped);

  if (!names.length) {
    container.innerHTML =
      '<div class="loading-card">কোনো সক্রিয় ক্যাটাগরি পাওয়া যায়নি।</div>';
    return;
  }

  container.innerHTML = names.map((category) => {
    const servicesHTML = grouped[category].map((service) => {
      const name = service.name || service.title || "সার্ভিস";
      const description = service.description || "বিস্তারিত তথ্য পাওয়া যায়নি।";

      return `
        <article class="service-item">
          <h3>${escapeHTML(service.icon || "✦")} ${escapeHTML(name)}</h3>
          <p>${escapeHTML(description)}</p>
        </article>
      `;
    }).join("");

    return `
      <section class="category-group">
        <h2>${escapeHTML(category)}</h2>
        <div class="service-grid">
          ${servicesHTML}
        </div>
      </section>
    `;
  }).join("");
}

/* ---------- ADMIN BANNERS ---------- */

async function loadBanners() {
  const container = $("#homeBanners");

  try {
    const result = await apiRequest(API.content);

    const content = result.content || result.data || result;
    const banners = Array.isArray(content.banners)
      ? content.banners
      : [];

    state.banners = banners.filter((banner) => {
      return banner.enabled !== false &&
        banner.active !== false;
    });

    renderBanners();

  } catch (error) {
    console.info("Banner content unavailable:", error.message);
    container.innerHTML = "";
  }
}

function renderBanners() {
  const container = $("#homeBanners");

  if (!state.banners.length) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = state.banners.map((banner) => {
    const title = banner.title || "";
    const description = banner.description || "";
    const imageUrl = banner.imageUrl || banner.image || "";

    return `
      <article class="managed-banner">
        ${title ? `<h3>${escapeHTML(title)}</h3>` : ""}
        ${description ? `<p>${escapeHTML(description)}</p>` : ""}
        ${
          imageUrl
            ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(title || "RS PAY banner")}" loading="lazy">`
            : ""
        }
      </article>
    `;
  }).join("");
}

/* ---------- START APPLICATION ---------- */

document.addEventListener("DOMContentLoaded", () => {
  restoreTheme();
  restoreSession();
});
