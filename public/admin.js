
const $ = id => document.getElementById(id);

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "কাজটি সম্পন্ন হয়নি");
  return data;
}

function message(id, text) {
  $(id).textContent = text;
}

function safeText(value) {
  return String(value ?? "");
}

function addListItem(container, title, description, status, buttons = []) {
  const item = document.createElement("article");
  item.className = "list-item";

  const info = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const detail = document.createElement("p");
  detail.textContent = description || "";
  const state = document.createElement("span");
  state.className = "status";
  state.textContent = status || "";
  info.append(heading, detail, state);

  const actions = document.createElement("div");
  actions.className = "list-actions";
  buttons.forEach(({ label, action }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    actions.appendChild(button);
  });

  item.append(info, actions);
  container.appendChild(item);
}

async function checkAdmin() {
  try {
    await api("/api/admin/me");
    showAdmin();
  } catch {
    $("adminLogin").classList.remove("hidden");
    $("adminDashboard").classList.add("hidden");
  }
}

function showAdmin() {
  $("adminLogin").classList.add("hidden");
  $("adminDashboard").classList.remove("hidden");
  loadContent();
  loadBanners();
  loadServices();
  loadUsers();
}

$("adminLoginForm").addEventListener("submit", async event => {
  event.preventDefault();
  message("loginMessage", "অপেক্ষা করুন...");
  try {
    await api("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password: $("adminPassword").value })
    });
    $("adminPassword").value = "";
    showAdmin();
  } catch (error) {
    message("loginMessage", error.message);
  }
});

$("adminLogout").addEventListener("click", async () => {
  try {
    await api("/api/admin/logout", { method: "POST", body: "{}" });
  } catch {}
  $("adminDashboard").classList.add("hidden");
  $("adminLogin").classList.remove("hidden");
});

document.querySelectorAll(".admin-tabs button").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".admin-tabs button").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.add("hidden"));
    button.classList.add("active");
    $(button.dataset.panel).classList.remove("hidden");
  });
});

async function loadContent() {
  try {
    const data = await api("/api/admin/content");
    const content = data.content || data;
    $("heroTitleInput").value = content.heroTitle || "";
    $("heroSubtitleInput").value = content.heroSubtitle || "";
  } catch (error) {
    message("contentMessage", error.message);
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
    message("contentMessage", "ওয়েবসাইটের লেখা আপডেট হয়েছে।");
  } catch (error) {
    message("contentMessage", error.message);
  }
});

function resetBannerForm() {
  $("bannerForm").reset();
  $("bannerId").value = "";
  $("bannerEnabled").checked = true;
}

$("bannerReset").addEventListener("click", resetBannerForm);

async function loadBanners() {
  try {
    const data = await api("/api/admin/banners");
    const banners = data.banners || [];
    const list = $("bannerList");
    list.innerHTML = "";

    banners.forEach(banner => {
      addListItem(
        list,
        safeText(banner.title),
        `${banner.position || ""} • ${banner.imageUrl || "No image"}`,
        banner.enabled ? "Enabled" : "Disabled",
        [
          { label: "Edit", action: () => editBanner(banner) },
          { label: "Delete", action: () => deleteBanner(banner._id) }
        ]
      );
    });
  } catch (error) {
    message("bannerMessage", error.message);
  }
}

function editBanner(banner) {
  $("bannerId").value = banner._id || "";
  $("bannerTitle").value = banner.title || "";
  $("bannerDescription").value = banner.description || "";
  $("bannerImage").value = banner.imageUrl || "";
  $("bannerLink").value = banner.link || "";
  $("bannerPosition").value = banner.position || "landing_top";
  $("bannerEnabled").checked = banner.enabled !== false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("bannerForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("bannerId").value;
  const payload = {
    title: $("bannerTitle").value.trim(),
    description: $("bannerDescription").value.trim(),
    imageUrl: $("bannerImage").value.trim(),
    link: $("bannerLink").value.trim(),
    position: $("bannerPosition").value,
    enabled: $("bannerEnabled").checked
  };

  try {
    await api(id ? `/api/admin/banners/${encodeURIComponent(id)}` : "/api/admin/banners", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    resetBannerForm();
    message("bannerMessage", "Banner সংরক্ষণ হয়েছে।");
    loadBanners();
  } catch (error) {
    message("bannerMessage", error.message);
  }
});

async function deleteBanner(id) {
  if (!id || !confirm("এই ব্যানারটি মুছে ফেলবেন?")) return;
  try {
    await api(`/api/admin/banners/${encodeURIComponent(id)}`, { method: "DELETE" });
    loadBanners();
  } catch (error) {
    message("bannerMessage", error.message);
  }
}

function resetServiceForm() {
  $("serviceForm").reset();
  $("serviceId").value = "";
  $("serviceEnabled").checked = true;
}

$("serviceReset").addEventListener("click", resetServiceForm);

async function loadServices() {
  try {
    const data = await api("/api/admin/services");
    const list = $("serviceList");
    list.innerHTML = "";

    (data.services || []).forEach(service => {
      addListItem(
        list,
        `${service.icon || "✦"} ${service.name}`,
        service.description || "",
        service.enabled ? "Enabled" : "Disabled",
        [
          { label: "Edit", action: () => editService(service) },
          { label: "Delete", action: () => deleteService(service._id) }
        ]
      );
    });
  } catch (error) {
    message("serviceMessage", error.message);
  }
}

function editService(service) {
  $("serviceId").value = service._id || "";
  $("serviceName").value = service.name || "";
  $("serviceDescription").value = service.description || "";
  $("serviceIcon").value = service.icon || "";
  $("serviceEnabled").checked = service.enabled !== false;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

$("serviceForm").addEventListener("submit", async event => {
  event.preventDefault();
  const id = $("serviceId").value;
  const payload = {
    name: $("serviceName").value.trim(),
    description: $("serviceDescription").value.trim(),
    icon: $("serviceIcon").value.trim(),
    enabled: $("serviceEnabled").checked
  };

  try {
    await api(id ? `/api/admin/services/${encodeURIComponent(id)}` : "/api/admin/services", {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(payload)
    });
    resetServiceForm();
    message("serviceMessage", "সার্ভিস সংরক্ষণ হয়েছে।");
    loadServices();
  } catch (error) {
    message("serviceMessage", error.message);
  }
});

async function deleteService(id) {
  if (!id || !confirm("এই সার্ভিসটি মুছে ফেলবেন?")) return;
  try {
    await api(`/api/admin/services/${encodeURIComponent(id)}`, { method: "DELETE" });
    loadServices();
  } catch (error) {
    message("serviceMessage", error.message);
  }
}

async function loadUsers() {
  try {
    const data = await api("/api/admin/users");
    const list = $("userList");
    list.innerHTML = "";

    (data.users || []).forEach(user => {
      addListItem(
        list,
        user.name || "Unnamed User",
        user.email || "",
        user.role || "user"
      );
    });

    if (!data.users?.length) {
      list.textContent = "এখনো কোনো ব্যবহারকারী পাওয়া যায়নি।";
    }
  } catch (error) {
    $("userList").textContent = error.message;
  }
}

checkAdmin();
