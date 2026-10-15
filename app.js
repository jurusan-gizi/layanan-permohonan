(() => {
  'use strict';

  const CFG = window.LAYANAN_CONFIG || {};
  const SSO = window.GiziSSO || null;
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const $isi = document.getElementById('isi');

  let DATA = null;   // { profil, layanan, riwayat }
  let sesi = null;   // token Gizi-Link mahasiswa

  mulai();

  async function mulai() {
    if (!CFG.API_URL) return tampilPesan('Layanan belum tersambung ke server. Admin: isi <code>API_URL</code> di <code>config.js</code>.');
    if (!SSO) return tampilPesan('Gizi-Link tidak dapat dimuat. Periksa koneksi lalu muat ulang halaman.');
    sesi = SSO.get();
    if (sesi) return muat();
    const staf = SSO.getStaf && SSO.getStaf();
    if (staf) { sesi = staf; return muatPantau(); }
    tampilMasuk();
  }

  /* ===================== MODE PANTAU (KAPRODI / ADMIN) ===================== */
  let P = null;                                   // data pantauan
  const F = { status: 'Diajukan', jenis: '', cari: '' };

  async function muatPantau() {
    tampilMuat();
    try {
      const res = await api({ aksi: 'pantau', token: sesi.token });
      if (!res.ok) {
        if (res.kode === 'AUTH') { SSO.keluar(false); return tampilMasuk('Sesi berakhir, silakan masuk lagi.'); }
        return tampilPesan(esc(res.pesan || 'Gagal memuat data.'));
      }
      P = res;
      if (!P.data.some((d) => d.status === 'Diajukan')) F.status = '';
      daftarPantau();
    } catch (e) {
      tampilPesan(navigator.onLine ? 'Server tidak merespons. Coba muat ulang halaman sebentar lagi.' : 'Tidak ada koneksi internet.');
    }
  }

  function daftarPantau() {
    const hit = (st) => P.data.filter((d) => !st || d.status === st).length;
    const cocok = P.data.filter((d) =>
      (!F.status || d.status === F.status) && (!F.jenis || d.kode === F.jenis) &&
      (!F.cari || (d.nama + ' ' + d.nim + ' ' + d.no).toLowerCase().includes(F.cari.toLowerCase())));
    const lingkup = P.staf.label || (P.staf.lingkup.includes('semua') ? 'Semua prodi' : 'Prodi ' + P.staf.lingkup.map((x) => x.toUpperCase()).join(', '));
    $isi.innerHTML = `
      <section class="kartu profil">
        <div class="avatar" aria-hidden="true">${esc(inisial(P.staf.nama))}</div>
        <div class="profil-teks">
          <p class="salam">Pemantauan permohonan · ${esc(lingkup)}</p>
          <p class="nama">${esc(P.staf.nama || '-')}</p>
        </div>
      </section>

      ${P.jenis.some((j) => j.kode === 'KMB') ? `<button type="button" class="btn kolektif" id="btn-kolektif">📑 Usulan Kolektif Pengembalian
          <small>${P.data.filter((d) => d.kolektif && !d.noUsulan && d.status !== 'Ditolak').length} belum diusulkan</small></button>` : ''}

      <div class="stat-grid" role="group" aria-label="Saring status">
        ${[['', 'Semua'], ...P.status.map((x) => [x, x])].map(([v, t]) => `
          <button class="stat ${v ? 's-' + v.toLowerCase() : 's-semua'}" data-status="${esc(v)}" aria-pressed="${F.status === v}">
            <b>${hit(v)}</b><span>${esc(t)}</span></button>`).join('')}
      </div>

      <div class="saring">
        <select id="f-jenis" aria-label="Jenis permohonan">
          <option value="">Semua jenis</option>
          ${P.jenis.map((j) => `<option value="${esc(j.kode)}" ${F.jenis === j.kode ? 'selected' : ''}>${esc(j.ikon + ' ' + j.nama)}</option>`).join('')}
        </select>
        <input id="f-cari" type="search" placeholder="Cari nama / NIM / no. registrasi" value="${esc(F.cari)}">
      </div>

      ${cocok.length ? `<ul class="riwayat pantau">${cocok.map((d) => `
        <li data-no="${esc(d.no)}" tabindex="0" role="button">
          <span class="r-ikon" aria-hidden="true">${esc(d.ikon)}</span>
          <span class="r-jenis">${esc(d.nama)} <small class="r-nim">${esc(d.nim)}</small></span>
          <span class="status s-${esc(d.status.toLowerCase())}">${esc(d.status)}</span>
          <span class="r-info">${esc(d.jenis)} · ${esc(d.prodi)}${d.kelas ? ' ' + esc(d.kelas) : ''}<br>${esc(d.no)} · ${esc(tglWaktu(d.waktu))}</span>
        </li>`).join('')}</ul>`
      : '<p class="kartu kosong">Tidak ada permohonan untuk saringan ini.</p>'}`;

    $isi.querySelectorAll('[data-status]').forEach((b) => b.onclick = () => { F.status = b.dataset.status; daftarPantau(); });
    const bk = document.getElementById('btn-kolektif');
    if (bk) bk.onclick = () => usulanKolektif();
    document.getElementById('f-jenis').onchange = (e) => { F.jenis = e.target.value; daftarPantau(); };
    const cari = document.getElementById('f-cari');
    cari.oninput = () => { F.cari = cari.value; clearTimeout(cari._t); cari._t = setTimeout(() => { daftarPantau(); const c = document.getElementById('f-cari'); c.focus(); c.setSelectionRange(c.value.length, c.value.length); }, 250); };
    $isi.querySelectorAll('[data-no]').forEach((li) => {
      const buka = () => detailPantau(li.dataset.no);
      li.onclick = buka; li.onkeydown = (e) => { if (e.key === 'Enter') buka(); };
    });
  }

  function detailPantau(no) {
    const d = P.data.find((x) => x.no === no);
    const sapa = `Halo ${d.nama}, terkait permohonan ${d.jenis} (No. ${d.no}): `;
    $isi.innerHTML = `
      <section class="kartu">
        <div class="form-judul">
          <span class="app-ikon" style="--warna:#00807e" aria-hidden="true">${esc(d.ikon)}</span>
          <div><h2>${esc(d.jenis)}</h2><p class="bantu" style="margin:2px 0 0">${esc(d.no)} · ${esc(tglWaktu(d.waktu))}</p></div>
        </div>
        <dl class="identitas">
          <dt>Nama</dt><dd>${esc(d.nama)}</dd>
          <dt>NIM</dt><dd>${esc(d.nim)}</dd>
          <dt>Prodi</dt><dd>${esc([d.prodi, d.kelas].filter(Boolean).join(' – '))}</dd>
          ${d.rincian.map((r) => `<dt>${esc(r.label)}</dt><dd>${esc(r.nilai)}</dd>`).join('')}
        </dl>
      </section>

      <form id="form-status" class="kartu" style="margin-top:12px" novalidate>
        <label for="s-status">Status</label>
        <select id="s-status">${P.status.map((x) => `<option ${x === d.status ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>
        <label for="s-catatan">Catatan untuk mahasiswa</label>
        <textarea id="s-catatan" maxlength="500" placeholder="mis. Sudah diteruskan ke bagian akademik Direktorat 15/10">${esc(d.catatan)}</textarea>
        ${d.diperbarui ? `<p class="bantu-field">Terakhir diperbarui: ${esc(d.diperbarui)}</p>` : ''}
        ${(d.adminField || []).map((f) => `
          <label for="adm-${esc(f.id)}">${esc(f.label)}${f.wajib ? '<span class="wajib">*</span>' : ''}</label>
          <input id="adm-${esc(f.id)}" ${f.tipe === 'tanggal' ? 'type="date"' : ''} value="${esc(d.adminIsi[f.id] || '')}">`).join('')}
        <p id="pesan-form" class="pesan" role="alert" hidden></p>
        ${d.surat ? `<button type="button" class="btn wa" id="btn-docx" style="background:#1d4ed8;margin-top:18px">📄 Unduh draf surat (.docx) untuk Srikandi</button>
          <p class="bantu-field">Nomor, tanggal, tanda tangan & nama penandatangan sengaja dikosongkan (diisi Srikandi). Status otomatis menjadi <b>Diproses</b>.</p>` : ''}
        ${d.kolektif ? `<p class="langkah" style="margin-top:16px">${d.noUsulan
            ? `📑 Sudah masuk usulan <b>${esc(d.noUsulan)}</b>. Kelola (unduh ulang, tandai selesai) di menu <b>Usulan Kolektif</b>.`
            : '📑 Belum diusulkan. Gabungkan dengan mahasiswa lain lewat menu <b>Usulan Kolektif</b> di halaman daftar.'}</p>` : ''}
        <button type="submit" class="btn utama" id="btn-simpan">Simpan status</button>
        ${d.hp ? `<a class="btn sekunder" href="https://wa.me/${encodeURIComponent(d.hp)}?text=${encodeURIComponent(sapa)}" target="_blank" rel="noopener">💬 Hubungi mahasiswa via WA</a>` : ''}
        ${d.pesanDirektorat ? `<a class="btn wa" id="btn-teruskan" style="margin-top:10px" href="https://wa.me/${encodeURIComponent(d.waDirektorat)}?text=${encodeURIComponent(d.pesanDirektorat)}" target="_blank" rel="noopener">📤 Teruskan ke WA admin Direktorat</a>
          <p class="bantu-field">Setelah diteruskan, status otomatis menjadi <b>Diproses</b> dan mahasiswa melihat catatannya.</p>` : ''}
        <button type="button" class="btn sekunder" id="btn-kembali">← Kembali ke daftar</button>
      </form>`;
    document.getElementById('btn-kembali').onclick = daftarPantau;
    const btnDocx = document.getElementById('btn-docx');
    if (btnDocx) btnDocx.onclick = () => unduhDraf(d, btnDocx);
    const btnTeruskan = document.getElementById('btn-teruskan');
    if (btnTeruskan) btnTeruskan.addEventListener('click', () => {
      // WA terbuka lewat tautan; pencatatan di server berjalan bersamaan.
      api({ aksi: 'teruskan', token: sesi.token, no: d.no }).then((res) => {
        if (!res || !res.ok) return;
        Object.assign(d, { status: res.status, catatan: res.catatan, diperbarui: res.diperbarui });
        const sel = document.getElementById('s-status'), cat = document.getElementById('s-catatan');
        if (sel) sel.value = res.status;
        if (cat) cat.value = res.catatan;
      }).catch(() => {});
    });
    document.getElementById('form-status').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-simpan');
      btn.disabled = true; btn.innerHTML = '<span class="putar kecil"></span> Menyimpan…';
      try {
        const res = await api({ aksi: 'ubahStatus', token: sesi.token, no: d.no,
          status: document.getElementById('s-status').value, catatan: document.getElementById('s-catatan').value, admin: isianAdmin(d) });
        if (!res.ok) {
          if (res.kode === 'AUTH') { SSO.keluar(false); return tampilMasuk('Sesi berakhir, silakan masuk lagi.'); }
          return pesanForm(res.pesan || 'Gagal menyimpan.');
        }
        Object.assign(d, { status: res.status, catatan: res.catatan, diperbarui: res.diperbarui, adminIsi: isianAdmin(d) });
        daftarPantau();
      } catch (err) {
        pesanForm(navigator.onLine ? 'Server tidak merespons. Coba lagi.' : 'Tidak ada koneksi internet.');
      } finally {
        if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = 'Simpan status'; }
      }
    });
    scrollTo(0, 0);
  }

  async function muat() {
    tampilMuat();
    try {
      const res = await api({ aksi: 'muat', token: sesi.token });
      if (!res.ok) {
        if (res.kode === 'AUTH') { SSO.keluar(false); return tampilMasuk('Sesi berakhir, silakan masuk lagi.'); }
        return tampilPesan(esc(res.pesan || 'Gagal memuat layanan.'));
      }
      DATA = res;
      beranda();
    } catch (e) {
      tampilPesan(navigator.onLine ? 'Server tidak merespons. Coba muat ulang halaman sebentar lagi.' : 'Tidak ada koneksi internet.');
    }
  }

  /* ===================== TAMPILAN ===================== */
  function tampilMasuk(catatan) {
    const staf = SSO && SSO.getStaf && SSO.getStaf();
    $isi.innerHTML = `
      <section class="kartu">
        <h2 style="margin:0 0 6px;font-size:19px">Masuk dulu lewat Gizi-Link</h2>
        <p class="bantu" style="margin-top:0">${staf
          ? 'Layanan ini khusus mahasiswa. Anda sedang masuk sebagai dosen/staf.'
          : 'Data diri (nama, NIM, prodi) akan terisi otomatis dari akun Gizi-Link Anda.'}</p>
        ${catatan ? `<p class="pesan">${esc(catatan)}</p>` : ''}
        <button class="btn utama" id="btn-masuk">Masuk dengan NIM & tanggal lahir</button>
      </section>`;
    document.getElementById('btn-masuk').onclick = () => {
      if (staf) SSO.keluar(false);
      SSO.masuk(location.href.split('#')[0]);
    };
  }

  function beranda() {
    const p = DATA.profil;
    $isi.innerHTML = `
      <section class="kartu profil">
        <div class="avatar" aria-hidden="true">${esc(inisial(p.nama))}</div>
        <div class="profil-teks">
          <p class="salam">Mahasiswa</p>
          <p class="nama">${esc(p.nama || '-')}</p>
          <p class="bantu">${esc([p.nim, p.prodi, p.kelas].filter(Boolean).join(' · '))}</p>
        </div>
      </section>

      <h2 class="judul-bagian">Pilih permohonan</h2>
      <ul class="grid-app">
        ${DATA.layanan.map((l) => `
          <li><button class="app" data-kode="${esc(l.kode)}" style="--warna:${esc(l.warna)}">
            <span class="app-ikon" aria-hidden="true">${esc(l.ikon)}</span>
            <span class="app-teks rapat">
              <span class="app-nama">${esc(l.nama)}</span>
              <span class="app-desk">${esc(l.ringkas)}</span>
            </span>
          </button></li>`).join('')}
      </ul>
      ${DATA.layanan.length ? '' : '<p class="kartu kosong">Belum ada layanan yang dibuka.</p>'}

      <h2 class="judul-bagian">Permohonan saya</h2>
      ${DATA.riwayat.length ? `<ul class="riwayat">${DATA.riwayat.map(itemRiwayat).join('')}</ul>`
        : '<p class="kartu kosong">Belum ada permohonan.</p>'}`;
    $isi.querySelectorAll('[data-kode]').forEach((b) => b.addEventListener('click', () => bukaForm(b.dataset.kode)));
    scrollTo(0, 0);
  }

  function itemRiwayat(r) {
    const kelas = 's-' + String(r.status).toLowerCase();
    return `<li>
      <span class="r-ikon" aria-hidden="true">${esc(r.ikon)}</span>
      <span class="r-jenis">${esc(r.jenis)}</span>
      <span class="status ${esc(kelas)}">${esc(r.status)}</span>
      <span class="r-info">${esc(r.no)} · ${esc(tglWaktu(r.waktu))}</span>
      ${r.catatan ? `<span class="r-catatan">💬 ${esc(r.catatan)}</span>` : ''}
      ${r.surat && r.status === 'Selesai' ? `<a class="r-wa" href="https://jurusan-gizi.github.io/Kantor-Virtual/">📄 Unduh di Cari Surat</a>` : ''}
    </li>`;
  }

  function bukaForm(kode) {
    const l = DATA.layanan.find((x) => x.kode === kode);
    const p = DATA.profil;
    $isi.innerHTML = `
      <section class="kartu">
        <div class="form-judul">
          <span class="app-ikon" style="--warna:${esc(l.warna)}" aria-hidden="true">${esc(l.ikon)}</span>
          <h2>${esc(l.nama)}</h2>
        </div>
        <span class="kunci">🔒 Data diri dari akun Gizi-Link</span>
        <dl class="identitas">
          <dt>Nama</dt><dd>${esc(p.nama || '-')}</dd>
          <dt>NIM</dt><dd>${esc(p.nim)}</dd>
          <dt>Prodi</dt><dd>${esc([p.prodi, p.kelas].filter(Boolean).join(' – ') || '-')}</dd>
        </dl>
      </section>

      <form id="form-ajuan" class="kartu" style="margin-top:12px" novalidate>
        ${htmlFields(l.field)}
        <p id="pesan-form" class="pesan" role="alert" hidden></p>
        <button type="submit" class="btn utama" id="btn-kirim">Simpan permohonan</button>
        <button type="button" class="btn sekunder" id="btn-batal">Batal</button>
      </form>`;
    document.getElementById('btn-batal').onclick = beranda;
    document.getElementById('form-ajuan').addEventListener('submit', (e) => { e.preventDefault(); kirim(l); });
    const btnTambah = document.getElementById('btn-tambah-grup');
    if (btnTambah) btnTambah.onclick = () => {
      const g = $isi.querySelector('.grup-isian[hidden]');
      if (g) { g.hidden = false; g.querySelector('input,textarea').focus(); }
      btnTambah.hidden = !$isi.querySelector('.grup-isian[hidden]');
    };
    $isi.querySelectorAll('[data-hapus-grup]').forEach((b) => b.onclick = () => {
      const g = b.closest('.grup-isian');
      g.querySelectorAll('input,textarea').forEach((el) => { el.value = ''; });
      g.hidden = true;
      if (btnTambah) btnTambah.hidden = false;
    });
    $isi.querySelectorAll('input[data-rupiah]').forEach((el) => el.addEventListener('input', () => {
      const angka = el.value.replace(/\D/g, '');
      el.value = angka ? Number(angka).toLocaleString('id-ID') : '';
    }));
    scrollTo(0, 0);
  }

  /** Isian biasa + isian berkelompok (grup 1..4: instansi tujuan) dengan tombol "Tambah". */
  function htmlFields(fields) {
    let html = '', grupAkhir = 0;
    const grup = {};
    fields.forEach((f) => { if (f.grup) (grup[f.grup] = grup[f.grup] || []).push(f); });
    fields.forEach((f) => {
      if (!f.grup) { html += htmlField(f); return; }
      if (f.grup === grupAkhir) return;
      grupAkhir = f.grup;
      const n = f.grup;
      html += `<fieldset class="grup-isian" data-grup="${n}" ${n > 1 ? 'hidden' : ''}>
        <legend>Instansi tujuan ${n}${n > 1 ? ` <button type="button" class="hapus-grup" data-hapus-grup>✕ Hapus</button>` : ''}</legend>
        ${grup[n].map(htmlField).join('')}</fieldset>`;
      if (n === Math.max(...Object.keys(grup).map(Number))) {
        html += `<button type="button" class="btn sekunder" id="btn-tambah-grup" style="margin-top:10px">＋ Tambah instansi tujuan</button>
          <p class="bantu-field">Isi semua instansi yang harus menerima surat pengembalian (mis. tempat kerja, BKD/BKPSDM, Dinas Kesehatan). Maksimal 4.</p>`;
      }
    });
    return html;
  }

  function htmlField(f) {
    const id = 'f-' + f.id;
    const label = `<label for="${id}">${esc(f.label)}${f.wajib ? '<span class="wajib">*</span>' : ''}</label>`;
    const ph = f.contoh ? ` placeholder="${esc(f.contoh)}"` : '';
    let input;
    switch (f.tipe) {
      case 'pilih':
        input = f.opsi.length === 1
          ? `<select id="${id}"><option selected>${esc(f.opsi[0])}</option></select>`
          : `<select id="${id}"><option value="">— Pilih —</option>${f.opsi.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`; break;
      case 'panjang':
        input = `<textarea id="${id}" maxlength="1000"${ph}></textarea>`; break;
      case 'tanggal':
        input = `<input id="${id}" type="date">`; break;
      case 'rupiah':
        input = `<div class="rp"><span>Rp</span><input id="${id}" inputmode="numeric" data-rupiah placeholder="mis. 2.500.000"></div>`; break;
      case 'angka':
        input = `<input id="${id}" inputmode="numeric"${ph}>`; break;
      case 'hp':
        input = `<input id="${id}" type="tel" inputmode="tel" autocomplete="tel" placeholder="mis. 0812xxxxxxxx">`; break;
      default:
        input = `<input id="${id}" maxlength="300"${ph}>`;
    }
    return label + input + (f.bantu ? `<p class="bantu-field">${esc(f.bantu)}</p>` : '');
  }

  async function kirim(l) {
    const data = {};
    for (const f of l.field) {
      const v = (document.getElementById('f-' + f.id).value || '').trim();
      if (f.wajib && !v) return pesanForm(`${f.label} wajib diisi.`, 'f-' + f.id);
      data[f.id] = f.tipe === 'rupiah' ? v.replace(/\D/g, '') : v;
    }
    for (let g = 1; g <= 4; g++) {
      if (!(('instansi_' + g) in data)) continue;
      if (!!data['instansi_' + g] !== !!data['alamat_' + g]) {
        return pesanForm(`Lengkapi nama dan alamat instansi tujuan ${g}.`, data['instansi_' + g] ? 'f-alamat_' + g : 'f-instansi_' + g);
      }
    }
    const btn = document.getElementById('btn-kirim');
    btn.disabled = true;
    btn.innerHTML = '<span class="putar kecil"></span> Menyimpan…';
    try {
      const res = await api({ aksi: 'ajukan', token: sesi.token, kode: l.kode, data });
      if (!res.ok) {
        if (res.kode === 'AUTH') { SSO.keluar(false); return tampilMasuk('Sesi berakhir, silakan masuk lagi.'); }
        return pesanForm(res.pesan || 'Gagal menyimpan.');
      }
      sukses(l, res);
    } catch (e) {
      pesanForm(navigator.onLine ? 'Server tidak merespons. Coba lagi sebentar lagi.' : 'Tidak ada koneksi internet.');
    } finally {
      if (document.body.contains(btn)) { btn.disabled = false; btn.textContent = 'Simpan permohonan'; }
    }
  }

  function sukses(l, res) {
    if (res.kolektif) {
      $isi.innerHTML = `
        <section class="kartu sukses">
          <div class="centang" aria-hidden="true">✓</div>
          <h2>Permohonan tersimpan</h2>
          <p class="bantu" style="margin-top:0">${esc(l.nama)}</p>
          <div class="no-reg">${esc(res.no)}</div>
          <div class="langkah">
            <strong>Selanjutnya:</strong> admin akademik jurusan menggabungkan permohonan Anda ke dalam
            <strong>usulan Ketua Jurusan kepada Direktur</strong>. Direktorat kemudian menerbitkan surat pengembalian
            (satu surat berisi semua instansi tujuan Anda). Setelah status <strong>Selesai</strong>, surat dapat
            diunduh di aplikasi <strong>Cari Surat Mahasiswa</strong>.
          </div>
          <button type="button" class="btn sekunder" id="btn-selesai">Kembali ke daftar permohonan</button>
        </section>`;
      document.getElementById('btn-selesai').onclick = muat;
      return scrollTo(0, 0);
    }
    if (res.surat) {
      $isi.innerHTML = `
        <section class="kartu sukses">
          <div class="centang" aria-hidden="true">✓</div>
          <h2>Permohonan tersimpan</h2>
          <p class="bantu" style="margin-top:0">${esc(l.nama)}</p>
          <div class="no-reg">${esc(res.no)}</div>
          <div class="langkah">
            <strong>Selanjutnya:</strong> admin jurusan menyiapkan surat dan memprosesnya di <strong>Srikandi</strong>.
            Pantau statusnya di <em>Permohonan saya</em>. Setelah berstatus <strong>Selesai</strong>, surat dapat
            diunduh di aplikasi <strong>Cari Surat Mahasiswa</strong>.
          </div>
          <button type="button" class="btn sekunder" id="btn-selesai">Kembali ke daftar permohonan</button>
        </section>`;
      document.getElementById('btn-selesai').onclick = muat;
      return scrollTo(0, 0);
    }
    $isi.innerHTML = `
      <section class="kartu sukses">
        <div class="centang" aria-hidden="true">✓</div>
        <h2>Permohonan tersimpan</h2>
        <p class="bantu" style="margin-top:0">${esc(l.nama)}</p>
        <div class="no-reg">${esc(res.no)}</div>
        <p class="bantu" style="margin-top:6px">Simpan nomor registrasi ini untuk menanyakan perkembangan surat.</p>

        <div class="langkah">
          <strong>Selanjutnya:</strong> permohonan Anda diperiksa oleh <strong>Kaprodi</strong>, lalu diteruskan ke
          bagian akademik Direktorat. Pantau statusnya di <em>Permohonan saya</em>. Status berubah menjadi
          <strong>Diproses</strong> setelah diteruskan.
        </div>
        <button type="button" class="btn sekunder" id="btn-selesai">Kembali ke daftar permohonan</button>
      </section>`;
    document.getElementById('btn-selesai').onclick = muat;
    scrollTo(0, 0);
  }

  /* ===================== USULAN KOLEKTIF (Pengembalian ke instansi) ===================== */
  const K = { kelompok: '' };   // kelompok terpilih: 'prof|RPL', 'd4|RPL', ...

  function kelompokProdi(prodi) {
    const p = String(prodi || '').toLowerCase();
    return p.includes('prof') ? 'prof' : p.includes('d4') ? 'd4' : p.includes('d3') ? 'd3' : p;
  }
  function kunciKelompok(d) { return kelompokProdi(d.prodi) + '|' + ((d.isi && d.isi.jalur) || '-'); }
  function labelKelompok(k) {
    const [p, j] = k.split('|');
    return (p === 'prof' ? 'Profesi Dietisien' : p === 'd4' ? 'Sarjana Terapan' : p.toUpperCase()) + ' · ' + j;
  }

  function usulanKolektif() {
    const kmb = P.data.filter((d) => d.kolektif);
    const belum = kmb.filter((d) => !d.noUsulan && d.status !== 'Ditolak');
    const kelompok = [...new Set(belum.map(kunciKelompok))].sort();
    if (!kelompok.includes(K.kelompok)) K.kelompok = kelompok[0] || '';
    const calon = belum.filter((d) => kunciKelompok(d) === K.kelompok).sort((a, b) => (a.no < b.no ? -1 : 1));

    // Usulan yang sudah dibuat, dikelompokkan per No. Usulan
    const usulan = {};
    kmb.filter((d) => d.noUsulan).forEach((d) => (usulan[d.noUsulan] = usulan[d.noUsulan] || []).push(d));
    const daftarUsulan = Object.keys(usulan).sort().reverse();

    $isi.innerHTML = `
      <section class="kartu">
        <h2 style="margin:0 0 4px;font-size:18px">📑 Usulan Kolektif Pengembalian</h2>
        <p class="bantu" style="margin:0">Pilih mahasiswa, lalu buat <b>satu nota dinas</b> Ketua Jurusan ke Direktur beserta lampiran daftar nama.
          Satu usulan = satu prodi + satu jalur.</p>
      </section>

      <h2 class="judul-bagian">Belum diusulkan</h2>
      ${kelompok.length ? `
        <div class="chip-grup" role="group" aria-label="Kelompok">
          ${kelompok.map((k) => `<button type="button" class="chip" data-kel="${esc(k)}" aria-pressed="${k === K.kelompok}">
            ${esc(labelKelompok(k))} <b>${belum.filter((d) => kunciKelompok(d) === k).length}</b></button>`).join('')}
        </div>
        <section class="kartu" style="padding:8px 12px">
          <label class="cek-semua"><input type="checkbox" id="cek-semua" checked> Pilih semua (${calon.length})</label>
          <ul class="daftar-cek">
            ${calon.map((d) => `<li><label>
              <input type="checkbox" class="cek-mhs" value="${esc(d.no)}" checked>
              <span><b>${esc(d.nama)}</b> <small>${esc(d.nim)}</small><br>
              <small class="bantu">${esc(daftarInstansi(d).map((x) => x.nama).join(' · '))}</small></span>
              <button type="button" class="lihat" data-lihat="${esc(d.no)}" aria-label="Lihat rincian">›</button>
            </label></li>`).join('')}
          </ul>
          <p id="pesan-form" class="pesan" role="alert" hidden></p>
          <button type="button" class="btn wa" id="btn-usulkan" style="background:#7c3aed;margin-top:12px">📄 Buat Nota Dinas Usulan (.docx)</button>
          <p class="bantu-field">Mahasiswa terpilih mendapat No. Usulan yang sama dan status otomatis menjadi <b>Diproses</b>.
            Nomor, tanggal, TTD & nama penandatangan dikosongkan untuk Srikandi.</p>
        </section>`
      : '<p class="kartu kosong">Semua permohonan pengembalian sudah diusulkan. 👍</p>'}

      <h2 class="judul-bagian">Usulan yang sudah dibuat</h2>
      ${daftarUsulan.length ? `<ul class="riwayat">${daftarUsulan.map((no) => {
        const a = usulan[no], selesai = a.every((d) => d.status === 'Selesai');
        return `<li>
          <span class="r-ikon" aria-hidden="true">📑</span>
          <span class="r-jenis">${esc(no)} <small class="r-nim">${a.length} mahasiswa</small></span>
          <span class="status s-${selesai ? 'selesai' : 'diproses'}">${selesai ? 'Selesai' : 'Diproses'}</span>
          <span class="r-info">${esc(labelKelompok(kunciKelompok(a[0])))}<br>${esc(a.map((d) => d.nama).join(', '))}</span>
          <span class="aksi-usulan">
            <button type="button" class="btn sekunder kecil" data-unduh="${esc(no)}">📄 Unduh ulang</button>
            ${selesai ? '' : `<button type="button" class="btn sekunder kecil" data-selesai="${esc(no)}">✓ Tandai surat terbit</button>
            <button type="button" class="btn teks kecil" data-batal="${esc(no)}">Batalkan</button>`}
          </span>
        </li>`;
      }).join('')}</ul>` : '<p class="kartu kosong">Belum ada usulan.</p>'}

      <button type="button" class="btn sekunder" id="btn-kembali" style="margin-top:16px">← Kembali ke daftar</button>`;

    document.getElementById('btn-kembali').onclick = daftarPantau;
    $isi.querySelectorAll('[data-kel]').forEach((b) => b.onclick = () => { K.kelompok = b.dataset.kel; usulanKolektif(); });
    $isi.querySelectorAll('[data-lihat]').forEach((b) => b.onclick = (e) => { e.preventDefault(); detailPantau(b.dataset.lihat); });
    const semua = document.getElementById('cek-semua');
    if (semua) semua.onchange = () => $isi.querySelectorAll('.cek-mhs').forEach((c) => { c.checked = semua.checked; });
    const bu = document.getElementById('btn-usulkan');
    if (bu) bu.onclick = () => buatUsulan(bu);
    $isi.querySelectorAll('[data-unduh]').forEach((b) => b.onclick = () => unduhUsulan(usulan[b.dataset.unduh], b.dataset.unduh, b));
    $isi.querySelectorAll('[data-selesai]').forEach((b) => b.onclick = () => aturUsulan(b.dataset.selesai, 'selesai', b));
    $isi.querySelectorAll('[data-batal]').forEach((b) => b.onclick = () => aturUsulan(b.dataset.batal, 'batal', b));
    scrollTo(0, 0);
  }

  function daftarInstansi(d) {
    const i = d.isi || {}, out = [];
    for (let g = 1; g <= 4; g++) if (i['instansi_' + g]) out.push({ nama: i['instansi_' + g], alamat: i['alamat_' + g] || '' });
    return out;
  }

  async function buatUsulan(btn) {
    const nos = [...$isi.querySelectorAll('.cek-mhs:checked')].map((c) => c.value);
    if (!nos.length) return pesanForm('Pilih minimal satu mahasiswa.');
    if (!confirm(`Buat nota dinas usulan untuk ${nos.length} mahasiswa?`)) return;
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="putar kecil"></span> Menyiapkan…';
    try {
      const res = await api({ aksi: 'usulkan', token: sesi.token, nos });
      if (!res.ok) return pesanForm(res.pesan || 'Gagal membuat usulan.');
      const anggota = P.data.filter((d) => nos.includes(d.no));
      anggota.forEach((d) => Object.assign(d, { noUsulan: res.noUsulan, status: res.status, catatan: res.catatan, diperbarui: res.diperbarui }));
      await unduhUsulan(anggota, res.noUsulan);
      usulanKolektif();
    } catch (e) {
      pesanForm('Gagal: ' + (e.message || e));
    } finally {
      if (document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  async function unduhUsulan(anggota, noUsulan, btn) {
    const label = btn && btn.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="putar kecil"></span>'; }
    try {
      const urut = anggota.slice().sort((a, b) => (a.no < b.no ? -1 : 1));
      const d0 = urut[0];
      const jalur = (d0.isi && d0.isi.jalur) || '';
      const nomor = (xs, f) => xs.length > 1 ? xs.map((x, i) => `${i + 1}. ${f(x)}`).join('\n') : xs.map(f).join('');
      const data = {
        prodi_kalimat: 'Prodi ' + namaProdi(d0.prodi), PRODI: namaProdi(d0.prodi).toUpperCase(),
        jalur, JALUR: jalur.toUpperCase(),
        mhs: urut.map((d, i) => {
          const inst = daftarInstansi(d);
          return { no: i + 1, nama: d.nama, nim: d.nim, instansi: nomor(inst, (x) => x.nama), alamat: nomor(inst, (x) => x.alamat) };
        })
      };
      await renderDocx('usulan-pengembalian.docx', data, `${noUsulan} Usulan Pengembalian ${labelKelompok(kunciKelompok(d0))}.docx`);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
    }
  }

  async function aturUsulan(noUsulan, aksiUsulan, btn) {
    const tanya = aksiUsulan === 'selesai'
      ? `Tandai semua mahasiswa di ${noUsulan} SELESAI (surat pengembalian sudah terbit & diunggah ke Drive)?`
      : `Batalkan ${noUsulan}? Mahasiswanya kembali ke daftar "Belum diusulkan".`;
    if (!confirm(tanya)) return;
    btn.disabled = true;
    try {
      const res = await api({ aksi: 'aturUsulan', token: sesi.token, noUsulan, aksiUsulan });
      if (!res.ok) { alert(res.pesan || 'Gagal.'); return; }
      P.data.filter((d) => d.noUsulan === noUsulan).forEach((d) => Object.assign(d, {
        noUsulan: res.ubah['No. Usulan'] !== undefined ? res.ubah['No. Usulan'] : d.noUsulan,
        status: res.ubah['Status'], catatan: res.ubah['Catatan Admin'], diperbarui: res.ubah['Diperbarui']
      }));
      usulanKolektif();
    } catch (e) {
      alert(navigator.onLine ? 'Server tidak merespons. Coba lagi.' : 'Tidak ada koneksi internet.');
    } finally {
      if (document.body.contains(btn)) btn.disabled = false;
    }
  }

  async function renderDocx(templat, data, namaFile) {
    await muatSkrip('https://cdn.jsdelivr.net/npm/pizzip@3.2.0/dist/pizzip.min.js');
    await muatSkrip('https://cdn.jsdelivr.net/npm/docxtemplater@3.69.3/build/docxtemplater.js');
    const r = await fetch('templates/' + templat, { cache: 'no-cache' });
    if (!r.ok) throw new Error('Template ' + templat + ' tidak ditemukan.');
    const zip = new window.PizZip(await r.arrayBuffer());
    const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '[[', end: ']]' }, nullGetter: () => '' });
    doc.render(data);
    const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = namaFile.replace(/[\\/:*?"<>|]/g, '-');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  /* ===================== DRAF SURAT (.docx untuk Srikandi) ===================== */
  function isianAdmin(d) {
    const o = {};
    (d.adminField || []).forEach((f) => { const el = document.getElementById('adm-' + f.id); if (el) o[f.id] = el.value.trim(); });
    return o;
  }

  function muatSkrip(src) {
    return new Promise((ok, gagal) => {
      if (document.querySelector(`script[src="${src}"]`)) return ok();
      const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => gagal(new Error('Gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }

  function kalimatProdi(prodi) {
    const p = String(prodi || '').toLowerCase();
    if (p.includes('prof')) return 'Prodi Pendidikan Profesi Dietisien Program Pendidikan Profesi';
    if (p.includes('d3') || p.includes('diploma')) return 'Prodi Gizi Program Diploma Tiga';
    if (p.includes('d4') || p.includes('sarjana') || p.includes('dietetika')) return 'Prodi Gizi dan Dietetika Program Sarjana Terapan';
    return prodi || '';
  }
  function namaProdi(prodi) {
    const p = String(prodi || '').toLowerCase();
    if (p.includes('prof')) return 'Pendidikan Profesi Dietisien';
    if (p.includes('d3') || p.includes('diploma')) return 'Diploma Tiga Gizi';
    if (p.includes('d4') || p.includes('sarjana') || p.includes('dietetika')) return 'Sarjana Terapan Gizi dan Dietetika';
    return prodi || '';
  }
  function tglIndo(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : (iso || '');
  }

  function dataSurat(d, adm) {
    const i = d.isi || {};
    const umum = { nama: d.nama, nim: d.nim, prodi: namaProdi(d.prodi), prodi_kalimat: kalimatProdi(d.prodi) };
    if (d.kode === 'DATA') return Object.assign(umum, {
      tujuan: i.ditujukan, alamat_tujuan: i.alamat_tujuan,
      ttl: [i.tempat_lahir, tglIndo(i.tanggal_lahir)].filter(Boolean).join(', '),
      kelamin: i.kelamin, pekerjaan: i.kelamin === 'Perempuan' ? 'Mahasiswi' : 'Mahasiswa',
      alamat: i.alamat_mhs, judul: i.judul, data_diminta: i.data_diminta, lokasi: i.lokasi
    });
    if (d.kode === 'KMB') return Object.assign(umum, {
      instansi: i.instansi, tujuan_instansi: i.pimpinan_instansi, alamat_instansi: i.alamat_instansi,
      tujuan_bkd: i.bkd, alamat_bkd: i.alamat_bkd,
      no_yudisium: adm.no_yudisium, tgl_yudisium: tglIndo(adm.tgl_yudisium)
    });
    return Object.assign(umum, i);
  }

  async function unduhDraf(d, btn) {
    const adm = isianAdmin(d);
    const kurang = (d.adminField || []).find((f) => f.wajib && !adm[f.id]);
    if (kurang) return pesanForm(`${kurang.label} wajib diisi sebelum membuat draf surat.`, 'adm-' + kurang.id);
    const label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="putar kecil"></span> Menyiapkan surat…';
    try {
      await muatSkrip('https://cdn.jsdelivr.net/npm/pizzip@3.2.0/dist/pizzip.min.js');
      await muatSkrip('https://cdn.jsdelivr.net/npm/docxtemplater@3.69.3/build/docxtemplater.js');
      const r = await fetch('templates/' + d.surat, { cache: 'no-cache' });
      if (!r.ok) throw new Error('Template ' + d.surat + ' tidak ditemukan.');
      const zip = new window.PizZip(await r.arrayBuffer());
      const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: '[[', end: ']]' }, nullGetter: () => '' });
      doc.render(dataSurat(d, adm));
      const blob = doc.getZip().generate({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${d.no} ${d.jenis} - ${d.nama}.docx`.replace(/[\\/:*?"<>|]/g, '-');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);

      // Simpan isian admin + tandai Diproses (bila masih Diajukan)
      const status = d.status === 'Diajukan' ? 'Diproses' : d.status;
      const catatan = d.catatan || (d.status === 'Diajukan' ? 'Surat sedang diproses di Srikandi.' : '');
      const res = await api({ aksi: 'ubahStatus', token: sesi.token, no: d.no, status, catatan, admin: adm });
      if (res.ok) {
        Object.assign(d, { status: res.status, catatan: res.catatan, diperbarui: res.diperbarui, adminIsi: adm });
        document.getElementById('s-status').value = res.status;
        document.getElementById('s-catatan').value = res.catatan;
      }
    } catch (e) {
      pesanForm('Gagal membuat draf: ' + (e.message || e));
    } finally {
      btn.disabled = false; btn.innerHTML = label;
    }
  }

  /* ===================== UTILITAS ===================== */
  async function api(data) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const r = await fetch(CFG.API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(data),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }

  function pesanForm(t, fokusId) {
    const p = document.getElementById('pesan-form');
    p.textContent = t; p.hidden = false;
    if (fokusId) document.getElementById(fokusId).focus();
  }
  function tampilMuat() { $isi.innerHTML = '<section class="muat"><span class="putar"></span></section>'; }
  function tampilPesan(html) { $isi.innerHTML = `<p class="kartu pesan">${html}</p>`; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function inisial(n) { return String(n || '?').replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'; }
  function tglWaktu(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{2}):(\d{2}))?/);
    return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1].slice(0, 3)} ${m[1]}${m[4] ? `, ${m[4]}.${m[5]}` : ''}` : s;
  }
})();
