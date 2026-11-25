# Findings — Retail Operations Platform

Tanggal: 24 Oktober 2026. Semua lokasi mengacu pada working copy saat audit, bukan semata-mata commit terakhir. Tidak ada kode aplikasi yang diperbaiki.

## Cara membaca

**A** = Verified defect; **B** = Strong UX concern; **C** = Subjective suggestion; **D** = Requires user testing. Perilaku yang terbukti tidak selalu berarti telah dibuktikan sebagai pelanggaran WCAG. Relevansi standar dan batas pembuktiannya disebutkan terpisah.

Severity mempertimbangkan hambatan tugas, frekuensi penggunaan, jangkauan, dan pemulihan. **High** mengganggu tugas utama, aksesibilitas kontrol utama, atau menyebabkan kehilangan pekerjaan. **Medium** mengurangi pemahaman, konteks, aksesibilitas, atau keandalan pengembangan. **Low** adalah peningkatan terbatas dengan jalur kerja tetap tersedia. Tidak ada Critical yang terkonfirmasi dalam cakupan audit.

Effort adalah perkiraan hari kerja satu engineer yang mengenal proyek, termasuk verifikasi terarah, bukan komitmen jadwal. Referensi WCAG menggunakan [Understanding documents W3C](https://www.w3.org/WAI/WCAG22/Understanding/); audit ini bukan penilaian konformansi menyeluruh.

| ID | Severity | Klasifikasi | Area |
| --- | --- | --- | --- |
| UI-01 | High | A | Kontras primary dan navigasi aktif |
| UI-02 | High | A | Draft customer pada dialog |
| UI-03 | High | A | Pemulihan validasi customer |
| UI-04 | High | A | Handover mobile |
| UI-05 | Medium | A | Konteks filter/pagination |
| UI-06 | Medium | B | Bahasa dan pemahaman pengguna |
| UI-07 | Medium | A | Dashboard saat teks diperbesar |
| UI-08 | Medium | A | Sorting tabel pickup |
| UI-09 | Medium | A | Label customer picker |
| UI-10 | Medium | B | Bypass navigasi keyboard |
| UI-11 | Medium | A | State pilihan tema |
| UI-12 | Medium | B | Pemulihan halaman tidak ditemukan |
| UI-13 | Medium | B | Cabang UI lama dan maintainability |
| UI-14 | Low | A | Reduced motion dialog |

<a id="ui-01"></a>
## UI-01 — Kontras kontrol utama tidak mencukupi

- **Severity / klasifikasi:** High / A — Verified defect.
- **Halaman / komponen:** dashboard sebagai sampel kontrol utama; token primary global; navigasi aktif sidebar.
- **Lokasi:** `resources/css/app.css:107` dan `:108` untuk pasangan dark primary; `resources/css/app.css:71` serta `resources/js/components/nav-main.tsx:34` untuk teks primary pada latar primary/10 di light mode. [Token](../../resources/css/app.css#L107), [navigasi](../../resources/js/components/nav-main.tsx#L34).
- **Observed:** setelah tema diubah melalui tombol aplikasi dan transisi selesai, teks putih 14 px pada tombol enabled “Buat pickup” dan “Terapkan” memiliki rasio **2,92:1**. Teks “Dashboard” aktif di sidebar light mode adalah **4,21:1**, ukuran 14 px, weight 600. Elemen anchor dan span merupakan sampel duplikat dari label yang sama, bukan dua defect terpisah.
- **Expected:** teks normal pada kontrol enabled mencapai minimal 4,5:1 pada pasangan warna aktual. Weight 600 dan ukuran 14 px bukan kategori large text.
- **Guideline / prinsip:** WCAG 1.4.3 Contrast (Minimum); panduan Vercel accessibility; UI/UX Pro Max accessibility dan dark-mode contrast.
- **Evidence:** `interaction-results.json`, record `dashboard-actual-dark` dan `dashboard-contrast-light`; [dark screenshot](screenshots/dashboard-actual-dark.png). Pengukuran computed CSS diselesaikan menjadi warna sRGB melalui canvas dan dikompositkan terhadap latar solid. Bukan audit seluruh pasangan warna; gradient dan elemen yang dikecualikan dijelaskan di verification.
- **User impact:** staf dengan penglihatan rendah lebih sulit membaca tindakan utama dan lokasi navigasi. Token bersama berpotensi memengaruhi banyak halaman, meskipun hanya sampel tersebut yang diukur.
- **Recommended fix:** koreksi pasangan token/variant yang terlibat; uji label, hover, focus, selected, dan kedua tema. Jangan menyamakan disabled control dengan enabled control atau mengubah semua warna status tanpa pengukuran.
- **Effort:** 0,5–1 hari.

<a id="ui-02"></a>
## UI-02 — Escape menghilangkan draft customer

- **Severity / klasifikasi:** High / A — Verified defect.
- **Halaman / komponen:** Customer → Tambah Customer / CustomerDialog.
- **Lokasi:** `resources/js/components/customer-dialog.tsx:27`, `:34`, `:51`; [kode](../../resources/js/components/customer-dialog.tsx#L27). Pola busy-only serupa terdapat pada `resources/js/components/create-pickup-dialog.tsx:26`, tetapi kehilangan draft pada dialog pickup tidak diuji ulang di browser.
- **Observed:** isi nama dan alamat; tekan Escape saat tidak menyimpan; dialog tertutup tanpa pemeriksaan perubahan. Buka kembali: nilai nama kosong (`retainedDraft: ""`). Proteksi terhadap outside click dan penutupan saat busy tersedia, tetapi bukan proteksi dirty state.
- **Expected:** perubahan yang belum tersimpan bertahan atau pengguna diberi pilihan eksplisit untuk kembali mengedit/membuang draft. Form bersih tetap boleh ditutup cepat.
- **Guideline / prinsip:** error prevention, user control, perlindungan pekerjaan belum tersimpan; Vercel forms; UI/UX Pro Max forms and feedback.
- **Evidence:** `interaction-results.json`, `customer-dialog`, `customer-draft-after-escape`; [setelah dibuka kembali](screenshots/customer-draft-after-escape.png).
- **User impact:** CS/Admin harus mengisi ulang data; tombol Escape yang biasa dipakai menutup popup dapat menghapus pekerjaan panjang tanpa peringatan.
- **Recommended fix:** periksa dirty state pada Escape, tombol tutup, dan Batal; pertahankan draft atau gunakan konfirmasi discard yang aksesibel. Ambil pelajaran dari guard yang sudah ada di pickup wizard/handover; jangan membuat guard global untuk setiap klik atau mengganggu form yang belum berubah.
- **Effort:** 1–2 hari, termasuk audit pemakai pola dialog yang sama.

<a id="ui-03"></a>
## UI-03 — Error validasi customer tidak membawa pengguna ke masalahnya

- **Severity / klasifikasi:** High / A — Verified defect.
- **Halaman / komponen:** CustomerForm dalam dialog dengan body scroll dan footer tetap.
- **Lokasi:** `resources/js/components/customer-form.tsx:76` untuk submit, `:118` untuk body scroll, `:337`–`:355` untuk input/error contact; [form](../../resources/js/components/customer-form.tsx#L337).
- **Observed:** submit nama/alamat valid tanpa email, telepon, atau contact menghasilkan **422 aktual dari aplikasi fixture**. Bagian kontak dibuka dan pesan dirender, tetapi berada di bawah area yang terlihat. Fokus tetap pada container dialog, bukan input invalid atau ringkasan. Input `customer-contact` memiliki `aria-invalid=true` dan **tidak memiliki `aria-describedby`** yang menunjuk pesan. Pesan mempunyai role alert, jadi audit tidak menyatakan pesan sama sekali tidak diumumkan.
- **Expected:** setelah submit gagal, pengguna mengetahui bagian yang perlu diperbaiki dan dapat langsung mencapainya. Error terhubung secara programatis dengan input dan tetap tampil dekat field.
- **Guideline / prinsip:** Vercel forms/errors; UI/UX Pro Max hasil pencarian “error summary validation”; relasi label/instruction/error dan pemulihan yang dapat dipahami. Tidak semua form wajib memindahkan fokus setiap kali pengguna mengetik; rekomendasi berlaku pada hasil submit gagal.
- **Evidence:** `interaction-results.json`, `customer-server-validation` (`httpStatus:422`, active DIV, invalid description null); [screenshot](screenshots/customer-server-validation.png).
- **User impact:** tombol Simpan terlihat tetapi penyebab kegagalannya tidak; staf dapat mengulang submit atau mengira sistem macet.
- **Recommended fix:** ringkasan error fokusable dengan tautan ke field, atau fokus/scroll terarah ke invalid field pertama setelah submit. Beri ID pesan dan `aria-describedby`; pertahankan pesan inline dan nilai yang sudah diisi. Validasi minimal satu kanal kontak adalah aturan yang sudah dijelaskan, bukan defect yang diminta dihapus.
- **Effort:** 1–2 hari, mulai dari CustomerForm lalu terapkan konvensi pada form sejenis.

<a id="ui-04"></a>
## UI-04 — Panel verifikasi terlalu jauh setelah pemilihan task di ponsel

- **Severity / klasifikasi:** High / A — Verified defect.
- **Halaman / komponen:** Handover Session detail / HandoverSessionDetail.
- **Lokasi:** `resources/js/components/handover-session-detail.tsx:527` untuk susunan grid, `:560` untuk daftar task, `:612` untuk panel verifikasi; [kode](../../resources/js/components/handover-session-detail.tsx#L527).
- **Observed:** pada 375×812 px dengan 12 task, klik task pertama mempertahankan scrollY=0. Heading “Verifikasi Paket” berada pada **top=1.997,5 CSS px**, di bawah seluruh daftar task. Selected state dan `aria-controls` ada, tetapi target pekerjaan berikutnya tidak dibawa ke area yang terlihat.
- **Expected:** setelah memilih task di layar kecil, staf dapat segera mencapai jumlah paket yang harus diverifikasi dan tetap kembali ke daftar dengan konteks utuh.
- **Guideline / prinsip:** task continuity, action feedback, mobile information priority; UI/UX Pro Max layout/responsive dan touch/interaction.
- **Evidence:** `interaction-results.json`, `handover-mobile-selection`; [screenshot panjang](screenshots/handover-mobile-selection.png). Nilai diukur pada fixture 12 task, bukan klaim seluruh session selalu sepanjang itu.
- **User impact:** Retail Staff perlu menggulir melewati banyak kartu setiap kali beralih task; risiko kehilangan konteks customer yang sedang dihitung meningkat.
- **Recommended fix:** pada mobile, bawa panel terpilih ke view/fokus yang tepat atau gunakan daftar terlipat dengan akses kembali yang jelas. Pertahankan susunan dua panel desktop. Pilihan implementasi harus diuji dengan session banyak task; jangan sekadar memindahkan semua informasi ke modal tanpa evaluasi.
- **Effort:** 1–2 hari.

<a id="ui-05"></a>
## UI-05 — Konteks daftar customer tidak bertahan setelah reload

- **Severity / klasifikasi:** Medium / A — Verified defect terhadap kontinuitas tugas.
- **Halaman / komponen:** Customer list; beberapa daftar operasional mempunyai pola local state serupa yang perlu ditinjau saat remediasi.
- **Lokasi:** `resources/js/pages/customers.tsx:28`–`:31`, `:44`, `:223`; [kode](../../resources/js/pages/customers.tsx#L28).
- **Observed:** pencarian customer dan perpindahan pagination bekerja, tetapi URL tetap `/operations/customers`. Reload mengosongkan pencarian dan kembali ke halaman awal. Bukti browser untuk kehilangan state hanya pada customer; jangan menganggap seluruh daftar gagal dengan cara yang sama.
- **Expected:** query/filter/page yang menentukan hasil daftar dapat dipulihkan saat reload atau dibagikan melalui URL, dengan page direset secara sengaja saat filter berubah.
- **Guideline / prinsip:** Vercel navigation/state in URL; UI/UX Pro Max deep linking dan predictable back; efisiensi repetitive tasks.
- **Evidence:** `interaction-results.json`, `customer-filtered`, `customer-filter-after-reload`, `customer-pagination`; [filtered](screenshots/customer-filtered.png), [setelah reload](screenshots/customer-filter-after-reload.png). Hasil Pickup memberi pembanding positif karena URL sort/filter diperbarui.
- **User impact:** CS/Admin mengulang pencarian dan mencari kembali posisi setelah refresh atau pemeriksaan data.
- **Recommended fix:** gunakan query URL dan helper Wayfinder yang sudah ada; selaraskan state awal, debounce, pagination, dan reload. Terapkan bertahap, bukan mengganti seluruh fetching dengan state framework baru.
- **Effort:** 1–2 hari untuk customer; tambahan 1–2 hari untuk daftar lain setelah verifikasi kebutuhan per workflow.

<a id="ui-06"></a>
## UI-06 — Bahasa pemulihan dan pengaturan belum konsisten

- **Severity / klasifikasi:** Medium / B — Strong UX concern; keberadaan campuran bahasa terverifikasi, tingkat kesulitan staf belum diuji.
- **Halaman / komponen:** validasi customer, forgot/reset password, settings navigation, pilihan tema, teks aksesibilitas bawaan.
- **Lokasi:** `resources/js/components/customer-form.tsx:355` menampilkan pesan validasi server; `resources/js/pages/auth/forgot-password.tsx:28`, `:50`, `:67`; `resources/js/layouts/settings/layout.tsx:15`, `:37`; [auth](../../resources/js/pages/auth/forgot-password.tsx#L28), [settings](../../resources/js/layouts/settings/layout.tsx#L15).
- **Observed:** UI operasional berbahasa Indonesia, sedangkan error yang diterima berbunyi “The contact field is required when none of email / phone are present.” Settings memakai Profile/Settings dan auth recovery menggunakan kalimat Inggris. Terminologi shipment/APEX/AWB dapat merupakan istilah pekerjaan yang sah; masalahnya adalah kalimat bantuan/pemulihan yang tidak konsisten.
- **Expected:** bahasa produk dan error dapat dipahami staf target, dengan istilah operasional yang disepakati. Jangan menerjemahkan identifier AWB atau status sumber secara sembarang.
- **Guideline / prinsip:** plain language, consistency, error recovery; UI/UX Pro Max forms and feedback; language-of-content memerlukan evaluasi tambahan bila bahasa dokumen dan bagian berbeda.
- **Evidence:** screenshot `customer-server-validation`, `auth-forgot`, `settings-profile`, `appearance-selected-state`; source rendering pesan server. Tidak ada survei kemampuan bahasa staf dalam audit.
- **User impact:** pemulihan akun dan perbaikan input lebih bergantung pada bantuan staf teknis.
- **Recommended fix:** sepakati Bahasa Indonesia sebagai bahasa bantuan operasional, lokalisasi pesan validasi dan auth/settings, serta catat glossary singkat istilah bisnis. Perubahan backend translation, bila diperlukan, harus menjadi pekerjaan yang disetujui terpisah.
- **Effort:** 1–2 hari untuk cakupan yang teramati, ditambah review istilah bersama operasional.

<a id="ui-07"></a>
## UI-07 — Diagram dashboard meluber saat ukuran teks diperbesar

- **Severity / klasifikasi:** Medium / A — Verified layout defect; implikasi WCAG perlu diuji lebih lanjut.
- **Halaman / komponen:** Dashboard / OperationalDonut.
- **Lokasi:** `resources/js/components/operational-dashboard-charts.tsx:72`; [kode](../../resources/js/components/operational-dashboard-charts.tsx#L72).
- **Observed:** pada viewport 375×812 dengan root font-size 200%, container donut `size-40` tumbuh menjadi 320 px; SVG mencapai right=401 px dan dokumen mengalami horizontal overflow. Pada ukuran teks normal, sampel 320/375/768/1440 px tidak menunjukkan overflow dokumen.
- **Expected:** pembesaran teks tidak mendorong konten umum keluar viewport; grafik berada dalam batas area tersedia dan data tetap dapat dipahami.
- **Guideline / prinsip:** Vercel responsive/overflow; UI/UX Pro Max typography/responsive; terkait pemeriksaan WCAG 1.4.4 Resize Text dan 1.4.10 Reflow.
- **Evidence:** `follow-up-results.json`, `text-zoom-overflow-detail`; [screenshot](screenshots/text-zoom-overflow-detail.png).
- **User impact:** pengguna yang memperbesar teks perlu menggulir horizontal dan dapat kehilangan label atau aksi di dashboard.
- **Recommended fix:** batasi grafik berdasarkan lebar tersedia menggunakan max-width/aspect ratio dan periksa legenda pada font besar. Pertahankan data tekstual. Uji browser zoom 200/400% dan resize text yang sebenarnya sebelum menyimpulkan konformansi: root-font simulation bukan pengganti penuh, dan grafik dua dimensi memiliki pengecualian reflow tertentu.
- **Effort:** 0,5–1 hari.

<a id="ui-08"></a>
## UI-08 — Sorting tabel tidak mengumumkan arah aktif

- **Severity / klasifikasi:** Medium / A — Verified defect.
- **Halaman / komponen:** Hasil Pickup, mode monitoring pickup / PickupMonitoring.
- **Lokasi:** `resources/js/components/pickup-monitoring.tsx:577`, `:585`, `:605`; [kode](../../resources/js/components/pickup-monitoring.tsx#L577).
- **Observed:** tombol “Pickup / Customer” mengubah URL menjadi sort=customer_name dan direction=desc, tetapi semua header TH memiliki `aria-sort=null`; ikon ArrowDownUp juga tidak menunjukkan arah terpilih secara spesifik.
- **Expected:** kolom yang sedang diurutkan mengumumkan ascending/descending, dan perubahan dapat dipahami tanpa menebak dari posisi baris.
- **Guideline / prinsip:** semantic table state, programmatic relationships/state; Vercel accessibility; UI/UX Pro Max shadcn/table guidance.
- **Evidence:** `interaction-results.json`, `pickup-sorted` beserta daftar `aria-sort`; [screenshot](screenshots/pickup-sorted.png). Sorting berfungsi; audit tidak menyebut sorting rusak.
- **User impact:** pengguna screen reader sulit mengetahui urutan aktif, dan pengguna visual hanya melihat ikon generik.
- **Recommended fix:** pasang `aria-sort` pada TH aktif dan indikasi visual arah; pertahankan tombol keyboard dan URL state. Jangan mengganti tabel khusus domain hanya untuk menambahkan atribut ini.
- **Effort:** 0,5 hari.

<a id="ui-09"></a>
## UI-09 — Label Customer tidak terkait dengan pemilihnya

- **Severity / klasifikasi:** Medium / A — Verified defect pada asosiasi label.
- **Halaman / komponen:** Buat Pickup On-Demand / CreatePickup → CustomerPicker.
- **Lokasi:** `resources/js/components/create-pickup.tsx:181` dan `:182`; `resources/js/components/customer-picker.tsx:43`, `:99`, `:102`; [pemakai](../../resources/js/components/create-pickup.tsx#L181), [primitive domain](../../resources/js/components/customer-picker.tsx#L99).
- **Observed:** label terlihat “Customer” tidak memiliki htmlFor; caller tidak meneruskan `triggerId` yang sudah didukung picker. Browser tidak dapat menemukan control berdasarkan label “Customer”; trigger combobox tetap memiliki nama dari placeholder/nilai pilihan, sehingga tidak benar menyebutnya sama sekali tanpa accessible name.
- **Expected:** nama field stabil “Customer” terhubung secara programatis dengan trigger, terlepas dari customer yang sedang dipilih.
- **Guideline / prinsip:** label association dan accessible name yang stabil; Vercel forms/accessibility; UI/UX Pro Max forms.
- **Evidence:** pemeriksaan source dan browser `customer-picker-dialog`; dialog pencarian sendiri mempunyai title/description dan dapat dibuka dengan combobox locator.
- **User impact:** pengguna assistive technology kehilangan hubungan eksplisit antara nama field dan pilihan; perubahan nilai dapat menggantikan petunjuk konteks.
- **Recommended fix:** gunakan `triggerId` + htmlFor atau `aria-labelledby` yang sesuai. Audit caller picker lainnya dengan pola yang sama sebelum menyimpulkan seluruh caller salah.
- **Effort:** 0,5 hari.

<a id="ui-10"></a>
## UI-10 — Tidak ada pintasan melewati navigasi menuju pekerjaan utama

- **Severity / klasifikasi:** Medium / B — Strong UX concern.
- **Halaman / komponen:** shell aplikasi bersama, terutama sidebar Admin yang panjang.
- **Lokasi:** `resources/js/layouts/app/app-sidebar-layout.tsx:13`–`:15`; `resources/js/components/app-content.tsx:11`; [layout](../../resources/js/layouts/app/app-sidebar-layout.tsx#L13).
- **Observed:** pemeriksaan kode dan tab pertama pada dashboard tidak menemukan skip link ke main/content. Landmark main tersedia melalui SidebarInset/AppContent.
- **Expected:** pengguna keyboard dapat menuju konten utama dengan cepat pada navigasi berulang, tanpa menelusuri seluruh menu setiap kali dibutuhkan.
- **Guideline / prinsip:** bypass repeated navigation, efisiensi keyboard; Vercel accessibility. **Tidak diklaim sebagai kegagalan otomatis WCAG 2.4.1**, karena landmark merupakan mekanisme alternatif bagi sebagian assistive technology.
- **Evidence:** `follow-up-results.json`, `keyboard-first-tab` (`skipLinkCount:0`) dan inspeksi shell; [screenshot](screenshots/keyboard-first-tab.png).
- **User impact:** pengguna keyboard tanpa shortcut landmark harus melewati banyak kontrol sebelum mencapai tugas, terutama pada role Admin.
- **Recommended fix:** skip link focus-visible menuju main dengan target fokus yang benar; validasi kebijakan fokus saat perpindahan halaman Inertia. Jangan mencuri fokus pada setiap refresh/filter otomatis.
- **Effort:** 0,5–1 hari.

<a id="ui-11"></a>
## UI-11 — Pilihan tema hanya menunjukkan state secara visual

- **Severity / klasifikasi:** Medium / A — Verified defect.
- **Halaman / komponen:** Settings → Appearance / AppearanceToggleTab.
- **Lokasi:** `resources/js/components/appearance-tabs.tsx:28`–`:40`; [kode](../../resources/js/components/appearance-tabs.tsx#L28).
- **Observed:** Light/Dark/System dirender sebagai button dengan class berbeda untuk pilihan aktif. Browser menemukan `aria-pressed=null`, `aria-selected=null`, dan tanpa role pilihan yang sesuai pada ketiganya.
- **Expected:** assistive technology dapat mengetahui pilihan aktif dan kelompok pengaturannya, bukan hanya nama tiga tombol.
- **Guideline / prinsip:** programmatic control state; Vercel accessibility; UI/UX Pro Max visual states.
- **Evidence:** `follow-up-results.json`, `appearance-selected-state`, `selectionAttributes`; [screenshot](screenshots/appearance-selected-state.png).
- **User impact:** sulit memastikan apakah setting sudah berubah atau sedang mengikuti sistem.
- **Recommended fix:** gunakan primitive ToggleGroup yang sudah terpasang atau pertahankan button dengan semantik pressed/group yang tepat. Tidak perlu dependency baru.
- **Effort:** 0,5 hari.

<a id="ui-12"></a>
## UI-12 — Halaman 404 tidak menyediakan jalur pemulihan di dalam aplikasi

- **Severity / klasifikasi:** Medium / B — Strong UX concern, dengan respons 404 terverifikasi.
- **Halaman / komponen:** route yang tidak ditemukan / penanganan error dokumen.
- **Lokasi:** `bootstrap/app.php:34` untuk responder yang mengkhususkan JSON; inventory resolver `resources/js/app.tsx:1` dan direktori pages tidak memiliki halaman error khusus. [exception configuration](../../bootstrap/app.php#L34).
- **Observed:** mengunjungi route audit yang tidak ada menampilkan “404 Not Found” standar tanpa shell, tombol kembali, atau tautan dashboard. Ini hanya bukti untuk 404, bukan klaim semua error 500/403 memiliki hasil sama.
- **Expected:** pengguna dapat kembali ke daftar/dashboard atau memahami langkah berikutnya setelah membuka URL lama/keliru.
- **Guideline / prinsip:** error recovery, continuity, helpful error content; Vercel errors; UI/UX Pro Max feedback.
- **Evidence:** `interaction-results.json`, `not-found`; [screenshot](screenshots/not-found.png). URL invalid sengaja dipilih; tidak ditemukan menu produksi yang mengarah ke route invalid tersebut.
- **User impact:** staf harus memakai kontrol browser atau menebak URL saat tautan lama tidak berlaku.
- **Recommended fix:** halaman error aplikasi sederhana dengan pesan Indonesia dan jalur kembali aman. Tangani status lain berdasarkan kebutuhan dan pengujian terpisah, tanpa mengubah permission atau menyembunyikan status HTTP.
- **Effort:** 1–2 hari.

<a id="ui-13"></a>
## UI-13 — Halaman operasi masih menyimpan implementasi customer yang tidak terjangkau

- **Severity / klasifikasi:** Medium / B — Strong maintainability concern; tidak ada defect transaksi yang disimpulkan.
- **Halaman / komponen:** operations.tsx versus halaman customers.tsx yang aktif.
- **Lokasi:** `resources/js/pages/operations.tsx:417`, `:531`, `:826`, `:1533`; `routes/web.php:100`–`:101` untuk early return route customer. [cabang legacy](../../resources/js/pages/operations.tsx#L826), [route](../../routes/web.php#L100).
- **Observed:** komponen operasi sepanjang sekitar 1.928 baris masih memiliki cabang `screen === 'customers'`, list/editor/state customer. Route customers melakukan early return ke `Inertia::render('customers')` sebelum mengirim halaman operations. Menu customer aktif menggunakan halaman baru. Cabang source bukan bukti halaman kedua tersedia bagi pengguna.
- **Expected:** hanya satu implementasi aktif untuk tugas yang sama; perubahan customer tidak membuat pengembang mengedit salinan yang tidak terlihat.
- **Guideline / prinsip:** reuse before new abstraction, maintainable consistency; shadcn composition dan prinsip design system kecil sesuai kebutuhan.
- **Evidence:** route dan kedua file, plus screenshot customers aktif; inventaris source mencatat keduanya. Kesimpulan unreachable terbatas pada entry point route yang ditemukan; pastikan tidak ada embedding lain sebelum penghapusan.
- **User impact:** dampak tidak langsung: perbaikan berpotensi masuk ke cabang salah, status/form menyimpang, dan review regresi lebih berat.
- **Recommended fix:** setelah regresi workflow terpasang, pisahkan tanggung jawab operasi sesuai screen yang benar-benar dirutekan dan hapus hanya cabang yang terbukti tidak dipakai. Gunakan komponen existing; jangan membangun framework halaman atau tabel baru.
- **Effort:** 2–4 hari secara bertahap.

<a id="ui-14"></a>
## UI-14 — Animasi dialog tetap aktif ketika reduced motion dipilih

- **Severity / klasifikasi:** Low / A — Verified preference-handling defect terhadap panduan; bukan pernyataan pelanggaran WCAG AA otomatis.
- **Halaman / komponen:** CustomerDialog dan primitive Dialog; Sheet memakai kelas animasi sejenis tetapi tidak diukur ulang pada state buka dalam pemeriksaan ini.
- **Lokasi:** `resources/js/components/ui/dialog.tsx:39`, `:58`; pembanding Sheet `resources/js/components/ui/sheet.tsx:61`; [Dialog](../../resources/js/components/ui/dialog.tsx#L58).
- **Observed:** pada browser dengan `prefers-reduced-motion: reduce`, computed style dialog masih `animation-name: enter`, duration `0.2s`, transition `0.2s`. Kelas zoom/fade tetap ada. Ini pemeriksaan style, bukan pengukuran ketidaknyamanan pengguna atau flashes.
- **Expected:** gerakan nonesensial mengikuti preferensi reduced motion dengan menghapus zoom/slide dan mengurangi transisi yang tidak diperlukan.
- **Guideline / prinsip:** Vercel reduced motion; UI/UX Pro Max animation guidance.
- **Evidence:** `extra-results.json`, `dialog-reduced-motion`, property `motion`.
- **User impact:** pengguna yang memilih pengurangan gerakan tetap menerima animasi nonesensial saat membuka dialog.
- **Recommended fix:** gunakan variant motion-reduce pada primitive bersama, verifikasi Dialog/Sheet/dropdown; jangan menghapus indikasi loading penting tanpa pengganti.
- **Effort:** 0,5–1 hari.

## Hal yang sengaja tidak dikategorikan sebagai defect

- Tabel lebar yang dapat digulir di dalam container, dengan dokumen tetap sesuai viewport, bukan otomatis kegagalan responsive. Tabel data dua dimensi mempunyai pengecualian reflow tertentu.
- Perbedaan kepadatan antara monitoring, form, auth, dan dashboard sesuai tugas; tidak harus memiliki susunan kartu identik.
- Checkbox kecil di daftar pickup dibungkus label dengan area klik yang lebih besar. Tidak dihitung sebagai kegagalan target hanya berdasarkan ukuran glyph 16 px.
- Sheet yang diuji mempunyai focus trap dan mengembalikan fokus ke trigger setelah benar-benar tertutup. Snapshot saat exit animation tidak dipakai untuk menyimpulkan kebocoran fokus.
- Native date input dapat mengikuti locale browser. Perbedaan tampilannya terhadap tanggal berformat Indonesia bukan bukti perubahan nilai/tanggal salah.
- Tidak adanya Customer Portal, self-service publik, atau AWB generation via API JNE tidak dinilai sebagai defect fitur saat ini.
- Tidak adanya primitive shadcn generasi terbaru bukan pelanggaran; proyek tidak wajib mengubah dependency atau mengganti API TanStack v9 yang terpasang.

## Pertanyaan yang memerlukan pengujian pengguna / perangkat

| ID | Status | Pertanyaan dan bukti awal | Rencana validasi | Prioritas riset |
| --- | --- | --- | --- | --- |
| R-01 | D | POP mewajibkan tanda tangan pada canvas berbasis pointer; `resources/js/components/signature-pad.tsx:37`, `:43`. Menggambar lintasan dapat merupakan pengecualian keyboard yang esensial, sehingga tidak disebut pelanggaran otomatis. | Uji pengguna dengan keterbatasan motorik dan putuskan kebijakan operasional untuk sender yang tidak dapat menandatangani; nilai alternatif yang sah. | Medium; sebelum klaim aksesibilitas POP lengkap |
| R-02 | D | Dashboard memiliki metrik dan tindak lanjut, tetapi tidak ada role Head Retail terpisah. Belum diketahui tiga keputusan terpenting tiap shift. | Uji tugas menemukan backlog, penanggung jawab, usia exception, dan tindakan berikutnya bersama Head Retail/Admin. | Medium |
| R-03 | D | Native mobile mengimplementasikan draft/offline, kamera, keyboard detection, app back, push, dan recovery. Browser web tidak membuktikan perilaku perangkat. | Uji Android fisik, keyboard terbuka, rotasi, permission kamera, hilang jaringan, restart aplikasi, dan draft recovery; jangan memakai data pelanggan nyata tanpa kebutuhan. | High sebelum rollout mobile luas |
| R-04 | D | Report run, AWB, dan rekonsiliasi menampilkan tahapan berbeda. Fixture tidak membuktikan semua pesan pada report live lama/gagal/parsial dapat dipahami staf. | Walkthrough read-only dengan Admin menggunakan kasus nyata yang disetujui; cek siapa bertindak, kapan menunggu/retry, dan apakah status akhir konsisten. | Medium |

Saran estetika opsional **C** dicatat di [design-system-review](design-system-review.md), bukan disamarkan sebagai defect.

## Indeks ringkas per file — format web-design-guidelines

- `resources/css/app.css:107` — UI-01: pasangan dark primary/foreground di bawah kontras teks normal.
- `resources/js/components/nav-main.tsx:34` — UI-01: navigasi aktif light mode diukur 4,21:1.
- `resources/js/components/customer-dialog.tsx:27` — UI-02: close guard hanya busy, draft tidak dilindungi.
- `resources/js/components/customer-form.tsx:344` — UI-03: invalid field tidak memiliki hubungan pesan; submit gagal tidak membawa fokus/scroll ke error.
- `resources/js/components/handover-session-detail.tsx:527` — UI-04: daftar mendahului panel kerja pada mobile tanpa perpindahan ke panel terpilih.
- `resources/js/pages/customers.tsx:28` — UI-05: filter/page hanya local state.
- `resources/js/pages/auth/forgot-password.tsx:28` — UI-06: bantuan akun berbahasa Inggris di antara UI operasional Indonesia.
- `resources/js/layouts/settings/layout.tsx:15` — UI-06: bahasa pengaturan belum selaras.
- `resources/js/components/operational-dashboard-charts.tsx:72` — UI-07: ukuran rem diagram meluber pada pembesaran teks.
- `resources/js/components/pickup-monitoring.tsx:577` — UI-08: TH sortable tanpa aria-sort.
- `resources/js/components/create-pickup.tsx:181` — UI-09: label Customer tidak terhubung dengan triggerId picker.
- `resources/js/layouts/app/app-sidebar-layout.tsx:13` — UI-10: tidak ada skip link; main landmark sudah tersedia.
- `resources/js/components/appearance-tabs.tsx:29` — UI-11: tombol pilihan tema tidak mengumumkan state terpilih.
- `bootstrap/app.php:34` — UI-12: 404 dokumen belum memiliki jalur pemulihan aplikasi.
- `resources/js/pages/operations.tsx:826` — UI-13: cabang customer legacy tidak dipakai oleh route customer saat ini.
- `resources/js/components/ui/dialog.tsx:58` — UI-14: animasi tidak menyesuaikan reduced-motion.
