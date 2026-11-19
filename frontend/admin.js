const API_URL = "http://localhost:3000";
const ADMIN_TOKEN_KEY = "gritAdminToken";

const loginView = document.querySelector("#adminLoginView");
const dashboardView = document.querySelector("#adminDashboardView");
const loginForm = document.querySelector("#adminLoginForm");
const loginMessage = document.querySelector("#adminLoginMessage");
const loginSubmit = document.querySelector("#adminLoginSubmit");
const dashboardMessage = document.querySelector("#adminDashboardMessage");
const ticketList = document.querySelector("#adminTicketList");
const logoutButton = document.querySelector("#adminLogout");
const eventForm = document.querySelector("#adminEventForm");
const ticketCreateForm = document.querySelector("#adminTicketCreateForm");
const verifyForm = document.querySelector("#verifyTicketForm");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showLogin(message = "") {
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  loginView.hidden = false;
  dashboardView.hidden = true;
  loginMessage.textContent = message;
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function setDashboardMessage(message, isSuccess = false) {
  dashboardMessage.textContent = message;
  dashboardMessage.classList.toggle("is-success", isSuccess);
}

async function adminRequest(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);

  if (token && options.requiresAuth !== false) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${url}`, {
    ...options,
    headers
  });
  let result;

  try {
    result = await response.json();
  } catch (error) {
    throw new Error("Respons server tidak dapat dibaca.");
  }

  if (!response.ok || !result.success) {
    if (response.status === 401 && options.requiresAuth !== false) {
      showLogin("Sesi admin berakhir. Silakan login kembali.");
    }
    throw new Error(result.message || "Permintaan gagal.");
  }

  return result;
}

function renderTicket(ticket) {
  const status = ticket.status === "SOLD_OUT" ? "SOLD_OUT" : "AVAILABLE";

  return `
    <article class="admin-ticket-card">
      <div class="admin-ticket-heading">
        <h3>${escapeHtml(ticket.name)}</h3>
        <span class="admin-ticket-id">${escapeHtml(ticket.id)}</span>
      </div>

      <form class="ticket-edit-form" data-ticket-id="${escapeHtml(ticket.id)}">
        <label>
          Nama tiket
          <input name="name" type="text" value="${escapeHtml(ticket.name)}" maxlength="80" required>
        </label>

        <label>
          Harga (Rupiah)
          <input name="price" type="number" value="${Number(ticket.price)}" min="1" max="999999999" step="1" required>
        </label>

        <label class="field-wide">
          Deskripsi
          <textarea name="description" maxlength="500">${escapeHtml(ticket.description || "")}</textarea>
        </label>

        <label>
          Stok
          <input name="stock" type="number" value="${Number(ticket.stock)}" min="0" max="1000000" step="1" required>
        </label>

        <label>
          Status
          <select name="status">
            <option value="AVAILABLE" ${status === "AVAILABLE" ? "selected" : ""}>Tersedia</option>
            <option value="SOLD_OUT" ${status === "SOLD_OUT" ? "selected" : ""}>Habis / Nonaktif</option>
          </select>
        </label>

        <div class="admin-ticket-actions">
          <button class="btn btn-dark save-ticket-button" type="submit">Simpan perubahan</button>
        </div>
      </form>
    </article>
  `;
}

function renderCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) {
    return '<p class="admin-empty">Belum ada kategori tiket.</p>';
  }

  return categories
    .map(category => {
      const tickets = Array.isArray(category.tickets) ? category.tickets : [];
      return `
        <section class="admin-category">
          <div class="admin-category-heading">
            <h2>${escapeHtml(category.name)}</h2>
            <p>${escapeHtml(category.description || "")}</p>
          </div>
          ${tickets.map(renderTicket).join("")}
        </section>
      `;
    })
    .join("");
}

function toLocalDateTime(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}

function fromLocalDateTime(value) {
  return value ? new Date(value).toISOString() : "";
}

function populateEvent(event) {
  eventForm.elements.name.value = event.name || "";
  eventForm.elements.location.value = event.location || "";
  eventForm.elements.startAt.value = toLocalDateTime(event.startAt);
  eventForm.elements.endAt.value = toLocalDateTime(event.endAt);
  eventForm.elements.description.value = event.description || "";
  eventForm.elements.mapUrl.value = event.mapUrl || "";
  eventForm.elements.salesOpen.checked = Boolean(event.salesOpen);
  document.querySelector("#adminEventState").textContent =
    !event.isConfigured
      ? "Belum ada acara"
      : event.salesOpen
        ? "Penjualan dibuka"
        : "Penjualan ditutup";
}

function populateTicketCategories(categories) {
  const select = document.querySelector("#ticketCategorySelect");
  select.innerHTML = categories
    .map(
      category =>
        `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`
    )
    .join("");
}

async function loadDashboardData() {
  ticketList.innerHTML = `
    <div class="admin-loading">
      <span class="spinner" aria-hidden="true"></span>
      Memuat tiket...
    </div>
  `;

  const [tickets, event] = await Promise.all([
    adminRequest("/api/admin/tickets"),
    adminRequest("/api/admin/event")
  ]);
  populateEvent(event.data);
  populateTicketCategories(tickets.data);
  ticketList.innerHTML = renderCategories(tickets.data);
}

if (loginForm) {
  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    loginMessage.textContent = "";
    loginSubmit.disabled = true;
    loginSubmit.textContent = "Memeriksa...";

    const formData = new FormData(loginForm);
    try {
      const result = await adminRequest("/api/admin/login", {
        method: "POST",
        requiresAuth: false,
        body: JSON.stringify({
          username: formData.get("username"),
          password: formData.get("password")
        })
      });

      sessionStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      loginForm.reset();
      showDashboard();
      setDashboardMessage("");
      await loadDashboardData();
    } catch (error) {
      if (sessionStorage.getItem(ADMIN_TOKEN_KEY)) {
        setDashboardMessage(error.message);
      } else {
        loginMessage.textContent = error.message;
      }
    } finally {
      loginSubmit.disabled = false;
      loginSubmit.textContent = "Masuk";
    }
  });
}

if (ticketList) {
  ticketList.addEventListener("submit", async event => {
    const form = event.target.closest(".ticket-edit-form");
    if (!form) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector(".save-ticket-button");
    const formData = new FormData(form);
    button.disabled = true;
    button.textContent = "Menyimpan...";
    setDashboardMessage("");

    try {
      await adminRequest(
        `/api/admin/tickets/${encodeURIComponent(form.dataset.ticketId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: formData.get("name"),
            description: formData.get("description"),
            price: Number(formData.get("price")),
            stock: Number(formData.get("stock")),
            status: formData.get("status")
          })
        }
      );
      await loadDashboardData();
      setDashboardMessage("Perubahan tiket berhasil disimpan.", true);
    } catch (error) {
      setDashboardMessage(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Simpan perubahan";
    }
  });
}

if (eventForm) {
  eventForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.querySelector("#saveEventButton");
    const formData = new FormData(eventForm);
    button.disabled = true;
    button.textContent = "Menyimpan...";
    setDashboardMessage("");

    try {
      const result = await adminRequest("/api/admin/event", {
        method: "PATCH",
        body: JSON.stringify({
          name: formData.get("name"),
          location: formData.get("location"),
          startAt: fromLocalDateTime(formData.get("startAt")),
          endAt: fromLocalDateTime(formData.get("endAt")),
          description: formData.get("description"),
          mapUrl: formData.get("mapUrl"),
          salesOpen: formData.get("salesOpen") === "on"
        })
      });
      populateEvent(result.data);
      setDashboardMessage("Pengaturan acara berhasil disimpan.", true);
    } catch (error) {
      setDashboardMessage(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Simpan acara";
    }
  });
}

if (ticketCreateForm) {
  ticketCreateForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.querySelector("#createTicketButton");
    const formData = new FormData(ticketCreateForm);
    button.disabled = true;
    button.textContent = "Menambahkan...";
    setDashboardMessage("");

    try {
      await adminRequest("/api/admin/tickets", {
        method: "POST",
        body: JSON.stringify({
          categoryId: formData.get("categoryId"),
          name: formData.get("name"),
          description: formData.get("description"),
          price: Number(formData.get("price")),
          stock: Number(formData.get("stock"))
        })
      });
      ticketCreateForm.reset();
      ticketCreateForm.elements.stock.value = "0";
      await loadDashboardData();
      setDashboardMessage("Jenis tiket berhasil ditambahkan.", true);
    } catch (error) {
      setDashboardMessage(error.message);
    } finally {
      button.disabled = false;
      button.textContent = "Tambah jenis tiket";
    }
  });
}

if (verifyForm) {
  verifyForm.addEventListener("submit", async event => {
    event.preventDefault();
    const button = document.querySelector("#verifyTicketButton");
    const resultContainer = document.querySelector("#verifyTicketResult");
    const formData = new FormData(verifyForm);
    button.disabled = true;
    button.textContent = "Memeriksa...";
    resultContainer.className = "admin-verification-result";
    resultContainer.textContent = "";

    try {
      const result = await adminRequest("/api/admin/tickets/verify", {
        method: "POST",
        body: JSON.stringify({ code: formData.get("code") })
      });
      const ticket = result.data;
      const labels = {
        VALID: "Valid",
        EXPIRED: "Expire",
        NOT_FOUND: "Tidak ditemukan"
      };
      resultContainer.classList.add(`is-${ticket.status.toLowerCase()}`);
      resultContainer.innerHTML = `<strong>${labels[ticket.status]}</strong>`;

      if (ticket.status !== "NOT_FOUND") {
        resultContainer.innerHTML += `
          <span>${escapeHtml(ticket.ticketName)} — ${escapeHtml(ticket.eventName)}</span>
          <span>Nama: ${escapeHtml(ticket.customerName)}</span>
          <span>Kode: ${escapeHtml(ticket.code)}</span>
          ${
            ticket.expiresAt
              ? `<span>Berlaku sampai: ${escapeHtml(
                  new Date(ticket.expiresAt).toLocaleString("id-ID")
                )}</span>`
              : ""
          }
        `;
      }
    } catch (error) {
      resultContainer.classList.add("is-error");
      resultContainer.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Cek kode";
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    showLogin("Kamu sudah keluar dari dashboard.");
  });
}

if (sessionStorage.getItem(ADMIN_TOKEN_KEY)) {
  showDashboard();
  loadDashboardData().catch(error => {
    setDashboardMessage(error.message);
  });
} else {
  showLogin();
}
