const $ = (selector) => document.querySelector(selector);

const landingView = $("#landingView");
const dashboardView = $("#dashboardView");
const modal = $("#authModal");
const form = $("#authForm");

let authMode = "login";

// Login / Registration mode
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

// Open modal
function openModal(mode) {
  setMode(mode);
  modal.classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

// Close modal
function closeModal() {
  modal.classList.add("hidden");
  document.body.style.overflow = "";
}

// Show dashboard
function showDashboard(user) {
  landingView.classList.add("hidden");
  dashboardView.classList.remove("hidden");

  $("#welcomeName").textContent = user.name;
  $("#sideName").textContent = user.name;
  $("#sideEmail").textContent = user.email;

  $("#userInitial").textContent =
    (user.name || "U").trim().charAt(0).toUpperCase();

  closeModal();

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// Show landing page
function showLanding() {
  dashboardView.classList.add("hidden");
  landingView.classList.remove("hidden");

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

// API request helper
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
    throw new Error(
      data.message || "অনুরোধটি সম্পন্ন হয়নি।"
    );
  }

  return data;
}

// Open login and registration
document.querySelectorAll("[data-open]").forEach((button) => {
  button.addEventListener("click", () => {
    openModal(button.dataset.open);
  });
});

// Close modal
$("#closeModal").addEventListener("click", closeModal);

// Switch tabs
$("#loginTab").addEventListener("click", () => {
  setMode("login");
});

$("#registerTab").addEventListener("click", () => {
  setMode("register");
});

// Close modal by clicking outside
modal.addEventListener("click", (event) => {
  if (event.target === modal) {
    closeModal();
  }
});

// Registration and login form
form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = $("#formMessage");
  const submit = $("#submitAuth");

  message.textContent = "অনুগ্রহ করে অপেক্ষা করুন…";
  submit.disabled = true;

  const payload = {
    email: $("#emailInput").value.trim(),
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
  } finally {
    showLanding();
  }
});

// Mobile menu
$("#mobileMenu").addEventListener("click", () => {
  $(".topbar").classList.toggle("mobile-open");
});

// Restore login session after refresh
async function restoreSession() {
  try {
    const result = await api("/api/auth/me");
    showDashboard(result.user);
  } catch {
    showLanding();
  }
}

restoreSession();
