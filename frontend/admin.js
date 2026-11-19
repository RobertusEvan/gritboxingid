const API_URL =
  typeof window.GRIT_API_URL === "string"
    ? window.GRIT_API_URL
    : "http://localhost:3000";
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
const summaryRange = document.querySelector("#adminSummaryRange");
const fightCardList = document.querySelector("#adminFightCardList");
const sponsorList = document.querySelector("#adminSponsorList");
const fightCardForm = document.querySelector("#adminFightCardForm");
const sponsorForm = document.querySelector("#adminSponsorForm");
const adminPageButtons = document.querySelectorAll("[data-admin-page]");
const adminPageSections = document.querySelectorAll(
  "[data-admin-page-content]"
);
let pendingSiteImageUploads = 0;
let siteContentSaving = false;
const rupiahFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0
});

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
  setAdminPage("overview");
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

function setAdminPage(page) {
  adminPageButtons.forEach(button => {
    const isActive = button.dataset.adminPage === page;
    button.classList.toggle("is-active", isActive);
    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });
  adminPageSections.forEach(section => {
    section.hidden = section.dataset.adminPageContent !== page;
  });
}

function getJakartaDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function renderRevenueChart(daily, days) {
  const chart = document.querySelector("#adminRevenueChart");
  const amountByDate = new Map(
    daily.map(item => [item.date, Number(item.amount)])
  );
  const dates = Array.from({ length: days }, (_, index) =>
    getJakartaDateKey(new Date(Date.now() - (days - index - 1) * 86400000))
  );
  const amounts = dates.map(date => amountByDate.get(date) || 0);
  const maximum = Math.max(...amounts, 0);
  const labelInterval = Math.max(1, Math.ceil(days / 8));

  chart.innerHTML = `
    <div class="admin-chart-bars">
      ${dates
        .map((date, index) => {
          const amount = amounts[index];
          const height = maximum > 0 && amount > 0
            ? Math.max(5, (amount / maximum) * 150)
            : 3;
          const showLabel =
            index % labelInterval === 0 || index === dates.length - 1;
          const dateLabel = new Date(`${date}T12:00:00+07:00`)
            .toLocaleDateString("id-ID", {
              day: "numeric",
              month: "short",
              timeZone: "Asia/Jakarta"
            });

          return `
            <div class="admin-chart-column" title="${escapeHtml(dateLabel)}: ${rupiahFormatter.format(amount)}">
              <span class="admin-chart-bar" style="height:${height}px"></span>
              <span class="admin-chart-label">${showLabel ? escapeHtml(dateLabel) : ""}</span>
            </div>
          `;
        })
        .join("")}
    </div>
    ${
      maximum === 0
        ? '<p class="admin-chart-overlay">Belum ada pembayaran settlement pada periode ini.</p>'
        : ""
    }
  `;
}

function paymentMethodLabel(method) {
  const labels = {
    bank_transfer: "Transfer bank",
    qris: "QRIS",
    gopay: "GoPay",
    shopeepay: "ShopeePay",
    credit_card: "Kartu kredit",
    cstore: "Gerai retail",
    echannel: "Mandiri bill",
    other: "Lainnya"
  };
  return labels[method] || method.replaceAll("_", " ");
}

function renderPaymentMethods(methods) {
  const donut = document.querySelector("#adminPaymentDonut");
  const legend = document.querySelector("#adminPaymentLegend");
  const colors = ["#e54b3b", "#181818", "#c79b42", "#4d8c78", "#8581ad"];
  const total = methods.reduce(
    (sum, method) => sum + Number(method.amount),
    0
  );

  if (total === 0) {
    donut.style.background = "conic-gradient(#e9e7e1 0 360deg)";
    legend.innerHTML =
      '<p class="admin-chart-empty">Belum ada data metode pembayaran.</p>';
    return;
  }

  let currentAngle = 0;
  const segments = methods.map((method, index) => {
    const percentage = (Number(method.amount) / total) * 360;
    const segment = `${colors[index % colors.length]} ${currentAngle}deg ${currentAngle + percentage}deg`;
    currentAngle += percentage;
    return segment;
  });
  donut.style.background = `conic-gradient(${segments.join(", ")})`;
  legend.innerHTML = methods
    .map(
      (method, index) => `
        <div class="admin-method-item">
          <span class="admin-method-dot" style="background:${colors[index % colors.length]}"></span>
          <span class="admin-method-name">${escapeHtml(paymentMethodLabel(method.method))}</span>
          <strong>${rupiahFormatter.format(Number(method.amount))}</strong>
        </div>
      `
    )
    .join("");
}

async function loadSummaryData() {
  const days = Number(summaryRange.value);
  const result = await adminRequest(
    `/api/admin/summary?days=${encodeURIComponent(days)}`
  );
  const { summary, daily, paymentMethods } = result.data;
  document.querySelector("#summaryRevenue").textContent =
    rupiahFormatter.format(summary.revenue);
  document.querySelector("#summaryTransactions").textContent =
    summary.successfulTransactions.toLocaleString("id-ID");
  document.querySelector("#summaryTickets").textContent =
    summary.issuedTickets.toLocaleString("id-ID");
  document.querySelector("#summaryPending").textContent =
    summary.pendingTransactions.toLocaleString("id-ID");
  renderRevenueChart(daily, result.data.days);
  renderPaymentMethods(paymentMethods);
}

async function loadDashboardData() {
  ticketList.innerHTML = `
    <div class="admin-loading">
      <span class="spinner" aria-hidden="true"></span>
      Memuat tiket...
    </div>
  `;

  const [tickets, event, siteContent] = await Promise.all([
    adminRequest("/api/admin/tickets"),
    adminRequest("/api/admin/event"),
    adminRequest("/api/admin/site-content")
  ]);
  populateEvent(event.data);
  populateTicketCategories(tickets.data);
  ticketList.innerHTML = renderCategories(tickets.data);
  populateSiteContent(siteContent.data);
}

function createSiteEntryId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `item-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function getSiteImageUrl(imageId) {
  return `${API_URL}/api/site-images/${encodeURIComponent(imageId)}`;
}

function renderSiteImageField(label, fieldName, imageId, altText, noun = "foto") {
  const hasImage = Boolean(imageId);
  return `
    <div class="admin-site-image-field">
      <label>
        ${escapeHtml(label)}
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          data-image-slot="${fieldName}"
        >
      </label>
      <input
        type="hidden"
        name="${fieldName}"
        value="${hasImage ? escapeHtml(imageId) : ""}"
      >
      <div class="admin-site-image-preview">
        <img
          data-image-preview="${fieldName}"
          src="${hasImage ? escapeHtml(getSiteImageUrl(imageId)) : ""}"
          alt="${escapeHtml(altText)}"
          ${hasImage ? "" : "hidden"}
        >
        <span data-image-placeholder="${fieldName}" ${hasImage ? "hidden" : ""}>
          Belum ada ${noun}
        </span>
      </div>
      <div class="admin-site-image-actions">
        <button
          class="btn btn-light"
          type="button"
          data-clear-image="${fieldName}"
          ${hasImage ? "" : "hidden"}
        >
          Hapus ${noun}
        </button>
        <span data-image-status="${fieldName}" aria-live="polite"></span>
      </div>
    </div>
  `;
}

function renderFightCardEditor(fight, index) {
  return `
    <article class="admin-site-item" data-item-id="${escapeHtml(fight.id)}">
      <div class="admin-site-item-heading">
        <h3>Pertandingan ${index + 1}</h3>
        <button
          class="btn btn-light"
          type="button"
          data-remove-site-item
        >
          Hapus pertandingan
        </button>
      </div>
      <div class="admin-site-item-fields">
        <label>
          Nama fighter merah
          <input name="redName" type="text" maxlength="100" value="${escapeHtml(fight.redName)}" required>
        </label>
        <label>
          Nama fighter biru
          <input name="blueName" type="text" maxlength="100" value="${escapeHtml(fight.blueName)}" required>
        </label>
        <label class="field-wide">
          Kelas pertandingan
          <input name="division" type="text" maxlength="100" value="${escapeHtml(fight.division)}" required>
        </label>
        ${renderSiteImageField(
          "Foto fighter merah",
          "redImageId",
          fight.redImageId,
          fight.redName,
          "foto"
        )}
        ${renderSiteImageField(
          "Foto fighter biru",
          "blueImageId",
          fight.blueImageId,
          fight.blueName,
          "foto"
        )}
      </div>
    </article>
  `;
}

function renderSponsorEditor(sponsor, index) {
  return `
    <article class="admin-site-item" data-item-id="${escapeHtml(sponsor.id)}">
      <div class="admin-site-item-heading">
        <h3>Sponsor ${index + 1}</h3>
        <button
          class="btn btn-light"
          type="button"
          data-remove-site-item
        >
          Hapus sponsor
        </button>
      </div>
      <div class="admin-site-item-fields">
        <label>
          Nama sponsor
          <input name="name" type="text" maxlength="100" value="${escapeHtml(sponsor.name)}" required>
        </label>
        ${renderSiteImageField(
          "Logo sponsor",
          "imageId",
          sponsor.imageId,
          `${sponsor.name} logo`,
          "logo"
        )}
      </div>
    </article>
  `;
}

function populateSiteContent(content) {
  renderFightCardList(
    Array.isArray(content.fightCards) ? content.fightCards : []
  );
  renderSponsorList(Array.isArray(content.sponsors) ? content.sponsors : []);
}

function renderFightCardList(fightCards) {
  fightCardList.innerHTML =
    fightCards.length > 0
      ? fightCards.map(renderFightCardEditor).join("")
      : '<p class="admin-empty">Belum ada pertandingan. Tambahkan Fight Card untuk ditampilkan.</p>';
}

function renderSponsorList(sponsors) {
  sponsorList.innerHTML =
    sponsors.length > 0
      ? sponsors.map(renderSponsorEditor).join("")
      : '<p class="admin-empty">Belum ada sponsor. Tambahkan sponsor untuk ditampilkan.</p>';
}

function collectFightCards() {
  return Array.from(fightCardList.querySelectorAll(".admin-site-item")).map(
    item => ({
      id: item.dataset.itemId,
      redName: item.querySelector('[name="redName"]').value,
      blueName: item.querySelector('[name="blueName"]').value,
      division: item.querySelector('[name="division"]').value,
      redImageId: item.querySelector('[name="redImageId"]').value || null,
      blueImageId: item.querySelector('[name="blueImageId"]').value || null
    })
  );
}

function collectSponsors() {
  return Array.from(sponsorList.querySelectorAll(".admin-site-item")).map(
    item => ({
      id: item.dataset.itemId,
      name: item.querySelector('[name="name"]').value,
      imageId: item.querySelector('[name="imageId"]').value || null
    })
  );
}

async function uploadSiteImage(input) {
  const file = input.files && input.files[0];
  if (!file) {
    return;
  }

  if (siteContentSaving) {
    input.value = "";
    setDashboardMessage("Tunggu penyimpanan selesai sebelum mengunggah gambar.");
    return;
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
  const item = input.closest(".admin-site-item");
  const fieldName = input.dataset.imageSlot;
  const status = item.querySelector(`[data-image-status="${fieldName}"]`);
  const uploadButton = input;

  if (!allowedTypes.includes(file.type) || file.size > 2 * 1024 * 1024) {
    status.textContent = "Pilih PNG, JPG, atau WebP maksimal 2 MB.";
    input.value = "";
    return;
  }

  pendingSiteImageUploads += 1;
  document.querySelector("#saveFightCardsButton").disabled = true;
  document.querySelector("#saveSponsorsButton").disabled = true;
  uploadButton.disabled = true;
  status.textContent = "Mengunggah gambar...";
  try {
    const result = await adminRequest("/api/admin/site-images", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Image-Type": file.type
      },
      body: file
    });
    const imageId = result.data.imageId;
    const image = item.querySelector(`[data-image-preview="${fieldName}"]`);
    const placeholder = item.querySelector(
      `[data-image-placeholder="${fieldName}"]`
    );
    const hiddenInput = item.querySelector(`[name="${fieldName}"]`);
    const clearButton = item.querySelector(`[data-clear-image="${fieldName}"]`);
    hiddenInput.value = imageId;
    image.src = getSiteImageUrl(imageId);
    image.hidden = false;
    placeholder.hidden = true;
    clearButton.hidden = false;
    status.textContent = "Gambar terunggah. Simpan perubahan untuk menerapkan.";
  } catch (error) {
    status.textContent = error.message;
  } finally {
    uploadButton.disabled = false;
    input.value = "";
    pendingSiteImageUploads -= 1;
    if (pendingSiteImageUploads === 0 && !siteContentSaving) {
      document.querySelector("#saveFightCardsButton").disabled = false;
      document.querySelector("#saveSponsorsButton").disabled = false;
    }
  }
}

function setSiteContentFormsDisabled(disabled) {
  [fightCardForm, sponsorForm].forEach(form => {
    form.querySelectorAll("input, button").forEach(control => {
      control.disabled = disabled;
    });
  });
}

async function saveSiteContent(button, contentKey) {
  if (pendingSiteImageUploads > 0) {
    setDashboardMessage("Tunggu semua gambar selesai diunggah sebelum menyimpan.");
    return;
  }

  const content = {
    fightCards: collectFightCards(),
    sponsors: collectSponsors()
  };
  siteContentSaving = true;
  setSiteContentFormsDisabled(true);
  const originalLabel = button.textContent;
  button.textContent = "Menyimpan...";
  setDashboardMessage("");

  try {
    const result = await adminRequest("/api/admin/site-content", {
      method: "PATCH",
      body: JSON.stringify(content)
    });
    populateSiteContent(result.data);
    const message =
      contentKey === "fightCards"
        ? "Fight Card berhasil disimpan."
        : "Logo sponsor berhasil disimpan.";
    setDashboardMessage(message, true);
  } catch (error) {
    setDashboardMessage(error.message);
  } finally {
    siteContentSaving = false;
    setSiteContentFormsDisabled(pendingSiteImageUploads > 0);
    if (pendingSiteImageUploads === 0) {
      document.querySelector("#saveFightCardsButton").disabled = false;
      document.querySelector("#saveSponsorsButton").disabled = false;
    }
    button.textContent = originalLabel;
  }
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
      await Promise.all([loadDashboardData(), loadSummaryData()]);
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

adminPageButtons.forEach(button => {
  button.addEventListener("click", () => {
    const page = button.dataset.adminPage;
    setAdminPage(page);
    if (page === "overview") {
      loadSummaryData().catch(error => setDashboardMessage(error.message));
    }
  });
});

if (summaryRange) {
  summaryRange.addEventListener("change", () => {
    loadSummaryData().catch(error => setDashboardMessage(error.message));
  });
}

if (fightCardList) {
  fightCardList.addEventListener("change", event => {
    const input = event.target.closest("[data-image-slot]");
    if (input) {
      uploadSiteImage(input);
    }
  });
  fightCardList.addEventListener("click", event => {
    const clearButton = event.target.closest("[data-clear-image]");
    if (clearButton) {
      const item = clearButton.closest(".admin-site-item");
      const fieldName = clearButton.dataset.clearImage;
      item.querySelector(`[name="${fieldName}"]`).value = "";
      item.querySelector(`[data-image-preview="${fieldName}"]`).hidden = true;
      item.querySelector(`[data-image-placeholder="${fieldName}"]`).hidden =
        false;
      clearButton.hidden = true;
      item.querySelector(`[data-image-status="${fieldName}"]`).textContent =
        "Foto akan dihapus setelah disimpan.";
      return;
    }

    const removeButton = event.target.closest("[data-remove-site-item]");
    if (removeButton) {
      removeButton.closest(".admin-site-item").remove();
      renderFightCardList(collectFightCards());
    }
  });
}

if (sponsorList) {
  sponsorList.addEventListener("change", event => {
    const input = event.target.closest("[data-image-slot]");
    if (input) {
      uploadSiteImage(input);
    }
  });
  sponsorList.addEventListener("click", event => {
    const clearButton = event.target.closest("[data-clear-image]");
    if (clearButton) {
      const item = clearButton.closest(".admin-site-item");
      const fieldName = clearButton.dataset.clearImage;
      item.querySelector(`[name="${fieldName}"]`).value = "";
      item.querySelector(`[data-image-preview="${fieldName}"]`).hidden = true;
      item.querySelector(`[data-image-placeholder="${fieldName}"]`).hidden =
        false;
      clearButton.hidden = true;
      item.querySelector(`[data-image-status="${fieldName}"]`).textContent =
        "Logo akan dihapus setelah disimpan.";
      return;
    }

    const removeButton = event.target.closest("[data-remove-site-item]");
    if (removeButton) {
      removeButton.closest(".admin-site-item").remove();
      renderSponsorList(collectSponsors());
    }
  });
}

document.querySelector("#addFightCardButton").addEventListener("click", () => {
  const fightCards = collectFightCards();
  if (fightCards.length >= 30) {
    setDashboardMessage("Maksimal 30 pertandingan.");
    return;
  }
  fightCards.push({
    id: createSiteEntryId(),
    redName: "",
    blueName: "",
    division: "",
    redImageId: null,
    blueImageId: null
  });
  renderFightCardList(fightCards);
});

document.querySelector("#addSponsorButton").addEventListener("click", () => {
  const sponsors = collectSponsors();
  if (sponsors.length >= 50) {
    setDashboardMessage("Maksimal 50 sponsor.");
    return;
  }
  sponsors.push({
    id: createSiteEntryId(),
    name: "",
    imageId: null
  });
  renderSponsorList(sponsors);
});

if (fightCardForm) {
  fightCardForm.addEventListener("submit", event => {
    event.preventDefault();
    saveSiteContent(
      document.querySelector("#saveFightCardsButton"),
      "fightCards"
    );
  });
}

if (sponsorForm) {
  sponsorForm.addEventListener("submit", event => {
    event.preventDefault();
    saveSiteContent(
      document.querySelector("#saveSponsorsButton"),
      "sponsors"
    );
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
  Promise.all([loadDashboardData(), loadSummaryData()]).catch(error => {
    setDashboardMessage(error.message);
  });
} else {
  showLogin();
}
