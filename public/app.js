
const $ = (selector) => document.querySelector(selector);

const landingView = $("#landingView");
const dashboardView = $("#dashboardView");
const modal = $("#authModal");
const form = $("#authForm");

let authMode = "login";

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

function showDashboard(user) {
  landingView.classList.add("hidden");
  dashboardView.classList.remove("hidden");

  const name = user.name || "User";
  const phone = user.phone || "মোবাইল নম্বর যোগ করা হয়নি";
  const initial = name.trim().charAt(0).toUpperCase();

  $("#welcomeName").textContent = name;
  $("#sideName").textContent = name;
  $("#sideEmail").textContent = phone;
  $("#userInitial").textContent = initial;
  $("#accountInitial").textContent = initial;
  $("#accountDisplayName").textContent = name;
  $("#accountDisplayEmail").textContent = phone;
  $("#profileName").value = name;
  $("#profileEmail").value = user.phone || "";

  closeModal();
  showDashTab("overview");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showLanding() {
  dashboardView.classList.add("hidden");
  landingView.classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showDashTab(tab) {
  const overview = $("#overview");
  const account = $("#accountPanel");

  overview.classList.toggle("hidden", tab === "account");
  account.classList.toggle("hidden", tab !== "account");

  document.querySelectorAll("[data-dash-tab]").forEach(link => {
    link.classList.toggle("active", link.dataset.dashTab === tab);
  });
}

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

// Login এবং Register বাটন
document.querySelectorAll("[data-open]").forEach(button => {
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

// Registration এবং Login
form.addEventListener("submit", async event => {
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
    const result = await api(
      `/api/auth/${authMode === "register" ? "register" : "login"}`,
      {
        method: "POST",
        body: JSON.stringify(payload)
      }
    );

    form.reset();
    showDashboard(result.user);

  } catch (error) {
    message.textContent = error.message;

  } finally {
    submit.disabled = false;
  }
});

// Logout
$("#logoutBtn").addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", {
      method: "POST",
      body: "{}"
    });
  } catch (error) {
    console.error(error);
  }

  showLanding();
});

// Mobile menu
$("#mobileMenu").addEventListener("click", () => {
  $(".topbar").classList.toggle("mobile-open");
});

// আগের Login Session পুনরুদ্ধার
async function restoreSession() {
  try {
    const result = await api("/api/auth/me");
    showDashboard(result.user);
  } catch {
    showLanding();
  }
}

// নিরাপদ Text
function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

// Admin Panel থেকে পাঠানো Website Content
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
      $("#landingCta").innerHTML =
        `${safeText(landing.buttonText)} <span>→</span>`;

      $("#howCta").textContent = `${landing.buttonText} →`;
    }

    const banners = contentResult.banners || [];

    function renderBanners(slot, selector) {
      const host = $(selector);
      if (!host) return;

      const selected = banners.filter(
        banner => banner.slot === slot && banner.enabled
      );

      if (!selected.length) {
        host.classList.add("hidden");
        host.innerHTML = "";
        return;
      }

      host.classList.remove("hidden");

      host.innerHTML = selected.map(banner => `
        <article class="managed-banner">
          <div>
            <span class="section-kicker">RS PAY UPDATE</span>
            <h3>${safeText(banner.title)}</h3>
            <p>${safeText(banner.description)}</p>

            ${banner.linkUrl ? `
              <a class="btn btn-gold"
                 href="${safeText(banner.linkUrl)}"
                 target="_blank"
                 rel="noopener noreferrer">
                ${safeText(banner.buttonText || "বিস্তারিত দেখুন")} ↗
              </a>
            ` : ""}
          </div>

          ${banner.imageUrl ? `
            <img src="${safeText(banner.imageUrl)}"
                 alt="${safeText(banner.title)}"
                 loading="lazy">
          ` : ""}
        </article>
      `).join("");
    }

    renderBanners("landing_top", "#landingTopBanners");
    renderBanners("landing_middle", "#landingMiddleBanners");
    renderBanners("dashboard_home", "#dashboardBanners");

    const services = (serviceResult.services || [])
      .filter(item => item.enabled !== false);

    const landingGrid = $("#landingServiceGrid");

    if (landingGrid && services.length) {
      landingGrid.innerHTML = services.map(item => `
        <article class="service-card managed-service-card">
          <div class="service-icon">${safeText(item.icon || "◇")}</div>
          <h3>${safeText(item.name)}</h3>
          <p>${safeText(item.description || "সেবা বিভাগ")}</p>
          <span class="card-arrow">↗</span>
        </article>
      `).join("");
    }

    const dashboardGrid = $("#dashboardServiceGrid");

    if (dashboardGrid && services.length) {
      dashboardGrid.innerHTML = services.map(item => `
        <div>
          ${safeText(item.icon || "◇")}
          <b>${safeText(item.name)}</b>
          <small>সেবা বিভাগ</small>
        </div>
      `).join("");
    }

  } catch (error) {
    console.warn(
      "RS PAY content load error:",
      error.message
    );
  }
}

// Dashboard Tabs
document.querySelectorAll("[data-dash-tab]").forEach(link => {
  link.addEventListener("click", event => {
    event.preventDefault();
    showDashTab(link.dataset.dashTab);
  });
});

// Account Profile Update
$("#profileForm").addEventListener("submit", async event => {
  event.preventDefault();

  const message = $("#profileMessage");
  const button = event.currentTarget.querySelector(
    'button[type="submit"]'
  );

  button.disabled = true;
  message.textContent = "সংরক্ষণ হচ্ছে…";

  try {
    const result = await api("/api/account/profile", {
      method: "PUT",
      body: JSON.stringify({
        name: $("#profileName").value.trim()
      })
    });

    const name = result.user.name;
    const initial = name.trim().charAt(0).toUpperCase();

    $("#welcomeName").textContent = name;
    $("#sideName").textContent = name;
    $("#accountDisplayName").textContent = name;
    $("#profileName").value = name;
    $("#userInitial").textContent = initial;
    $("#accountInitial").textContent = initial;

    message.textContent = "প্রোফাইল আপডেট হয়েছে।";

  } catch (error) {
    message.textContent = error.message;

  } finally {
    button.disabled = false;
  }
});

// Website Content Load
loadManagedContent();

// Existing Login Session Check
restoreSession();
