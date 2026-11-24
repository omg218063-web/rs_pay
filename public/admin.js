const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

const loginScreen = $("#loginScreen");
const adminApp = $("#adminApp");
const toast = $("#toast");

let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

async function api(url, options = {}) {
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

function showAdmin() {
  loginScreen.classList.add("hidden");
  adminApp.classList.remove("hidden");
  loadDashboard();
}

function showLogin() {
  adminApp.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function openAdminPage(pageId) {
  $$(".admin-page").forEach(page => page.classList.add("hidden"));

  const page = document.getElementById(pageId);
  if (page) page.classList.remove("hidden");

  $$(".side-link[data-page]").forEach(button => {
    button.classList.toggle("active", button.dataset.page === pageId);
  });

  const headings = {
    dashboardPage: "Dashboard",
    bannersPage: "Banner Manager",
    websitePage: "Website Editor",
    usersPage: "User Manager",
    walletPage: "Wallet Overview"
  };

  $("#pageHeading").textContent = headings[pageId] || "Admin Panel";
  $("#sidebar").classList.remove("open");

  if (pageId === "bannersPage") loadBanners();
  if (pageId === "websitePage") loadWebsite();
  if (pageId === "usersPage") loadUsers();
}

$$("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    openAdminPage(button.dataset.page);
  });
});

$("#menuButton").addEventListener("click", () => {
  $("#sidebar").classList.toggle("open");
});

// ADMIN LOGIN
$("#adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = event.submitter;
  const password = $("#adminPassword").value;

  if (!password) {
    showToast("Admin Password দিন।");
    return;
  }

  button.disabled = true;
  button.textContent = "Checking...";

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    });

    $("#adminPassword").value = "";
    showAdmin();
    showToast("Admin Login সফল হয়েছে।");

  } catch (error) {
    showToast(error.message);

  } finally {
    button.disabled = false;
    button.innerHTML = 'Secure Login <span>→</span>';
  }
});

// CHECK EXISTING ADMIN SESSION
async function checkAdminSession() {
  try {
    await api("/api/admin/me");
    showAdmin();
  } catch {
    showLogin();
  }
}

// DASHBOARD
async function loadDashboard() {
  try {
    const data = await api("/api/admin/stats");
    const stats = data.stats;

    $("#totalUsers").textContent = stats.totalUsers ?? "—";
    $("#verifiedUsers").textContent = stats.verifiedUsers ?? "—";
    $("#recentUsers").textContent = stats.recentUsers ?? "—";
    $("#totalOrders").textContent =
      stats.orders === null ? "Not Connected" : stats.orders;

  } catch (error) {
    showToast(error.message);
  }
}

// BANNER MANAGER
function updateBannerPreview(card) {
  const url = $('[data-field="imageUrl"]', card).value.trim();
  const img = $(".banner-preview", card);

  img.removeAttribute("src");

  if (url) {
    img.onerror = () => {
      img.removeAttribute("src");
      showToast("ছবির লিংকটি কাজ করছে না।");
    };
    img.src = url;
  }
}

$$(".banner-editor").forEach(card => {
  $('[data-field="imageUrl"]', card).addEventListener("input", () => {
    updateBannerPreview(card);
  });
});

async function loadBanners() {
  try {
    const data = await api("/api/admin/banners");

    $$(".banner-editor").forEach(card => {
      const banner = data.banners.find(
        item => item.slot === card.dataset.slot
      );

      if (!banner) {
        $('[data-field="title"]', card).value = "";
        $('[data-field="description"]', card).value = "";
        $('[data-field="imageUrl"]', card).value = "";
        $('[data-field="buttonText"]', card).value = "";
        $('[data-field="linkUrl"]', card).value = "";
        $('[data-field="enabled"]', card).checked = false;
        updateBannerPreview(card);
        return;
      }

      $('[data-field="title"]', card).value = banner.title || "";
      $('[data-field="description"]', card).value = banner.description || "";
      $('[data-field="imageUrl"]', card).value = banner.imageUrl || "";
      $('[data-field="buttonText"]', card).value = banner.buttonText || "";
      $('[data-field="linkUrl"]', card).value = banner.linkUrl || "";
      $('[data-field="enabled"]', card).checked = !!banner.enabled;

      updateBannerPreview(card);
    });

  } catch (error) {
    showToast(error.message);
  }
}

$$(".save-banner").forEach(button => {
  button.addEventListener("click", async () => {
    const card = button.closest(".banner-editor");
    const slot = card.dataset.slot;

    const payload = {
      title: $('[data-field="title"]', card).value.trim(),
      description: $('[data-field="description"]', card).value.trim(),
      imageUrl: $('[data-field="imageUrl"]', card).value.trim(),
      buttonText: $('[data-field="buttonText"]', card).value.trim(),
      linkUrl: $('[data-field="linkUrl"]', card).value.trim(),
      enabled: $('[data-field="enabled"]', card).checked
    };

    if (payload.imageUrl && !isValidHttpUrl(payload.imageUrl)) {
      showToast("সঠিক Image URL দিন।");
      return;
    }

    if (payload.linkUrl && !isValidHttpUrl(payload.linkUrl)) {
      showToast("সঠিক Click Link দিন।");
      return;
    }

    button.disabled = true;
    button.textContent = "Saving...";

    try {
      await api("/api/admin/banners/" + slot, {
        method: "PUT",
        body: JSON.stringify(payload)
      });

      showToast("Banner সংরক্ষণ হয়েছে।");

    } catch (error) {
      showToast(error.message);

    } finally {
      button.disabled = false;
      button.textContent = "Save Banner";
    }
  });
});

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

// WEBSITE EDITOR
async function loadWebsite() {
  try {
    const data = await api("/api/admin/site-content");
    const content = data.content;

    $("#landingTitle").value = content.landing?.title || "";
    $("#landingSubtitle").value = content.landing?.subtitle || "";
    $("#landingButton").value = content.landing?.buttonText || "";
    $("#landingButtonLink").value = content.landing?.buttonLink || "";
    $("#primaryColor").value = content.colors?.primary || "#7138d5";
    $("#secondaryColor").value = content.colors?.secondary || "#d7ad55";

  } catch (error) {
    showToast(error.message);
  }
}

$("#saveWebsite").addEventListener("click", async () => {
  const button = $("#saveWebsite");
  const buttonLink = $("#landingButtonLink").value.trim();

  if (buttonLink && !isValidHttpUrl(buttonLink)) {
    showToast("সঠিক Button Link দিন।");
    return;
  }

  const primary = $("#primaryColor").value;
  const secondary = $("#secondaryColor").value;

  const payload = {
    landing: {
      title: $("#landingTitle").value.trim(),
      subtitle: $("#landingSubtitle").value.trim(),
      buttonText: $("#landingButton").value.trim(),
      buttonLink
    },
    colors: {
      primary,
      secondary
    }
  };

  button.disabled = true;
  button.textContent = "Saving...";

  try {
    await api("/api/admin/site-content", {
      method: "PUT",
      body: JSON.stringify(payload)
    });

    showToast("Website Settings সংরক্ষণ হয়েছে।");

  } catch (error) {
    showToast(error.message);

  } finally {
    button.disabled = false;
    button.textContent = "Save Website Settings";
  }
});

// USER MANAGER
async function loadUsers() {
  const tbody = $("#usersTable");
  tbody.innerHTML = '<tr><td colspan="4">তথ্য লোড হচ্ছে...</td></tr>';

  try {
    const data = await api("/api/admin/users");

    if (!data.users.length) {
      tbody.innerHTML = '<tr><td colspan="4">এখনো কোনো ইউজার নেই।</td></tr>';
      return;
    }

    tbody.innerHTML = "";

    data.users.forEach(user => {
      const row = document.createElement("tr");

      const name = document.createElement("td");
      name.textContent = user.name;

      const phone = document.createElement("td");
      phone.textContent = user.phone;

      const status = document.createElement("td");
      status.textContent = user.accountVerified ? "Verified" : "Not Verified";
      status.className = user.accountVerified ? "table-status" : "";

      const date = document.createElement("td");
      date.textContent = user.createdAt
        ? new Date(user.createdAt).toLocaleDateString()
        : "—";

      row.append(name, phone, status, date);
      tbody.appendChild(row);
    });

  } catch (error) {
    tbody.innerHTML = "";
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = error.message;
    row.appendChild(cell);
    tbody.appendChild(row);
  }
}

$("#refreshUsers").addEventListener("click", loadUsers);

// LOGOUT
$("#logoutButton").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", {
      method: "POST",
      body: JSON.stringify({})
    });

    showLogin();
    showToast("Admin Logout হয়েছে।");

  } catch (error) {
    showToast(error.message);
  }
});

// START
checkAdminSession();
