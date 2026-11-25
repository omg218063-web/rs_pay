
"use strict";

const $ = id => document.getElementById(id);

let usersCache = [];
let bannersCache = [];
let servicesCache = [];
let bannerPreviewData = "";

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : {
        "Content-Type": "application/json"
      }),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || "অনুরোধ সম্পন্ন হয়নি।");
  }

  return data;
}

function showMessage(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function toast(value) {
  const element = $("adminToast");
  if (!element) return;

  element.textContent = value;
  element.classList.remove("hidden");

  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    element.classList.add("hidden");
  }, 3000);
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function dateText(value) {
  if (!value) return "তথ্য নেই";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "তথ্য নেই";

  return date.toLocaleDateString("bn-BD", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function timeText(value) {
  if (!value) return "কখনো অ্যাক্টিভ হয়নি";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "তথ্য নেই";

  return date.toLocaleString("bn-BD", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function isOnline(user) {
  if (!user.lastSeen) return false;

  const last = new Date(user.lastSeen).getTime();

  return Number.isFinite(last) &&
    Date.now() - last <= 5 * 60 * 1000;
}

/* LOGIN */

async function checkAdmin() {
  try {
    await api("/api/admin/me");
    showDashboard();
  } catch {
    $("adminLogin").classList.remove("hidden");
    $("adminDashboard").classList.add("hidden");
  }
}

function showDashboard() {
  $("adminLogin").classList.add("hidden");
  $("adminDashboard").classList.remove("hidden");

  const date = $("todayDate");
  if (date) {
    date.textContent = new Date().toLocaleDateString("bn-BD");
  }

  loadDashboard();
  loadUsers();
  loadBanners();
  loadServices();
  loadContent();
}

$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("loginButton");
  button.disabled = true;
  button.textContent = "প্রবেশ করা হচ্ছে...";

  showMessage("loginMessage", "");

  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({
        password: $("adminPassword").value
      })
    });

    $("adminPassword").value = "";
    showDashboard();
    toast("অ্যাডমিন প্যানেলে স্বাগতম।");

  } catch (error) {
    showMessage("loginMessage", error.message);
  } finally {
    button.disabled = false;
    button.textContent = "নিরাপদে প্রবেশ করুন";
  }
});

$("adminLogout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", {
      method: "POST",
      body: "{}"
    });
  } catch {}

  $("adminDashboard").classList.add("hidden");
  $("adminLogin").classList.remove("hidden");
  toast("লগআউট সম্পন্ন হয়েছে।");
});

/* NAVIGATION */

function openPanel(panelId) {
  document.querySelectorAll(".admin-panel").forEach(panel => {
    panel.classList.add("hidden");
  });

  const target = $(panelId);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".bottom-nav-item").forEach(button => {
    button.classList.toggle(
      "active",
      button.dataset.panel === panelId
    );
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

document.querySelectorAll(".bottom-nav-item").forEach(button => {
  button.addEventListener("click", () => {
    openPanel(button.dataset.panel);
  });
});

document.querySelectorAll("[data-go]").forEach(button => {
  button.addEventListener("click", () => {
    openPanel(button.dataset.go);
  });
});

/* DASHBOARD */

async function loadDashboard() {
  try {
    const data = await api("/api/admin/stats");

    const total = Number(data.totalUsers || 0);
    const online = Number(data.onlineUsers || 0);
    const offline = Number(data.offlineUsers || 0);

    $("totalUsers").textContent = total.toLocaleString("bn-BD");
    $("onlineUsers").textContent = online.toLocaleString("bn-BD");
    $("offlineUsers").textContent = offline.toLocaleString("bn-BD");

    const onlinePercent = total
      ? Math.round((online / total) * 100)
      : 0;

    const offlinePercent = total
      ? Math.round((offline / total) * 100)
      : 0;

    $("onlinePercent").textContent = onlinePercent + "%";
    $("offlinePercent").textContent = offlinePercent + "%";

    $("onlineProgress").style.width = onlinePercent + "%";
    $("offlineProgress").style.width = offlinePercent + "%";

    if (data.ordersAvailable) {
      $("totalOrders").textContent =
        Number(data.totalOrders || 0).toLocaleString("bn-BD");

      $("orderStatus").textContent = "রেকর্ড পাওয়া গেছে";
      $("orderInformation").textContent =
        "অর্ডার রেকর্ড পাওয়া গেছে। বিস্তারিত অর্ডার মডেল সংযুক্ত হলে এখানে দেখানো যাবে।";
    } else {
      $("totalOrders").textContent = "N/A";
      $("orderStatus").textContent = "ডেটাবেস সংযুক্ত নেই";
      $("orderInformation").textContent =
        "বর্তমান সার্ভারে অর্ডার ডেটাবেস মডেল নেই। তাই অর্ডারের সংখ্যা বা ইতিহাস দেখানো সম্ভব নয়।";
    }

    if (Array.isArray(data.recentUsers)) {
      renderRecentUsers(data.recentUsers);
    } else {
      await loadUsers();
    }

  } catch (error) {
    $("totalUsers").textContent = "—";
    $("onlineUsers").textContent = "—";
    $("offlineUsers").textContent = "—";
    $("totalOrders").textContent = "—";
    $("orderInformation").textContent = error.message;
  }
}

function renderRecentUsers(users) {
  const tbody = $("recentUsers");
  tbody.replaceChildren();

  if (!users.length) {
    tbody.innerHTML =
      '<tr><td colspan="4" class="empty-cell">কোনো কাস্টমার নেই।</td></tr>';
    return;
  }

  users.slice(0, 6).forEach(user => {
    const online = isOnline(user);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHTML(user.name || "নাম নেই")}</td>
      <td>${escapeHTML(user.phone || "নম্বর নেই")}</td>
      <td>
        <span class="status-pill ${online ? "status-online" : "status-offline"}">
          ${online ? "অনলাইন" : "অফলাইন"}
        </span>
      </td>
      <td>${escapeHTML(dateText(user.createdAt))}</td>
    `;

    tbody.appendChild(row);
  });
}

$("refreshDashboard").addEventListener("click", async () => {
  await loadDashboard();
  await loadUsers();
  toast("ড্যাশবোর্ড আপডেট হয়েছে।");
});

/* USERS */

async function loadUsers() {
  try {
    const data = await api("/api/admin/users");

    usersCache = data.users || [];

    renderUsers();
    renderRecentUsers(usersCache);

  } catch (error) {
    $("allUsers").innerHTML =
      `<tr><td colspan="5" class="empty-cell">${escapeHTML(error.message)}</td></tr>`;
  }
}

function renderUsers() {
  const search = $("userSearch").value.trim().toLowerCase();
  const filter = $("userFilter").value;

  const filtered = usersCache.filter(user => {
    const matchesSearch =
      String(user.name || "").toLowerCase().includes(search) ||
      String(user.phone || "").toLowerCase().includes(search);

    const online = isOnline(user);

    const matchesFilter =
      filter === "all" ||
      (filter === "online" && online) ||
      (filter === "offline" && !online);

    return matchesSearch && matchesFilter;
  });

  const tbody = $("allUsers");
  tbody.replaceChildren();

  if (!filtered.length) {
    tbody.innerHTML =
      '<tr><td colspan="5" class="empty-cell">কোনো কাস্টমার পাওয়া যায়নি।</td></tr>';
    return;
  }

  filtered.forEach(user => {
    const online = isOnline(user);
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${escapeHTML(user.name || "নাম নেই")}</td>
      <td>${escapeHTML(user.phone || "নম্বর নেই")}</td>
      <td>
        <span class="status-pill ${online ? "status-online" : "status-offline"}">
          ${online ? "অনলাইন" : "অফলাইন"}
        </span>
      </td>
      <td>${escapeHTML(timeText(user.lastSeen))}</td>
      <td>${escapeHTML(dateText(user.createdAt))}</td>
    `;

    tbody.appendChild(row);
  });
}

$("userSearch").addEventListener("input", renderUsers);
$("userFilter").addEventListener("change", renderUsers);

$("refreshUsers").addEventListener("click", async () => {
  await loadUsers();
  toast("কাস্টমার তালিকা আপডেট হয়েছে।");
});

/* BANNER IMAGE PREVIEW */

$("bannerFile").addEventListener("change", event => {
  const file = event.target.files?.[0];

  bannerPreviewData = "";

  if (!file) {
    resetImagePreview();
    return;
  }

  const allowed = ["image/jpeg", "image/png", "image/webp"];

  if (!allowed.includes(file.type)) {
    toast("JPG, PNG অথবা WEBP ছবি নির্বাচন করুন।");
    event.target.value = "";
    resetImagePreview();
    return;
  }

  if (file.size > 1.2 * 1024 * 1024) {
    toast("ছবির সাইজ ১.২ MB-এর কম রাখুন।");
    event.target.value = "";
    resetImagePreview();
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    bannerPreviewData = String(reader.result || "");

    $("bannerPreview").src = bannerPreviewData;
    $("bannerPreview").classList.remove("hidden");
    $("previewPlaceholder").classList.add("hidden");
  };

  reader.onerror = () => {
    toast("ছবি পড়া যায়নি।");
  };

  reader.readAsDataURL(file);
});

function resetImagePreview() {
  $("bannerPreview").src = "";
  $("bannerPreview").classList.add("hidden");
  $("previewPlaceholder").classList.remove("hidden");
}

/* IMAGE UPLOAD */

async function uploadBannerImage(dataUrl) {
  const result = await api("/api/admin/media", {
    method: "POST",
    body: JSON.stringify({
      imageData: dataUrl
    })
  });

  return result.imageUrl;
}

/* BANNERS */

async function loadBanners() {
  try {
    const data = await api("/api/admin/banners");
    bannersCache = data.banners || [];
    renderBanners();

  } catch (error) {
    $("bannerList").textContent = error.message;
  }
}

function renderBanners() {
  const list = $("bannerList");
  list.replaceChildren();

  if (!bannersCache.length) {
    list.textContent = "এখনো কোনো ব্যানার যোগ করা হয়নি।";
    return;
  }

  bannersCache.forEach(banner => {
    const item = document.createElement("article");
    item.className = "banner-item";

    const image = document.createElement("img");
    image.alt = banner.title || "Banner";
    image.src = banner.imageUrl || "";
    image.onerror = () => {
      image.style.display = "none";
    };

    const title = document.createElement("h4");
    title.textContent = banner.title || "নাম নেই";

    const details = document.createElement("p");
    details.textContent =
      `${banner.position || banner.slot || ""} • ` +
      (banner.enabled ? "সক্রিয়" : "বন্ধ");

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editBanner(banner));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Delete";
    remove.className = "delete-button";
    remove.addEventListener("click", () => deleteBanner(banner._id));

    actions.append(edit, remove);
    item.append(image, title, details, actions);
    list.appendChild(item);
  });
}

function resetBannerForm() {
  $("bannerForm").reset();
  $("bannerId").value = "";
  $("bannerEnabled").checked = true;
  $("bannerFormHeading").textContent = "নতুন ব্যানার যোগ করুন";
  $("bannerSaveButton").textContent = "ব্যানার সংরক্ষণ";
  $("bannerFile").required = true;
  bannerPreviewData = "";
  resetImagePreview();
}

$("bannerReset").addEventListener("click", resetBannerForm);

function editBanner(banner) {
  $("bannerId").value = banner._id || "";
  $("bannerTitle").value = banner.title || "";
  $("bannerDescription").value = banner.description || "";
  $("bannerLink").value = banner.link || banner.linkUrl || "";
  $("bannerPosition").value =
    banner.position || banner.slot || "landing_top";

  $("bannerEnabled").checked = banner.enabled !== false;
  $("bannerFormHeading").textContent = "ব্যানার সম্পাদনা করুন";
  $("bannerSaveButton").textContent = "পরিবর্তন সংরক্ষণ";
  $("bannerFile").required = false;

  bannerPreviewData = "";

  if (banner.imageUrl) {
    $("bannerPreview").src = banner.imageUrl;
    $("bannerPreview").classList.remove("hidden");
    $("previewPlaceholder").classList.add("hidden");
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("bannerForm").addEventListener("submit", async event => {
  event.preventDefault();

  const id = $("bannerId").value;
  const file = $("bannerFile").files?.[0];

  const button = $("bannerSaveButton");
  button.disabled = true;
  button.textContent = "সংরক্ষণ হচ্ছে...";

  try {
    let imageUrl = "";

    if (bannerPreviewData) {
      imageUrl = await uploadBannerImage(bannerPreviewData);
    } else if (id) {
      const existing = bannersCache.find(item => item._id === id);
      imageUrl = existing?.imageUrl || "";
    }

    if (!imageUrl) {
      throw new Error("ব্যানারের ছবি নির্বাচন করুন।");
    }

    const payload = {
      title: $("bannerTitle").value.trim(),
      description: $("bannerDescription").value.trim(),
      imageUrl,
      link: $("bannerLink").value.trim(),
      position: $("bannerPosition").value,
      enabled: $("bannerEnabled").checked
    };

    await api(
      id
        ? `/api/admin/banners/${encodeURIComponent(id)}`
        : "/api/admin/banners",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload)
      }
    );

    resetBannerForm();
    await loadBanners();

    showMessage("bannerMessage", "ব্যানার সফলভাবে সংরক্ষণ হয়েছে।");
    toast("ব্যানার সংরক্ষণ হয়েছে।");

  } catch (error) {
    showMessage("bannerMessage", error.message);
  } finally {
    button.disabled = false;
    button.textContent = $("bannerId").value
      ? "পরিবর্তন সংরক্ষণ"
      : "ব্যানার সংরক্ষণ";
  }
});

async function deleteBanner(id) {
  if (!id || !confirm("এই ব্যানারটি মুছে ফেলবেন?")) return;

  try {
    await api(`/api/admin/banners/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    await loadBanners();
    toast("ব্যানার মুছে ফেলা হয়েছে।");

  } catch (error) {
    showMessage("bannerMessage", error.message);
  }
}

/* SERVICES */

async function loadServices() {
  try {
    const data = await api("/api/admin/services");
    servicesCache = data.services || [];
    renderServices();

  } catch (error) {
    $("serviceList").textContent = error.message;
  }
}

function renderServices() {
  const list = $("serviceList");
  list.replaceChildren();

  if (!servicesCache.length) {
    list.textContent = "কোনো সার্ভিস পাওয়া যায়নি।";
    return;
  }

  servicesCache.forEach(service => {
    const item = document.createElement("article");
    item.className = "simple-item";

    const title = document.createElement("h4");
    title.textContent =
      `${service.icon || "✦"} ${service.name || "সার্ভিস"}`;

    const description = document.createElement("p");
    description.textContent =
      `${service.description || ""} • ` +
      (service.enabled === false ? "বন্ধ" : "সক্রিয়");

    const actions = document.createElement("div");
    actions.className = "item-actions";

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => editService(service));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "delete-button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteService(service._id));

    actions.append(edit, remove);
    item.append(title, description, actions);
    list.appendChild(item);
  });
}

function resetServiceForm() {
  $("serviceForm").reset();
  $("serviceId").value = "";
  $("serviceEnabled").checked = true;
  $("serviceFormHeading").textContent = "নতুন সার্ভিস যোগ করুন";
}

$("serviceReset").addEventListener("click", resetServiceForm);

function editService(service) {
  $("serviceId").value = service._id || "";
  $("serviceName").value = service.name || "";
  $("serviceDescription").value = service.description || "";
  $("serviceIcon").value = service.icon || "✦";
  $("serviceEnabled").checked = service.enabled !== false;
  $("serviceFormHeading").textContent = "সার্ভিস সম্পাদনা করুন";

  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("serviceForm").addEventListener("submit", async event => {
  event.preventDefault();

  const id = $("serviceId").value;

  const payload = {
    name: $("serviceName").value.trim(),
    description: $("serviceDescription").value.trim(),
    icon: $("serviceIcon").value.trim() || "✦",
    enabled: $("serviceEnabled").checked
  };

  try {
    await api(
      id
        ? `/api/admin/services/${encodeURIComponent(id)}`
        : "/api/admin/services",
      {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(payload)
      }
    );

    resetServiceForm();
    await loadServices();

    showMessage("serviceMessage", "সার্ভিস সংরক্ষণ হয়েছে।");
    toast("সার্ভিস আপডেট হয়েছে।");

  } catch (error) {
    showMessage("serviceMessage", error.message);
  }
});

async function deleteService(id) {
  if (!id || !confirm("এই সার্ভিসটি মুছে ফেলবেন?")) return;

  try {
    await api(`/api/admin/services/${encodeURIComponent(id)}`, {
      method: "DELETE"
    });

    await loadServices();
    toast("সার্ভিস মুছে ফেলা হয়েছে।");

  } catch (error) {
    showMessage("serviceMessage", error.message);
  }
}

/* WEBSITE TEXT */

async function loadContent() {
  try {
    const data = await api("/api/admin/content");
    const content = data.content || {};

    $("heroTitleInput").value =
      content.heroTitle || content.landing?.title || "";

    $("heroSubtitleInput").value =
      content.heroSubtitle || content.landing?.subtitle || "";

  } catch (error) {
    showMessage("contentMessage", error.message);
  }
}

$("contentForm").addEventListener("submit", async event => {
  event.preventDefault();

  try {
    await api("/api/admin/content", {
      method: "PUT",
      body: JSON.stringify({
        heroTitle: $("heroTitleInput").value.trim(),
        heroSubtitle: $("heroSubtitleInput").value.trim()
      })
    });

    showMessage("contentMessage", "ওয়েবসাইটের লেখা সংরক্ষণ হয়েছে।");
    toast("কনটেন্ট আপডেট হয়েছে।");

  } catch (error) {
    showMessage("contentMessage", error.message);
  }
});

/* START */

document.addEventListener("DOMContentLoaded", checkAdmin);
