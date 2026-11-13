const API_URL = "http://localhost:3000";

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

  const statusText = soldOut ? "Habis" : "Tersedia";

  const stockText = soldOut
    ? "Tiket telah habis"
    : `${ticket.stock} tiket tersedia`;

  return `
    <article class="ticket-card">
      <div class="ticket-card-content">
        <div class="ticket-description">
          <span
            class="ticket-status ${
              soldOut ? "sold-out" : "available"
            }"
          >
            ${statusText}
          </span>

          <h4>${escapeHtml(ticket.name)}</h4>

          <p>
            ${escapeHtml(
              ticket.description || "Tiket GRIT Boxing 2026."
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
            ${soldOut ? "disabled" : ""}
          >
            ${soldOut ? "Habis" : "Pilih Tiket"}
          </button>
        </div>
      </div>
    </article>
  `;
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
          Pastikan backend berjalan di
          <code>http://localhost:3000</code>.
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

      if (!ticketId) {
        return;
      }

      /*
       * checkout.html akan dibuat pada tahap berikutnya.
       * ID tiket dikirim melalui URL.
       */
      window.location.href =
        `checkout.html?ticket=${encodeURIComponent(ticketId)}`;
    });
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
| Form kontak
|--------------------------------------------------------------------------
*/

const contactDialog =
  document.querySelector("#contactDialog");

const dialogTitle =
  document.querySelector("#dialogTitle");

const messageInput =
  document.querySelector("#messageInput");

document
  .querySelectorAll(".modal-trigger")
  .forEach(button => {
    button.addEventListener("click", () => {
      if (!contactDialog) {
        return;
      }

      const type = button.dataset.type;

      if (type === "petinju") {
        dialogTitle.textContent =
          "Pendaftaran Fighter";

        messageInput.value =
          "Saya ingin mendapatkan informasi pendaftaran fighter.";
      } else {
        dialogTitle.textContent =
          "Kerja Sama Vendor atau Sponsor";

        messageInput.value =
          "Saya ingin membahas kerja sama dengan GRIT Boxing.";
      }

      contactDialog.showModal();
    });
  });

const submitFormButton =
  document.querySelector("#submitForm");

if (submitFormButton) {
  submitFormButton.addEventListener("click", () => {
    const name =
      document.querySelector("#nameInput")
        ?.value.trim();

    const phone =
      document.querySelector("#phoneInput")
        ?.value.trim();

    const formStatus =
      document.querySelector("#formStatus");

    if (!formStatus) {
      return;
    }

    if (!name || !phone) {
      formStatus.textContent =
        "Nama dan nomor WhatsApp wajib diisi.";

      return;
    }

    formStatus.textContent =
      "Data demo tersimpan. Form akan dihubungkan ke backend pada tahap berikutnya.";
  });
}

/*
|--------------------------------------------------------------------------
| Memulai pengambilan tiket
|--------------------------------------------------------------------------
*/

loadTicketCategories();