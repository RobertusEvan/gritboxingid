const API_URL =
  typeof window.GRIT_API_URL === "string"
    ? window.GRIT_API_URL
    : "http://localhost:3000";
const ticketsById = new Map();
let snapLoadPromise;
let ticketSalesOpen = false;

/*
|--------------------------------------------------------------------------
| Navigasi mobile
|--------------------------------------------------------------------------
*/

const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector(".nav-menu");

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.toggle("open");

    navToggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );
  });

  document.querySelectorAll(".nav-menu a").forEach(link => {
    link.addEventListener("click", () => {
      navMenu.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

/*
|--------------------------------------------------------------------------
| Format mata uang
|--------------------------------------------------------------------------
*/

function formatRupiah(amount) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0
  }).format(amount);
}

/*
|--------------------------------------------------------------------------
| Menghindari HTML injection
|--------------------------------------------------------------------------
*/

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*
|--------------------------------------------------------------------------
| Membuat benefit tiket
|--------------------------------------------------------------------------
*/

function renderBenefits(benefits) {
  if (!Array.isArray(benefits) || benefits.length === 0) {
    return "";
  }

  return `
    <ul class="ticket-benefits">
      ${benefits
        .map(benefit => `<li>${escapeHtml(benefit)}</li>`)
        .join("")}
    </ul>
  `;
}

/*
|--------------------------------------------------------------------------
| Membuat kartu tiket
|--------------------------------------------------------------------------
*/

function renderTicketCard(ticket) {
  const soldOut =
    ticket.status === "SOLD_OUT" ||
    ticket.stock <= 0;
  const unavailable = soldOut || !ticketSalesOpen;

  const statusText = !ticketSalesOpen
    ? "Penjualan ditutup"
    : soldOut
      ? "Habis"
      : "Tersedia";

  const stockText = !ticketSalesOpen
    ? "Pembelian tiket belum dibuka"
    : soldOut
      ? "Tiket telah habis"
      : `${ticket.stock} tiket tersedia`;

  return `
    <article class="ticket-card">
      <div class="ticket-card-content">
        <div class="ticket-description">
          <span
            class="ticket-status ${
              unavailable ? "sold-out" : "available"
            }"
          >
            ${statusText}
          </span>

          <h4>${escapeHtml(ticket.name)}</h4>

          <p>
            ${escapeHtml(
              ticket.description || "Tiket GRIT Boxing."
            )}
          </p>

          ${renderBenefits(ticket.benefits)}

          <small>
            Maksimal pembelian:
            ${Number(ticket.maxPurchase || 1)} tiket
          </small>
        </div>

        <div class="ticket-card-action">
          <strong class="ticket-price">
            ${formatRupiah(ticket.price)}
          </strong>

          <p class="ticket-stock">
            ${stockText}
          </p>

          <button
            type="button"
            class="select-ticket-button"
            data-ticket-id="${escapeHtml(ticket.id)}"
            ${unavailable ? "disabled" : ""}
          >
            ${!ticketSalesOpen ? "Belum Dibuka" : soldOut ? "Habis" : "Pilih Tiket"}
          </button>
        </div>
      </div>
    </article>
  `;
}

function formatEventDate(value, options) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("id-ID", {
    ...options,
    timeZone: "Asia/Jakarta"
  }).format(date);
}

function applyEventDetails(event) {
  const configured = Boolean(event && event.isConfigured);
  const name = configured ? event.name : "GRIT BOXING";
  const date = configured
    ? formatEventDate(event.startAt, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric"
      })
    : "Belum ada acara";
  const time = configured
    ? `${formatEventDate(event.startAt, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      })} WIB`
    : "Jadwal akan diumumkan";
  const location = configured ? event.location : "Lokasi belum diumumkan";
  const description =
    configured && event.description
      ? event.description
      : "Detail acara akan diumumkan.";

  document.querySelector("#heroEventName").textContent = name;
  document.querySelector("#heroEventDate").textContent = date;
  document.querySelector("#heroEventTime").textContent = time;
  document.querySelector("#heroEventLocation").textContent = location;
  document.querySelector("#heroEventAddress").textContent = configured
    ? "Lokasi pertandingan"
    : "Informasi acara akan diperbarui di sini";
  document.querySelector("#eventDate").textContent = date;
  document.querySelector("#eventTime").textContent = time;
  document.querySelector("#eventLocation").textContent = location;
  document.querySelector("#eventAddress").textContent = configured
    ? "Lokasi pertandingan"
    : "Informasi lokasi akan diperbarui";
  document.querySelector("#eventDescription").textContent = description;
  document.querySelector("#eventMapLocation").textContent = configured
    ? location
    : "Lokasi acara akan diumumkan.";
  document.querySelector("#ticketEventName").textContent = name;
  document.querySelector("#checkoutEventName").textContent = name;
  document.title = configured ? name : "GRIT Boxing ID";

  const mapLink = document.querySelector("#eventMapLink");
  const mapUrl = configured ? event.mapUrl : "";
  mapLink.hidden = !mapUrl;
  if (mapLink.hidden) {
    mapLink.removeAttribute("href");
  } else {
    mapLink.href = mapUrl;
  }

  ticketSalesOpen = Boolean(event && event.salesOpen);
  const notice = document.querySelector("#ticketSalesNotice");
  notice.hidden = ticketSalesOpen;
  notice.textContent = configured
    ? "Penjualan tiket belum dibuka atau sudah ditutup."
    : "Belum ada acara aktif. Penjualan tiket belum dibuka.";
}

/*
|--------------------------------------------------------------------------
| Mengambil kategori tiket dari backend
|--------------------------------------------------------------------------
*/

async function loadTicketCategories() {
  const container =
    document.querySelector("#ticketCategories");

  if (!container) {
    return;
  }

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Memuat tiket...</p>
    </div>
  `;

  try {
    const response = await fetch(
      `${API_URL}/api/ticket-categories`
    );

    if (!response.ok) {
      throw new Error(
        `Server memberikan status ${response.status}`
      );
    }

    const result = await response.json();

    if (
      !result.success ||
      !Array.isArray(result.data)
    ) {
      throw new Error("Format data tiket tidak sesuai.");
    }

    applyEventDetails(result.event);

    if (result.data.length === 0) {
      container.innerHTML = `
        <div class="ticket-error">
          <strong>Belum ada tiket tersedia.</strong>
          <p>
            Silakan periksa kembali informasi penjualan tiket.
          </p>
        </div>
      `;

      return;
    }

    ticketsById.clear();
    const availablePrices = [];
    result.data.forEach(category => {
      (category.tickets || []).forEach(ticket => {
        ticketsById.set(ticket.id, ticket);
        if (
          ticketSalesOpen &&
          ticket.status !== "SOLD_OUT" &&
          ticket.stock > 0
        ) {
          availablePrices.push(Number(ticket.price));
        }
      });
    });
    document.querySelector("#eventStartingPrice").textContent =
      availablePrices.length > 0
        ? `Mulai dari ${formatRupiah(Math.min(...availablePrices))}`
        : "Belum diumumkan";

    container.innerHTML = result.data
      .map(category => {
        const tickets = Array.isArray(category.tickets)
          ? category.tickets
          : [];

        return `
          <section class="ticket-category">
            <div class="ticket-category-heading">
              <div>
                <h3>${escapeHtml(category.name)}</h3>

                <p>
                  ${escapeHtml(
                    category.description || ""
                  )}
                </p>
              </div>

              <span class="ticket-category-count">
                ${tickets.length} jenis tiket
              </span>
            </div>

            <div class="ticket-list">
              ${tickets
                .map(ticket => renderTicketCard(ticket))
                .join("")}
            </div>
          </section>
        `;
      })
      .join("");

    activateTicketButtons();
  } catch (error) {
    console.error("Gagal memuat tiket:", error);

    container.innerHTML = `
      <div class="ticket-error">
        <strong>Data tiket gagal dimuat.</strong>

        <p>
          Periksa koneksi backend dan URL API di
          <code>frontend/config.js</code>.
        </p>

        <button
          type="button"
          class="btn btn-dark retry-button"
          id="retryTickets"
        >
          Coba Lagi
        </button>
      </div>
    `;

    const retryButton =
      document.querySelector("#retryTickets");

    if (retryButton) {
      retryButton.addEventListener(
        "click",
        loadTicketCategories
      );
    }
  }
}

/*
|--------------------------------------------------------------------------
| Tombol pemilihan tiket
|--------------------------------------------------------------------------
*/

function activateTicketButtons() {
  const buttons = document.querySelectorAll(
    ".select-ticket-button:not(:disabled)"
  );

  buttons.forEach(button => {
    button.addEventListener("click", () => {
      const ticketId = button.dataset.ticketId;
      const ticket = ticketsById.get(ticketId);
      const checkoutDialog =
        document.querySelector("#checkoutDialog");

      if (!ticket || !checkoutDialog) {
        return;
      }

      document.querySelector("#checkoutTicketId").value =
        ticket.id;
      document.querySelector("#checkoutTicketName").textContent =
        ticket.name;
      document.querySelector("#checkoutTicketPrice").textContent =
        formatRupiah(ticket.price);
      document.querySelector("#checkoutStatus").textContent = "";
      paymentPageStatus.hidden = true;
      paymentPageStatus.textContent = "";
      checkoutDialog.showModal();
    });
  });
}

function loadSnap(clientKey, isProduction) {
  if (
    window.snap &&
    Array.from(document.scripts).some(
      script => script.dataset.clientKey === clientKey
    )
  ) {
    return Promise.resolve();
  }

  if (snapLoadPromise) {
    return snapLoadPromise;
  }

  snapLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = isProduction
      ? "https://app.midtrans.com/snap/snap.js"
      : "https://app.sandbox.midtrans.com/snap/snap.js";
    script.dataset.clientKey = clientKey;
    script.setAttribute("data-client-key", clientKey);
    script.onload = () => resolve();
    script.onerror = () => {
      snapLoadPromise = null;
      reject(new Error("Komponen pembayaran Midtrans gagal dimuat."));
    };
    document.head.appendChild(script);
  });

  return snapLoadPromise;
}

const checkoutForm =
  document.querySelector("#checkoutForm");
const checkoutDialog =
  document.querySelector("#checkoutDialog");
const checkoutClose =
  document.querySelector("#checkoutClose");
const paymentPageStatus =
  document.querySelector("#paymentPageStatus");

function showPaymentPageStatus(message, status = "") {
  if (!paymentPageStatus) {
    return;
  }
  paymentPageStatus.textContent = message;
  paymentPageStatus.className = "payment-page-status";
  if (status) {
    paymentPageStatus.classList.add(`is-${status}`);
  }
  paymentPageStatus.hidden = false;
  paymentPageStatus.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

if (checkoutDialog && checkoutClose) {
  checkoutClose.addEventListener("click", () => {
    checkoutDialog.close();
  });
}

if (checkoutForm) {
  checkoutForm.addEventListener("submit", async event => {
    event.preventDefault();

    const submitButton =
      document.querySelector("#checkoutSubmit");
    const status =
      document.querySelector("#checkoutStatus");
    const ticketId =
      document.querySelector("#checkoutTicketId").value;
    const name =
      document.querySelector("#checkoutName").value.trim();
    const email =
      document.querySelector("#checkoutEmail").value.trim();
    const phone =
      document.querySelector("#checkoutPhone").value.trim();

    status.textContent = "Menyiapkan pembayaran...";
    submitButton.disabled = true;

    try {
      const response = await fetch(`${API_URL}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketId, name, email, phone })
      });
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || "Transaksi tidak dapat dibuat."
        );
      }

      await loadSnap(result.clientKey, result.isProduction);
      if (!window.snap) {
        throw new Error("Komponen pembayaran Midtrans tidak tersedia.");
      }

      checkoutDialog.close();
      showPaymentPageStatus("Silakan selesaikan pembayaran di Midtrans.");
      window.snap.pay(result.token, {
        onSuccess: () => {
          showPaymentPageStatus(
            "Pembayaran berhasil. Kode tiket akan dikirim ke email setelah dikonfirmasi Midtrans.",
            "success"
          );
        },
        onPending: () => {
          showPaymentPageStatus(
            "Pembayaran menunggu konfirmasi Midtrans."
          );
        },
        onError: () => {
          showPaymentPageStatus(
            "Pembayaran gagal. Silakan coba kembali.",
            "error"
          );
        },
        onClose: () => {
          showPaymentPageStatus(
            "Jendela pembayaran ditutup. Jika pembayaran sudah dilakukan, tunggu konfirmasi email."
          );
        }
      });
    } catch (error) {
      console.error("Checkout gagal:", error);
      if (checkoutDialog.open) {
        status.textContent = error.message;
      } else {
        showPaymentPageStatus(error.message, "error");
      }
    } finally {
      submitButton.disabled = false;
    }
  });
}

/*
|--------------------------------------------------------------------------
| Fight card
|--------------------------------------------------------------------------
*/

const showAllButton =
  document.querySelector("#showAll");

const fightGrid =
  document.querySelector("#fightGrid");

if (showAllButton && fightGrid) {
  showAllButton.addEventListener("click", () => {
    fightGrid.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  });
}

/*
|--------------------------------------------------------------------------
| Memulai pengambilan tiket
|--------------------------------------------------------------------------
*/

loadTicketCategories();