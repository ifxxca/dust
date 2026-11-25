# Retail Pickup Mobile — audit dan UAT

Tanggal: 11 November 2026. Repository: `S:/2026/dust`.

Status: implementasi dan verifikasi otomatis dikerjakan bertahap. UAT Android fisik **BELUM DIUJI**, sesuai arahan pengguna setelah `adb devices -l` tidak menampilkan perangkat. Tidak ada deploy, commit, push, reset, stash, atau pembuatan APK release.

## Ruang lingkup dan baseline

Pengguna utama adalah petugas pickup berpengalaman yang memindai banyak paket. Tugas utama: mencatat resi pada buku yang benar, menyimpan daftar sekali, dan memantau hasil input/approval. Data utama: AWB terakhir, draft lokal, status backend, kegagalan, dan jumlah per status. Aksi rutin: scan, tambah, simpan, lanjut scan. Pengecualian: duplikat, format tidak dikenal, offline, hasil pengiriman belum pasti, penolakan Hybrid, dan sesi berakhir. Bantuan suara/getaran dan rincian riwayat ditempatkan dalam disclosure.

Versi diperiksa dari Composer dan package.json: Laravel 13.35.0, PHP 8.5.12, Capacitor Android/Core/CLI 8.5.3, Barcode Scanning 8.2.1, App 8.1.2, Push Notifications 8.1.3, React 19.2, Tailwind 4. Aplikasi mobile merupakan React + Capacitor tersendiri; tidak dibangun ulang sebagai aplikasi Inertia.

Banyak perubahan Git sudah ada ketika audit dimulai. Perubahan tersebut dipertahankan. Tidak ada `.ai/rules` pada checkout ini. Komponen Button, Input, Label, Checkbox, Dialog, dan OperationalFeedback yang sudah ada digunakan kembali.

## Temuan awal, perilaku lama, dan hasil implementasi

| Area / tingkat | Perilaku yang ditemukan sebelum perubahan ini | Perbaikan / hasil |
| --- | --- | --- |
| Audio / P1 | ScanFeedbackPlugin memanggil setStreamVolume ke volume maksimum pada setiap scan. | Pemaksaan volume dihapus, izin MODIFY_AUDIO_SETTINGS dihapus. STREAM_MUSIC mengikuti volume/rute sistem dan mode dering. |
| Milestone / P1 | Scanner kamera dan input POP memutar suara sukses saat resi baru masuk draft lokal. | Penerimaan draft hanya getaran 25 ms dan teks belum dikirim. Suara sukses hanya setelah status ACCEPTED dengan approved_at dan batch DONE/PARTIAL. |
| Signature / P1 | Client menerima rentang karakter umum 6–100; backend memakai pemeriksaan karakter umum. | Allowlist penuh digunakan pada client serta seluruh jalur pencatatan/koreksi resi baru yang relevan. |
| Duplikat / sudah ada | CameraScanSession sudah memiliki seen-set, debounce 750 ms, deduplikasi per frame, dan antrean penulisan. Database mempunyai klaim AWB unik serta submission_key. | Dipertahankan; suara/getaran duplikat dibedakan. Hasil validasi lambat yang ditolak tidak berubah menjadi duplikat palsu. Pemeriksaan lokal mencakup seluruh resi pada buku, bukan hanya halaman aktif. |
| Ketahanan / sudah ada | Draft terenkripsi melalui MobileLocal, scoped per akun/environment. Penulisan lokal diserialkan. Timeout HTTP 30 detik. | Dipertahankan; statistik sesi juga dipersistenkan dan draft rusak tidak dihapus diam-diam. |
| Retry / P1 | Pengiriman tidak pasti mempertahankan draft dan kunci; sebelumnya semua HTTP 4xx dapat membuka kembali daftar. | Hanya 422 yang membuka kembali daftar. Timeout, 5xx, 401/403/409/429 mempertahankan payload/kunci agar pemeriksaan ulang tidak membuat pengiriman baru. |
| Progres / P2 | Status batch dan tombol segarkan sudah tersedia, tetapi belum ada ringkasan resi yang mengikuti backend saat scan. | Polling status setiap 5 detik saat layar aktif, tidak paralel. Ringkasan memakai percobaan terbaru tiap record pada seluruh buku. Riwayat 50 terbaru ditampilkan terpisah dari halaman resi tersimpan. |
| Buka ulang offline / P1 | Draft menyimpan daftar dan kunci tetapi belum menyimpan konteks buku untuk membuka ulang scanner tanpa jaringan. | Konteks minimal buku kini dicache terenkripsi pada journal yang sama. Reload offline tetap dapat melanjutkan draft; reconnect menyegarkan buku. Draft versi lama tanpa konteks tetap dapat diinspeksi dan memerlukan satu pembukaan online. |
| Tautan notifikasi / P1 | initialPickupId dapat memilih buku tanpa membuat draft kosong; tambah resi kemudian tidak bekerja. | Draft dibuat ketika buku pertama dibuka langsung, tanpa menimpa draft yang dipulihkan. |
| Kamera / sudah ada | Dukungan kamera, izin, senter, cleanup listener, penutupan saat pause/background, dan penantian penulisan sudah ditangani. | Dipertahankan; tombol coba kamera lagi ditambahkan, AWB terakhir ditonjolkan, footer dapat digulir pada layar pendek. |
| Notifikasi sukses / sudah sesuai | Observer hanya membuat alert FAILED/PARTIAL/UNKNOWN, tidak mengirim push per resi berhasil. | Dipertahankan; tidak ditambahkan push sukses atau retry biasa. |
| Notifikasi foreground / P2 | Capacitor presentationOptions mengaktifkan alert dan sound sistem ketika aplikasi aktif. | presentationOptions kosong; kejadian aktif masuk ke indikator/umpan balik aplikasi. |
| Notifikasi perhatian / P2 | Alert unik per batch dan delivery unik per device sudah ada; tag FCM unik per alert menambah item tray. | Tag cashless stabil per buku pickup, sehingga kejadian batch buku yang sama menggantikan satu item tray. Deduplikasi insiden foreground juga ditambahkan. |
| Umpan balik operator / P2 | Tidak ada pengaturan terpisah untuk suara berhasil/gagal serta getaran. | Disclosure pengaturan, tes dua suara, tes getaran, dan petunjuk volume media/Bluetooth/senyap/Jangan Ganggu. |

## Checklist implementasi

- [x] Audit jalur kamera, manual/keyboard/Bluetooth, POP, handover terpisah, koreksi, worker, impor, dan rekonsiliasi.
- [x] Pertahankan proses batch, izin, jumlah POP final, bukti sumber, dan aturan rekonsiliasi.
- [x] Simpan 154 pola tepat dalam satu sumber `config/awb-signatures.json`.
- [x] Validasi penuh, # hanya digit ASCII, literal persis, tanpa ekstraksi substring.
- [x] Catat semua signature yang cocok pada affected_results.signature_matches; tetap satu record/pengiriman.
- [x] Pisahkan diterima lokal, terkirim, antrean/proses, approval selesai, dan rekonsiliasi.
- [x] Bedakan getaran penerimaan, berhasil, gagal, dan duplikat.
- [x] Hapus perubahan volume tersembunyi dan pertahankan preferensi operator/perangkat.
- [x] Ringkasan backend, statistik sesi lokal, riwayat, dan kegagalan tetap terlihat.
- [x] Pertahankan kunci pengiriman tidak pasti; cegah payload berubah selama pemeriksaan ulang.
- [x] Tidak ada notifikasi sistem foreground/sukses; perhatian latar belakang dikelompokkan per buku.
- [x] Perbaiki pembukaan buku dari tautan notifikasi dan pemulihan kamera.
- [x] Verifikasi tipe, tes otomatis, build development, dan kompilasi Java tanpa membuat APK.
- [ ] Jalankan seluruh matriks pada perangkat Android fisik.
- [ ] Persetujuan UAT operasional dan otorisasi release/deploy terpisah.

## Audit signature sebelum mengubah pola ambigu

Daftar lengkap terakhir pengguna adalah sumber otoritatif. Tidak ada pola yang dipotong, diubah, dihapus, atau ditambahkan dari contoh instruksi awal.

- Jumlah: **154 pola**, seluruhnya unik secara identik.
- Distribusi panjang AWB: 9 karakter = 1 pola; 11 = 2; 12 = 4; 13 = 10; 14 = 3; 15 = 34; 16 = 100.
- Literal tunggal: **RMA911008**, hanya cocok persis setelah normalisasi yang didokumentasikan.
- `$333260100######` mengandung tanda dolar literal; tanda ini dipertahankan pada scan, draft, backend, worker, dan impor sumber.
- Tanda hubung pada BSC-, DICOM-, FF-, FP-35, JT-, VL- adalah literal dan wajib berada pada posisi yang sama.
- Ditemukan **217 pasangan overlap**. Contoh: BLIJC0450####### adalah subset BLIJC###########; 0701############ adalah subset 070#############.
- `BLIJC########` disebut sebagai duplikat dalam brief, tetapi tidak terdapat pada daftar lengkap terakhir. Daftar tersebut memuat BLIJC0450####### dan BLIJC########### sekali masing-masing. Sistem audit tetap mendeteksi duplikat identik melalui tes konfigurasi duplikat sintetis; pola tidak dihapus otomatis.
- PPIN dengan 9 dan 10 digit, serta TG dengan 10 dan 14 digit, memiliki panjang berbeda; bukan duplikat.
- Pola numerik luas tetap berisiko menerima barcode non-AWB yang kebetulan memiliki format sama. Allowlist tidak membuktikan kepemilikan, kategori, atau keberadaan resi pada upstream. Pemeriksaan bisnis dan hasil backend tetap berlaku.
- Signature 0101########### dikenali secara format, tetapi aturan Cashless lama tetap mengecualikan resi numerik berawalan 0101/0166. Allowlist tidak mengubah klasifikasi Manual.

Normalisasi mengikuti kontrak lama secara lebih terbatas dan sama di kedua sisi: huruf ASCII a–z menjadi A–Z; hanya spasi ASCII, tab, CR, dan LF di tepi dibuang. Nol awal, tanda dolar, tanda hubung, isi internal, Unicode, NUL, dan karakter lain dipertahankan untuk validasi. Middleware TrimStrings dikecualikan pada bidang AWB agar tidak membuang karakter bermakna sebelum pemeriksaan. Pencocokan sendiri case-sensitive terhadap hasil normalisasi; tidak memakai flag case-insensitive. Tidak ada ekstraksi resi dari QR/teks campuran.

Backend membaca JSON melalui config pickup; frontend membundel JSON yang sama. Perubahan daftar memerlukan build mobile dan cache config yang sesuai saat proses release yang nanti diotorisasi. Client lama dapat menerima lokal tetapi tetap ditolak server; client lama juga dapat menolak pola baru sampai aset diperbarui.

## Cakupan backend dan perlindungan historis

| Jalur | Penegakan |
| --- | --- |
| Pencatatan satu resi / Sertim | RecordCashlessAwb memvalidasi resi baru/pengganti setelah pemeriksaan replay dan otorisasi. |
| Handover web/mobile | RecordCashlessHandover memvalidasi setiap resi baru dan mencatat seluruh signature cocok pada audit. |
| Capture POP | FinalizePickup meneruskan hanya resi yang benar-benar baru ke action handover yang sama; error terkait dipetakan ke cashless_awbs. |
| Koreksi resi gagal web/mobile | CorrectFailedCashlessAwb memvalidasi pengganti setelah pemeriksaan replay, hak akses, status pasti, dan versi. |
| Replay pengiriman lama | Kunci dan payload identik yang sudah tersimpan dapat dikonfirmasi kembali meskipun konfigurasi signature berubah. |
| Impor laporan historis | Tidak diberi allowlist baru. Format historis tetap diterima sesuai kontrak impor lama; penerimaan karakter dolar ditambahkan agar signature sah tidak terputus di tahap laporan. |
| Worker dan antrean pemrosesan | Format umum yang sudah ada diperluas untuk dolar literal. Tidak ditambahkan retry input/approval yang hasilnya belum pasti. |

## Status dan penghitung

Ringkasan **Buku** menunjukkan seluruh resi tersimpan pada buku, masing-masing dihitung sekali berdasarkan percobaan terbaru. Berhasil berarti ACCEPTED + approved_at + batch DONE/PARTIAL. ACCEPTED sebelum approval masih Diproses. Percobaan lanjutan aktif ditampilkan Dicoba ulang; kegagalan pasti sebagai Gagal; UNKNOWN/PREVIOUSLY_ENTERED sebagai Periksa. Rekonsiliasi tidak disimpulkan dari hasil tersebut dan tetap mengikuti alur lama.

Ringkasan **Sesi buku** menghitung percobaan scan, duplikat, dan tidak valid di perangkat. Nilai dipertahankan pada draft buku, termasuk setelah daftar berhasil dikirim. Membuka buku lain memulai sesi buku baru. Jumlah draft/konfirmasi tertunda ditampilkan terpisah dan tidak dijumlahkan sebagai sukses backend. Menghapus resi draft tidak menghapus fakta percobaan scan.

Notifikasi audio backend dibatasi satu rangkaian umpan balik untuk kumpulan milestone baru dalam satu siklus polling. Kegagalan diprioritaskan bila sukses dan gagal tiba bersamaan. Identitas resi yang sudah diberi umpan balik disimpan terenkripsi per akun/environment/buku sebelum bunyi dipanggil, sehingga polling/masuk ulang tidak mengulang bunyi untuk hasil lama. Status dan riwayat tetap menjadi sumber konfirmasi bila suara tidak terdengar.

## Kebijakan notifikasi

1. Normal: penerimaan lokal, sukses, duplikat, penolakan format, antrean, serta percobaan rutin tetap di aplikasi; tidak membuat push sukses.
2. Perhatian: alert FAILED/PARTIAL/UNKNOWN tetap tersimpan meskipun izin push ditolak. Saat aplikasi aktif, gunakan indikator/teks aplikasi. Saat latar belakang, FCM memakai kanal perhatian cashless_processing yang sudah ada, dengan tautan batch yang divalidasi dan hak akses diperiksa ulang.
3. Kegagalan berulang dalam satu buku: satu tag `cashless-task-{task_id}` menggantikan item tray sebelumnya. Riwayat semua batch tetap tersedia di aplikasi. Deduplikasi database tetap per insiden/batch/perangkat; ini bukan penghapusan histori.

Kanal prioritas tinggi hanya untuk perhatian operasional yang memang diperlukan, bukan sukses biasa. Tidak mengubah pilihan kanal Android milik pengguna, sesuai [dokumentasi kanal Android](https://developer.android.com/develop/ui/compose/notifications/channels). Tidak ada permintaan akses kebijakan Jangan Ganggu. Backlog draft lokal terlihat melalui counter dan indikator offline; tidak ditambahkan layanan latar belakang atau pengiriman otomatis baru.

## Audit audio Android

Implementasi native yang sudah ada tetap menggunakan ToneGenerator pada STREAM_MUSIC, kini dipersiapkan sekali dan digunakan ulang. [API ToneGenerator](https://developer.android.com/reference/android/media/ToneGenerator) memakai pemilihan stream, bukan AudioAttributes yang dikustomisasi; tidak menggunakan USAGE_ALARM. Bunyi singkat tidak mengambil audio focus baru dan tidak mengubah volume media. Bunyi dihentikan saat pause dan sumber daya dilepas saat destroy.

Suara dihormati hanya ketika preferensi terkait aktif, mode dering normal, dan volume media lebih dari nol. Rute Bluetooth, DND, kebijakan OEM, kemampuan perangkat, dan pembatasan sistem masih dapat memengaruhi keluaran. Getaran memeriksa hasVibrator dan pengaturan haptic sistem; kegagalan haptic/audio tidak membatalkan pencatatan.

Pola awal: diterima 25 ms; berhasil 70 ms; gagal 150–80–150 ms; duplikat 35–45–35 ms. Tes suara tidak memicu getaran; tes getaran tidak memutar suara. Durasi dan latensi aktual belum diukur pada perangkat. Tidak ada klaim bypass mode senyap atau DND.

## Verifikasi otomatis

Hasil akhir dan perintah dicatat pada bagian verifikasi akhir di bawah. Fixture browser menggunakan API simulasi lokal dan token dummy; tes endpoint memakai database SQLite terisolasi. Tidak ada panggilan ke sistem Hybrid/FCM produksi.

Pengujian browser mencakup 375×812 terang, 390×844 gelap, 812×375 lanskap, dan 1280×900 gelap dengan reduced-motion. Pada semuanya diuji: membuka langsung buku, draft pulih setelah reload online maupun offline, duplikat/invalid tidak dikirim, fokus error, statistik, scan offline, respons terputus setelah commit simulasi, retry dengan payload/kunci identik, antrean bukan sukses, konfirmasi approval, kegagalan permanen, riwayat, preferensi, serta tidak ada overflow horizontal. Ini tidak membuktikan perilaku kamera/perangkat Android.

## Matriks UAT fisik — seluruhnya BELUM DIUJI

Tidak ada perangkat ADB ketika pemeriksaan dilakukan; pengguna memilih melanjutkan dengan UAT fisik belum diuji. Jangan mengubah status berikut menjadi lulus berdasarkan simulasi browser atau kompilasi Java.

| Kelompok | Kasus yang harus dicatat pada perangkat | Hasil aktual |
| --- | --- | --- |
| Signature | Numerik sah, alfanumerik sah, prefix salah, suffix salah, panjang salah, nol awal, hyphen literal, konfigurasi duplikat, overlap, literal persis, barcode non-AWB, dolar literal | BELUM DIUJI |
| Proses | Sukses dengan approval, diterima tetapi antre, backend gagal, putus jaringan, percobaan ulang yang diotorisasi, gagal permanen, duplikat, scan beruntun, background/foreground, interupsi proses | BELUM DIUJI |
| Suara | Volume media normal, rendah, nol; senyap; getar; DND; Bluetooth; latensi dan pemindaian berulang | BELUM DIUJI |
| Getaran | Aktif/nonaktif, perangkat tanpa vibrator, perbedaan pola, pembatasan OEM | BELUM DIUJI |
| Kamera | Izin ditolak/diberikan, kamera dipakai aplikasi lain, pause/resume saat mulai, senter, rotasi, recovery error, process death | BELUM DIUJI |
| Notifikasi | Tidak ada spam sukses, retry terlihat in-app, kegagalan meminta perhatian, satu item per buku di background, deduplikasi, izin ditolak, tap menuju batch benar | BELUM DIUJI |

Untuk setiap kasus rekam model perangkat, versi Android, versi/build aplikasi, pengaturan volume/ringer/DND/Bluetooth, masukan, status backend, hasil visual, suara yang benar-benar terdengar, getaran yang benar-benar terasa, latensi, serta LULUS/GAGAL. Jangan menandai bypass senyap sebagai LULUS tanpa bukti perangkat.

## Keterbatasan dan penilaian kesiapan APK

- UAT fisik, proses kamera native, latensi audio, DND/Bluetooth/OEM, dan pengiriman push latar belakang nyata belum diverifikasi.
- Polling 5 detik berjalan saat layar aktif, bukan layanan pemrosesan latar belakang. Ketika offline, status server terakhir bisa usang dan tidak dianggap hasil baru.
- Retry cashless tidak dibuat otomatis tiga kali secara generik. Input/approval upstream yang hasilnya belum pasti tetap memerlukan pemeriksaan aman sesuai alur bisnis lama; UI menjelaskan tidak ada pengiriman ulang otomatis dari perangkat.
- Riwayat progres ringkas memuat 50 resi terbaru; daftar tersimpan yang dipaginasi dan hasil batch lama tetap tersedia.
- Kanal perhatian Android existing dipertahankan; pilihan pengguna tidak dipaksa berubah. Grouping tray berbasis buku menampilkan tautan insiden terbaru; insiden lain tetap ada dalam riwayat.
- Shared JSON menyamakan sumber konfigurasi, tetapi binary lama tidak memperoleh pola baru tanpa build yang sesuai.
- Peringatan ukuran bundle mobile >500 kB masih muncul; tidak dilakukan refactor besar untuk mengubah arsitektur.
- Build development dan kompilasi Java adalah kesiapan teknis untuk lanjut UAT, **bukan persetujuan APK release**. Release belum layak dinyatakan siap operasional sampai matriks perangkat dan persetujuan pengguna selesai.

## Lampiran — pasangan overlap

Overlap ditentukan secara matematis: panjang sama dan setiap posisi memiliki literal sama, dua #, atau # berhadapan dengan digit literal. Semua pola tetap dipertahankan. Satu resi yang cocok dengan beberapa pola hanya diterima satu kali.

| Pola A | Pola B |
| --- | --- |
| `#############260` | `######260#######` |
| `#############260` | `####260#########` |
| `#############260` | `##260###########` |
| `#############260` | `0000############` |
| `#############260` | `01##############` |
| `#############260` | `0211############` |
| `#############260` | `029830##########` |
| `#############260` | `070#############` |
| `#############260` | `0701############` |
| `#############260` | `0751############` |
| `#############260` | `18645###########` |
| `#############260` | `2600############` |
| `#############260` | `51972###########` |
| `#############260` | `630#############` |
| `#############260` | `8811############` |
| `############260#` | `######260#######` |
| `############260#` | `####260#########` |
| `############260#` | `##260###########` |
| `############260#` | `0000############` |
| `############260#` | `01##############` |
| `############260#` | `0211############` |
| `############260#` | `029830##########` |
| `############260#` | `070#############` |
| `############260#` | `0701############` |
| `############260#` | `0751############` |
| `############260#` | `18645###########` |
| `############260#` | `2600############` |
| `############260#` | `51972###########` |
| `############260#` | `630#############` |
| `############260#` | `8811############` |
| `######260#######` | `##260###########` |
| `######260#######` | `0000############` |
| `######260#######` | `01##############` |
| `######260#######` | `0211############` |
| `######260#######` | `029830##########` |
| `######260#######` | `070#############` |
| `######260#######` | `0701############` |
| `######260#######` | `0751############` |
| `######260#######` | `18645###########` |
| `######260#######` | `2600############` |
| `######260#######` | `51972###########` |
| `######260#######` | `630#############` |
| `######260#######` | `8811############` |
| `#####0#######20` | `0101###########` |
| `#####0#######20` | `0125###########` |
| `#####0#######20` | `0499###########` |
| `#####0#######20` | `0500###########` |
| `#####0#######20` | `06#############` |
| `#####0#######20` | `07#############` |
| `#####0#######20` | `1056###########` |
| `#####0#######20` | `1641###########` |
| `#####0#######20` | `1771###########` |
| `#####0#######20` | `2196###########` |
| `#####0#######20` | `2262###########` |
| `#####0#######20` | `2546###########` |
| `#####0#######20` | `260############` |
| `#####0#######20` | `327############` |
| `#####0#######20` | `4701###########` |
| `#####0#######20` | `5087###########` |
| `#####0#######20` | `52086000#######` |
| `#####0#######20` | `54#############` |
| `#####0#######20` | `62#############` |
| `#####0#######20` | `66848##########` |
| `#####0#######20` | `6974###########` |
| `#####0#######20` | `73#############` |
| `#####0#######20` | `95950##########` |
| `#####0#######21` | `0101###########` |
| `#####0#######21` | `0125###########` |
| `#####0#######21` | `0499###########` |
| `#####0#######21` | `0500###########` |
| `#####0#######21` | `06#############` |
| `#####0#######21` | `07#############` |
| `#####0#######21` | `1056###########` |
| `#####0#######21` | `1641###########` |
| `#####0#######21` | `1771###########` |
| `#####0#######21` | `2196###########` |
| `#####0#######21` | `2262###########` |
| `#####0#######21` | `2546###########` |
| `#####0#######21` | `260############` |
| `#####0#######21` | `327############` |
| `#####0#######21` | `4701###########` |
| `#####0#######21` | `5087###########` |
| `#####0#######21` | `52086000#######` |
| `#####0#######21` | `54#############` |
| `#####0#######21` | `62#############` |
| `#####0#######21` | `66848##########` |
| `#####0#######21` | `6974###########` |
| `#####0#######21` | `73#############` |
| `#####0#######21` | `95950##########` |
| `#####0#######22` | `0101###########` |
| `#####0#######22` | `0125###########` |
| `#####0#######22` | `0499###########` |
| `#####0#######22` | `0500###########` |
| `#####0#######22` | `06#############` |
| `#####0#######22` | `07#############` |
| `#####0#######22` | `1056###########` |
| `#####0#######22` | `1641###########` |
| `#####0#######22` | `1771###########` |
| `#####0#######22` | `2196###########` |
| `#####0#######22` | `2262###########` |
| `#####0#######22` | `2546###########` |
| `#####0#######22` | `260############` |
| `#####0#######22` | `327############` |
| `#####0#######22` | `4701###########` |
| `#####0#######22` | `5087###########` |
| `#####0#######22` | `52086000#######` |
| `#####0#######22` | `54#############` |
| `#####0#######22` | `62#############` |
| `#####0#######22` | `66848##########` |
| `#####0#######22` | `6974###########` |
| `#####0#######22` | `73#############` |
| `#####0#######22` | `95950##########` |
| `#####0#######23` | `0101###########` |
| `#####0#######23` | `0125###########` |
| `#####0#######23` | `0499###########` |
| `#####0#######23` | `0500###########` |
| `#####0#######23` | `06#############` |
| `#####0#######23` | `07#############` |
| `#####0#######23` | `1056###########` |
| `#####0#######23` | `1641###########` |
| `#####0#######23` | `1771###########` |
| `#####0#######23` | `2196###########` |
| `#####0#######23` | `2262###########` |
| `#####0#######23` | `2546###########` |
| `#####0#######23` | `260############` |
| `#####0#######23` | `327############` |
| `#####0#######23` | `4701###########` |
| `#####0#######23` | `5087###########` |
| `#####0#######23` | `52086000#######` |
| `#####0#######23` | `54#############` |
| `#####0#######23` | `62#############` |
| `#####0#######23` | `66848##########` |
| `#####0#######23` | `6974###########` |
| `#####0#######23` | `73#############` |
| `#####0#######23` | `95950##########` |
| `#####0#######24` | `0101###########` |
| `#####0#######24` | `0125###########` |
| `#####0#######24` | `0499###########` |
| `#####0#######24` | `0500###########` |
| `#####0#######24` | `06#############` |
| `#####0#######24` | `07#############` |
| `#####0#######24` | `1056###########` |
| `#####0#######24` | `1641###########` |
| `#####0#######24` | `1771###########` |
| `#####0#######24` | `2196###########` |
| `#####0#######24` | `2262###########` |
| `#####0#######24` | `2546###########` |
| `#####0#######24` | `260############` |
| `#####0#######24` | `327############` |
| `#####0#######24` | `4701###########` |
| `#####0#######24` | `5087###########` |
| `#####0#######24` | `52086000#######` |
| `#####0#######24` | `54#############` |
| `#####0#######24` | `62#############` |
| `#####0#######24` | `66848##########` |
| `#####0#######24` | `6974###########` |
| `#####0#######24` | `73#############` |
| `#####0#######24` | `95950##########` |
| `#####00######25` | `0101###########` |
| `#####00######25` | `0125###########` |
| `#####00######25` | `0499###########` |
| `#####00######25` | `0500###########` |
| `#####00######25` | `06#############` |
| `#####00######25` | `07#############` |
| `#####00######25` | `1056###########` |
| `#####00######25` | `1641###########` |
| `#####00######25` | `1771###########` |
| `#####00######25` | `2196###########` |
| `#####00######25` | `2262###########` |
| `#####00######25` | `2546###########` |
| `#####00######25` | `260############` |
| `#####00######25` | `327############` |
| `#####00######25` | `4701###########` |
| `#####00######25` | `5087###########` |
| `#####00######25` | `52086000#######` |
| `#####00######25` | `54#############` |
| `#####00######25` | `62#############` |
| `#####00######25` | `66848##########` |
| `#####00######25` | `6974###########` |
| `#####00######25` | `73#############` |
| `#####00######25` | `95950##########` |
| `#####00######26` | `0101###########` |
| `#####00######26` | `0125###########` |
| `#####00######26` | `0499###########` |
| `#####00######26` | `0500###########` |
| `#####00######26` | `06#############` |
| `#####00######26` | `07#############` |
| `#####00######26` | `1056###########` |
| `#####00######26` | `1641###########` |
| `#####00######26` | `1771###########` |
| `#####00######26` | `2196###########` |
| `#####00######26` | `2262###########` |
| `#####00######26` | `2546###########` |
| `#####00######26` | `260############` |
| `#####00######26` | `327############` |
| `#####00######26` | `4701###########` |
| `#####00######26` | `5087###########` |
| `#####00######26` | `52086000#######` |
| `#####00######26` | `54#############` |
| `#####00######26` | `62#############` |
| `#####00######26` | `66848##########` |
| `#####00######26` | `6974###########` |
| `#####00######26` | `73#############` |
| `#####00######26` | `95950##########` |
| `####260#########` | `0000############` |
| `####260#########` | `01##############` |
| `####260#########` | `0211############` |
| `####260#########` | `070#############` |
| `####260#########` | `0701############` |
| `####260#########` | `0751############` |
| `####260#########` | `2600############` |
| `####260#########` | `51972###########` |
| `####260#########` | `630#############` |
| `####260#########` | `8811############` |
| `##260###########` | `01##############` |
| `070#############` | `0701############` |
| `BLIJC0450#######` | `BLIJC###########` |


## Verifikasi akhir

| Pemeriksaan | Hasil akhir |
| --- | --- |
| Endpoint, bisnis, pipeline, dan konkurensi PHP | 248 tes lulus pada run terarah, termasuk klaim AWB bersamaan pada database MySQL sementara. |
| Browser web Sertim, koreksi, sumber, dan rekonsiliasi | 1 tes tambahan lulus setelah selector tes lama disesuaikan dari summary ke tombol disclosure serta dari select native ke combobox yang memang sudah digunakan UI. Total PHP terverifikasi: **249 tes**. |
| JavaScript/Vitest | **269 tes lulus**, 10 berkas. Meliputi seluruh 154 signature, overlap, duplikat konfigurasi, normalisasi, feedback, preferensi, journal, status, transport, dan lifecycle scanner. |
| Worker upstream dengan fixture lokal | **35 tes lulus**; mencakup dolar literal sampai ekspor/approval, hasil tidak pasti, lost acknowledgment, retry report tanpa input ulang, serta verifikasi lebih dari 50 resi. |
| Browser mobile simulasi | **4 skenario ukuran/tema lulus**, termasuk reload offline dan payload retry identik. |
| TypeScript | `npm run types:check` lulus untuk web dan mobile. |
| Lint terarah | Lulus pada kode signature, feedback, scanner, progres, pengaturan, dan panel yang diubah. |
| Format | Pint dengan --dirty --format agent dibatasi pada berkas PHP terkait; format frontend terarah lulus. |
| Build web | `npm run build` berhasil. Peringatan fontaine opsional tidak ditindaklanjuti dengan perubahan dependensi. |
| Build mobile | `npm run build:mobile` dan `npx cap copy android` berhasil. Ini aset development, bukan APK release. |
| Kompilasi Android | compileDebugJavaWithJavac dan compileDebugAndroidTestJavaWithJavac berhasil. Tidak menjalankan assemble/package/release. Terdapat peringatan deprecated API Android dan flatDir. |
| Whitespace diff | `git diff --check` lulus; hanya peringatan normalisasi CRLF/LF Git yang sudah ada. |
| UAT fisik | **BELUM DIUJI**, pilihan pengguna. Kamera, latensi suara/getaran, ringer/DND/Bluetooth, dan push nyata belum dapat diberi status lulus. |

Perintah untuk mengulang tes mobile menggunakan konfigurasi mobile agar konstanta API tersedia. Origin berikut dummy, bukan tujuan server sungguhan; request transport pada tes dimock:

```powershell
$env:MOBILE_API_URL='https://uat.invalid'
npx vp test run --config vite.mobile.config.ts --root . resources/mobile/src/camera-scanner.test.ts resources/mobile/src/push.test.ts resources/js/lib/scan-feedback.test.ts resources/js/lib/awb-signatures.test.ts resources/js/lib/cashless-handover.test.ts resources/mobile/src/api.test.ts resources/mobile/src/cashless-handover.test.ts resources/mobile/src/cashless-scan-progress.test.tsx resources/mobile/src/local-store.test.ts resources/mobile/src/proof-draft.test.ts
npm run types:check
```

PHP CLI lokal belum mengaktifkan SQLite secara default. Tes dijalankan langsung dengan ekstensi yang sudah terpasang, tanpa mengubah php.ini atau dependensi:

```powershell
$env:OPENSSL_CONF='C:/laragon/bin/php/php-8.5.12-1-Win32-vs17-x64/extras/ssl/openssl.cnf'
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/pestphp/pest/bin/pest --compact tests/Feature/AwbSignatureTest.php tests/Feature/MobileCashlessHandoverTest.php tests/Feature/CashlessHandoverTest.php tests/Feature/PickupCashlessCaptureTest.php tests/Feature/FailedCashlessCorrectionTest.php tests/Feature/SertimCashlessTest.php tests/Feature/CashlessEntryAlertTest.php tests/Feature/JneReportAwbImportTest.php tests/Feature/JneReportSchedulingTest.php tests/Feature/CashlessEntryBatchTest.php tests/Feature/JneConfiguredReconciliationTest.php tests/Feature/JnePopReconciliationTest.php tests/Feature/SertimCashlessBrowserTest.php tests/Feature/SertimCashlessConcurrencyTest.php
```

Konkurensi menggunakan database MySQL sementara dengan nama acak dan menghapus hanya database fixture itu. Impor historis tetap diuji tanpa allowlist scan. Fixture lama yang sebelumnya memakai contoh resi bebas diganti menjadi resi signature sah; assertion izin, audit, jumlah final, dan rekonsiliasi dipertahankan.

Untuk simulasi mobile, jalankan Vite lokal pada port khusus di satu terminal, lalu runner pada terminal lain:

```powershell
$env:MOBILE_API_URL='http://127.0.0.1:8000'
npx vite --config vite.mobile.config.ts --mode development --host 127.0.0.1 --port 5179
```

```powershell
node tests/Browser/mobile-scan-uat.mjs
node --test workers/jne-report/test/cashless-entry.test.mjs workers/jne-report/test/hybrid-apex.test.mjs
```

Suite repository penuh belum diklaim lulus. Setelah ekstensi SQLite aktif pada PHP CLI/child process, jalankan `php artisan test --compact` untuk pemeriksaan menyeluruh sebelum persetujuan UAT/release. Tidak ada dependensi aplikasi yang ditambahkan atau diubah.
