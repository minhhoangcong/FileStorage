const authCard = document.getElementById("authCard");
const appShell = document.getElementById("appShell");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const userInfo = document.getElementById("userInfo");
const toast = document.getElementById("toast");
const fileGrid = document.getElementById("fileGrid");
const usersTableBody = document.getElementById("usersTableBody");
const adminFoldersTableBody = document.getElementById("adminFoldersTableBody");
const adminLogsTableBody = document.getElementById("adminLogsTableBody");
const adminUsersSection = document.getElementById("adminUsersSection");
const adminFoldersSection = document.getElementById("adminFoldersSection");
const adminLogsSection = document.getElementById("adminLogsSection");
const filesSection = document.getElementById("filesSection");
const topbarSection = document.querySelector(".topbar");
const statGridSection = document.querySelector(".stat-grid");
const uploadBoxSection = document.querySelector(".upload-box");
const folderBoxSection = document.querySelector(".folder-box");
const previewModal = document.getElementById("previewModal");
const previewBody = document.getElementById("previewBody");
const previewTitle = document.getElementById("previewTitle");
const viewTitle = document.getElementById("viewTitle");
const viewSubtitle = document.getElementById("viewSubtitle");

const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const sortFilter = document.getElementById("sortFilter");
const fileInput = document.getElementById("fileInput");
const folderSelect = document.getElementById("folderSelect");
const tagsInput = document.getElementById("tagsInput");
const newFolderInput = document.getElementById("newFolderInput");
const folderChips = document.getElementById("folderChips");
const pageInfo = document.getElementById("pageInfo");
const prevPageBtn = document.getElementById("prevPageBtn");
const nextPageBtn = document.getElementById("nextPageBtn");

const totalFilesValue = document.getElementById("totalFilesValue");
const usedStorageValue = document.getElementById("usedStorageValue");
const storageLimitValue = document.getElementById("storageLimitValue");
const storageUsagePercent = document.getElementById("storageUsagePercent");

const adminFilesNav = document.getElementById("adminFilesNav");
const adminUsersNav = document.getElementById("adminUsersNav");
const adminFoldersNav = document.getElementById("adminFoldersNav");
const adminLogsNav = document.getElementById("adminLogsNav");

let authToken = localStorage.getItem("token") || "";
let currentUser = null;
let currentView = "my";
let pageState = { page: 1, totalPages: 1, limit: 8 };
let searchDebounce = null;
let activePreviewObjectUrl = null;
let allFolders = ["root"];
let selectedFolderFilter = "";

const formatSizeMb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
const formatSizeKb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const formatTime = (value) => new Date(value).toLocaleString();

function showToast(message, timeout = 2200) {
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), timeout);
}

async function api(path, options = {}) {
  const headers = options.headers ? { ...options.headers } : {};
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  const res = await fetch(path, { ...options, headers });
  const contentType = res.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.message || "Request failed");
  }
  return data;
}

function setAuthUI(loggedIn) {
  authCard.classList.toggle("hidden", loggedIn);
  appShell.classList.toggle("hidden", !loggedIn);
  document.body.classList.toggle("auth-only", !loggedIn);
}

function switchAuthTab(tabName) {
  document.querySelectorAll(".auth-tab").forEach((el) => {
    el.classList.toggle("active", el.dataset.tab === tabName);
  });
  loginForm.classList.toggle("active", tabName === "login");
  registerForm.classList.toggle("active", tabName === "register");
}

function setView(view) {
  currentView = view;
  pageState.page = 1;
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
  const isUserPanel = view === "adminUsers";
  const isFolderPanel = view === "adminFolders";
  const isLogsPanel = view === "adminLogs";
  const isFilePanel = !isUserPanel && !isFolderPanel && !isLogsPanel;

  adminUsersSection.classList.toggle("hidden", !isUserPanel);
  adminFoldersSection.classList.toggle("hidden", !isFolderPanel);
  adminLogsSection.classList.toggle("hidden", !isLogsPanel);
  filesSection.classList.toggle("hidden", !isFilePanel);

  topbarSection.classList.toggle("hidden", !isFilePanel);
  statGridSection.classList.toggle("hidden", !isFilePanel);
  uploadBoxSection.classList.toggle("hidden", !isFilePanel);
  folderBoxSection.classList.toggle("hidden", !isFilePanel);

  if (view === "my") {
    viewTitle.textContent = "My Drive";
    viewSubtitle.textContent = "Your uploaded files";
  }
  if (view === "starred") {
    viewTitle.textContent = "Starred";
    viewSubtitle.textContent = "Quick access files";
  }
  if (view === "adminFiles") {
    viewTitle.textContent = "Admin File Explorer";
    viewSubtitle.textContent = "All files across users";
  }
  if (view === "adminUsers") {
    viewTitle.textContent = "Admin User Management";
    viewSubtitle.textContent = "Promote/demote user roles";
  }
  if (view === "adminFolders") {
    viewTitle.textContent = "Admin Folder Management";
    viewSubtitle.textContent = "Browse and clean user folders";
  }
  if (view === "adminLogs") {
    viewTitle.textContent = "Admin Audit Logs";
    viewSubtitle.textContent = "Track admin and system actions";
  }
}

function getActiveQuery() {
  const params = new URLSearchParams();
  params.set("page", pageState.page);
  params.set("limit", pageState.limit);
  params.set("sort", sortFilter.value);
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  if (typeFilter.value) params.set("type", typeFilter.value);
  if (selectedFolderFilter) params.set("folder", selectedFolderFilter);
  if (currentView === "starred") params.set("starred", "true");
  return params.toString();
}

function createActionButton(label, className, handler) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className = `small ${className || "ghost"}`.trim();
  btn.addEventListener("click", handler);
  return btn;
}

async function openPreview(file) {
  try {
    previewTitle.textContent = file.originalFilename;
    const url = `/api/v1/files/${file._id}/preview`;
    previewBody.innerHTML = "";
    let mediaTag = null;
    if (file.mimeType.startsWith("image/")) {
      previewBody.innerHTML = `<img alt="preview" />`;
      mediaTag = previewBody.querySelector("img");
    } else if (file.mimeType.startsWith("video/")) {
      previewBody.innerHTML = `<video controls></video>`;
      mediaTag = previewBody.querySelector("video");
    } else if (file.mimeType.startsWith("audio/")) {
      previewBody.innerHTML = `<audio controls style="width:100%"></audio>`;
      mediaTag = previewBody.querySelector("audio");
    } else if (file.mimeType === "application/pdf") {
      previewBody.innerHTML = `<iframe title="pdf-preview"></iframe>`;
      mediaTag = previewBody.querySelector("iframe");
    } else if (file.mimeType === "text/plain") {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${authToken}` } });
      if (!res.ok) throw new Error("Cannot preview text file");
      const text = await res.text();
      previewBody.innerHTML = `<pre>${text.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</pre>`;
    } else {
      showToast("This file type cannot be previewed");
      return;
    }

    if (file.mimeType !== "text/plain" && mediaTag) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) {
        throw new Error("Cannot open preview");
      }
      const blob = await response.blob();
      if (activePreviewObjectUrl) {
        URL.revokeObjectURL(activePreviewObjectUrl);
      }
      activePreviewObjectUrl = URL.createObjectURL(blob);
      mediaTag.src = activePreviewObjectUrl;
    }
    previewModal.showModal();
  } catch (error) {
    showToast(error.message);
  }
}

async function downloadFile(file) {
  try {
    const response = await fetch(`/api/v1/files/${file._id}/download`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data?.message || "Download failed");
    }
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = file.originalFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    showToast(error.message);
  }
}

async function updateMeta(fileId, payload, successMessage) {
  try {
    await api(`/api/v1/files/${fileId}/meta`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (successMessage) showToast(successMessage);
    await loadFiles();
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteFile(fileId) {
  if (!window.confirm("Delete this file permanently?")) return;
  try {
    await api(`/api/v1/files/${fileId}`, { method: "DELETE" });
    showToast("File deleted");
    await loadFiles();
  } catch (error) {
    showToast(error.message);
  }
}

function renderFiles(files = []) {
  fileGrid.innerHTML = "";
  if (!files.length) {
    fileGrid.innerHTML = `<article class="file-card"><p>No files found.</p></article>`;
    return;
  }

  files.forEach((file) => {
    const card = document.createElement("article");
    card.className = "file-card";
    card.innerHTML = `
      <div>
        <span class="badge">${file.folder || "root"}</span>
      </div>
      <div class="file-name">${file.originalFilename}</div>
      <div class="file-meta">
        <span>${file.mimeType}</span>
        <span>${formatSizeKb(file.size)} | ${formatTime(file.createdAt)}</span>
        <span>Owner: ${file.uploadedBy?.email || "you"}</span>
        <span>Tags: ${(file.tags || []).join(", ") || "-"}</span>
      </div>
      <div class="file-actions"></div>
    `;
    const actions = card.querySelector(".file-actions");

    actions.appendChild(createActionButton("Preview", "ghost", () => openPreview(file)));
    actions.appendChild(createActionButton("Download", "ghost", () => downloadFile(file)));
    actions.appendChild(
      createActionButton(file.isStarred ? "Unstar" : "Star", "ghost", () =>
        updateMeta(file._id, { isStarred: !file.isStarred }, "Star status updated")
      )
    );
    actions.appendChild(
      createActionButton("Rename", "ghost", () => {
        const nextName = prompt("New file name", file.originalFilename);
        if (!nextName) return;
        updateMeta(file._id, { originalFilename: nextName }, "Renamed");
      })
    );
    actions.appendChild(
      createActionButton("Move", "ghost", () => {
        const folder = prompt("Folder name", file.folder || "root");
        if (folder === null) return;
        updateMeta(file._id, { folder }, "Folder updated");
      })
    );
    actions.appendChild(
      createActionButton("Delete", "danger", () => deleteFile(file._id))
    );

    fileGrid.appendChild(card);
  });
}

async function loadMyStats() {
  try {
    if (currentView === "adminFiles" && currentUser.role === 1) {
      const data = await api("/api/v1/admin/stats");
      totalFilesValue.textContent = String(data.stats.totalFiles);
      usedStorageValue.textContent = formatSizeMb(data.stats.totalStorageBytes);
      storageLimitValue.textContent = "System-wide";
      storageUsagePercent.textContent = `${data.stats.usersByRole.admins} admin / ${data.stats.usersByRole.users} user`;
      return;
    }

    const data = await api("/api/v1/files/stats");
    totalFilesValue.textContent = String(data.stats.totalFiles);
    usedStorageValue.textContent = formatSizeMb(data.stats.usedBytes);
    storageLimitValue.textContent = formatSizeMb(data.stats.limitBytes);
    storageUsagePercent.textContent = `${data.stats.usedPercent}%`;
  } catch (error) {
    showToast(error.message);
  }
}

function renderFolders() {
  folderSelect.innerHTML = "";
  allFolders.forEach((folder) => {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = folder;
    folderSelect.appendChild(opt);
  });

  folderChips.innerHTML = "";
  const allBtn = document.createElement("button");
  allBtn.className = `chip-btn ${selectedFolderFilter === "" ? "active" : ""}`;
  allBtn.textContent = "All";
  allBtn.addEventListener("click", async () => {
    selectedFolderFilter = "";
    await loadFiles();
  });
  folderChips.appendChild(allBtn);

  allFolders.forEach((folder) => {
    const wrap = document.createElement("div");
    wrap.className = "folder-chip-wrap";

    const btn = document.createElement("button");
    btn.className = `chip-btn ${selectedFolderFilter === folder ? "active" : ""}`;
    btn.textContent = folder;
    btn.addEventListener("click", async () => {
      selectedFolderFilter = folder === "root" ? "root" : folder;
      await loadFiles();
    });
    wrap.appendChild(btn);

    if (folder !== "root") {
      const del = document.createElement("button");
      del.className = "chip-del-btn";
      del.textContent = "x";
      del.title = `Delete folder ${folder}`;
      del.addEventListener("click", async (event) => {
        event.stopPropagation();
        const ok = confirm(`Delete folder "${folder}"?`);
        if (!ok) return;
        try {
          await api("/api/v1/files/folders", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ path: folder }),
          });
          if (selectedFolderFilter === folder) {
            selectedFolderFilter = "";
          }
          showToast("Folder deleted");
          await loadFolders();
          await loadFiles();
        } catch (error) {
          if (error.message.toLowerCase().includes("not empty")) {
            const forceOk = confirm(
              `Folder "${folder}" is not empty. Delete all files/subfolders inside it?`
            );
            if (!forceOk) return;
            try {
              await api("/api/v1/files/folders", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ path: folder, force: true }),
              });
              if (selectedFolderFilter === folder) {
                selectedFolderFilter = "";
              }
              showToast("Folder and contents deleted");
              await loadFolders();
              await loadFiles();
            } catch (forceError) {
              showToast(forceError.message);
            }
          } else {
            showToast(error.message);
          }
        }
      });
      wrap.appendChild(del);
    }

    folderChips.appendChild(wrap);
  });
}

async function loadFolders() {
  try {
    const data = await api("/api/v1/files/folders");
    const names = (data.folders || []).map((f) => f.path);
    allFolders = ["root", ...new Set(names)];
    renderFolders();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadFiles() {
  if (currentView === "adminUsers") return;
  try {
    const query = getActiveQuery();
    const endpoint =
      currentView === "adminFiles"
        ? `/api/v1/admin/files?${query}`
        : `/api/v1/files/my-files?${query}`;
    const data = await api(endpoint);
    renderFiles(data.files || []);
    pageState.totalPages = data.totalPages || 1;
    pageInfo.textContent = `Page ${data.page || 1}/${pageState.totalPages}`;
    prevPageBtn.disabled = pageState.page <= 1;
    nextPageBtn.disabled = pageState.page >= pageState.totalPages;
    await loadMyStats();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadUsers() {
  if (currentUser?.role !== 1) return;
  try {
    const data = await api("/api/v1/admin/users");
    usersTableBody.innerHTML = "";
    (data.users || []).forEach((user) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${user.name}</td>
        <td>${user.email}</td>
        <td>${user.role === 1 ? "admin" : "user"}</td>
        <td>${formatTime(user.createdAt)}</td>
        <td></td>
      `;
      const actionTd = tr.querySelector("td:last-child");
      const toggleBtn = createActionButton(
        user.role === 1 ? "Set User" : "Set Admin",
        "ghost",
        async () => {
          try {
            await api(`/api/v1/admin/users/${user._id}/role`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ role: user.role === 1 ? 0 : 1 }),
            });
            showToast("Role updated");
            await loadUsers();
            await loadFiles();
          } catch (error) {
            showToast(error.message);
          }
        }
      );
      actionTd.appendChild(toggleBtn);
      usersTableBody.appendChild(tr);
    });
  } catch (error) {
    showToast(error.message);
  }
}

async function loadAdminFolders() {
  if (currentUser?.role !== 1) return;
  try {
    const data = await api("/api/v1/admin/folders?limit=100");
    adminFoldersTableBody.innerHTML = "";

    (data.folders || []).forEach((folder) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${folder.path}</td>
        <td>${folder.createdBy?.email || "n/a"}</td>
        <td>${formatTime(folder.createdAt)}</td>
        <td></td>
      `;

      const actionTd = tr.querySelector("td:last-child");
      const delBtn = createActionButton("Delete", "danger", async () => {
        const ownerId = folder.createdBy?._id;
        if (!ownerId) return showToast("Missing folder owner");

        const ok = confirm(`Delete folder "${folder.path}" for ${folder.createdBy.email}?`);
        if (!ok) return;
        try {
          await api("/api/v1/admin/folders", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ownerId, path: folder.path }),
          });
          showToast("Folder deleted");
          await loadAdminFolders();
        } catch (error) {
          if (error.message.toLowerCase().includes("not empty")) {
            const forceOk = confirm(
              `Folder not empty. Force delete "${folder.path}" and all contents?`
            );
            if (!forceOk) return;
            await api("/api/v1/admin/folders", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ownerId, path: folder.path, force: true }),
            });
            showToast("Folder and contents deleted");
            await loadAdminFolders();
          } else {
            showToast(error.message);
          }
        }
      });

      actionTd.appendChild(delBtn);
      adminFoldersTableBody.appendChild(tr);
    });
  } catch (error) {
    showToast(error.message);
  }
}

async function loadAuditLogs() {
  if (currentUser?.role !== 1) return;
  try {
    const data = await api("/api/v1/admin/audit-logs?limit=100");
    adminLogsTableBody.innerHTML = "";
    (data.logs || []).forEach((log) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${formatTime(log.createdAt)}</td>
        <td>${log.actor?.email || "system"}</td>
        <td>${log.action}</td>
        <td>${log.targetType}: ${log.targetLabel || "-"}</td>
      `;
      adminLogsTableBody.appendChild(tr);
    });
  } catch (error) {
    showToast(error.message);
  }
}

async function loadSession() {
  if (!authToken) {
    setAuthUI(false);
    return;
  }
  try {
    const data = await api("/api/v1/auth/me");
    currentUser = data.user;
    userInfo.textContent = `${currentUser.name} (${currentUser.role === 1 ? "admin" : "user"})`;

    const isAdmin = currentUser.role === 1;
    adminFilesNav.classList.toggle("hidden", !isAdmin);
    adminUsersNav.classList.toggle("hidden", !isAdmin);
    adminFoldersNav.classList.toggle("hidden", !isAdmin);
    adminLogsNav.classList.toggle("hidden", !isAdmin);

    setAuthUI(true);
    setView("my");
    await loadFolders();
    await loadFiles();
  } catch (_error) {
    authToken = "";
    localStorage.removeItem("token");
    setAuthUI(false);
  }
}

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => switchAuthTab(tab.dataset.tab));
});

document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", async () => {
    setView(btn.dataset.view);
    if (btn.dataset.view === "adminUsers") await loadUsers();
    else if (btn.dataset.view === "adminFolders") await loadAdminFolders();
    else if (btn.dataset.view === "adminLogs") await loadAuditLogs();
    else await loadFiles();
  });
});

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(registerForm).entries());
  try {
    await api("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    showToast("Register successful. Please login.");
    registerForm.reset();
    switchAuthTab("login");
  } catch (error) {
    showToast(error.message);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = Object.fromEntries(new FormData(loginForm).entries());
  try {
    const data = await api("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    authToken = data.token;
    localStorage.setItem("token", authToken);
    await loadSession();
    loginForm.reset();
    showToast("Login successful");
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("uploadBtn").addEventListener("click", async () => {
  const file = fileInput.files?.[0];
  if (!file) {
    showToast("Choose file first");
    return;
  }
  const form = new FormData();
  form.append("file", file);
  form.append("folder", folderSelect.value || "root");
  form.append("tags", tagsInput.value.trim());

  try {
    await api("/api/v1/files/upload", { method: "POST", body: form });
    fileInput.value = "";
    tagsInput.value = "";
    showToast("Upload success");
    pageState.page = 1;
    await loadFiles();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("createFolderBtn").addEventListener("click", async () => {
  const value = newFolderInput.value.trim();
  if (!value) {
    showToast("Enter folder name");
    return;
  }
  try {
    await api("/api/v1/files/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: value }),
    });
    newFolderInput.value = "";
    showToast("Folder created");
    await loadFolders();
  } catch (error) {
    showToast(error.message);
  }
});

document.getElementById("refreshBtn").addEventListener("click", async () => {
  if (currentView === "adminUsers") await loadUsers();
  else {
    await loadFolders();
    await loadFiles();
  }
});

document.getElementById("reloadUsersBtn").addEventListener("click", loadUsers);
document.getElementById("reloadFoldersBtn").addEventListener("click", loadAdminFolders);
document.getElementById("reloadLogsBtn").addEventListener("click", loadAuditLogs);

document.getElementById("logoutBtn").addEventListener("click", () => {
  authToken = "";
  currentUser = null;
  localStorage.removeItem("token");
  fileGrid.innerHTML = "";
  usersTableBody.innerHTML = "";
  adminFoldersTableBody.innerHTML = "";
  adminLogsTableBody.innerHTML = "";
  setAuthUI(false);
});

document.getElementById("closePreviewBtn").addEventListener("click", () => {
  previewBody.innerHTML = "";
  if (activePreviewObjectUrl) {
    URL.revokeObjectURL(activePreviewObjectUrl);
    activePreviewObjectUrl = null;
  }
  previewModal.close();
});

searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    pageState.page = 1;
    loadFiles();
  }, 320);
});

typeFilter.addEventListener("change", () => {
  pageState.page = 1;
  loadFiles();
});

sortFilter.addEventListener("change", () => {
  pageState.page = 1;
  loadFiles();
});

prevPageBtn.addEventListener("click", async () => {
  if (pageState.page <= 1) return;
  pageState.page -= 1;
  await loadFiles();
});

nextPageBtn.addEventListener("click", async () => {
  if (pageState.page >= pageState.totalPages) return;
  pageState.page += 1;
  await loadFiles();
});

loadSession();
