/**
 * LAYANAN PERMOHONAN — Gizi-Link, Jurusan Gizi Poltekkes Kemenkes Makassar
 *
 * Mahasiswa (sudah masuk lewat Gizi-Link) mengisi form permohonan:
 *   1. Angsuran UKT
 *   2. Surat Keterangan Tidak Sedang Menerima Beasiswa
 *   3. Surat Izin Pengambilan Data Awal        → admin unduh draf .docx → Srikandi
 *   4. Pengembalian ke Instansi (D4 RPL, Profesi Reguler/RPL) → admin gabung jadi 1 nota dinas
 *      usulan Kajur ke Direktur (.docx, menu Usulan Kolektif) → Srikandi → surat per mahasiswa di Cari Surat
 * Data tersimpan di sheet (satu tab per jenis) sebagai arsip; Kaprodi/admin
 * memantau & mengubah kolom Status langsung di Google Sheet. Setelah tersimpan,
 * mahasiswa menekan tombol "Kirim ke WA" — pesan sudah terisi otomatis.
 *
 * CARA PASANG (lengkapnya di README.md):
 *  1. Buat Google Sheet baru "Layanan Permohonan Gizi-Link" → Ekstensi → Apps Script
 *     → hapus isi Code.gs → tempel file ini → Simpan.
 *  2. Setelan Project (roda gigi) → Properti Skrip → tambahkan
 *       SSO_SECRET = (salin dari Apps Script portal Gizi-Link)
 *  3. Pilih fungsi `setup` → Jalankan → izinkan akses.
 *     Terbentuk: tab per jenis permohonan + tab "Pengaturan" (nomor WA tujuan per jenis).
 *  4. Terapkan → Deployment baru → Aplikasi web → Jalankan sebagai: Saya,
 *     Yang memiliki akses: Siapa saja → salin URL /exec ke config.js.
 *
 * MENGUBAH NOMOR WA TUJUAN: cukup edit tab "Pengaturan" (tidak perlu deploy ulang).
 * PEMANTAUAN: isi kolom "Permohonan" di sheet Staf portal, campuran prodi & jenis.
 *   Kaprodi D3 → "D3, UKT, BSW" · Kepala Unit Lab → "DATA" · Tim akademik → "KMB" · Kajur → "semua"
 * REKAP EMAIL PAGI: isi email di tab "Rekap Email", lalu jalankan fungsi pasangRekapEmail SEKALI.
 * MENAMBAH/MENGUBAH ISIAN FORM: ubah daftar JENIS di bawah, Simpan, jalankan setup,
 * lalu Kelola deployment → Versi baru.
 */

var CONFIG = {
  ZONA: 'Asia/Makassar',
  WA_DEFAULT: '6285255549979',   // nomor uji coba; ganti per jenis di tab "Pengaturan"
  STATUS: ['Diajukan', 'Diproses', 'Selesai', 'Ditolak'],
  MAKS_TEKS: 1000,
  URL_APLIKASI: 'https://jurusan-gizi.github.io/layanan-permohonan/'
};

/* Isian umum yang selalu ada di akhir setiap form */
var FIELD_HP = { id: 'no_hp', label: 'No. HP/WA aktif', tipe: 'hp', wajib: true };
var SEMESTER = { id: 'semester', label: 'Semester', tipe: 'pilih', opsi: ['1', '2', '3', '4', '5', '6', '7', '8'], wajib: true };

/**
 * Daftar jenis permohonan. Urutan di sini = urutan tombol di aplikasi.
 * tipe: teks | panjang | angka | rupiah | tanggal | pilih | hp
 */
var JENIS = [
  {
    kode: 'UKT', tab: 'Angsuran UKT', ikon: '💰', warna: '#0F766E',
    nama: 'Permohonan Angsuran UKT',
    ringkas: 'Mengangsur pembayaran UKT semester berjalan',
    field: [
      SEMESTER,
      { id: 'nominal_ukt', label: 'Besaran UKT per semester', tipe: 'rupiah', wajib: true },
      { id: 'angsuran', label: 'Jumlah angsuran yang diminta', tipe: 'pilih', opsi: ['2 kali', '3 kali'], wajib: true },
      { id: 'alasan', label: 'Alasan permohonan', tipe: 'panjang', wajib: true, bantu: 'Jelaskan singkat kondisi yang membuat perlu mengangsur.' },
      FIELD_HP
    ]
  },
  {
    kode: 'BSW', tab: 'Ket Tidak Terima Beasiswa', ikon: '🎓', warna: '#B45309',
    nama: 'Surat Keterangan Tidak Sedang Menerima Beasiswa',
    ringkas: 'Syarat pendaftaran beasiswa',
    field: [
      SEMESTER,
      { id: 'beasiswa', label: 'Nama beasiswa yang akan dilamar', tipe: 'teks', wajib: true, contoh: 'mis. Beasiswa Bank Indonesia 2026' },
      { id: 'penyelenggara', label: 'Penyelenggara beasiswa', tipe: 'teks', wajib: false },
      { id: 'batas_waktu', label: 'Batas waktu pendaftaran', tipe: 'tanggal', wajib: true },
      FIELD_HP
    ]
  },
  {
    kode: 'DATA', tab: 'Pengambilan Data Awal', ikon: '📋', warna: '#1D4ED8',
    nama: 'Surat Izin Pengambilan Data Awal',
    ringkas: 'Draf surat dibuat otomatis, terbit lewat Srikandi',
    surat: 'data-awal.docx',     // admin mengunduh draf .docx → Srikandi → PDF muncul di Cari Surat
    field: [
      { id: 'tempat_lahir', label: 'Tempat lahir', tipe: 'teks', wajib: true },
      { id: 'tanggal_lahir', label: 'Tanggal lahir', tipe: 'tanggal', wajib: true },
      { id: 'kelamin', label: 'Jenis kelamin', tipe: 'pilih', opsi: ['Laki-laki', 'Perempuan'], wajib: true },
      { id: 'alamat_mhs', label: 'Alamat tempat tinggal', tipe: 'panjang', wajib: true },
      { id: 'judul', label: 'Judul penelitian', tipe: 'panjang', wajib: true },
      { id: 'data_diminta', label: 'Data yang akan diambil', tipe: 'panjang', wajib: true, contoh: 'mis. Data prevalensi balita umur 6–24 bulan' },
      { id: 'lokasi', label: 'Lokasi pengambilan data', tipe: 'teks', wajib: true, contoh: 'mis. Puskesmas Paccerakkang' },
      { id: 'ditujukan', label: 'Surat ditujukan kepada', tipe: 'teks', wajib: true, contoh: 'mis. Kepala Puskesmas Paccerakkang' },
      { id: 'alamat_tujuan', label: 'Alamat instansi tujuan', tipe: 'panjang', wajib: true, contoh: 'mis. Jl. Paccerakkang No. 1, Kec. Biringkanaya, Kota Makassar' },
      FIELD_HP
    ]
  },
  {
    kode: 'KMB', tab: 'Usulan Pengembalian', ikon: '↩️', warna: '#7C3AED',
    nama: 'Pengembalian ke Instansi (Tugas/Izin Belajar)',
    ringkas: 'Mahasiswa tugas belajar/izin belajar · diusulkan kolektif ke Direktur',
    prodi: ['d4', 'prof'],        // hanya prodi ini yang melihat layanan ini
    kolektif: true,               // admin menggabungkan banyak mahasiswa jadi 1 nota dinas usulan
    cariSurat: true,              // surat terbit (per mahasiswa) diunduh di Cari Surat
    templatKolektif: 'usulan-pengembalian.docx',
    field: [
      { id: 'jalur', label: 'Jalur', tipe: 'pilih', opsi: ['Reguler', 'RPL'], wajib: true,
        opsiProdi: { d4: ['RPL'] }, bantu: 'Sarjana Terapan hanya jalur RPL.' },
      { id: 'instansi_1', label: 'Instansi tujuan 1', tipe: 'teks', wajib: true, grup: 1, contoh: 'mis. RSUD Datu Pancaitana Kab. Bone' },
      { id: 'alamat_1', label: 'Alamat instansi tujuan 1', tipe: 'panjang', wajib: true, grup: 1, contoh: 'Jalan, kelurahan, kecamatan, kab/kota, provinsi, kode pos' },
      { id: 'instansi_2', label: 'Instansi tujuan 2', tipe: 'teks', grup: 2, contoh: 'mis. BKD Provinsi Kalimantan Selatan' },
      { id: 'alamat_2', label: 'Alamat instansi tujuan 2', tipe: 'panjang', grup: 2 },
      { id: 'instansi_3', label: 'Instansi tujuan 3', tipe: 'teks', grup: 3 },
      { id: 'alamat_3', label: 'Alamat instansi tujuan 3', tipe: 'panjang', grup: 3 },
      { id: 'instansi_4', label: 'Instansi tujuan 4', tipe: 'teks', grup: 4 },
      { id: 'alamat_4', label: 'Alamat instansi tujuan 4', tipe: 'panjang', grup: 4 },
      FIELD_HP
    ],
    kolomAdmin: ['No. Usulan']    // diisi otomatis saat admin membuat nota dinas usulan
  }
];

var KOLOM_AWAL = ['No. Registrasi', 'Waktu Pengajuan', 'NIM', 'Nama', 'Prodi', 'Kelas'];
var KOLOM_AKHIR = ['Status', 'Catatan Admin', 'Diperbarui'];
function adminField_(j) { return j.adminField || []; }

/** Layanan hanya untuk prodi tertentu? (j.prodi = ['d4','prof']) */
function prodiBoleh_(j, prodi) {
  if (!j.prodi) return true;
  var p = String(prodi || '').toLowerCase();
  return j.prodi.some(function (x) { return p.indexOf(x) >= 0; });
}
function opsiUntuk_(f, prodi) {
  if (!f.opsiProdi) return f.opsi;
  var p = String(prodi || '').toLowerCase();
  for (var k in f.opsiProdi) if (p.indexOf(k) >= 0) return f.opsiProdi[k];
  return f.opsi;
}

/* ===================== SETUP ===================== */
function setup() {
  var ss = SpreadsheetApp.getActive();

  JENIS.forEach(function (j) {
    var sh = ss.getSheetByName(j.tab) || ss.insertSheet(j.tab);
    var header = headerJenis_(j);
    if (sh.getLastRow() === 0) {
      sh.appendRow(header);
      sh.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#d9f2f1');
      sh.setFrozenRows(1);
      sh.getRange('C:C').setNumberFormat('@');
    } else {
      // Tambahkan kolom baru (bila isian form ditambah) tanpa mengganggu data lama
      var lama = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
      header.forEach(function (h) {
        if (lama.indexOf(h) < 0) {
          sh.getRange(1, sh.getLastColumn() + 1).setValue(h).setFontWeight('bold').setBackground('#d9f2f1');
          lama.push(h);
        }
      });
    }
    // Dropdown status untuk Kaprodi/admin
    var kolStatus = kolom_(sh, 'Status');
    var aturan = SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.STATUS, true).build();
    sh.getRange(2, kolStatus, Math.max(sh.getMaxRows() - 1, 1), 1).setDataValidation(aturan);
  });

  var p = ss.getSheetByName('Pengaturan') || ss.insertSheet('Pengaturan');
  if (p.getLastRow() === 0) {
    p.appendRow(['kode', 'jenis', 'wa_tujuan', 'aktif']);
    p.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#d9f2f1');
    p.getRange('C:C').setNumberFormat('@');
    p.setFrozenRows(1);
  }
  var ada = p.getDataRange().getValues().map(function (r) { return String(r[0]); });
  JENIS.forEach(function (j) {
    if (ada.indexOf(j.kode) < 0) p.appendRow([j.kode, j.nama, CONFIG.WA_DEFAULT, 'YA']);
  });

  var re = ss.getSheetByName('Rekap Email') || ss.insertSheet('Rekap Email');
  if (re.getLastRow() === 0) {
    re.appendRow(['lingkup', 'email', 'keterangan']);
    re.getRange(1, 1, 1, 3).setFontWeight('bold').setBackground('#d9f2f1');
    re.setFrozenRows(1);
    re.appendRow(['D3', '', 'isi email Kaprodi D3 (boleh beberapa, pisahkan koma)']);
    re.appendRow(['D4', '', 'isi email Kaprodi D4']);
    re.appendRow(['Prof', '', 'isi email Kaprodi Profesi']);
    re.appendRow(['semua', '', 'menerima rekap semua prodi']);
    re.appendRow(['DATA', '', 'Kepala Unit Lab: rekap surat data awal']);
    re.appendRow(['KMB', '', 'Tim akademik: rekap surat pengembalian']);
  }

  if (!PropertiesService.getScriptProperties().getProperty('SSO_SECRET')) {
    Logger.log('PERHATIAN: Properti Skrip SSO_SECRET belum diisi. Salin dari Apps Script portal Gizi-Link.');
  }
  Logger.log('Setup selesai. Tab dibuat: ' + JENIS.map(function (j) { return j.tab; }).join(', ') + ', Pengaturan.');
}

function headerJenis_(j) {
  return KOLOM_AWAL.concat(j.field.map(function (f) { return f.label; }),
    adminField_(j).map(function (f) { return f.label; }), j.kolomAdmin || [], KOLOM_AKHIR);
}

/* ===================== WEB APP ===================== */
function doGet() {
  return json_({ ok: true, layanan: 'Layanan Permohonan Gizi-Link', status: 'aktif' });
}

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);

    // Dosen/staf (Kaprodi, admin): mode pantau
    var staf = verifikasiStafSSO_(req.token);
    if (staf) {
      var lingkup = lingkupStaf_(staf);
      if (req.aksi === 'badge') return json_({ ok: true, jumlah: lingkup.length ? hitungBaru_(lingkup) : 0, label: 'baru' });
      if (!lingkup.length) return json_({ ok: false, kode: 'AKSES', pesan: 'Akun Anda belum diberi akses pemantauan permohonan. Hubungi admin jurusan.' });
      if (req.aksi === 'pantau') return json_(pantau_(staf, lingkup));
      if (req.aksi === 'ubahStatus') return json_(ubahStatus_(staf, lingkup, req));
      if (req.aksi === 'teruskan') return json_(teruskan_(staf, lingkup, req));
      if (req.aksi === 'usulkan') return json_(usulkan_(staf, lingkup, req));
      if (req.aksi === 'aturUsulan') return json_(aturUsulan_(staf, lingkup, req));
      return json_({ ok: false, pesan: 'Aksi tidak dikenal.' });
    }

    var mhs = verifikasiSSO_(req.token);
    if (!mhs) return json_({ ok: false, kode: 'AUTH', pesan: 'Sesi Gizi-Link berakhir. Silakan masuk lagi.' });
    if (req.aksi === 'badge') return json_({ ok: true, jumlah: 0 });
    if (req.aksi === 'muat') return json_(muat_(mhs));
    if (req.aksi === 'ajukan') return json_(ajukan_(mhs, req));
    return json_({ ok: false, pesan: 'Aksi tidak dikenal.' });
  } catch (err) {
    return json_({ ok: false, pesan: 'Terjadi gangguan di server: ' + (err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ===================== MUAT: daftar layanan + riwayat ===================== */
function muat_(mhs) {
  var atur = pengaturan_();
  var layanan = JENIS.filter(function (j) { return (!atur[j.kode] || atur[j.kode].aktif) && prodiBoleh_(j, mhs.prodi); }).map(function (j) {
    var field = j.field.map(function (f) {
      return f.opsiProdi ? Object.assign({}, f, { opsi: opsiUntuk_(f, mhs.prodi), opsiProdi: undefined }) : f;
    });
    return { kode: j.kode, nama: j.nama, ringkas: j.ringkas, ikon: j.ikon, warna: j.warna, field: field, surat: !!(j.surat || j.kolektif), kolektif: !!j.kolektif };
  });
  return { ok: true, profil: profilPublik_(mhs), layanan: layanan, riwayat: riwayat_(mhs.nim) };
}

function riwayat_(nim) {
  var ss = SpreadsheetApp.getActive(), target = normNim_(nim), out = [];
  var tz = CONFIG.ZONA;
  var atur = pengaturan_();
  JENIS.forEach(function (j) {
    var sh = ss.getSheetByName(j.tab);
    if (!sh || sh.getLastRow() < 2) return;
    var data = sh.getDataRange().getValues(), h = data[0].map(String);
    var iNo = h.indexOf('No. Registrasi'), iW = h.indexOf('Waktu Pengajuan'), iN = h.indexOf('NIM'),
      iS = h.indexOf('Status'), iC = h.indexOf('Catatan Admin');
    for (var r = 1; r < data.length; r++) {
      if (normNim_(data[r][iN]) !== target) continue;
      var w = data[r][iW];
      out.push({
        no: String(data[r][iNo]), kode: j.kode, jenis: j.nama, ikon: j.ikon,
        waktu: w instanceof Date ? Utilities.formatDate(w, tz, 'yyyy-MM-dd HH:mm') : String(w),
        status: String(data[r][iS] || 'Diajukan'), catatan: iC >= 0 ? String(data[r][iC] || '') : ''
      });
      // Pesan WA disusun ulang dari baris tersimpan → mahasiswa bisa mengirim (ulang) kapan saja
      var isi = {};
      j.field.forEach(function (f) { var k = h.indexOf(f.label); isi[f.id] = k >= 0 ? nilaiSel_(data[r][k]) : ''; });
      var mhs = { nim: String(data[r][iN]), nama: String(data[r][h.indexOf('Nama')] || ''), prodi: String(data[r][h.indexOf('Prodi')] || ''), kelas: String(data[r][h.indexOf('Kelas')] || '') };
      var item = out[out.length - 1];
      // WA ke Direktorat hanya dikirim Kaprodi dari menu pantau (fungsi kontrol), bukan oleh mahasiswa.
      if (j.surat || j.cariSurat) item.surat = true;
    }
  });
  out.sort(function (a, b) { return a.waktu < b.waktu ? 1 : -1; });
  return out;
}

/* ===================== AJUKAN ===================== */
function ajukan_(mhs, req) {
  var j = JENIS.filter(function (x) { return x.kode === req.kode; })[0];
  if (!j) return { ok: false, pesan: 'Jenis permohonan tidak dikenal.' };
  var atur = pengaturan_()[j.kode] || { wa: CONFIG.WA_DEFAULT, aktif: true };
  if (!atur.aktif) return { ok: false, pesan: 'Layanan ini sedang ditutup sementara.' };
  if (!prodiBoleh_(j, mhs.prodi)) return { ok: false, pesan: 'Layanan ini tidak tersedia untuk prodi Anda.' };

  // Validasi isian di server
  var isi = {}, data = req.data || {};
  for (var i = 0; i < j.field.length; i++) {
    var f = j.field[i];
    var v = String(data[f.id] == null ? '' : data[f.id]).trim().slice(0, CONFIG.MAKS_TEKS);
    if (f.wajib && !v) return { ok: false, pesan: f.label + ' wajib diisi.' };
    if (v && f.tipe === 'pilih' && opsiUntuk_(f, mhs.prodi).indexOf(v) < 0) return { ok: false, pesan: f.label + ' tidak valid.' };
    if (v && (f.tipe === 'angka' || f.tipe === 'rupiah')) { v = v.replace(/[^\d]/g, ''); if (!v) return { ok: false, pesan: f.label + ' harus berupa angka.' }; }
    if (v && f.tipe === 'tanggal' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, pesan: f.label + ' tidak valid.' };
    if (v && f.tipe === 'hp') { v = v.replace(/[^\d+]/g, ''); if (v.replace(/\D/g, '').length < 9) return { ok: false, pesan: 'Nomor HP tidak valid.' }; }
    if (/^[=+\-@]/.test(v) && f.tipe !== 'hp') v = "'" + v;   // cegah isian dibaca sebagai rumus
    isi[f.id] = v;
  }
  // Isian berpasangan (instansi_n + alamat_n): bila salah satu diisi, pasangannya wajib
  for (var g = 1; g <= 4; g++) {
    if (!('instansi_' + g in isi)) continue;
    if (!!isi['instansi_' + g] !== !!isi['alamat_' + g]) return { ok: false, pesan: 'Lengkapi nama dan alamat instansi tujuan ' + g + '.' };
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName(j.tab);
    if (!sh) throw new Error('Tab "' + j.tab + '" belum ada. Jalankan fungsi setup.');
    var h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);

    // Cegah dobel: permohonan jenis yang sama masih berstatus Diajukan
    if (sh.getLastRow() > 1) {
      var lama = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues();
      var iN = h.indexOf('NIM'), iS = h.indexOf('Status'), iNo = h.indexOf('No. Registrasi');
      for (var r = 0; r < lama.length; r++) {
        if (normNim_(lama[r][iN]) === normNim_(mhs.nim) && String(lama[r][iS] || 'Diajukan') === 'Diajukan') {
          return { ok: false, pesan: 'Anda masih punya permohonan yang sama (' + lama[r][iNo] + ') dengan status Diajukan. Tunggu sampai diproses.' };
        }
      }
    }

    var now = new Date();
    var no = nomorBaru_(sh, h, j.kode, now);
    var baris = h.map(function (kol) {
      switch (kol) {
        case 'No. Registrasi': return no;
        case 'Waktu Pengajuan': return now;
        case 'NIM': return mhs.nim;
        case 'Nama': return mhs.nama || '';
        case 'Prodi': return mhs.prodi || '';
        case 'Kelas': return mhs.kelas || '';
        case 'Status': return 'Diajukan';
        case 'Catatan Admin': return '';
        case 'Diperbarui': return '';
      }
      var f = j.field.filter(function (x) { return x.label === kol; })[0];
      return f ? isi[f.id] : '';
    });
    sh.appendRow(baris);
    sh.getRange(sh.getLastRow(), h.indexOf('Waktu Pengajuan') + 1).setNumberFormat('dd/MM/yyyy HH:mm');

    if (j.surat || j.kolektif) return { ok: true, no: no, surat: true, kolektif: !!j.kolektif };
    return { ok: true, no: no };
  } finally {
    lock.releaseLock();
  }
}

function nomorBaru_(sh, h, kode, now) {
  var prefix = kode + '-' + Utilities.formatDate(now, CONFIG.ZONA, 'yyMM') + '-';
  var max = 0;
  if (sh.getLastRow() > 1) {
    sh.getRange(2, h.indexOf('No. Registrasi') + 1, sh.getLastRow() - 1, 1).getValues().forEach(function (r) {
      var v = String(r[0]);
      if (v.indexOf(prefix) === 0) max = Math.max(max, Number(v.slice(prefix.length)) || 0);
    });
  }
  return prefix + ('00' + (max + 1)).slice(-3);
}

/* ===================== PANTAU (KAPRODI / ADMIN) ===================== */
/**
 * Wewenang seorang staf, dari kolom "Permohonan" di sheet Staf portal (ikut di dalam token).
 * Isinya boleh campuran PRODI dan JENIS, dipisah koma:
 *   Prodi : D3, D4, Prof, semua
 *   Jenis : UKT, BSW, DATA, KMB   (kode di daftar JENIS)
 * Aturan: jenis tidak ditulis = semua jenis; prodi tidak ditulis = semua prodi.
 * Contoh:
 *   "D3, UKT, BSW" → Kaprodi D3, hanya angsuran UKT & ket. beasiswa prodi D3
 *   "DATA"         → Kepala Unit Lab, semua surat data awal dari semua prodi
 *   "KMB"          → Tim akademik, semua surat pengembalian dari semua prodi
 *   "semua"        → Ketua Jurusan, semuanya
 */
function lingkupStaf_(staf) {
  return String(staf.permohonan || '').split(/[,;]/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
}

function kodeJenis_() {
  return JENIS.map(function (j) { return j.kode.toLowerCase(); });
}

function pisahLingkup_(lingkup) {
  var kode = kodeJenis_();
  return {
    jenis: lingkup.filter(function (l) { return kode.indexOf(l) >= 0; }),
    prodi: lingkup.filter(function (l) { return kode.indexOf(l) < 0; })
  };
}

/** o = baris permohonan (punya o['Prodi'] dan o._j), atau teks prodi saja. */
function dalamLingkup_(lingkup, o) {
  if (!lingkup.length) return false;
  var b = pisahLingkup_(lingkup);
  var prodi = typeof o === 'object' ? o['Prodi'] : o;
  var kode = typeof o === 'object' && o._j ? o._j.kode.toLowerCase() : '';
  var p = String(prodi || '').toLowerCase();
  var okJenis = !b.jenis.length || (kode && b.jenis.indexOf(kode) >= 0);
  var okProdi = !b.prodi.length || b.prodi.some(function (l) { return l === 'semua' || p.indexOf(l) >= 0; });
  return okJenis && okProdi;
}

/** Teks wewenang untuk ditampilkan di aplikasi, mis. "Prodi D3 · Angsuran UKT, Ket. Beasiswa". */
function labelLingkup_(lingkup) {
  var b = pisahLingkup_(lingkup);
  var prodi = !b.prodi.length || b.prodi.indexOf('semua') >= 0 ? 'Semua prodi'
    : 'Prodi ' + b.prodi.map(function (x) { return x === 'prof' ? 'Profesi' : x.toUpperCase(); }).join(', ');
  var jenis = b.jenis.length ? JENIS.filter(function (j) { return b.jenis.indexOf(j.kode.toLowerCase()) >= 0; })
    .map(function (j) { return j.nama; }).join(', ') : 'Semua jenis';
  return prodi + ' · ' + jenis;
}

function jenisLingkup_(lingkup) {
  var b = pisahLingkup_(lingkup);
  return JENIS.filter(function (j) { return !b.jenis.length || b.jenis.indexOf(j.kode.toLowerCase()) >= 0; });
}

/** Semua baris permohonan (seluruh jenis) dalam bentuk objek. */
function semuaBaris_() {
  var ss = SpreadsheetApp.getActive(), out = [];
  JENIS.forEach(function (j) {
    var sh = ss.getSheetByName(j.tab);
    if (!sh || sh.getLastRow() < 2) return;
    var data = sh.getDataRange().getValues(), h = data[0].map(String);
    for (var r = 1; r < data.length; r++) {
      var o = { _j: j, _sh: sh, _row: r + 1, _h: h };
      h.forEach(function (k, i) { o[k] = data[r][i]; });
      if (!o['No. Registrasi']) continue;
      out.push(o);
    }
  });
  return out;
}

function hitungBaru_(lingkup) {
  return semuaBaris_().filter(function (o) {
    return dalamLingkup_(lingkup, o) && String(o['Status'] || 'Diajukan') === 'Diajukan';
  }).length;
}

/** Nilai sel → teks; tanggal (yang otomatis jadi Date di Sheet) → yyyy-MM-dd. */
function nilaiSel_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, CONFIG.ZONA, 'yyyy-MM-dd');
  return String(v == null ? '' : v).replace(/^'/, '');
}

function fmtWaktu_(w) {
  return w instanceof Date ? Utilities.formatDate(w, CONFIG.ZONA, 'yyyy-MM-dd HH:mm') : String(w || '');
}

function pantau_(staf, lingkup) {
  var atur = pengaturan_();
  var list = semuaBaris_().filter(function (o) { return dalamLingkup_(lingkup, o); }).map(function (o) {
    var j = o._j, isi = {};
    j.field.forEach(function (f) { isi[f.id] = nilaiSel_(o[f.label]); });
    var mhs = { nim: String(o['NIM']), nama: String(o['Nama'] || ''), prodi: String(o['Prodi'] || ''), kelas: String(o['Kelas'] || '') };
    var waktu = o['Waktu Pengajuan'] instanceof Date ? o['Waktu Pengajuan'] : new Date();
    return {
      no: String(o['No. Registrasi']), kode: j.kode, jenis: j.nama, ikon: j.ikon,
      waktu: fmtWaktu_(o['Waktu Pengajuan']), nim: mhs.nim, nama: mhs.nama, prodi: mhs.prodi, kelas: mhs.kelas,
      status: String(o['Status'] || 'Diajukan'), catatan: String(o['Catatan Admin'] || ''),
      diperbarui: String(o['Diperbarui'] || ''),
      rincian: j.field.filter(function (f) { return !(f.grup && !isi[f.id]); })
        .map(function (f) { return { label: f.label, nilai: nilaiTampil_(f, isi[f.id]) }; }),
      kolektif: !!j.kolektif,
      noUsulan: String(o['No. Usulan'] || ''),
      hp: normWa_(isi.no_hp),
      waDirektorat: j.surat || j.kolektif ? '' : normWa_((atur[j.kode] || {}).wa || CONFIG.WA_DEFAULT),
      pesanDirektorat: j.surat || j.kolektif ? '' : pesanWa_(j, mhs, isi, String(o['No. Registrasi']), waktu, staf),
      surat: j.surat || '',
      isi: isi,
      adminField: adminField_(j),
      adminIsi: adminField_(j).reduce(function (a, f) {
        a[f.id] = nilaiSel_(o[f.label]);
        return a;
      }, {})
    };
  });
  list.sort(function (a, b) { return a.waktu < b.waktu ? 1 : -1; });
  return {
    ok: true,
    staf: { nama: staf.nama, lingkup: lingkup, label: labelLingkup_(lingkup) },
    jenis: jenisLingkup_(lingkup).map(function (j) { return { kode: j.kode, nama: j.nama, ikon: j.ikon }; }),
    status: CONFIG.STATUS,
    data: list
  };
}

function ubahStatus_(staf, lingkup, req) {
  var status = String(req.status || '');
  if (CONFIG.STATUS.indexOf(status) < 0) return { ok: false, pesan: 'Status tidak valid.' };
  var catatan = String(req.catatan || '').trim().slice(0, 500);
  if (/^[=+\-@]/.test(catatan)) catatan = "'" + catatan;

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var o = semuaBaris_().filter(function (x) { return String(x['No. Registrasi']) === String(req.no); })[0];
    if (!o) return { ok: false, pesan: 'Permohonan tidak ditemukan.' };
    if (!dalamLingkup_(lingkup, o)) return { ok: false, pesan: 'Permohonan ini di luar wewenang Anda.' };
    var h = o._h, sh = o._sh;
    var jejak = Utilities.formatDate(new Date(), CONFIG.ZONA, 'dd/MM/yyyy HH:mm') + ' · ' + (staf.nama || staf.id);
    sh.getRange(o._row, h.indexOf('Status') + 1).setValue(status);
    sh.getRange(o._row, h.indexOf('Catatan Admin') + 1).setValue(catatan);
    if (h.indexOf('Diperbarui') >= 0) sh.getRange(o._row, h.indexOf('Diperbarui') + 1).setValue(jejak);
    var adm = req.admin || {};
    adminField_(o._j).forEach(function (f) {
      if (!(f.id in adm)) return;
      var k = h.indexOf(f.label);
      if (k < 0) return;
      var v = String(adm[f.id] || '').trim().slice(0, 300);
      if (/^[=+\-@]/.test(v)) v = "'" + v;
      sh.getRange(o._row, k + 1).setNumberFormat('@').setValue(v);
    });
    return { ok: true, status: status, catatan: catatan.replace(/^'/, ''), diperbarui: jejak };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Kaprodi menekan "Teruskan ke admin Direktorat" → dicatat otomatis:
 * status Diajukan → Diproses, catatan untuk mahasiswa, dan jejak siapa yang meneruskan.
 */
function teruskan_(staf, lingkup, req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var o = semuaBaris_().filter(function (x) { return String(x['No. Registrasi']) === String(req.no); })[0];
    if (!o) return { ok: false, pesan: 'Permohonan tidak ditemukan.' };
    if (!dalamLingkup_(lingkup, o)) return { ok: false, pesan: 'Permohonan ini di luar wewenang Anda.' };
    if (o._j.surat || o._j.kolektif) return { ok: false, pesan: 'Jenis ini diproses lewat Srikandi.' };
    var h = o._h, sh = o._sh, sekarang = new Date();
    var tgl = Utilities.formatDate(sekarang, CONFIG.ZONA, 'dd/MM/yyyy');
    var jejak = Utilities.formatDate(sekarang, CONFIG.ZONA, 'dd/MM/yyyy HH:mm') + ' · ' + (staf.nama || staf.id) + ' · diteruskan ke Direktorat';
    var status = String(o['Status'] || 'Diajukan');
    var catatan = String(o['Catatan Admin'] || '');
    if (status === 'Diajukan') {
      status = 'Diproses';
      catatan = 'Sudah diteruskan Kaprodi ke bagian akademik Direktorat (' + tgl + ').';
      sh.getRange(o._row, h.indexOf('Status') + 1).setValue(status);
      sh.getRange(o._row, h.indexOf('Catatan Admin') + 1).setValue(catatan);
    }
    if (h.indexOf('Diperbarui') >= 0) sh.getRange(o._row, h.indexOf('Diperbarui') + 1).setValue(jejak);
    return { ok: true, status: status, catatan: catatan, diperbarui: jejak };
  } finally {
    lock.releaseLock();
  }
}

/* ===================== USULAN KOLEKTIF (Pengembalian ke instansi) ===================== */
/**
 * Admin memilih beberapa permohonan (1 prodi + 1 jalur) → diberi No. Usulan yang sama,
 * status Diproses. Nota dinas .docx dibuat di aplikasi dari data yang sama.
 */
function usulkan_(staf, lingkup, req) {
  var nos = (req.nos || []).map(String);
  if (!nos.length) return { ok: false, pesan: 'Pilih minimal satu mahasiswa.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var semua = semuaBaris_();
    var pilih = semua.filter(function (o) { return nos.indexOf(String(o['No. Registrasi'])) >= 0; });
    if (pilih.length !== nos.length) return { ok: false, pesan: 'Sebagian permohonan tidak ditemukan. Muat ulang halaman.' };
    var kunci = '';
    for (var i = 0; i < pilih.length; i++) {
      var o = pilih[i];
      if (!o._j.kolektif) return { ok: false, pesan: o['No. Registrasi'] + ' bukan permohonan pengembalian.' };
      if (!dalamLingkup_(lingkup, o)) return { ok: false, pesan: o['No. Registrasi'] + ' di luar wewenang Anda.' };
      if (o['No. Usulan']) return { ok: false, pesan: o['Nama'] + ' sudah masuk usulan ' + o['No. Usulan'] + '.' };
      if (String(o['Status'] || 'Diajukan') === 'Ditolak') return { ok: false, pesan: o['Nama'] + ' berstatus Ditolak.' };
      var k = kelompokProdi_(o['Prodi']) + '|' + nilaiSel_(o['Jalur']);
      if (kunci && k !== kunci) return { ok: false, pesan: 'Satu usulan hanya untuk satu prodi dan satu jalur.' };
      kunci = k;
    }
    var now = new Date();
    var prefix = 'USUL-' + Utilities.formatDate(now, CONFIG.ZONA, 'yyMM') + '-', max = 0;
    semua.forEach(function (o) {
      var v = String(o['No. Usulan'] || '');
      if (v.indexOf(prefix) === 0) max = Math.max(max, Number(v.slice(prefix.length)) || 0);
    });
    var noUsulan = prefix + ('0' + (max + 1)).slice(-2);
    var tgl = Utilities.formatDate(now, CONFIG.ZONA, 'dd/MM/yyyy');
    var catatan = 'Masuk usulan Ketua Jurusan ke Direktur (' + noUsulan + ', ' + tgl + '). Surat pengembalian sedang diproses.';
    var jejak = Utilities.formatDate(now, CONFIG.ZONA, 'dd/MM/yyyy HH:mm') + ' · ' + (staf.nama || staf.id) + ' · ' + noUsulan;
    pilih.forEach(function (o) { tulis_(o, { 'No. Usulan': noUsulan, 'Status': 'Diproses', 'Catatan Admin': catatan, 'Diperbarui': jejak }); });
    return { ok: true, noUsulan: noUsulan, status: 'Diproses', catatan: catatan, diperbarui: jejak };
  } finally {
    lock.releaseLock();
  }
}

/** aksi: 'selesai' (semua anggota usulan → Selesai) atau 'batal' (lepas No. Usulan, kembali Diajukan). */
function aturUsulan_(staf, lingkup, req) {
  var noUsulan = String(req.noUsulan || '');
  if (!noUsulan) return { ok: false, pesan: 'No. usulan kosong.' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var anggota = semuaBaris_().filter(function (o) { return String(o['No. Usulan'] || '') === noUsulan && dalamLingkup_(lingkup, o); });
    if (!anggota.length) return { ok: false, pesan: 'Usulan tidak ditemukan.' };
    var now = new Date();
    var jejak = Utilities.formatDate(now, CONFIG.ZONA, 'dd/MM/yyyy HH:mm') + ' · ' + (staf.nama || staf.id);
    var ubah;
    if (req.aksiUsulan === 'selesai') {
      ubah = { 'Status': 'Selesai', 'Catatan Admin': 'Surat pengembalian sudah terbit. Silakan unduh di aplikasi Cari Surat.', 'Diperbarui': jejak + ' · selesai' };
    } else if (req.aksiUsulan === 'batal') {
      ubah = { 'No. Usulan': '', 'Status': 'Diajukan', 'Catatan Admin': '', 'Diperbarui': jejak + ' · batal ' + noUsulan };
    } else return { ok: false, pesan: 'Aksi tidak dikenal.' };
    anggota.forEach(function (o) { tulis_(o, ubah); });
    return { ok: true, jumlah: anggota.length, ubah: ubah };
  } finally {
    lock.releaseLock();
  }
}

function kelompokProdi_(prodi) {
  var p = String(prodi || '').toLowerCase();
  return p.indexOf('prof') >= 0 ? 'prof' : p.indexOf('d4') >= 0 ? 'd4' : p.indexOf('d3') >= 0 ? 'd3' : p;
}

/** Tulis beberapa kolom (berdasarkan judul kolom) pada satu baris permohonan. */
function tulis_(o, nilai) {
  Object.keys(nilai).forEach(function (kol) {
    var k = o._h.indexOf(kol);
    if (k >= 0) o._sh.getRange(o._row, k + 1).setValue(nilai[kol]);
  });
}

/* ===================== REKAP EMAIL HARIAN ===================== */
/** Jalankan SEKALI untuk memasang jadwal rekap email tiap pagi pukul 07.00. */
function pasangRekapEmail() {
  ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === 'rekapHarian'; })
    .forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('rekapHarian').timeBased().everyDays(1).atHour(7).inTimezone(CONFIG.ZONA).create();
  Logger.log('Rekap email terpasang: setiap hari sekitar pukul 07.00 WITA.');
}

/** Kirim email rekap permohonan 24 jam terakhir ke Kaprodi (tab "Rekap Email"). */
function rekapHarian() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Rekap Email');
  if (!sh || sh.getLastRow() < 2) return;
  var sejak = Date.now() - 24 * 3600 * 1000;
  var baru = semuaBaris_().filter(function (o) {
    var w = o['Waktu Pengajuan'];
    return w instanceof Date && w.getTime() >= sejak;
  });
  var menunggu = semuaBaris_().filter(function (o) { return String(o['Status'] || 'Diajukan') === 'Diajukan'; });

  sh.getDataRange().getValues().slice(1).forEach(function (r) {
    var lingkup = String(r[0] || '').split(/[,;]/).map(function (x) { return x.trim().toLowerCase(); }).filter(Boolean);
    var email = String(r[1] || '').trim();
    if (!lingkup.length || !email) return;
    var milik = baru.filter(function (o) { return dalamLingkup_(lingkup, o); });
    if (!milik.length) return;   // tidak ada permohonan baru → tidak kirim email
    var tunggu = menunggu.filter(function (o) { return dalamLingkup_(lingkup, o); }).length;

    var baris = milik.map(function (o) {
      return '<tr><td style="padding:6px 8px;border-bottom:1px solid #e5eeee">' + esc_(o['No. Registrasi']) + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e5eeee">' + esc_(o._j.nama) + '</td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e5eeee">' + esc_(o['Nama']) + '<br><small>' + esc_(o['NIM']) + ' · ' + esc_(o['Prodi']) + '</small></td>' +
        '<td style="padding:6px 8px;border-bottom:1px solid #e5eeee">' + esc_(o['Status'] || 'Diajukan') + '</td></tr>';
    }).join('');
    var html = '<div style="font-family:Arial,sans-serif;color:#12302f">' +
      '<h2 style="color:#00807e;margin:0 0 4px">Rekap Permohonan Mahasiswa</h2>' +
      '<p style="margin:0 0 12px;color:#5d7473">' + milik.length + ' permohonan baru dalam 24 jam terakhir · ' + tunggu + ' masih berstatus Diajukan</p>' +
      '<table style="border-collapse:collapse;font-size:13px;width:100%"><tr style="background:#e3f2f1;text-align:left">' +
      '<th style="padding:6px 8px">No.</th><th style="padding:6px 8px">Jenis</th><th style="padding:6px 8px">Mahasiswa</th><th style="padding:6px 8px">Status</th></tr>' +
      baris + '</table>' +
      '<p style="margin-top:16px"><a href="' + CONFIG.URL_APLIKASI + '" style="background:#00807e;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Buka Layanan Permohonan</a></p>' +
      '<p style="color:#94a3b8;font-size:11px">Email otomatis dari Gizi-Link – Jurusan Gizi Poltekkes Kemenkes Makassar.</p></div>';
    MailApp.sendEmail({
      to: email,
      subject: '[Gizi-Link] ' + milik.length + ' permohonan mahasiswa baru',
      htmlBody: html
    });
  });
}

function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
}

/* ===================== PESAN WA ===================== */
var BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

function tglIndo_(iso) {
  var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Number(m[3]) + ' ' + BULAN[Number(m[2]) - 1] + ' ' + m[1] : iso;
}

function nilaiTampil_(f, v) {
  if (!v) return '-';
  v = String(v).replace(/^'/, '');
  if (f.tipe === 'rupiah') return 'Rp ' + String(v).replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  if (f.tipe === 'tanggal') return tglIndo_(v);
  return v;
}

function pesanWa_(j, mhs, isi, no, now, staf) {
  var waktu = Number(Utilities.formatDate(now, CONFIG.ZONA, 'd')) + ' ' +
    BULAN[Number(Utilities.formatDate(now, CONFIG.ZONA, 'M')) - 1] + ' ' +
    Utilities.formatDate(now, CONFIG.ZONA, 'yyyy, HH.mm') + ' WITA';
  var baris = [
    "Assalamu'alaikum, Bapak/Ibu Admin Akademik Direktorat.",
    'Bersama ini kami teruskan permohonan mahasiswa Jurusan Gizi berikut:',
    '',
    '📩 *' + j.nama.toUpperCase() + '*',
    'No. Registrasi : ' + no,
    'Tanggal        : ' + waktu,
    '',
    '👤 *Data Mahasiswa*',
    'Nama  : ' + (mhs.nama || '-'),
    'NIM   : ' + mhs.nim,
    'Prodi : ' + (mhs.prodi || '-') + (mhs.kelas ? ' – ' + mhs.kelas : ''),
    '',
    '📝 *Rincian*'
  ];
  j.field.forEach(function (f) {
    if (f.id === 'no_hp') return;
    baris.push(f.label + ' : ' + nilaiTampil_(f, isi[f.id]));
  });
  baris.push('No. HP/WA : ' + (isi.no_hp || '-'));
  baris.push('', 'Mohon kiranya dapat diproses. Terima kasih.');
  if (staf && staf.nama) baris.push('', 'Hormat kami,', staf.nama);
  baris.push('',
    '_Dikirim melalui Gizi-Link – Jurusan Gizi Poltekkes Kemenkes Makassar_');
  return baris.join('\n');
}

/* ===================== UTILITAS ===================== */
function pengaturan_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('Pengaturan');
  var out = {};
  if (!sh || sh.getLastRow() < 2) return out;
  sh.getDataRange().getDisplayValues().slice(1).forEach(function (r) {
    out[String(r[0]).trim()] = {
      wa: String(r[2] || '').trim() || CONFIG.WA_DEFAULT,
      aktif: String(r[3] || '').trim().toUpperCase() !== 'TIDAK'
    };
  });
  return out;
}

/** 0852… / +62852… / 62852… → 62852… */
function normWa_(v) {
  var s = String(v || '').replace(/\D/g, '');
  if (s.indexOf('0') === 0) s = '62' + s.slice(1);
  return s;
}

function kolom_(sh, nama) {
  return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String).indexOf(nama) + 1;
}

function normNim_(v) {
  return String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0');
}

function profilPublik_(m) {
  return { nim: m.nim, nama: m.nama, prodi: m.prodi, kelas: m.kelas };
}

/** Verifikasi token Gizi-Link DOSEN/STAF. {id, nama, permohonan, ...} atau null. */
function verifikasiStafSSO_(token) {
  try {
    var rahasia = PropertiesService.getScriptProperties().getProperty('SSO_SECRET');
    var bagian = String(token || '').split('.');
    if (!rahasia || bagian.length !== 2) return null;
    var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(bagian[0], rahasia));
    if (sig !== bagian[1]) return null;
    var p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(bagian[0])).getDataAsString('UTF-8'));
    if (!p || p.jenis !== 'staf' || !p.id || !p.exp || Date.now() > Number(p.exp)) return null;
    return p;
  } catch (e) {
    return null;
  }
}

/**
 * Verifikasi token Gizi-Link MAHASISWA (sama dengan aplikasi lain).
 * Butuh Properti Skrip "SSO_SECRET" yang sama dengan Apps Script portal.
 */
function verifikasiSSO_(token) {
  try {
    var rahasia = PropertiesService.getScriptProperties().getProperty('SSO_SECRET');
    var bagian = String(token || '').split('.');
    if (!rahasia || bagian.length !== 2) return null;
    var sig = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(bagian[0], rahasia));
    if (sig !== bagian[1]) return null;
    var p = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(bagian[0])).getDataAsString('UTF-8'));
    if (!p || !p.nim || p.jenis === 'staf' || !p.exp || Date.now() > Number(p.exp)) return null;
    return p;
  } catch (e) {
    return null;
  }
}
