# Prompt AI untuk membuat deck dari materi

Prompt ini juga tersedia langsung di aplikasi: **Tambah → ✨ Buat dengan AI → Salin prompt**
(di sana topik, tingkat, jumlah, dan jenis kartu bisa diatur tanpa mengedit teks).

## Cara mencicil materi

1. Buat satu deck per mata kuliah/bab besar, mis. "Biokimia – Nukleotida".
2. Ambil **1–3 halaman** materi per prompt (satu subbab). Potongan kecil = kartu lebih teliti.
3. Salin prompt di bawah ke ChatGPT, Gemini, atau Claude. Ganti bagian dalam kurung siku,
   lalu tempel materi di bagian MATERI (atau lampirkan PDF/foto).
4. Salin **seluruh** jawaban AI → buka IngatTerus → **Tambah** → tempel di kotak *Teks kartu*.
   Isi blok kode diambil otomatis; cek pratinjau, pilih deck yang sama, lalu **Impor**.
5. Ulangi untuk subbab berikutnya. Kartu yang pertanyaannya sudah ada akan dilewati.
6. Baca cepat kartu baru sebelum belajar. Hapus atau edit kartu yang keliru — AI bisa salah.

Tips: lebih baik 20 kartu yang benar-benar dipahami daripada 100 kartu hafalan panjang.
Kartu yang terus-terusan lupa (ditandai **sering lupa**) biasanya terlalu panjang: pecah jadi 2–3 kartu.

## 1. Prompt utama (kartu pemahaman)

````text
Kamu adalah pembuat flashcard ahli untuk aplikasi spaced repetition (IngatTerus).
Ubah MATERI di bawah menjadi sekitar 30 flashcard tentang "[TOPIK]" untuk tingkat [TINGKAT, mis. kuliah kedokteran].

PRINSIP ISI (agar mudah diingat jangka panjang):
1. Satu kartu = satu fakta atau konsep (atomik). Jawaban sesingkat mungkin: idealnya ≤ 15 kata, maksimal 3 baris.
2. Pertanyaan harus spesifik, bisa dipahami tanpa melihat kartu lain, dan hanya punya satu jawaban benar. Tambahkan konteks bila perlu (mis. "Pada jalur X, …").
3. Daftar lebih dari 3 butir jangan dijadikan satu kartu: pecah per butir atau per kelompok kecil.
4. Campurkan kartu fakta ("apa"), pemahaman ("mengapa", "bagaimana"), dan penerapan (contoh kasus singkat).
5. Untuk istilah kunci, buat dua arah: istilah → arti dan arti → istilah.
6. Buat kartu pembanding untuk hal yang mudah tertukar ("Apa beda X dan Y?").
7. Gunakan bahasa Indonesia yang ringkas; pertahankan istilah teknis/asing aslinya.
8. HANYA gunakan informasi dari materi. Jangan menebak atau menambah fakta. Bila ada bagian yang ambigu atau tampak keliru, jangan dibuat kartunya — tulis di CATATAN.
9. Urutkan dari konsep dasar ke lanjutan.

FORMAT WAJIB (agar bisa langsung diimpor):
- Satu kartu per baris: pertanyaan;jawaban
- Tanda titik koma (;) hanya dipakai SATU kali per baris sebagai pemisah. Di dalam teks pakai koma, jangan titik koma.
- Baris baru di dalam jawaban ditulis \n (garis miring terbalik + huruf n), bukan Enter.
- Tebalkan kata kunci dengan **dua bintang**, miring dengan *satu bintang*.
- Pangkat ditulis x^2^ atau x², indeks H~2~O atau H₂O.
- Tanpa nomor urut, tanpa judul, tanpa baris kosong, tanpa tabel.
- Tulis SEMUA kartu di dalam SATU blok kode (```). Setelah blok kode, tulis CATATAN singkat: bagian materi yang dilewati atau perlu dicek.

CONTOH FORMAT:
Apa fungsi utama mitokondria?;Menghasilkan **ATP** lewat respirasi sel
Mengapa sel otot punya banyak mitokondria?;Kontraksi otot butuh **ATP** dalam jumlah besar
Apa beda gula pada DNA dan RNA?;**DNA**: deoksiribosa\n**RNA**: ribosa

MATERI:
"""
[TEMPEL MATERI DI SINI]
"""
````

## 2. Prompt kartu jawaban singkat (untuk kuis & ujian)

````text
Kamu adalah pembuat flashcard ahli untuk aplikasi spaced repetition (IngatTerus).
Ubah MATERI di bawah menjadi sekitar 30 flashcard tentang "[TOPIK]" untuk tingkat [TINGKAT].

PRINSIP ISI (agar mudah diingat jangka panjang):
1. Satu kartu = satu fakta atau konsep (atomik). Jawaban sesingkat mungkin: idealnya ≤ 15 kata, maksimal 3 baris.
2. Pertanyaan harus spesifik, bisa dipahami tanpa melihat kartu lain, dan hanya punya satu jawaban benar. Tambahkan konteks bila perlu (mis. "Pada jalur X, …").
3. Daftar lebih dari 3 butir jangan dijadikan satu kartu: pecah per butir atau per kelompok kecil.
4. Jawaban harus SANGAT singkat: 1–5 kata (nama, angka, istilah, atau rumus), tanpa penjelasan.
5. Pertanyaan dibuat cukup spesifik sehingga jawaban singkat itu tidak ambigu.
6. Hindari jawaban "ya/tidak" dan jawaban yang mirip satu sama lain.
7. Buat kartu pembanding untuk hal yang mudah tertukar ("Apa beda X dan Y?").
8. Gunakan bahasa Indonesia yang ringkas; pertahankan istilah teknis/asing aslinya.
9. HANYA gunakan informasi dari materi. Jangan menebak atau menambah fakta. Bila ada bagian yang ambigu atau tampak keliru, jangan dibuat kartunya — tulis di CATATAN.
10. Urutkan dari konsep dasar ke lanjutan.

FORMAT WAJIB (agar bisa langsung diimpor):
- Satu kartu per baris: pertanyaan;jawaban
- Tanda titik koma (;) hanya dipakai SATU kali per baris sebagai pemisah. Di dalam teks pakai koma, jangan titik koma.
- Baris baru di dalam jawaban ditulis \n (garis miring terbalik + huruf n), bukan Enter.
- Tebalkan kata kunci dengan **dua bintang**, miring dengan *satu bintang*.
- Pangkat ditulis x^2^ atau x², indeks H~2~O atau H₂O.
- Tanpa nomor urut, tanpa judul, tanpa baris kosong, tanpa tabel.
- Tulis SEMUA kartu di dalam SATU blok kode (```). Setelah blok kode, tulis CATATAN singkat: bagian materi yang dilewati atau perlu dicek.

CONTOH FORMAT:
Apa fungsi utama mitokondria?;Menghasilkan **ATP** lewat respirasi sel
Mengapa sel otot punya banyak mitokondria?;Kontraksi otot butuh **ATP** dalam jumlah besar
Apa beda gula pada DNA dan RNA?;**DNA**: deoksiribosa\n**RNA**: ribosa

MATERI:
"""
[TEMPEL MATERI DI SINI]
"""
````

## 3. Prompt cek ulang (opsional, sebelum diimpor)

````text
Periksa flashcard berikut (format: pertanyaan;jawaban, satu kartu per baris).

Untuk setiap kartu:
1. Pastikan faktanya benar. Bila salah atau meragukan, perbaiki dan sebutkan di CATATAN.
2. Pecah kartu yang berisi lebih dari satu fakta atau daftar lebih dari 3 butir.
3. Pertajam pertanyaan yang ambigu atau punya lebih dari satu jawaban benar.
4. Persingkat jawaban yang terlalu panjang (idealnya ≤ 15 kata).
5. Hapus kartu duplikat.

Pertahankan format persis: satu kartu per baris, titik koma (;) hanya sekali sebagai pemisah, \n untuk baris baru, **tebal** untuk kata kunci. Tulis hasil akhir dalam SATU blok kode, lalu CATATAN perubahan di luar blok.

KARTU:
"""
[TEMPEL KARTU DI SINI]
"""
````
