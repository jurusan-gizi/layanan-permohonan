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
    const lingkup = P.staf.lingkup.includes('semua') ? 'Semua prodi' : 'Prodi ' + P.staf.lingkup.map((x) => x.toUpperCase()).join(', ');
    $isi.innerHTML = `
      <section class="kartu profil">
        <div class="avatar" aria-hidden="true">${esc(inisial(P.staf.nama))}</div>
        <div class="profil-teks">
          <p class="salam">Pemantauan permohonan · ${esc(lingkup)}</p>
          <p class="nama">${esc(P.staf.nama || '-')}</p>
        </div>
      </section>

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
        <p id="pesan-form" class="pesan" role="alert" hidden></p>
        <button type="submit" class="btn utama" id="btn-simpan">Simpan status</button>
        ${d.hp ? `<a class="btn sekunder" href="https://wa.me/${encodeURIComponent(d.hp)}?text=${encodeURIComponent(sapa)}" target="_blank" rel="noopener">💬 Hubungi mahasiswa via WA</a>` : ''}
        <a class="btn sekunder" href="https://wa.me/${encodeURIComponent(d.waDirektorat)}?text=${encodeURIComponent(d.pesanDirektorat)}" target="_blank" rel="noopener">📤 Teruskan ke admin Direktorat</a>
        <button type="button" class="btn sekunder" id="btn-kembali">← Kembali ke daftar</button>
      </form>`;
    document.getElementById('btn-kembali').onclick = daftarPantau;
    document.getElementById('form-status').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-simpan');
      btn.disabled = true; btn.innerHTML = '<span class="putar kecil"></span> Menyimpan…';
      try {
        const res = await api({ aksi: 'ubahStatus', token: sesi.token, no: d.no,
          status: document.getElementById('s-status').value, catatan: document.getElementById('s-catatan').value });
        if (!res.ok) {
          if (res.kode === 'AUTH') { SSO.keluar(false); return tampilMasuk('Sesi berakhir, silakan masuk lagi.'); }
          return pesanForm(res.pesan || 'Gagal menyimpan.');
        }
        Object.assign(d, { status: res.status, catatan: res.catatan, diperbarui: res.diperbarui });
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
        ${l.field.map(htmlField).join('')}
        <p id="pesan-form" class="pesan" role="alert" hidden></p>
        <button type="submit" class="btn utama" id="btn-kirim">Simpan permohonan</button>
        <button type="button" class="btn sekunder" id="btn-batal">Batal</button>
      </form>`;
    document.getElementById('btn-batal').onclick = beranda;
    document.getElementById('form-ajuan').addEventListener('submit', (e) => { e.preventDefault(); kirim(l); });
    $isi.querySelectorAll('input[data-rupiah]').forEach((el) => el.addEventListener('input', () => {
      const angka = el.value.replace(/\D/g, '');
      el.value = angka ? Number(angka).toLocaleString('id-ID') : '';
    }));
    scrollTo(0, 0);
  }

  function htmlField(f) {
    const id = 'f-' + f.id;
    const label = `<label for="${id}">${esc(f.label)}${f.wajib ? '<span class="wajib">*</span>' : ''}</label>`;
    const ph = f.contoh ? ` placeholder="${esc(f.contoh)}"` : '';
    let input;
    switch (f.tipe) {
      case 'pilih':
        input = `<select id="${id}"><option value="">— Pilih —</option>${f.opsi.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`; break;
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
    const link = `https://wa.me/${encodeURIComponent(res.wa)}?text=${encodeURIComponent(res.pesan)}`;
    $isi.innerHTML = `
      <section class="kartu sukses">
        <div class="centang" aria-hidden="true">✓</div>
        <h2>Permohonan tersimpan</h2>
        <p class="bantu" style="margin-top:0">${esc(l.nama)}</p>
        <div class="no-reg">${esc(res.no)}</div>
        <p class="bantu" style="margin-top:6px">Simpan nomor registrasi ini untuk menanyakan perkembangan surat.</p>

        <div class="langkah">
          <strong>Langkah terakhir:</strong> tekan tombol hijau di bawah. WhatsApp akan terbuka dengan pesan yang
          sudah terisi, lalu tekan <strong>Kirim</strong> agar admin akademik menerima pemberitahuan.
        </div>
        <a class="btn wa" href="${link}" target="_blank" rel="noopener">Kirim ke WA Admin Akademik</a>

        <details><summary>Lihat isi pesan</summary><div class="pratinjau">${esc(res.pesan)}</div></details>
        <button type="button" class="btn sekunder" id="btn-selesai">Kembali ke daftar permohonan</button>
      </section>`;
    document.getElementById('btn-selesai').onclick = muat;
    scrollTo(0, 0);
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
