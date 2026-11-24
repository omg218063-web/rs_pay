const landingScreen = document.getElementById("landingScreen");
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

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
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

// Show landing page
function showLanding() {
  landingScreen.classList.remove("hidden");
  authScreen.classList.add("hidden");
  appScreen.classList.add("hidden");

  window.scrollTo({ top: 0, behavior: "instant" });
}

// Open login or registration
function openAuth(mode = "register") {
  landingScreen.classList.add("hidden");
  appScreen.classList.add("hidden");
  authScreen.classList.remove("hidden");

  switchAuth(mode);

  window.scrollTo({ top: 0, behavior: "instant" });
}

// Back to landing page
document.getElementById("backToLanding").addEventListener("click", () => {
  showLanding();
});

// All Get Started and Login buttons
document.querySelectorAll("[data-open-auth]").forEach(button => {
  button.addEventListener("click", () => {
    openAuth(button.dataset.openAuth);
    document.getElementById("landingNav").classList.remove("open");
  });
});

// Mobile navigation menu
document.getElementById("menuToggle").addEventListener("click", () => {
  document.getElementById("landingNav").classList.toggle("open");
});

// Close mobile menu after selecting a link
document.querySelectorAll(".landing-nav a").forEach(link => {
  link.addEventListener("click", () => {
    document.getElementById("landingNav").classList.remove("open");
  });
});

// Switch between login and registration
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
  return String(name || "RS")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map(word => word[0])
    .join("")
    .toUpperCase();
}

// Theme customization
function setTheme(theme) {
  document.body.dataset.theme = theme;

  document.querySelectorAll(".theme-dot").forEach(button => {
    button.classList.toggle(
      "selected",
      button.dataset.theme === theme
    );
  });
}

// Show dashboard after successful login
function showApp(user) {
  currentUser = user;

  landingScreen.classList.add("hidden");
  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  const userInitials = initials(user.name);

  document.getElementById("homeName").textContent = user.name;
  document.getElementById("profileName").textContent = user.name;
  document.getElementById("profilePhone").textContent = user.phone;
  document.getElementById("editName").value = user.name;

  document.getElementById("profileAvatar").textContent = userInitials;
  document.getElementById("headerProfile").textContent = userInitials;

  updateVerificationStatus(user);

  setTheme(user.theme || "purple");
  openPage("homePage");

  window.scrollTo({ top: 0, behavior: "instant" });
}

function updateVerificationStatus(user) {
  const phoneStatus = document.getElementById("phoneStatus");
  const accountStatus = document.getElementById("accountStatus");

  phoneStatus.textContent = user.phoneVerified
    ? "Verified"
    : "Not Verified";

  phoneStatus.className = user.phoneVerified
    ? "verified"
    : "pending";

  accountStatus.textContent = user.accountVerified
    ? "Verified"
    : "Not Verified";

  accountStatus.className = user.accountVerified
    ? "verified"
    : "pending";
}

// Dashboard navigation
function openPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.add("hidden");
  });

  const target = document.getElementById(pageId);

  if (!target) return;

  target.classList.remove("hidden");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.page === pageId
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

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

  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(
    formData.get("confirmPassword") || ""
  );

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
      body: JSON.stringify({
        name,
        phone,
        password
      })
    });

    registerForm.reset();
    showApp(data.user);
    showToast(data.message || "অ্যাকাউন্ট তৈরি হয়েছে।");

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

  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "");

  const button = loginForm.querySelector("button[type='submit']");
  button.disabled = true;
  button.textContent = "Login হচ্ছে...";

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        phone,
        password
      })
    });

    loginForm.reset();
    showApp(data.user);
    showToast(data.message || "Login সফল হয়েছে।");

  } catch (error) {
    showToast(error.message);

  } finally {
    button.disabled = false;
    button.innerHTML = 'Login করুন <span>→</span>';
  }
});

// Update profile name
document.getElementById("saveProfile").addEventListener("click", async () => {
  const name = document.getElementById("editName").value.trim();

  try {
    const data = await apiRequest("/api/profile", {
      method: "PATCH",
      body: JSON.stringify({ name })
    });

    showApp(data.user);
    openPage("accountPage");
    showToast("প্রোফাইল আপডেট হয়েছে।");

  } catch (error) {
    showToast(error.message);
  }
});

// Save selected theme
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
      showToast("নতুন থিম সংরক্ষণ হয়েছে।");

    } catch (error) {
      showToast(error.message);
    }
  });
});

// Verification details
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

// Service cards
document.querySelectorAll("[data-service]").forEach(button => {
  button.addEventListener("click", () => {
    const service = button.dataset.service;

    showToast(
      service + " সার্ভিসের API এখনো সংযুক্ত করা হয়নি।"
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

    showLanding();
    switchAuth("login");

    showToast("আপনি সফলভাবে Logout করেছেন।");

  } catch (error) {
    showToast(error.message);
  }
});

// Check previous login session
async function checkSession() {
  try {
    const data = await apiRequest("/api/auth/me");
    showApp(data.user);

  } catch (error) {
    showLanding();
  }
}

checkSession();
