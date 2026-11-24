const admin$ = selector => document.querySelector(selector);

async function adminApi(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

function adminMessage(message) {
  admin$("#loginMessage").textContent = message;
}

function escapeAdmin(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#039;"
  })[char]);
}

function showAdminDashboard() {
  admin$("#adminLogin").classList.add("hidden");
  admin$("#adminDashboard").classList.remove("hidden");
  loadAdminData();
}

async function checkAdminSession() {
  try {
    await adminApi("/api/admin/me");
    showAdminDashboard();
  } catch {
    admin$("#adminLogin").classList.remove("hidden");
    admin$("#adminDashboard").classList.add("hidden");
  }
}

admin$("#adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await adminApi("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: admin$("#adminPassword").value
      })
    });

    admin$("#adminPassword").value = "";
    adminMessage("");
    showAdminDashboard();
  } catch (error) {
    adminMessage(error.message);
  }
});

admin$("#adminLogout").addEventListener("click", async () => {
  try {
    await adminApi("/api/admin/logout", {
      method: "POST",
      body: JSON.stringify({})
    });
  } finally {
    admin$("#adminDashboard").classList.add("hidden");
    admin$("#adminLogin").classList.remove("hidden");
    adminMessage("You have logged out.");
  }
});

async function loadStats() {
  const data = await adminApi("/api/admin/stats");
  admin$("#totalUsers").textContent = data.totalUsers;
  admin$("#verifiedUsers").textContent = data.verifiedUsers;
  admin$("#recentUsers").textContent = data.recentUsers;
}

async function loadContent() {
  const data = await adminApi("/api/admin/site-content");
  const content = data.content || {};
  const landing = content.landing || {};
  const colors = content.colors || {};

  admin$("#siteTitle").value = landing.title || "";
  admin$("#siteSubtitle").value = landing.subtitle || "";
  admin$("#siteButtonText").value = landing.buttonText || "";
  admin$("#siteButtonLink").value = landing.buttonLink || "#register";
  admin$("#primaryColor").value = colors.primary || "#7547c9";
  admin$("#secondaryColor").value = colors.secondary || "#eac16d";
}

async function loadBanners() {
  const data = await adminApi("/api/admin/banners");
  const banners = data.banners || [];

  admin$("#bannerList").innerHTML = banners.map(banner => `
    <div class="banner-row">
      <strong>${escapeAdmin(banner.slot)}</strong>
      <p>${escapeAdmin(banner.title)}</p>
      <button type="button" data-edit-slot="${escapeAdmin(banner.slot)}">
        Load this banner into editor
      </button>
    </div>
  `).join("") || "<p>No banners saved yet.</p>";

  admin$("#bannerList").querySelectorAll("[data-edit-slot]").forEach(button => {
    button.addEventListener("click", () => {
      const selected = banners.find(item => item.slot === button.dataset.editSlot);
      if (!selected) return;

      admin$("#bannerSlot").value = selected.slot;
      admin$("#bannerTitle").value = selected.title || "";
      admin$("#bannerDescription").value = selected.description || "";
      admin$("#bannerImage").value = selected.imageUrl || "";
      admin$("#bannerLink").value = selected.linkUrl || "";
      admin$("#bannerButton").value = selected.buttonText || "";
      admin$("#bannerEnabled").checked = selected.enabled === true;

      admin$("#bannerForm").scrollIntoView({ behavior: "smooth" });
    });
  });
}

async function loadUsers() {
  const data = await adminApi("/api/admin/users");
  const users = data.users || [];

  admin$("#usersTable").innerHTML = users.map(user => `
    <tr>
      <td>${escapeAdmin(user.name)}</td>
      <td>${escapeAdmin(user.phone)}</td>
      <td>${escapeAdmin(user.verificationStatus)}</td>
      <td>${new Date(user.createdAt).toLocaleDateString()}</td>
    </tr>
  `).join("") || '<tr><td colspan="4">No users found</td></tr>';
}

async function loadAdminData() {
  try {
    await Promise.all([loadStats(), loadContent(), loadBanners(), loadUsers()]);
  } catch (error) {
    adminMessage(error.message);
  }
}

admin$("#contentForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await adminApi("/api/admin/site-content", {
      method: "PUT",
      body: JSON.stringify({
        landing: {
          title: admin$("#siteTitle").value,
          subtitle: admin$("#siteSubtitle").value,
          buttonText: admin$("#siteButtonText").value,
          buttonLink: admin$("#siteButtonLink").value
        },
        colors: {
          primary: admin$("#primaryColor").value,
          secondary: admin$("#secondaryColor").value
        }
      })
    });

    alert("Website settings saved.");
  } catch (error) {
    alert(error.message);
  }
});

admin$("#bannerForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    const slot = admin$("#bannerSlot").value;

    await adminApi("/api/admin/banners/" + encodeURIComponent(slot), {
      method: "PUT",
      body: JSON.stringify({
        title: admin$("#bannerTitle").value,
        description: admin$("#bannerDescription").value,
        imageUrl: admin$("#bannerImage").value,
        linkUrl: admin$("#bannerLink").value,
        buttonText: admin$("#bannerButton").value,
        enabled: admin$("#bannerEnabled").checked
      })
    });

    alert("Banner saved.");
    await loadBanners();
  } catch (error) {
    alert(error.message);
  }
});

admin$("#refreshUsers").addEventListener("click", async () => {
  try {
    await loadUsers();
  } catch (error) {
    alert(error.message);
  }
});

checkAdminSession();
