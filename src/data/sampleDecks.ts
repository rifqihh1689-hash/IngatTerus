/** Tiga deck contoh bawaan. Format teks: **tebal**, *miring*, ^pangkat^, ~indeks~. */
import { db as defaultDb, setSetting, type IngatDB } from '../db/db'
import { addCards, createDeck } from '../db/repo'

export interface SampleDeck {
  key: string
  name: string
  description: string
  color: string
  cards: [front: string, back: string][]
}

export const SAMPLE_DECKS: SampleDeck[] = [
  {
    key: 'kosakata-inggris',
    name: 'Kosakata Bahasa Inggris',
    description: 'Kosakata sehari-hari & akademik tingkat menengah, lengkap dengan contoh kalimat.',
    color: 'sky',
    cards: [
      ['abundant', '**melimpah, berlimpah**\n*The region has abundant natural resources.*'],
      ['reluctant', '**enggan, segan**\n*She was reluctant to leave the party early.*'],
      ['achieve', '**mencapai, meraih**\n*Hard work helps you achieve your goals.*'],
      ['accurate', '**akurat, tepat**\n*Make sure the data is accurate.*'],
      ['afford', '**mampu (membeli/membayar)**\n*I can’t afford a new laptop right now.*'],
      ['benefit', '**manfaat, keuntungan**\n*Regular exercise has many benefits.*'],
      ['borrow', '**meminjam (dari orang lain)**\n*Can I borrow your pen?*'],
      ['lend', '**meminjamkan (kepada orang lain)**\n*Could you lend me some money?*'],
      ['consider', '**mempertimbangkan**\n*Please consider my proposal.*'],
      ['curious', '**penasaran, ingin tahu**\n*Children are naturally curious.*'],
      ['delighted', '**sangat senang**\n*We are delighted to hear the news.*'],
      ['determine', '**menentukan**\n*The test will determine your level.*'],
      ['encourage', '**mendorong, menyemangati**\n*Teachers should encourage students to ask questions.*'],
      ['essential', '**penting, mendasar**\n*Water is essential for life.*'],
      ['familiar', '**akrab, tidak asing**\n*This song sounds familiar.*'],
      ['frequently', '**sering**\n*He frequently travels for work.*'],
      ['generous', '**murah hati, dermawan**\n*Thank you for your generous donation.*'],
      ['honest', '**jujur**\n*To be honest, I forgot.*'],
      ['improve', '**meningkatkan, memperbaiki**\n*Reading improves your vocabulary.*'],
      ['journey', '**perjalanan**\n*Life is a long journey.*'],
      ['knowledge', '**pengetahuan**\n*Knowledge is power.*'],
      ['maintain', '**memelihara, mempertahankan**\n*It is hard to maintain an old house.*'],
      ['neighbor', '**tetangga**\n*Our neighbor has a friendly cat.*'],
      ['obvious', '**jelas, nyata**\n*The answer seems obvious.*'],
      ['purpose', '**tujuan, maksud**\n*What is the purpose of your visit?*'],
      ['require', '**membutuhkan, memerlukan**\n*This job requires patience.*'],
      ['schedule', '**jadwal**\n*Let me check my schedule.*'],
      ['thorough', '**teliti, menyeluruh**\n*The doctor gave him a thorough check-up.*'],
      ['urgent', '**mendesak**\n*I have an urgent message for you.*'],
      ['various', '**berbagai, beragam**\n*The shop sells various kinds of fruit.*'],
      ['wisdom', '**kebijaksanaan**\n*Wisdom comes with experience.*'],
    ],
  },
  {
    key: 'twk-dasar',
    name: 'Pengetahuan Umum & TWK Dasar',
    description: 'Pancasila, UUD 1945, sejarah kebangsaan, dan wawasan nusantara — bekal dasar TWK.',
    color: 'rose',
    cards: [
      ['Kapan dan di mana teks Proklamasi Kemerdekaan dibacakan?', '**17 Agustus 1945**, di Jalan Pegangsaan Timur No. 56, Jakarta.'],
      ['Siapa yang membacakan teks Proklamasi?', '**Ir. Soekarno**, didampingi **Drs. Mohammad Hatta**.'],
      ['Bunyi dan lambang sila ke-1 Pancasila?', '**Ketuhanan Yang Maha Esa**\nLambang: *bintang*.'],
      ['Bunyi dan lambang sila ke-2 Pancasila?', '**Kemanusiaan yang adil dan beradab**\nLambang: *rantai*.'],
      ['Bunyi dan lambang sila ke-3 Pancasila?', '**Persatuan Indonesia**\nLambang: *pohon beringin*.'],
      ['Bunyi dan lambang sila ke-4 Pancasila?', '**Kerakyatan yang dipimpin oleh hikmat kebijaksanaan dalam permusyawaratan/perwakilan**\nLambang: *kepala banteng*.'],
      ['Bunyi dan lambang sila ke-5 Pancasila?', '**Keadilan sosial bagi seluruh rakyat Indonesia**\nLambang: *padi dan kapas*.'],
      ['Tanggal berapa diperingati sebagai Hari Lahir Pancasila?', '**1 Juni** — pidato Ir. Soekarno di sidang BPUPKI, 1 Juni 1945.'],
      ['Kapan UUD 1945 disahkan dan oleh lembaga apa?', '**18 Agustus 1945** oleh **PPKI**.'],
      ['Siapa ketua BPUPKI?', '**dr. K.R.T. Radjiman Wedyodiningrat**'],
      ['Siapa ketua dan wakil ketua PPKI?', 'Ketua **Ir. Soekarno**, wakil ketua **Drs. Mohammad Hatta**.'],
      ['Kapan Sumpah Pemuda diikrarkan?', '**28 Oktober 1928**, pada Kongres Pemuda II.'],
      ['Semboyan "Bhinneka Tunggal Ika" berasal dari kitab apa?', 'Kitab **Sutasoma** karya **Mpu Tantular**.\nArtinya: *berbeda-beda tetapi tetap satu*.'],
      ['Berapa kali UUD 1945 diamandemen?', '**4 kali**: 1999, 2000, 2001, dan 2002.'],
      ['Bunyi Pasal 1 ayat (2) UUD 1945?', '*Kedaulatan berada di tangan rakyat dan dilaksanakan menurut Undang-Undang Dasar.*'],
      ['Bunyi Pasal 1 ayat (3) UUD 1945?', '*Negara Indonesia adalah negara hukum.*'],
      ['Pasal UUD 1945 tentang bendera, bahasa, lambang, dan lagu kebangsaan?', '**Pasal 35**: bendera Sang Merah Putih\n**Pasal 36**: bahasa Indonesia\n**Pasal 36A**: lambang Garuda Pancasila\n**Pasal 36B**: lagu Indonesia Raya'],
      ['Lembaga apa yang berwenang mengubah dan menetapkan UUD?', '**MPR** — Pasal 3 ayat (1) UUD 1945.'],
      ['Lembaga apa yang menguji undang-undang terhadap UUD?', '**Mahkamah Konstitusi** — Pasal 24C UUD 1945.'],
      ['Siapa pencipta lagu "Indonesia Raya"?', '**Wage Rudolf Supratman** (W.R. Supratman).'],
      ['Jumlah bulu pada lambang Garuda Pancasila dan maknanya?', 'Sayap **17** (tiap sisi), ekor **8**, pangkal ekor **19**, leher **45**\n→ melambangkan **17-8-1945**.'],
      ['Organisasi pergerakan nasional modern pertama dan tanggal berdirinya?', '**Budi Utomo**, 20 Mei 1908 — diperingati sebagai *Hari Kebangkitan Nasional*.'],
      ['Mengapa 10 November diperingati sebagai Hari Pahlawan?', 'Mengenang **Pertempuran Surabaya**, 10 November 1945.'],
      ['Apa isi Dekret Presiden 5 Juli 1959?', '1. Pembubaran **Konstituante**\n2. Berlakunya kembali **UUD 1945**\n3. Pembentukan **MPRS** dan **DPAS**'],
      ['Kapan Belanda mengakui kedaulatan Indonesia (hasil KMB)?', '**27 Desember 1949**, setelah Konferensi Meja Bundar di Den Haag.'],
      ['Di mana Pancasila sebagai dasar negara tercantum?', 'Pembukaan UUD 1945 **alinea ke-4**.'],
      ['Apa yang dimaksud Wawasan Nusantara?', 'Cara pandang bangsa Indonesia tentang diri dan lingkungannya yang **beragam dan bernilai strategis**, dengan mengutamakan **persatuan dan kesatuan** wilayah serta bangsa.'],
      ['Danau terbesar di Indonesia?', '**Danau Toba**, Sumatra Utara.'],
      ['Puncak tertinggi di Indonesia?', '**Puncak Jaya** (Carstensz Pyramid), Papua — ±4.884 mdpl.'],
    ],
  },
  {
    key: 'rumus-matematika',
    name: 'Rumus Matematika Dasar',
    description: 'Rumus bangun datar, bangun ruang, aljabar, statistika, dan barisan yang sering keluar di ujian.',
    color: 'emerald',
    cards: [
      ['Luas dan keliling **persegi** (sisi s)?', 'L = s²\nK = 4s'],
      ['Luas dan keliling **persegi panjang**?', 'L = p × l\nK = 2(p + l)'],
      ['Luas **segitiga**?', 'L = ½ × a × t'],
      ['Luas dan keliling **lingkaran**?', 'L = π r²\nK = 2πr = πd\n*(π ≈ 3,14 atau 22/7)*'],
      ['Teorema **Pythagoras**?', 'c² = a² + b²\n*c = sisi miring (hipotenusa)*'],
      ['Luas **trapesium**?', 'L = ½ × (a + b) × t\n*a, b = sisi sejajar*'],
      ['Luas **jajar genjang**?', 'L = a × t'],
      ['Luas **belah ketupat** / **layang-layang**?', 'L = ½ × d~1~ × d~2~\n*d = diagonal*'],
      ['Volume **kubus** dan luas permukaannya?', 'V = s³\nLp = 6s²'],
      ['Volume **balok**?', 'V = p × l × t'],
      ['Volume **tabung**?', 'V = π r² t'],
      ['Volume **kerucut**?', 'V = ⅓ π r² t'],
      ['Volume dan luas permukaan **bola**?', 'V = ⁴⁄₃ π r³\nLp = 4πr²'],
      ['Rumus **ABC** persamaan kuadrat ax² + bx + c = 0?', 'x = (−b ± √(b² − 4ac)) / 2a'],
      ['**Diskriminan** persamaan kuadrat dan artinya?', 'D = b² − 4ac\nD > 0: dua akar real berbeda\nD = 0: akar kembar\nD < 0: akar tidak real'],
      ['(a + b)² = ?', 'a² + 2ab + b²'],
      ['(a − b)² = ?', 'a² − 2ab + b²'],
      ['a² − b² = ?', '(a + b)(a − b)'],
      ['Sifat perpangkatan a^m^ × a^n^, a^m^ : a^n^, dan (a^m^)^n^?', 'a^m+n^, a^m−n^, dan a^m·n^'],
      ['**Gradien** garis melalui (x~1~, y~1~) dan (x~2~, y~2~)?', 'm = (y~2~ − y~1~) / (x~2~ − x~1~)'],
      ['Persamaan garis melalui (x~1~, y~1~) dengan gradien m?', 'y − y~1~ = m(x − x~1~)'],
      ['**Rata-rata** (mean)?', 'x̄ = jumlah seluruh data / banyak data'],
      ['**Peluang** kejadian A?', 'P(A) = n(A) / n(S)\n*n(S) = banyak ruang sampel*'],
      ['Suku ke-n **barisan aritmetika**?', 'U~n~ = a + (n − 1)b'],
      ['Jumlah n suku pertama **deret aritmetika**?', 'S~n~ = ½n (2a + (n − 1)b) = ½n (a + U~n~)'],
      ['Suku ke-n **barisan geometri**?', 'U~n~ = a · r^n−1^'],
      ['Hubungan **jarak, kecepatan, waktu**?', 's = v × t\nv = s / t\nt = s / v'],
      ['Jumlah **sudut dalam** segi-n?', '(n − 2) × 180°'],
      ['**Bunga tunggal**?', 'B = M × p × n\n*M = modal, p = suku bunga per periode, n = banyak periode*'],
      ['**Persentase** sebuah bagian?', '(bagian / keseluruhan) × 100%'],
    ],
  },
]

/** Tambahkan deck contoh. `onlyMissing` melewati deck contoh yang sudah ada. */
export async function seedSampleDecks(database: IngatDB = defaultDb, onlyMissing = true): Promise<number> {
  const existing = new Set((await database.decks.toArray()).map((d) => d.sample).filter(Boolean))
  let added = 0
  for (const sample of SAMPLE_DECKS) {
    if (onlyMissing && existing.has(sample.key)) continue
    const deckId = await createDeck(
      { name: sample.name, description: sample.description, color: sample.color, sample: sample.key },
      database,
    )
    await addCards(
      deckId,
      sample.cards.map(([front, back]) => ({ front, back })),
      database,
    )
    added++
  }
  await setSetting('seeded', true, database)
  return added
}
