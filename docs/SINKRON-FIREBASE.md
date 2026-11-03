# Memasang sinkron antar perangkat (Firebase)

Dengan sinkron, laptop dan HP memakai **deck, kartu, riwayat belajar, dan jadwal ulang yang sama**.
Cukup masuk dengan akun Google yang sama di setiap perangkat. Aplikasi tetap bisa dipakai offline;
perubahan dikirim otomatis begitu online.

Pemasangan ini dilakukan **sekali saja** oleh pemilik aplikasi (±10–15 menit, gratis, tanpa kartu kredit).

## Langkah 1 — Buat proyek Firebase

1. Buka <https://console.firebase.google.com> dan masuk dengan akun Google-mu.
2. Klik **Buat proyek** (*Create a project*).
3. Nama proyek: `ingatterus` → **Lanjutkan**.
4. Google Analytics boleh **dimatikan** → **Buat proyek** → tunggu selesai → **Lanjutkan**.

## Langkah 2 — Daftarkan aplikasi web & salin konfigurasi

1. Di halaman ringkasan proyek, klik ikon **`</>`** (Web).
2. Nama aplikasi: `IngatTerus`. **Jangan** centang Firebase Hosting → **Daftarkan aplikasi**.
3. Akan muncul kode seperti ini — **salin bagian `firebaseConfig`**:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "ingatterus-xxxx.firebaseapp.com",
     projectId: "ingatterus-xxxx",
     storageBucket: "ingatterus-xxxx.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef"
   };
   ```

   Nilai-nilai ini **bukan rahasia** (memang dipasang di aplikasi web); keamanan data dijaga oleh
   aturan Firestore di langkah 5.
4. Klik **Lanjutkan ke konsol**.

## Langkah 3 — Aktifkan login Google

1. Menu kiri: **Build → Authentication** → **Mulai** (*Get started*).
2. Tab **Sign-in method** → pilih **Google** → nyalakan **Enable**.
3. Pilih **email dukungan proyek** (email-mu) → **Simpan**.

## Langkah 4 — Izinkan alamat aplikasi

1. Masih di **Authentication**, buka tab **Settings** → **Authorized domains**.
2. Klik **Add domain** → isi `rifqihh1689-hash.github.io` → **Add**.

(`localhost` sudah otomatis diizinkan untuk pengembangan.)

## Langkah 5 — Buat database Firestore & pasang aturan keamanan

1. Menu kiri: **Build → Firestore Database** → **Buat database** (*Create database*).
2. Bila ditanya edisi, pilih **Standard**. Lokasi: **`asia-southeast2 (Jakarta)`** (tidak bisa diubah nanti).
3. Pilih **Mulai dalam mode produksi** (*Start in production mode*) → **Buat**.
4. Buka tab **Rules**, hapus semua isinya, lalu tempel aturan berikut → **Publish**:

   ```text
   rules_version = '2';

   // Aturan keamanan Firestore untuk sinkron IngatTerus.
   // Setiap pengguna hanya bisa membaca & menulis datanya sendiri di users/{uid}/records.
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId}/records/{recordId} {
         allow read: if request.auth != null && request.auth.uid == userId;
         allow create, update: if request.auth != null
           && request.auth.uid == userId
           && request.resource.data.keys().hasOnly(['t', 'i', 'd', 'del', 's'])
           && request.resource.data.t in ['decks', 'cards', 'reviewLogs', 'quizResults', 'settings']
           && recordId == request.resource.data.t + ':' + request.resource.data.i
           && request.resource.data.s == request.time;
       }
     }
   }
   ```

   (Isi yang sama ada di berkas [`firestore.rules`](../firestore.rules).)

## Langkah 6 — Pasang konfigurasi di aplikasi

Tempel nilai `firebaseConfig` dari langkah 2 ke [`src/sync/config.ts`](../src/sync/config.ts), pada
`FIREBASE_WEB_CONFIG`:

```ts
const FIREBASE_WEB_CONFIG: FirebaseWebConfig | null = {
  apiKey: 'AIza...',
  authDomain: 'ingatterus-xxxx.firebaseapp.com',
  projectId: 'ingatterus-xxxx',
  storageBucket: 'ingatterus-xxxx.firebasestorage.app',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abcdef',
}
```

Commit ke `main` → GitHub Actions men-deploy otomatis. (Atau kirim konfigurasinya ke pengembang
untuk dipasangkan.)

## Cara memakai

1. **Laptop** (perangkat yang sudah berisi materi): buka IngatTerus → **Pengaturan → Sinkron antar
   perangkat → Masuk dengan Google**. Semua data perangkat ini diunggah ke akunmu.
2. **HP**: buka IngatTerus → **Pengaturan → Masuk dengan Google** dengan **akun yang sama**.
   Data dari laptop otomatis diunduh.
3. Selesai. Belajar di mana saja; perangkat lain ikut terbarui saat aplikasinya dibuka, saat kembali
   online, dan setiap ±2 menit selama aplikasi terbuka. Ikon awan di kanan atas menunjukkan status.

Bila HP juga sudah punya data sendiri, aplikasi akan bertanya: **Gabungkan keduanya** (disarankan)
atau **Pakai data cloud saja**.

### Cara penggabungan bekerja

- **Riwayat ulasan & hasil kuis** dari semua perangkat digabung — tidak ada yang hilang.
- **Jadwal ulang** dihitung dari riwayat gabungan dengan FSRS, sehingga hasilnya sama persis di semua
  perangkat, bahkan bila kartu yang sama sempat diulang di laptop dan HP saat offline.
- **Isi kartu, deck, dan pengaturan belajar**: suntingan terbaru yang menang.
- **Penghapusan** ikut terhapus di perangkat lain. (Hati-hati: *Hapus semua data* juga menghapus di
  semua perangkat yang tersinkron.)
- Pengaturan khusus perangkat (jam pengingat, tema) tidak ikut disinkron.

### Catatan

- **iPhone/iPad**: aplikasi yang ditambahkan ke Layar Utama punya penyimpanan terpisah dari Safari —
  masuk dengan Google dari dalam aplikasi Layar Utama itu.
- **Kuota gratis** Firebase (paket Spark): 50.000 baca & 20.000 tulis per hari, 1 GiB data — jauh di
  atas kebutuhan belajar pribadi (±2 tulis per kartu yang diulang).
- Pesan *"Domain aplikasi belum diizinkan"* → periksa langkah 4. *"Akses ditolak"* → periksa aturan di
  langkah 5. *"Login Google belum diaktifkan"* → periksa langkah 3.
- Keluar dari akun hanya menghentikan sinkron di perangkat itu; datanya tetap ada.
