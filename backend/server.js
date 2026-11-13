const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const eventData = {
  id: "grit-boxing-2026",
  name: "GRIT BOXING 2026",
  category: "Olahraga",
  organizer: "GRIT BOXING",
  date: "Minggu, 13 September 2026",
  time: "08.00 WIB sampai selesai",
  location: "GOR Arcamanik, Kota Bandung, Jawa Barat",
  description: "High School Boxing Event in Bandung",
  mapUrl: "https://maps.app.goo.gl/JafyqUxR5rg5PxCJ6"
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
        description:
          "Tiket untuk school supporter dan boxing camp supporter.",
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
      "Tiket bagi seluruh masyarakat yang ingin menyaksikan pertandingan GRIT Boxing 2026.",
    tickets: [
      {
        id: "general-1",
        name: "Umum 1",
        description:
          "Tiket masyarakat umum untuk menyaksikan GRIT Boxing 2026.",
        price: 18000,
        stock: 0,
        maxPurchase: 5,
        status: "SOLD_OUT"
      },
      {
        id: "general-2",
        name: "Umum 2",
        description:
          "Open for public dan berlaku untuk satu orang.",
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

function getAllTickets() {
  return ticketCategories.flatMap(category =>
    category.tickets.map(ticket => ({
      ...ticket,
      categoryId: category.id,
      categoryName: category.name
    }))
  );
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Backend GRIT Boxing ID berhasil berjalan"
  });
});

app.get("/api/event", (req, res) => {
  res.json({
    success: true,
    data: eventData
  });
});

app.get("/api/ticket-categories", (req, res) => {
  res.json({
    success: true,
    data: ticketCategories
  });
});

app.get("/api/tickets/:ticketId", (req, res) => {
  const ticket = getAllTickets().find(
    item => item.id === req.params.ticketId
  );

  if (!ticket) {
    return res.status(404).json({
      success: false,
      message: "Tiket tidak ditemukan"
    });
  }

  res.json({
    success: true,
    data: ticket
  });
});

app.listen(PORT, () => {
  console.log(`Backend berjalan di http://localhost:${PORT}`);
  console.log(
    `Daftar tiket: http://localhost:${PORT}/api/ticket-categories`
  );
});