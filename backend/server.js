require("dotenv").config({
  path: require("path").join(__dirname, ".env")
});

const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");
const midtransClient = require("midtrans-client");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.DATABASE_SSL === "false"
          ? false
          : { rejectUnauthorized: false }
    })
  : null;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontend")));
app.use(
  "/images",
  express.static(path.join(__dirname, "..", "images"))
);

let databaseInitialization;

function initializeDatabase() {
  if (!pool) {
    return Promise.resolve();
  }
  if (!databaseInitialization) {
    databaseInitialization = ensureOrdersTable().catch(error => {
      databaseInitialization = null;
      throw error;
    });
  }
  return databaseInitialization;
}

app.use(async (req, res, next) => {
  try {
    await initializeDatabase();
    next();
  } catch (error) {
    console.error("Gagal menyiapkan database untuk request:", error);
    res.status(503).json({
      success: false,
      message: "Database belum siap. Silakan coba beberapa saat lagi."
    });
  }
});

const defaultEventData = {
  name: "",
  startAt: "",
  endAt: "",
  location: "",
  description: "",
  mapUrl: "",
  salesOpen: false
};

const ticketCategories = [
  {
    id: "supporter",
    name: "Supporter Access",
    description:
      "Tiket khusus untuk siswa sekolah, supporter, dan anggota boxing camp yang ingin memberikan dukungan kepada fighter.",
    tickets: [
      {
        id: "presale-1",
        name: "Presale 1",
        description: "Tiket untuk school supporter dan boxing camp supporter.",
        price: 13000,
        stock: 0,
        maxPurchase: 5,
        status: "SOLD_OUT"
      },
      {
        id: "presale-2",
        name: "Presale 2",
        description:
          "Tiket khusus sekolah, siswa, anggota, dan supporter boxing camp.",
        price: 15000,
        stock: 0,
        maxPurchase: 5,
        status: "SOLD_OUT"
      },
      {
        id: "presale-3",
        name: "Presale 3",
        description:
          "Support your fighter, represent your team, and be part of GRIT.",
        price: 20000,
        stock: 100,
        maxPurchase: 5,
        status: "AVAILABLE"
      }
    ]
  },
  {
    id: "general",
    name: "Umum",
    description:
      "Tiket bagi masyarakat yang ingin menyaksikan pertandingan GRIT Boxing.",
    tickets: [
      {
        id: "general-1",
        name: "Umum 1",
        description:
          "Tiket masyarakat umum untuk menyaksikan GRIT Boxing.",
        price: 18000,
        stock: 0,
        maxPurchase: 5,
        status: "SOLD_OUT"
      },
      {
        id: "general-2",
        name: "Umum 2",
        description: "Open for public dan berlaku untuk satu orang.",
        price: 20000,
        stock: 0,
        maxPurchase: 5,
        status: "SOLD_OUT"
      },
      {
        id: "general-3",
        name: "Umum 3",
        description:
          "Tiket umum untuk menyaksikan langsung pertandingan GRIT Boxing.",
        price: 25000,
        stock: 150,
        maxPurchase: 5,
        status: "AVAILABLE"
      }
    ]
  },
  {
    id: "vip",
    name: "VIP",
    description:
      "Tiket dengan akses khusus dan area menonton yang lebih eksklusif.",
    tickets: [
      {
        id: "vip",
        name: "VIP",
        description:
          "Nikmati pertandingan dari area VIP dengan posisi menonton yang lebih eksklusif.",
        benefits: [
          "Akses masuk area VIP",
          "Posisi menonton lebih eksklusif",
          "Area menonton lebih nyaman",
          "Menikmati pertandingan dari jarak lebih dekat"
        ],
        price: 50000,
        stock: 30,
        maxPurchase: 3,
        status: "AVAILABLE"
      }
    ]
  }
];

function getAllTickets(categories = ticketCategories) {
  return categories.flatMap(category =>
    category.tickets.map(ticket => ({
      ...ticket,
      categoryId: category.id,
      categoryName: category.name
    }))
  );
}

async function loadAppSettings() {
  if (!pool) {
    return {
      ticketCategories,
      event: defaultEventData
    };
  }

  const result = await pool.query(
    `SELECT ticket_categories, event_data
     FROM grit_boxing_settings
     WHERE settings_key = $1`,
    ["tickets"]
  );
  if (result.rows.length === 0) {
    throw new Error("Konfigurasi acara dan tiket belum tersedia.");
  }
  return {
    ticketCategories: result.rows[0].ticket_categories,
    event: result.rows[0].event_data || defaultEventData
  };
}

async function loadTicketCategories() {
  const settings = await loadAppSettings();
  return settings.ticketCategories;
}

function getEventStatus(event) {
  const startTime = Date.parse(event.startAt);
  const endTime = Date.parse(event.endAt);
  const configured = Boolean(
    event.name &&
      event.location &&
      Number.isFinite(startTime) &&
      Number.isFinite(endTime) &&
      endTime > startTime
  );

  return {
    ...event,
    isConfigured: configured,
    salesOpen:
      Boolean(event.salesOpen) &&
      configured &&
      endTime > Date.now()
  };
}

function isAdminConfigurationReady() {
  return Boolean(
    process.env.ADMIN_USERNAME &&
      process.env.ADMIN_PASSWORD &&
      process.env.ADMIN_PASSWORD.length >= 12 &&
      process.env.ADMIN_JWT_SECRET &&
      process.env.ADMIN_JWT_SECRET.length >= 32
  );
}

function safeStringEqual(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

const failedAdminLogins = new Map();
const ADMIN_LOGIN_LIMIT = 5;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;

function isAdminLoginBlocked(ip) {
  const attempt = failedAdminLogins.get(ip);
  if (!attempt || attempt.resetAt <= Date.now()) {
    failedAdminLogins.delete(ip);
    return false;
  }
  return attempt.count >= ADMIN_LOGIN_LIMIT;
}

function recordFailedAdminLogin(ip) {
  const now = Date.now();
  const attempt = failedAdminLogins.get(ip);
  if (!attempt || attempt.resetAt <= now) {
    failedAdminLogins.set(ip, {
      count: 1,
      resetAt: now + ADMIN_LOGIN_WINDOW_MS
    });
  } else {
    attempt.count += 1;
  }

  if (failedAdminLogins.size > 1000) {
    for (const [address, entry] of failedAdminLogins) {
      if (entry.resetAt <= now) {
        failedAdminLogins.delete(address);
      }
    }
  }
}

function requireAdmin(req, res, next) {
  if (!isAdminConfigurationReady()) {
    return res.status(503).json({
      success: false,
      message: "Konfigurasi admin belum lengkap."
    });
  }

  const authorization = req.get("authorization") || "";
  const [scheme, token] = authorization.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({
      success: false,
      message: "Silakan login sebagai admin."
    });
  }

  try {
    const payload = jwt.verify(token, process.env.ADMIN_JWT_SECRET);
    if (payload.role !== "admin") {
      throw new Error("Invalid admin role");
    }
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: "Sesi admin tidak valid atau sudah berakhir. Silakan login kembali."
    });
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[character];
  });
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createEmailTransporter() {
  const port = Number(process.env.SMTP_PORT);
  if (
    !process.env.SMTP_HOST ||
    !Number.isInteger(port) ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    throw new Error("Konfigurasi SMTP belum lengkap.");
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function ensureOrdersTable() {
  if (!pool) {
    return;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      order_id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      ticket_name TEXT,
      event_name TEXT,
      event_end_at TIMESTAMPTZ,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      gross_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_type TEXT,
      email_sent_at TIMESTAMPTZ,
      ticket_email_sent_at TIMESTAMPTZ,
      stock_decremented_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await Promise.all([
    pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ"
    ),
    pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS ticket_name TEXT"
    ),
    pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_name TEXT"
    ),
    pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_end_at TIMESTAMPTZ"
    ),
    pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS ticket_email_sent_at TIMESTAMPTZ"
    ),
    pool.query(
      "ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_decremented_at TIMESTAMPTZ"
    )
  ]);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grit_boxing_settings (
      settings_key TEXT PRIMARY KEY,
      ticket_categories JSONB NOT NULL,
      event_data JSONB,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "ALTER TABLE grit_boxing_settings ADD COLUMN IF NOT EXISTS event_data JSONB"
  );
  await pool.query(
    `INSERT INTO grit_boxing_settings
       (settings_key, ticket_categories, event_data)
     VALUES ($1, $2::jsonb, $3::jsonb)
     ON CONFLICT (settings_key) DO NOTHING`,
    [
      "tickets",
      JSON.stringify(ticketCategories),
      JSON.stringify(defaultEventData)
    ]
  );
  await pool.query(
    `UPDATE grit_boxing_settings
     SET event_data = $1::jsonb
     WHERE settings_key = $2 AND event_data IS NULL`,
    [JSON.stringify(defaultEventData), "tickets"]
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS grit_issued_tickets (
      ticket_code TEXT PRIMARY KEY,
      order_id TEXT NOT NULL UNIQUE REFERENCES orders(order_id),
      ticket_id TEXT NOT NULL,
      ticket_name TEXT NOT NULL,
      event_name TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(
    "CREATE INDEX IF NOT EXISTS grit_issued_tickets_email_idx ON grit_issued_tickets(customer_email)"
  );
  console.log("Tabel orders siap digunakan.");
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend GRIT Boxing ID berhasil berjalan"
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend GRIT Boxing ID berhasil berjalan"
  });
});

app.get("/api/event", async (req, res) => {
  try {
    const settings = await loadAppSettings();
    res.json({
      success: true,
      data: getEventStatus(settings.event)
    });
  } catch (error) {
    console.error("Gagal memuat informasi acara:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memuat informasi acara."
    });
  }
});

app.get("/api/ticket-categories", async (req, res) => {
  try {
    const settings = await loadAppSettings();
    res.json({
      success: true,
      data: settings.ticketCategories,
      event: getEventStatus(settings.event)
    });
  } catch (error) {
    console.error("Gagal memuat kategori tiket:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memuat tiket."
    });
  }
});

app.get("/api/tickets/:ticketId", async (req, res) => {
  let ticket;
  try {
    const categories = await loadTicketCategories();
    ticket = getAllTickets(categories).find(
      item => item.id === req.params.ticketId
    );
  } catch (error) {
    console.error("Gagal memuat tiket:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memuat tiket."
    });
  }

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Tiket tidak ditemukan"
    });
  }

  res.json({ success: true, data: ticket });
});

app.post("/api/admin/login", (req, res) => {
  if (!isAdminConfigurationReady()) {
    return res.status(503).json({
      success: false,
      message:
        "Pastikan backend/.env berisi ADMIN_USERNAME, ADMIN_PASSWORD (minimal 12 karakter), dan ADMIN_JWT_SECRET (minimal 32 karakter), lalu restart backend."
    });
  }

  if (isAdminLoginBlocked(req.ip)) {
    return res.status(429).json({
      success: false,
      message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit."
    });
  }

  const body =
    req.body && typeof req.body === "object" ? req.body : {};
  const username =
    typeof body.username === "string" ? body.username : "";
  const password =
    typeof body.password === "string" ? body.password : "";
  const validCredentials =
    safeStringEqual(username, process.env.ADMIN_USERNAME) &&
    safeStringEqual(password, process.env.ADMIN_PASSWORD);

  if (!validCredentials) {
    recordFailedAdminLogin(req.ip);
    return res.status(401).json({
      success: false,
      message: "Username atau password admin salah."
    });
  }

  failedAdminLogins.delete(req.ip);
  const token = jwt.sign(
    { role: "admin" },
    process.env.ADMIN_JWT_SECRET,
    {
      subject: process.env.ADMIN_USERNAME,
      expiresIn: "4h"
    }
  );
  res.json({ success: true, token, expiresIn: 14400 });
});

app.get("/api/admin/tickets", requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database belum dikonfigurasi."
    });
  }

  try {
    const categories = await loadTicketCategories();
    res.json({ success: true, data: categories });
  } catch (error) {
    console.error("Gagal memuat tiket admin:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memuat data tiket."
    });
  }
});

app.get("/api/admin/event", requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database belum dikonfigurasi."
    });
  }

  try {
    const settings = await loadAppSettings();
    res.json({ success: true, data: getEventStatus(settings.event) });
  } catch (error) {
    console.error("Gagal memuat pengaturan acara:", error);
    res.status(500).json({
      success: false,
      message: "Gagal memuat pengaturan acara."
    });
  }
});

app.patch("/api/admin/event", requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database belum dikonfigurasi."
    });
  }

  const input =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const name = typeof input.name === "string" ? input.name.trim() : null;
  const location =
    typeof input.location === "string" ? input.location.trim() : null;
  const description =
    typeof input.description === "string" ? input.description.trim() : null;
  const mapUrl = typeof input.mapUrl === "string" ? input.mapUrl.trim() : null;
  const startAt =
    typeof input.startAt === "string" ? input.startAt.trim() : null;
  const endAt = typeof input.endAt === "string" ? input.endAt.trim() : null;
  const salesOpen = input.salesOpen === true;

  if (
    name === null ||
    name.length > 120 ||
    location === null ||
    location.length > 200 ||
    description === null ||
    description.length > 1000 ||
    mapUrl === null ||
    mapUrl.length > 500 ||
    startAt === null ||
    endAt === null ||
    (startAt && !Number.isFinite(Date.parse(startAt))) ||
    (endAt && !Number.isFinite(Date.parse(endAt))) ||
    (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt))
  ) {
    return res.status(400).json({
      success: false,
      message: "Informasi acara tidak valid. Periksa nama, lokasi, dan jadwal."
    });
  }

  if (mapUrl) {
    try {
      if (new URL(mapUrl).protocol !== "https:") {
        throw new Error("URL peta harus menggunakan HTTPS.");
      }
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Tautan peta harus berupa URL HTTPS yang valid."
      });
    }
  }

  const event = {
    name,
    startAt: startAt ? new Date(startAt).toISOString() : "",
    endAt: endAt ? new Date(endAt).toISOString() : "",
    location,
    description,
    mapUrl,
    salesOpen
  };
  const eventStatus = getEventStatus(event);

  if (salesOpen && (!eventStatus.isConfigured || !eventStatus.salesOpen)) {
    return res.status(400).json({
      success: false,
      message:
        "Penjualan hanya dapat dibuka jika nama, lokasi, dan jadwal acara lengkap serta tanggal selesai belum lewat."
    });
  }

  try {
    const result = await pool.query(
      `UPDATE grit_boxing_settings
       SET event_data = $1::jsonb, updated_at = NOW()
       WHERE settings_key = $2`,
      [JSON.stringify(event), "tickets"]
    );

    if (result.rowCount === 0) {
      return res.status(500).json({
        success: false,
        message: "Konfigurasi acara belum tersedia."
      });
    }

    res.json({
      success: true,
      message: "Pengaturan acara berhasil disimpan.",
      data: getEventStatus(event)
    });
  } catch (error) {
    console.error("Gagal menyimpan pengaturan acara:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menyimpan pengaturan acara."
    });
  }
});

app.post("/api/admin/tickets", requireAdmin, async (req, res) => {
  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database belum dikonfigurasi."
    });
  }

  const input =
    req.body && typeof req.body === "object" && !Array.isArray(req.body)
      ? req.body
      : {};
  const categoryId =
    typeof input.categoryId === "string" ? input.categoryId : "";
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const price = input.price;
  const stock = input.stock;

  if (
    !categoryId ||
    !name ||
    name.length > 80 ||
    description.length > 500 ||
    !Number.isSafeInteger(price) ||
    price < 1 ||
    price > 999999999 ||
    !Number.isSafeInteger(stock) ||
    stock < 0 ||
    stock > 1000000
  ) {
    return res.status(400).json({
      success: false,
      message: "Data tiket tidak valid. Periksa nama, harga, dan stok."
    });
  }

  let client;
  let transactionOpen = false;
  let paymentCommitted = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const settings = await client.query(
      `SELECT ticket_categories
       FROM grit_boxing_settings
       WHERE settings_key = $1
       FOR UPDATE`,
      ["tickets"]
    );
    if (settings.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(500).json({
        success: false,
        message: "Konfigurasi tiket belum tersedia."
      });
    }

    const categories = settings.rows[0].ticket_categories;
    const category = categories.find(item => item.id === categoryId);
    if (!category) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({
        success: false,
        message: "Kategori tiket tidak ditemukan."
      });
    }

    const ticket = {
      id: `ticket-${crypto.randomBytes(6).toString("hex")}`,
      name,
      description,
      price,
      stock,
      maxPurchase: 1,
      status: stock > 0 ? "AVAILABLE" : "SOLD_OUT"
    };
    const updatedCategories = categories.map(item =>
      item.id === categoryId
        ? { ...item, tickets: [...item.tickets, ticket] }
        : item
    );

    await client.query(
      `UPDATE grit_boxing_settings
       SET ticket_categories = $1::jsonb, updated_at = NOW()
       WHERE settings_key = $2`,
      [JSON.stringify(updatedCategories), "tickets"]
    );
    await client.query("COMMIT");
    transactionOpen = false;
    res.status(201).json({
      success: true,
      message: "Jenis tiket berhasil ditambahkan.",
      data: ticket
    });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Gagal membatalkan penambahan tiket:", rollbackError);
      }
    }
    console.error("Gagal menambahkan jenis tiket:", error);
    res.status(500).json({
      success: false,
      message: "Gagal menambahkan jenis tiket."
    });
  } finally {
    if (client) {
      client.release();
    }
  }
});

app.post(
  "/api/admin/tickets/verify",
  requireAdmin,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: "Database belum dikonfigurasi."
      });
    }

    const code =
      req.body && typeof req.body.code === "string"
        ? req.body.code.trim().toUpperCase()
        : "";
    if (!code || code.length > 40) {
      return res.status(400).json({
        success: false,
        message: "Masukkan kode tiket yang valid."
      });
    }

    try {
      const result = await pool.query(
        `SELECT ticket_code, ticket_name, event_name, customer_name,
                customer_email, expires_at, created_at
         FROM grit_issued_tickets
         WHERE ticket_code = $1`,
        [code]
      );
      if (result.rows.length === 0) {
        return res.json({
          success: true,
          data: { status: "NOT_FOUND" }
        });
      }

      const ticket = result.rows[0];
      const expired =
        ticket.expires_at &&
        new Date(ticket.expires_at).getTime() <= Date.now();
      res.json({
        success: true,
        data: {
          status: expired ? "EXPIRED" : "VALID",
          code: ticket.ticket_code,
          ticketName: ticket.ticket_name,
          eventName: ticket.event_name,
          customerName: ticket.customer_name,
          customerEmail: ticket.customer_email,
          expiresAt: ticket.expires_at,
          issuedAt: ticket.created_at
        }
      });
    } catch (error) {
      console.error("Gagal mengecek kode tiket:", error);
      res.status(500).json({
        success: false,
        message: "Gagal mengecek kode tiket."
      });
    }
  }
);

app.patch(
  "/api/admin/tickets/:ticketId",
  requireAdmin,
  async (req, res) => {
    if (!pool) {
      return res.status(503).json({
        success: false,
        message: "Database belum dikonfigurasi."
      });
    }

    const allowedFields = new Set([
      "name",
      "description",
      "price",
      "stock",
      "status"
    ]);
    const input =
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? req.body
        : {};
    const inputFields = Object.keys(input);

    if (
      inputFields.length === 0 ||
      inputFields.some(field => !allowedFields.has(field))
    ) {
      return res.status(400).json({
        success: false,
        message: "Data perubahan tiket tidak valid."
      });
    }

    const updates = {};
    if (Object.prototype.hasOwnProperty.call(input, "name")) {
      if (
        typeof input.name !== "string" ||
        !input.name.trim() ||
        input.name.trim().length > 80
      ) {
        return res.status(400).json({
          success: false,
          message: "Nama tiket wajib diisi dan maksimal 80 karakter."
        });
      }
      updates.name = input.name.trim();
    }

    if (Object.prototype.hasOwnProperty.call(input, "description")) {
      if (
        typeof input.description !== "string" ||
        input.description.length > 500
      ) {
        return res.status(400).json({
          success: false,
          message: "Deskripsi tiket maksimal 500 karakter."
        });
      }
      updates.description = input.description.trim();
    }

    if (Object.prototype.hasOwnProperty.call(input, "price")) {
      if (
        !Number.isSafeInteger(input.price) ||
        input.price < 1 ||
        input.price > 999999999
      ) {
        return res.status(400).json({
          success: false,
          message: "Harga tiket harus berupa bilangan bulat yang valid."
        });
      }
      updates.price = input.price;
    }

    if (Object.prototype.hasOwnProperty.call(input, "stock")) {
      if (
        !Number.isSafeInteger(input.stock) ||
        input.stock < 0 ||
        input.stock > 1000000
      ) {
        return res.status(400).json({
          success: false,
          message: "Stok harus berupa bilangan bulat antara 0 dan 1.000.000."
        });
      }
      updates.stock = input.stock;
    }

    if (Object.prototype.hasOwnProperty.call(input, "status")) {
      if (!["AVAILABLE", "SOLD_OUT"].includes(input.status)) {
        return res.status(400).json({
          success: false,
          message: "Status tiket tidak valid."
        });
      }
      updates.status = input.status;
    }

    let client;
    let transactionOpen = false;
    try {
      client = await pool.connect();
      await client.query("BEGIN");
      transactionOpen = true;
      const settings = await client.query(
        "SELECT ticket_categories FROM grit_boxing_settings WHERE settings_key = $1 FOR UPDATE",
        ["tickets"]
      );

      if (settings.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return res.status(500).json({
          success: false,
          message: "Konfigurasi tiket belum tersedia."
        });
      }

      const categories = settings.rows[0].ticket_categories;
      const ticket = getAllTickets(categories).find(
        item => item.id === req.params.ticketId
      );
      if (!ticket) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return res.status(404).json({
          success: false,
          message: "Tiket tidak ditemukan."
        });
      }

      const updatedTicket = { ...ticket, ...updates };
      delete updatedTicket.categoryId;
      delete updatedTicket.categoryName;
      if (
        updatedTicket.status === "AVAILABLE" &&
        updatedTicket.stock <= 0
      ) {
        await client.query("ROLLBACK");
        transactionOpen = false;
        return res.status(400).json({
          success: false,
          message: "Tiket tidak bisa tersedia jika stoknya nol."
        });
      }

      if (updatedTicket.stock === 0) {
        updatedTicket.status = "SOLD_OUT";
      }

      const updatedCategories = categories.map(category => ({
        ...category,
        tickets: category.tickets.map(existingTicket =>
          existingTicket.id === ticket.id ? updatedTicket : existingTicket
        )
      }));

      await client.query(
        `UPDATE grit_boxing_settings
         SET ticket_categories = $1::jsonb, updated_at = NOW()
         WHERE settings_key = $2`,
        [JSON.stringify(updatedCategories), "tickets"]
      );
      await client.query("COMMIT");
      transactionOpen = false;

      res.json({
        success: true,
        message: "Perubahan tiket berhasil disimpan.",
        data: updatedTicket
      });
    } catch (error) {
      if (client && transactionOpen) {
        try {
          await client.query("ROLLBACK");
        } catch (rollbackError) {
          console.error("Gagal membatalkan perubahan tiket:", rollbackError);
        }
      }
      console.error("Gagal memperbarui tiket:", error);
      res.status(500).json({
        success: false,
        message: "Gagal menyimpan perubahan tiket."
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }
);

app.post("/api/checkout", async (req, res) => {
  const body =
    req.body && typeof req.body === "object" ? req.body : {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email =
    typeof body.email === "string" ? body.email.trim() : "";
  const phone =
    typeof body.phone === "string" ? body.phone.trim() : "";

  if (
    !name ||
    name.length > 100 ||
    !isValidEmail(email) ||
    email.length > 254 ||
    phone.length > 20
  ) {
    return res.status(400).json({
      success: false,
      message: "Nama, email, atau nomor WhatsApp tidak valid."
    });
  }

  if (!pool) {
    return res.status(503).json({
      success: false,
      message: "Database belum dikonfigurasi. Atur DATABASE_URL terlebih dahulu."
    });
  }

  if (!process.env.MIDTRANS_SERVER_KEY || !process.env.MIDTRANS_CLIENT_KEY) {
    return res.status(503).json({
      success: false,
      message: "Konfigurasi Midtrans belum lengkap."
    });
  }

  let ticket;
  let event;
  try {
    const settings = await loadAppSettings();
    event = getEventStatus(settings.event);
    if (!event.salesOpen) {
      return res.status(400).json({
        success: false,
        message: "Penjualan tiket sedang ditutup."
      });
    }

    ticket = getAllTickets(settings.ticketCategories).find(
      item => item.id === body.ticketId
    );
  } catch (error) {
    console.error("Gagal membaca tiket untuk checkout:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal memuat data tiket."
    });
  }

  if (!ticket || ticket.status === "SOLD_OUT" || ticket.stock <= 0) {
    return res.status(400).json({
      success: false,
      message: "Tiket tidak tersedia."
    });
  }

  const orderId = `GRIT-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  try {
    await pool.query(
      `INSERT INTO orders
        (order_id, ticket_id, ticket_name, event_name, event_end_at,
         customer_name, customer_email, customer_phone, gross_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        orderId,
        ticket.id,
        ticket.name,
        event.name,
        event.endAt,
        name,
        email,
        phone || null,
        ticket.price
      ]
    );

    const snap = new midtransClient.Snap({
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true",
      serverKey: process.env.MIDTRANS_SERVER_KEY,
      clientKey: process.env.MIDTRANS_CLIENT_KEY
    });
    const transaction = await snap.createTransaction({
      transaction_details: {
        order_id: orderId,
        gross_amount: ticket.price
      },
      item_details: [
        {
          id: ticket.id,
          price: ticket.price,
          quantity: 1,
          name: `Tiket ${ticket.name}`.slice(0, 50)
        }
      ],
      customer_details: {
        first_name: name,
        email,
        phone
      }
    });

    res.json({
      success: true,
      token: transaction.token,
      orderId,
      clientKey: process.env.MIDTRANS_CLIENT_KEY,
      isProduction: process.env.MIDTRANS_IS_PRODUCTION === "true"
    });
  } catch (error) {
    console.error("Checkout gagal:", error);
    try {
      await pool.query(
        "UPDATE orders SET status = $1, updated_at = NOW() WHERE order_id = $2",
        ["failed", orderId]
      );
    } catch (updateError) {
      console.error("Gagal memperbarui status order:", updateError);
    }
    res.status(500).json({
      success: false,
      message: "Gagal membuat transaksi. Silakan coba kembali."
    });
  }
});

app.post("/api/midtrans/webhook", async (req, res) => {
  const body =
    req.body && typeof req.body === "object" ? req.body : {};
  const {
    order_id: orderId,
    status_code: statusCode,
    gross_amount: grossAmount,
    signature_key: signature,
    transaction_status: transactionStatus,
    fraud_status: fraudStatus,
    payment_type: paymentType
  } = body;

  if (!pool || !process.env.MIDTRANS_SERVER_KEY) {
    return res.status(503).json({ message: "Payment service belum dikonfigurasi." });
  }

  if (
    typeof orderId !== "string" ||
    typeof statusCode !== "string" ||
    typeof grossAmount !== "string" ||
    typeof signature !== "string"
  ) {
    console.warn("Notifikasi Midtrans ditolak: field wajib tidak lengkap.");
    return res.status(400).json({ message: "Notifikasi tidak lengkap." });
  }

  const expectedSignature = crypto
    .createHash("sha512")
    .update(
      `${orderId}${statusCode}${grossAmount}${process.env.MIDTRANS_SERVER_KEY}`
    )
    .digest();
  const receivedSignature = Buffer.from(signature, "hex");
  if (
    receivedSignature.length !== expectedSignature.length ||
    !crypto.timingSafeEqual(receivedSignature, expectedSignature)
  ) {
    console.warn(`Signature Midtrans tidak valid untuk order ${orderId}.`);
    return res.status(403).json({ message: "Signature tidak valid." });
  }

  console.info(
    `Notifikasi Midtrans diterima untuk order ${orderId}: ${transactionStatus || "unknown"}.`
  );

  let client;
  let transactionOpen = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    transactionOpen = true;
    const orderResult = await client.query(
      "SELECT * FROM orders WHERE order_id = $1 FOR UPDATE",
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(404).json({ message: "Order tidak ditemukan." });
    }

    const order = orderResult.rows[0];
    if (Number(grossAmount) !== Number(order.gross_amount)) {
      await client.query("ROLLBACK");
      transactionOpen = false;
      return res.status(400).json({ message: "Jumlah pembayaran tidak sesuai." });
    }

    const isPaid =
      transactionStatus === "settlement" ||
      (transactionStatus === "capture" && fraudStatus === "accept");

    if (!isPaid) {
      await client.query(
        "UPDATE orders SET status = $1, payment_type = $2, updated_at = NOW() WHERE order_id = $3",
        [transactionStatus || "pending", paymentType || null, orderId]
      );
      await client.query("COMMIT");
      transactionOpen = false;
      return res.status(200).json({ message: "OK" });
    }

    await client.query(
      `UPDATE orders
       SET status = $1, payment_type = $2, updated_at = NOW()
       WHERE order_id = $3`,
      ["settlement", paymentType || null, orderId]
    );

    if (!order.stock_decremented_at) {
      const settingsResult = await client.query(
        `SELECT ticket_categories
         FROM grit_boxing_settings
         WHERE settings_key = $1
         FOR UPDATE`,
        ["tickets"]
      );
      if (settingsResult.rows.length === 0) {
        throw new Error("Konfigurasi tiket tidak ditemukan saat mengurangi stok.");
      }

      let ticketFound = false;
      let stockAlreadyEmpty = false;
      const updatedCategories = settingsResult.rows[0].ticket_categories.map(
        category => ({
          ...category,
          tickets: (Array.isArray(category.tickets) ? category.tickets : []).map(
            ticket => {
              if (ticket.id !== order.ticket_id) {
                return ticket;
              }

              ticketFound = true;
              const stock = Number(ticket.stock);
              if (!Number.isSafeInteger(stock) || stock < 0) {
                throw new Error(
                  `Stok tiket ${order.ticket_id} tidak valid.`
                );
              }
              if (stock === 0) {
                stockAlreadyEmpty = true;
                return { ...ticket, status: "SOLD_OUT" };
              }

              const remainingStock = stock - 1;
              return {
                ...ticket,
                stock: remainingStock,
                status:
                  remainingStock === 0 ? "SOLD_OUT" : ticket.status
              };
            }
          )
        })
      );

      if (!ticketFound) {
        throw new Error(`Tiket ${order.ticket_id} tidak ditemukan di katalog.`);
      }

      await client.query(
        `UPDATE grit_boxing_settings
         SET ticket_categories = $1::jsonb, updated_at = NOW()
         WHERE settings_key = $2`,
        [JSON.stringify(updatedCategories), "tickets"]
      );
      await client.query(
        `UPDATE orders
         SET stock_decremented_at = NOW()
         WHERE order_id = $1`,
        [orderId]
      );
      if (stockAlreadyEmpty) {
        console.warn(
          `Pesanan ${orderId} sudah dibayar saat stok tiket ${order.ticket_id} habis.`
        );
      }
    }

    let issuedTicketResult = await client.query(
      `SELECT ticket_code, ticket_name, event_name, expires_at
       FROM grit_issued_tickets
       WHERE order_id = $1
       FOR UPDATE`,
      [orderId]
    );
    if (issuedTicketResult.rows.length === 0) {
      const ticketCode = `GRIT-${crypto
        .randomBytes(8)
        .toString("hex")
        .toUpperCase()}`;
      issuedTicketResult = await client.query(
        `INSERT INTO grit_issued_tickets
          (ticket_code, order_id, ticket_id, ticket_name, event_name,
           customer_name, customer_email, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING ticket_code, ticket_name, event_name, expires_at`,
        [
          ticketCode,
          orderId,
          order.ticket_id,
          order.ticket_name || order.ticket_id,
          order.event_name || "GRIT BOXING",
          order.customer_name,
          order.customer_email,
          order.event_end_at
        ]
      );
    }

    await client.query("COMMIT");
    transactionOpen = false;
    paymentCommitted = true;

    await client.query("BEGIN");
    transactionOpen = true;
    const deliveryOrderResult = await client.query(
      "SELECT * FROM orders WHERE order_id = $1 FOR UPDATE",
      [orderId]
    );
    const deliveryOrder = deliveryOrderResult.rows[0];
    let emailSentNow = false;

    if (!deliveryOrder.ticket_email_sent_at) {
      const issuedTicket = issuedTicketResult.rows[0];
      const transporter = createEmailTransporter();
      const expiryText = issuedTicket.expires_at
        ? new Date(issuedTicket.expires_at).toLocaleString("id-ID", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "Asia/Jakarta"
          }) + " WIB"
        : "sesuai ketentuan penyelenggara";
      await transporter.sendMail({
        from: `"GRIT BOXING" <${process.env.SMTP_USER}>`,
        to: deliveryOrder.customer_email,
        subject: `Tiket GRIT BOXING - ${issuedTicket.ticket_name}`,
        text:
          `Halo ${deliveryOrder.customer_name},\n\n` +
          `Pembayaran ${issuedTicket.event_name} berhasil.\n\n` +
          `Tiket: ${issuedTicket.ticket_name}\n` +
          `Kode tiket: ${issuedTicket.ticket_code}\n` +
          `Berlaku sampai: ${expiryText}\n\n` +
          "Tunjukkan kode tiket ini kepada petugas saat memasuki acara.",
        html: `
          <div style="font-family: Arial, sans-serif; border: 1px solid #dedbd4; border-radius: 12px; padding: 24px; max-width: 600px;">
            <h2>${escapeHtml(issuedTicket.event_name)}</h2>
            <p>Halo <strong>${escapeHtml(deliveryOrder.customer_name)}</strong>,</p>
            <p>Pembayaran berhasil. Simpan kode tiket berikut dan tunjukkan kepada petugas saat memasuki acara.</p>
            <div style="margin: 20px 0; padding: 18px; border-radius: 8px; background: #f5f3ef; text-align: center;">
              <p style="margin: 0 0 8px; color: #777;">${escapeHtml(issuedTicket.ticket_name)}</p>
              <strong style="font-size: 24px; letter-spacing: 3px;">${escapeHtml(issuedTicket.ticket_code)}</strong>
            </div>
            <p><strong>Berlaku sampai:</strong> ${escapeHtml(expiryText)}</p>
            <p><strong>Order ID:</strong> ${escapeHtml(orderId)}</p>
            <p>Disiplin. Mental. Komunitas.</p>
          </div>
        `
      });
      await client.query(
        "UPDATE orders SET ticket_email_sent_at = NOW() WHERE order_id = $1",
        [orderId]
      );
      emailSentNow = true;
    }

    await client.query("COMMIT");
    transactionOpen = false;
    if (emailSentNow) {
      console.info(`Email tiket berhasil dikirim untuk order ${orderId}.`);
    }
    res.status(200).json({ message: "OK" });
  } catch (error) {
    if (client && transactionOpen) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        console.error("Gagal membatalkan transaksi webhook:", rollbackError);
      }
    }
    if (paymentCommitted) {
      console.error(`Email tiket belum terkirim untuk order ${orderId}:`, error);
      return res.status(500).json({
        message:
          "Pembayaran dan tiket sudah tersimpan, tetapi email tiket belum terkirim. Notifikasi dapat dicoba ulang."
      });
    }
    console.error(`Webhook gagal diproses untuk order ${orderId}:`, error);
    res.status(500).json({ message: "Webhook gagal diproses." });
  } finally {
    if (client) {
      client.release();
    }
  }
});

async function startServer() {
  if (pool) {
    try {
      await initializeDatabase();
    } catch (error) {
      console.error("Gagal menyiapkan tabel orders:", error);
    }
  } else {
    console.warn("DATABASE_URL belum diatur; checkout tidak dapat digunakan.");
  }

  app.listen(PORT, () => {
    console.log(`Backend berjalan di http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
