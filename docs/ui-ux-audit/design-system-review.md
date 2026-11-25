# Design System and Cross-Page Consistency Review

Tanggal: 24 Oktober 2026. Fokusnya memanfaatkan fondasi yang ada, bukan menambah design system besar di atas shadcn/ui.

## Kesimpulan

Proyek sudah memiliki sistem komponen yang nyata: primitive shadcn/Radix, token CSS, shell berbasis peran, PageContainer, DataTable, status domain, empty/loading feedback, dan komponen workflow. Kekurangan utamanya berada pada **kontrak perilaku**—validasi, perlindungan draft, persistensi konteks, state aksesibilitas, serta transisi task di mobile—bukan kurangnya variasi kartu atau ikon.

Tampilan operasional yang relatif padat merupakan pilihan yang masuk akal. Form, monitoring, dashboard, auth, dan aplikasi field mobile mempunyai kebutuhan berbeda. Penyelarasan sebaiknya memperbaiki pola yang sama tanpa menyeragamkan semua susunan halaman.

## Stack dan konvensi yang diperiksa

| Lapisan | Versi / implementasi pada audit | Implikasi |
| --- | --- | --- |
| Backend/runtime | PHP 8.5; Laravel 13.35.0 | Tidak ada rekomendasi perubahan backend dalam implementasi audit ini |
| Inertia | inertia-laravel 3.5.1; @inertiajs/react 3.9.1 | Form/useForm/useHttp dan router state dinilai berdasarkan versi terpasang |
| React | 19.3.0 | TSX dan komponen functional |
| Tailwind | 4.3.3 | Token CSS dan custom theme; tidak perlu migrasi versi untuk perbaikan ini |
| TanStack React Table | 9.3.1 | DataTable memakai API v9; jangan menyalin contoh v8 `useReactTable` ke proyek ini |
| Dialog | @radix-ui/react-dialog 1.3.0 | Focus management primitive sudah tersedia; consumer harus melengkapi label, error dan dirty state |
| shadcn configuration | new-york, TSX, CSS variables, neutral base, Lucide | Komponen disalin ke source proyek; bukan library dengan satu nomor versi universal |

`components.json`, package.json/installed metadata, source primitive, dan hasil application-info digunakan untuk pemeriksaan ini. Detail tambahan ada di verification. Tidak ada dependency yang dipasang atau diubah.

## Primitive dan composition

Tersedia 27 primitive di `resources/js/components/ui`: Alert, Avatar, Badge, Breadcrumb, Button, Card, Checkbox, Collapsible, Dialog, DropdownMenu, Icon, Input, Label, NavigationMenu, PlaceholderPattern, Select, Separator, Sheet, Sidebar, Skeleton, Sonner, Spinner, Table, Textarea, ToggleGroup, Toggle, Tooltip.

Hal-hal yang sudah sesuai:

- Button variants dan ukuran dipakai kembali; Link/asChild mengikuti composition Radix yang terpasang.
- Dialog/Sheet menggunakan primitive dengan title/description, close control, overlay, dan focus behavior. Pada Sheet detail shipment yang diuji, 12 Tab tetap berada di modal dan Escape mengembalikan fokus ke trigger setelah exit selesai.
- Input, Label, Select, Checkbox, Table dan feedback primitive lebih banyak digunakan daripada menggambar ulang tiap kontrol dengan div.
- Token `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--ring`, `--sidebar-*`, dan `--chart-*` menjadi fondasi tema.
- Lucide menjadi sistem ikon yang konsisten. Diagram custom SVG tidak otomatis memerlukan dependency chart baru.

Batasannya:

- Primitive yang aksesibel tidak otomatis membuat semua composition aksesibel. UI-03, UI-08, UI-09 dan UI-11 merupakan masalah di lapisan aplikasi.
- Panduan shadcn terbaru menyebut Field/InputGroup/Empty yang tidak ada di instalasi ini. Ketidakhadirannya **bukan defect** dan audit tidak merekomendasikan pemasangan hanya untuk mengikuti contoh baru.
- CSS variables dan dark variants sudah ada, tetapi rasio warna aktual tetap perlu diuji; UI-01 adalah bukti token yang perlu dikoreksi.
- Radix menyediakan modal behavior, tetapi tidak memutuskan apakah perubahan form boleh dibuang. Itu tanggung jawab CustomerDialog dan consumer lain.

## Matriks konsistensi lintas halaman

| Pola | Perbandingan source dan browser | Justifikasi / penilaian | Langkah yang disarankan |
| --- | --- | --- | --- |
| Shell dan sidebar | AppSidebarLayout dipakai semua halaman bisnis; auth/welcome berbeda | Konsisten. Role pickup lebih ringkas daripada admin secara sengaja | Pertahankan grouping role; tambahkan bypass content bila remediasi UI-10 disetujui |
| Breadcrumb | AppSidebarHeader memakai jneBreadcrumbs atau breadcrumbs halaman | Pemetaan JNE bersama sudah baik; detail resi/report/reconciliation tetap berada dalam workspace | Gunakan helper existing, jangan hardcode breadcrumb baru per page |
| Page header | Banyak halaman memakai h1 + deskripsi + actions; settings memakai Heading h2 dan heading tersembunyi di layout | Variasi sebagian berasal dari starter settings. Tidak ada bukti semua h2 merupakan kegagalan; hierarchy harus diperiksa per dokumen | Tetapkan kontrak title/description/actions/freshness menggunakan wrapper kecil hanya bila pengulangan terbukti |
| Width/spacing | PageContainer fluid/wide/form; monitoring memakai density lebih rapat; forms lebih sempit | Perbedaan workflow sah | Dokumentasikan pemilihan variant dalam komponen, hindari rewrite semua gap/margin |
| Cards | Card primitive, panel border manual, metric strips, charts | Umumnya koheren; tidak semua section harus menjadi kartu | Pertahankan nesting yang membantu scanning; perubahan shadow/radius murni preferensi bila tidak mengganggu tugas |
| Tables | Generic DataTable dan beberapa tabel grouped/sticky khusus monitoring | Reuse sudah kuat; custom table punya alasan domain | Tambahkan behavior yang hilang ke pemakai yang tepat, bukan membuat DataTable kedua |
| Search | Customer debounce local; JNE dan pickup monitoring memakai URL/filter; picker dialog punya pencarian sendiri | Konteks navigasi belum seragam, UI-05 | Samakan prinsip persistensi dan reset page; debounce live search berbeda secara wajar dari form Terapkan |
| Filter toolbar | Search/status/date/role berbeda sesuai screen; kadang panel lanjutan | Banyaknya filter tidak otomatis defect; tidak semua harus langsung terlihat | Standard label, clear/reset, applied-state, dan mobile wrap; jangan memaksakan filter domain ke satu schema besar |
| Forms | CustomerForm/useHttp; sebagian useForm/Form; custom lifecycle forms | Perbedaan API bukan defect. Error/fokus/draft behavior berbeda | Konvensi shared error association, required/optional, busy, success, discard |
| Status badge | StatusBadge pickup, ShipmentStatusBadge shipment, JneRunState proses report | Perbedaan makna sah: POP final bukan delivery final dan file selesai bukan import selesai | Bagikan token tone/icon conventions; pertahankan mapping domain terpisah |
| Actions | Primary/outline/ghost dan icon buttons berlabel banyak dipakai | Hierarchy cukup jelas, primary contrast perlu koreksi | Definisikan satu primary action per konteks kerja; jangan mengubah label bisnis tanpa staf |
| Dialog/Sheet | Form dialog, quick detail Sheet, run log modal, mobile sidebar | Pilihan overlay sesuai durasi/detail; focus trap diuji positif pada satu Sheet | Pertahankan Radix; tambah dirty/error conventions pada consumer |
| Feedback | Inline alerts/errors, skeletons, empty descriptions, Sonner dan mobile OperationalFeedback | Loading/error/retry customer bekerja pada simulasi; belum seluruh state diuji | Standar feedback berdasarkan aksi: loading, kosong, terfilter kosong, gagal, stale, belum pasti |
| Dates/numbers | Intl id-ID, business timezone labels, native date inputs, report source dates | Batas hari pickup 05.00–04.59 dan JNE kalender punya arti bisnis berbeda yang dijelaskan | Jangan mengganti date basis hanya demi keseragaman tampilan; samakan label timezone/freshness dan format output yang setara |
| Dark mode | Header toggle dan setting Light/Dark/System; token serta dark variants | Fitur aktif, tetapi kontras primary dan selected semantics perlu perbaikan | UI-01 dan UI-11 terlebih dahulu; cek raw status colors berdasarkan rasio nyata |
| Native mobile | Custom styles + shared primitives/tokens; field workflow dan bottom navigation | Berbeda dari admin desktop secara wajar; runtime belum diuji | Buat kontrak bersama untuk status/error/task naming; jangan memaksakan sidebar desktop ke perangkat field |

## DataTable: perlu reusable pattern baru?

**Tidak perlu DataTable baru.** `resources/js/components/data-table.tsx` sudah menyediakan column visibility, loading skeleton, empty/error row, pagination, page-size controls dan semantik table. Delapan pemakai produksi langsung terdapat di CustomerDataTable, HandoverSessionList, JneShipmentTable, OperationalRoleDashboard, PickupOperationalList, Discrepancies, Operations dan PickupSchedules. Satu file dapat memiliki lebih dari satu pemakaian.

Yang perlu disepakati pada pattern existing:

1. Siapa pemilik query/page/sort: URL untuk daftar yang perlu dibuka kembali, server tetap sumber total/pagination.
2. Reset page saat filter berubah; tidak menampilkan hasil lama seolah filter baru sudah selesai.
3. Atribut sort hanya pada kolom yang benar-benar sortable, label aksi row yang jelas, dan alternatif teks untuk status.
4. Empty seluruh dataset berbeda dari tidak ada hasil filter; keduanya mempunyai langkah berikutnya yang relevan.
5. Container scroll untuk tabel dua dimensi, tanpa memaksa seluruh halaman ikut melebar.

PickupMonitoring mempunyai header/grouping domain sendiri. UI-08 bisa diperbaiki di sana tanpa memindahkan semua tabel ke abstraction yang lebih besar. Jangan memasukkan seluruh logika pickup/JNE/customer ke konfigurasi tabel universal.

## Header dan filter: standar minimum yang cukup

Gunakan PageContainer yang sudah ada. Untuk header, cukup tetapkan title, deskripsi opsional, primary action, secondary actions, dan metadata freshness/timezone bila memang relevan. Heading helper dapat diberi kemampuan semantik sesuai kebutuhan ketika implementasi disetujui; tidak perlu membungkus setiap elemen UI dengan komponen baru.

Untuk filter, standar minimum adalah label yang jelas, state terapan, cara reset, hasil/pagination yang sesuai, state saat loading, dan wrapping pada layar kecil. Monitoring berfilter kompleks boleh memakai panel lanjutan; master customer sederhana tidak perlu panel yang sama.

## Konvensi form yang paling mendesak

- Label terhubung melalui id/htmlFor atau aria-labelledby, termasuk custom picker.
- Required dan optional sesuai aturan sebenarnya, dengan penjelasan singkat jika minimal satu dari beberapa field harus diisi.
- Error mempunyai ID dan relasi ke input; ringkasan atau fokus/scroll terarah setelah submit gagal.
- Busy mencegah submit ganda dan menjelaskan proses; dirty berbeda dari busy.
- Batal/Escape/close mempertahankan draft atau mengonfirmasi discard hanya saat ada perubahan.
- Sukses, gagal pasti, dan hasil yang belum pasti dibedakan; jangan menyarankan pengiriman ulang tanpa mempertimbangkan aksi yang mungkin sudah diterima.

CustomerForm adalah titik awal yang baik untuk menetapkan perilaku ini. InputError dan Alert yang sudah tersedia dapat digunakan; tidak perlu form library tambahan atau memigrasikan semua form ke primitive terbaru.

## Status, loading, empty, dan error

Pertahankan mapping status per domain. “Terkirim”, “Pickup berhasil”, “Terverifikasi”, “File siap”, dan “Siap dimonitor” bukan sinonim. Komponen bersama dapat menyamakan tone, ukuran, icon+label, dan cara menampilkan metadata tanpa menyatukan business state.

State minimum untuk daftar: initial loading, refetch, empty dataset, empty filtered result, request error dengan retry, dan stale/snapshot bila data bukan real-time. State minimum untuk mutation: busy, inline validation, error umum, conflict/hasil belum pasti jika relevan, dan sukses. Beberapa di antaranya sudah ada; audit tidak menyarankan mengganti semua dengan toast.

Customer retry berhasil setelah HTTP 500 yang diinjeksi di browser dihapus. Shipment filtered-empty memberi bukti empty state nyata pada query tanpa hasil. Tidak ada bukti visual untuk semua state server error di setiap modul, sehingga konsistensinya masih perlu gate regresi bertahap.

## Aksesibilitas: risiko dan hal yang sudah membantu

| Area | Temuan / bukti | Batas kesimpulan |
| --- | --- | --- |
| Contrast | UI-01 diukur pada kontrol enabled dan nav aktif | Bukan scan semua teks, grafik, ikon, hover dan focus |
| Labels/errors | UI-03 dan UI-09; banyak input lain sudah memakai Label/id | Tidak menyatakan semua form tanpa label atau semua alert tidak diumumkan |
| Keyboard/modal | Shipment Sheet trap/return pass; skip link belum tersedia; sorting dan theme state kurang | Belum uji NVDA/JAWS/VoiceOver; main landmark ada |
| Focus visibility | Primitive memakai focus-visible/ring; sampel keyboard dipotret | Belum mengukur kontras/occlusion semua focus indicator di semua overlay |
| Responsive | Normal-width samples pass; UI-04 mobile task flow, UI-07 text enlargement | Tidak ada klaim semua perangkat/semua data sudah lulus WCAG Reflow |
| Touch targets | Label checkbox operasional memperbesar hit area; link inline mempunyai pengecualian | WCAG 2.5.8 minimum 24×24 CSS px dengan pengecualian; 44/48 native adalah target ergonomi, bukan blanket AA web threshold |
| Charts | Legend, angka, SVG title dan data table alternatif pada aktivitas harian | Semantik SVG interaktif perlu screen-reader test; warna bukan satu-satunya bukti data |
| Reduced motion | UI-14 computed animation tetap aktif dengan reduce | Tidak mengklaim flashing atau gangguan vestibular yang telah diuji |
| Signature/physical input | Canvas pointer pada POP; kamera dan draft di native | Business accommodation dan essential path exception harus diperiksa; bukan pelanggaran keyboard otomatis |

## Duplikasi, Tailwind, dan maintainability

- Cabang customer legacy di operations.tsx adalah kandidat cleanup yang berbukti (UI-13). Selesaikan setelah perilaku yang benar mempunyai regresi.
- Pengulangan komposisi layout kecil belum tentu memerlukan abstraction. Prioritaskan pengulangan yang menimbulkan variasi behavior, misalnya close guard dan error association.
- `space-y-*`, gap/flex/grid, panel manual, dan raw domain colors hidup berdampingan. Ini bukan defect hanya karena panduan baru mempunyai preferensi berbeda. Nilai dampaknya lewat layout, tema, kontras, dan biaya perubahan.
- Custom mobile stylesheet besar mencerminkan platform terpisah. Audit tidak memaksakan dark mode native yang belum diklaim atau memigrasikannya menjadi halaman admin. Uji dan kurangi variasi yang benar-benar mengganggu task naming/status/error.
- Jangan mengganti TanStack v9, Radix, router, atau state fetching secara menyeluruh sebagai prasyarat perbaikan UI kecil.

## Saran subjektif yang dipisahkan dari defect

| ID | Klasifikasi / severity | Saran | Mengapa belum menjadi defect | Validasi dan effort |
| --- | --- | --- | --- | --- |
| S-01 | C / Low, opsional | Pertimbangkan urutan exception/backlog lebih awal pada dashboard untuk role yang memulai shift dari antrean masalah | Dashboard sudah punya tindak lanjut dan metrik; tidak ada bukti urutan sekarang menghambat keputusan staf | Uji tugas R-02 sebelum perubahan; 0,5–1 hari prototipe setelah kebutuhan jelas |
| S-02 | C / Low, opsional | Rapikan variasi spacing/header hanya saat komponen terkait sedang disentuh | Visual sudah relatif koheren; kepadatan berbeda dapat disengaja | Review lintas 5 screen per perubahan; 0,5–1 hari untuk wrapper kecil bila diperlukan |
| S-03 | C / Low, opsional | Pertimbangkan menyimpan preferensi kolom per pengguna/workspace jika operator berulang kali mengaturnya | Belum ada telemetry atau observasi pengulangan reset kolom | Tanyakan pada operator; jangan membuat preference service baru sebelum kebutuhan terbukti |

Tidak ada usulan menambah diagram hanya agar menyerupai referensi visual. Tambahkan visual hanya jika mendukung keputusan operasional dan data/definisinya tersedia. Semua saran ini menunggu persetujuan, seperti roadmap utama.
