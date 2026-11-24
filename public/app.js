const authScreen = document.getElementById("authScreen");
const appScreen = document.getElementById("appScreen");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");

const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");

const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");

let currentUser = null;

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
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
    throw new Error(data.message || "কোনো সমস্যা হয়েছে।");
  }

  return data;
}

function switchAuth(mode) {
  const isRegister = mode === "register";

  loginForm.classList.toggle("hidden", isRegister);
  registerForm.classList.toggle("hidden", !isRegister);

  loginTab.classList.toggle("active", !isRegister);
  registerTab.classList.toggle("active", isRegister);

  authTitle.textContent = isRegister
    ? "Create Your Account"
    : "Welcome Back!";

  authSubtitle.textContent = isRegister
    ? "নতুন RS PAY অ্যাকাউন্ট তৈরি করুন"
    : "আপনার RS PAY অ্যাকাউন্টে প্রবেশ করুন";
}

loginTab.addEventListener("click", () => switchAuth("login"));
registerTab.addEventListener("click", () => switchAuth("register"));

function initials(name) {
  const words = String(name || "RS").trim().split(/\s+/);
  return words.slice(0, 2).map(word => word[0]).join("").toUpperCase();
}

function setTheme(theme) {
  document.body.dataset.theme = theme;

  document.querySelectorAll(".theme-dot").forEach(button => {
    button.classList.toggle(
      "selected",
      button.dataset.theme === theme
    );
  });
}

function showApp(user) {
  currentUser = user;

  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  document.getElementById("homeName").textContent = user.name;
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profilePhone").textContent = user.phone;
  document.getElementById("editName").value = user.name;

  const userInitials = initials(user.name);

  document.getElementById("profileAvatar").textContent = userInitials;
  document.getElementById("headerProfile").textContent = userInitials;

  document.getElementById("phoneStatus").textContent =
    user.phoneVerified ? "Verified" : "Not Verified";

  document.getElementById("phoneStatus").className =
    user.phoneVerified ? "verified" : "pending";

  document.getElementById("accountStatus").textContent =
    user.accountVerified ? "Verified" : "Not Verified";

  document.getElementById("accountStatus").className =
    user.accountVerified ? "verified" : "pending";

  setTheme(user.theme || "purple");
  openPage("homePage");
}

function openPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.add("hidden");
  });

  document.getElementById(pageId).classList.remove("hidden");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageId
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Navigation
document.querySelectorAll(".nav-item").forEach(button => {
  button.addEventListener("click", () => {
    openPage(button.dataset.page);
  });
});

document.getElementById("headerProfile").addEventListener("click", () => {
  openPage("accountPage");
});

// Registration
registerForm.addEventListener("submit", async event => {
  event.preventDefault();

  const formData = new FormData(registerForm);

  const name = formData.get("name").trim();
  const phone = formData.get("phone").trim();
  const password = formData.get("password");
  const confirmPassword = formData.get("confirmPassword");

  if (password !== confirmPassword) {
    showToast("দুটি পাসওয়ার্ড মিলছে না।");
    return;
  }

  if (password.length < 8) {
    showToast("পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের দিন।");
    return;
  }

  const button = registerForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "অ্যাকাউন্ট তৈরি হচ্ছে...";

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, phone, password })
    });

    registerForm.reset();
    showApp(data.user);
    showToast(data.message);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'অ্যাকাউন্ট তৈরি করুন <span>→</span>';
  }
});

// Login
loginForm.addEventListener("submit", async event => {
  event.preventDefault();

  const formData = new FormData(loginForm);

  const phone = formData.get("phone").trim();
  const password = formData.get("password");

  const button = loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Login হচ্ছে...";

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ phone, password })
    });

    loginForm.reset();
    showApp(data.user);
    showToast(data.message);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.innerHTML = 'Login করুন <span>→</span>';
  }
});

// Update name
document.getElementById("saveProfile").addEventListener("click", async () => {
  const name = document.getElementById("editName").value.trim();

  try {
    const data = await apiRequest("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ name })
    });

    showApp(data.user);
    openPage("accountPage");
    showToast("আপনার নাম আপডেট হয়েছে।");
  } catch (error) {
    showToast(error.message);
  }
});

// Change theme
document.querySelectorAll(".theme-dot").forEach(button => {
  button.addEventListener("click", async () => {
    const theme = button.dataset.theme;

    try {
      const data = await apiRequest("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ theme })
      });

      showApp(data.user);
      openPage("accountPage");
      showToast("আপনার নতুন থিম সংরক্ষণ হয়েছে।");
    } catch (error) {
      showToast(error.message);
    }
  });
});

// Verification information
document.getElementById("verifyButton").addEventListener("click", async () => {
  try {
    await apiRequest("/api/verification/request", {
      method: "POST",
      body: JSON.stringify({})
    });
  } catch (error) {
    showToast(error.message);
  }
});

// Services
document.querySelectorAll("[data-service]").forEach(button => {
  button.addEventListener("click", () => {
    const service = button.dataset.service;

    showToast(
      service + " সার্ভিস এখনো পেমেন্ট API-এর সঙ্গে সংযুক্ত নয়।"
    );
  });
});

// Logout
document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await apiRequest("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({})
    });

    currentUser = null;
    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
    switchAuth("login");

    showToast("আপনি Logout করেছেন।");
  } catch (error) {
    showToast(error.message);
  }
});

// Check existing login session
async function checkSession() {
  try {
    const data = await apiRequest("/api/auth/me");
    showApp(data.user);
  } catch (error) {
    authScreen.classList.remove("hidden");
    appScreen.classList.add("hidden");
  }
}

checkSession();
