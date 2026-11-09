const navToggle = document.querySelector('.nav-toggle');
const navMenu = document.querySelector('.nav-menu');
navToggle.addEventListener('click', () => {
  const open = navMenu.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll('.nav-menu a').forEach(link => link.addEventListener('click', () => {
  navMenu.classList.remove('open');
  navToggle.setAttribute('aria-expanded', 'false');
}));

const dialog = document.querySelector('#contactDialog');
const dialogTitle = document.querySelector('#dialogTitle');
const messageInput = document.querySelector('#messageInput');
document.querySelectorAll('.modal-trigger').forEach(button => button.addEventListener('click', () => {
  const type = button.dataset.type;
  dialogTitle.textContent = type === 'petinju' ? 'Pendaftaran Petinju' : 'Kontak Vendor / Sponsor';
  messageInput.value = type === 'petinju' ? 'Saya ingin mendaftar sebagai petinju.' : 'Saya ingin membahas kerja sama.';
  dialog.showModal();
}));

document.querySelector('#submitForm').addEventListener('click', () => {
  const name = document.querySelector('#nameInput').value.trim();
  const phone = document.querySelector('#phoneInput').value.trim();
  const status = document.querySelector('#formStatus');
  if (!name || !phone) {
    status.textContent = 'Nama dan nomor WhatsApp wajib diisi.';
    return;
  }
  status.textContent = 'Data demo tersimpan di halaman ini. Hubungkan ke backend saat dibutuhkan.';
});

document.querySelector('#mapButton').addEventListener('click', () => alert('Tautan Google Maps belum ditentukan.'));
document.querySelector('#showAll').addEventListener('click', () => document.querySelector('#fightGrid').scrollIntoView({behavior:'smooth'}));
