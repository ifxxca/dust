# Retail Operations — audit dan implementasi web mobile/PWA

Tanggal: 11 November 2026. Status: implementasi lokal dan pengujian otomatis selesai; penerimaan perangkat fisik serta verifikasi environment HTTPS masih diperlukan. Tidak ada aplikasi iOS native, commit, push, deployment, reset/stash Git, atau perubahan data operasional.

## Arsitektur dan pemakaian ulang

Pengguna utama adalah pickup staff dan retail staff yang sudah memahami tugas operasional. Pekerjaan utama: membuka tugas sendiri, mencatat kunjungan, menyelesaikan POP, menyerahkan paket, dan memindai AWB. Data utama tetap customer, alamat, jadwal, status, jumlah paket, bukti, serta progres pemrosesan. Pengecualian penting adalah konflik versi, hasil kirim yang belum pasti, penolakan akses, AWB tidak valid, dan kegagalan proses.

Repositori memiliki dua frontend: web Inertia React v3 di `resources/js` dan React Capacitor di `resources/mobile`. Backend terpasang: Laravel 13.35.0, Fortify 1.41.0, Sanctum 4.3.3, Wayfinder 0.1.21, Pest 5.3.1. Frontend menggunakan React 19, Tailwind 4, shadcn/Radix, dan Capacitor 8. Tidak ditemukan `.ai/rules`; panduan AGENTS.md dan skill terkait diterapkan.

Pilihan implementasi: memakai ulang workspace React mobile yang sudah ada, dengan entry browser tersendiri. `/m` menyajikan shell publik tanpa data pengguna. `vite.pwa.config.ts` membangun aset ke `public/retail`; build Android tetap memakai `vite.mobile.config.ts`. Web Inertia dan modul bisnis desktop tetap tersedia. Tidak ada salinan action bisnis atau skema database baru.

| Area                | Dipakai ulang                                                                                       | Adaptasi browser                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Komponen visual     | shadcn Button/Input/Dialog, kartu tugas, progress, status, signature pad                            | Navigasi enam tujuan, target sentuh, safe area, input 16px, lebar kerja ponsel |
| Login               | Fortify `/login`, `/logout`, middleware akun aktif                                                  | Cookie sesi HttpOnly dan CSRF; tidak memakai bearer token native               |
| Tugas dan kunjungan | PickupTaskController, PickupExecutionController, policy, expected_version                           | Request cookie melalui route `retail.*`                                        |
| POP                 | ProofPanel, proof-draft, FinalizePickup, submission_key, bukti privat                               | Penyimpanan sementara di memori dan adapter file browser                       |
| Foto                | Galeri/review bukti dan validasi unggah backend                                                     | File input `capture=environment` atau galeri, resize JPEG, object URL          |
| Tanda tangan        | SignaturePad berbasis pointer dan pemeriksaan goresan                                               | Blob PNG dibuat langsung dari base64; tidak menggunakan fetch data URL         |
| Handover            | HandoverPanel, controller/action dan pemeriksaan revisi                                             | Transport cookie dan draft sementara                                           |
| Cashless            | CameraScanSession, antrean serial, progres, counter, riwayat, validasi AWB, correction/result panel | getUserMedia dan decoder ZXing yang dibundel lokal                             |
| Penyimpanan Android | SecureSession/MobileLocal native tetap tersedia                                                     | BrowserLocal terpisah; tidak meniru penyimpanan terenkripsi Android            |
| Pemberitahuan       | Feed notifikasi dan exception cashless yang sudah ada                                               | Notifikasi di dalam aplikasi; FCM/plugin native tidak dipanggil browser        |
| Riwayat/laporan     | Query tugas dan summary backend yang sudah ada                                                      | Ringkasan harian serta riwayat pribadi berbentuk kartu dan pagination          |
| Clock In/Out        | Tidak ditemukan implementasi operasional aktif                                                      | Tidak ditampilkan; placeholder Absensi/Fleet tidak muncul pada menu browser    |

Dependency decoder `@zxing/browser` 0.2.1 ditambahkan dengan persetujuan eksplisit pengguna. Peer yang terkunci adalah `@zxing/library` 0.23.0. Decoder dimuat ketika kamera dibuka. Tidak ada dependency lain yang diperbarui.

## Layout dan alur

Navigasi bawah: Beranda, Pickup, Handover, Scan AWB, Laporan, Profil. Pada layar sampai 360px, enam tujuan memakai dua baris agar hit target tetap minimal 44px. Navigasi disembunyikan saat keyboard atau pekerjaan terfokus memerlukan ruang. Notifikasi dapat dibuka dari Beranda/Profil. Alur pickup tetap bertahap: kunjungan, jumlah paket, foto opsional, tanda tangan wajib, review, lalu konfirmasi.

Tabel admin tidak digunakan sebagai halaman kerja mobile. Bantuan instalasi, pengaturan, dan detail bukti menggunakan disclosure/dialog yang sudah ada. Tidak ada menu pengelolaan akun, assignment admin, atau laporan admin pada workspace ini. Resource browser tidak menawarkan assignment admin dan membatasi eksekusi ke pickup staff seperti API mobile.

## Kontrak API dan autentikasi

Route browser di `routes/retail.php` menggunakan middleware `web`, `auth`, EnsureActiveUser, serta EnsureRetailMobileSession. Controller, Form Request, policy, action, idempotency key, dan event audit tetap sama dengan endpoint Android. Browser memakai origin yang sedang dibuka; URL dibuat melalui Wayfinder. Adapter memetakan path kontrak native ke route browser yang setara, mempertahankan parameter/query, serta menolak origin dan prefix yang salah.

| Kontrak                                   | Android                                         | Web/PWA                                           |
| ----------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Login                                     | POST `/api/mobile/v1/auth/tokens`               | POST `/login`, setelah GET `/sanctum/csrf-cookie` |
| Logout                                    | DELETE `/api/mobile/v1/auth/token`              | POST `/logout`                                    |
| Identitas                                 | GET `/api/mobile/v1/me`                         | GET `/m/api/v1/me`                                |
| Tugas, takeover, execution, visits, proof | `/api/mobile/v1/pickup-tasks/...`               | `/m/api/v1/pickup-tasks/...`                      |
| Pemeriksaan hasil kirim                   | `/api/mobile/v1/submissions/{key}`              | `/m/api/v1/submissions/{key}`                     |
| Bukti privat                              | `/api/mobile/v1/pickup-evidence/{id}`           | `/m/api/v1/pickup-evidence/{id}`                  |
| Handover                                  | `/api/mobile/v1/handovers/...`                  | `/m/api/v1/handovers/...`                         |
| Cashless/hasil/exception                  | `/api/mobile/v1/cashless-...` dan notifications | `/m/api/v1/cashless-...` dan notifications        |

Browser tidak melemahkan EnsureMobileToken. Cookie browser tidak dapat menggantikan token untuk endpoint native, dan bearer tidak mengautentikasi route browser. Properti `Session.token` pada adapter browser hanyalah UUID sementara untuk identitas pekerjaan UI; bukan kredensial autentikasi dan tidak dikirim sebagai Authorization. Masa berlaku sesi browser ditentukan Laravel, dengan 401/419 dikembalikan ke login. Pemeriksaan ulang dilakukan ketika aplikasi kembali terlihat dan ketika koneksi pulih.

AWB melewati helper lokal yang sama untuk kenyamanan input. Validasi otoritatif tetap pada endpoint penyimpanan/proof yang sudah ada, memakai ValidateAwbSignature; tidak ada endpoint validasi bisnis baru. Counter membedakan draft, tersimpan, diproses, berhasil, gagal, retry, dan perlu perhatian. Hasil sukses tidak membuat system notification per AWB. Hasil yang belum pasti diperiksa melalui submission lookup sebelum menawarkan kirim ulang; tidak ada retry tulis otomatis.

## Kemampuan browser dan fallback

Kamera memerlukan secure context dan `getUserMedia`. Decoder tidak bergantung pada BarcodeDetector yang dukungannya terbatas. Video menggunakan muted/playsInline; kamera belakang diminta sebagai preferensi, bukan jaminan. Izin ditolak, perangkat tidak tersedia, HTTPS tidak terpenuhi, atau kamera sedang dipakai menghasilkan pesan pemulihan dan pilihan input manual/scanner keyboard Bluetooth. Track dihentikan saat scanner ditutup atau aplikasi masuk background. Senter browser tidak dijanjikan.

Foto memakai file picker/capture yang tersedia pada browser. Gambar diubah menjadi JPEG maksimal 1920px sebelum dipakai ulang oleh alur unggah; backend tetap menentukan validitas dan batas akhir. File rusak/terlalu besar memberi kegagalan yang dapat dipulihkan. Jika HEIC tidak dapat didekode browser, gunakan JPEG. Kamera/galeri dapat berbeda antar perangkat.

Audio dipersiapkan lewat interaksi pointer/keyboard; feedback visual tetap tersedia bila audio diblokir. Getaran hanya dicoba bila API tersedia, tanpa janji dukungan iOS. Tidak ada klaim bahwa pengalaman browser identik dengan ML Kit atau plugin Android. Rujukan: [keterbatasan Barcode Detection API](https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API) dan [decoder browser ZXing](https://github.com/zxing-js/browser).

## Draft, offline, dan cache PWA

Draft browser, foto, tanda tangan, dan hasil capture berada dalam memori tab dan dipisahkan berdasarkan akun/environment. Logout, pergantian akun, atau sesi berakhir membersihkannya; object URL foto dibebaskan. Tidak ada token/bukti/draft persisten di localStorage, IndexedDB, atau Cache Storage. localStorage hanya dapat menyimpan preferensi feedback scanner yang tidak sensitif. Muat ulang, penutupan, atau penghentian tab oleh OS menghilangkan draft browser. Peringatan terlihat pada workspace; beforeunload membantu bila browser mendukungnya.

Tidak ada sinkronisasi/submission offline otomatis dan tidak ada janji pemulihan setelah OS menghentikan PWA. Draft terenkripsi Android tetap memakai plugin native. Penyimpanan persisten browser dan sinkronisasi penuh memerlukan desain enkripsi, pengelolaan kunci, rekonsiliasi, serta persetujuan terpisah.

Manifest menyediakan nama, bahasa, start URL `/m`, scope, display standalone, theme, serta ikon PNG 180/192/512 termasuk maskable. Worker disajikan lewat `/m/sw.js` dengan scope yang sesuai dan no-cache/no-store. Precache menggunakan allowlist aset publik build dan fetch tanpa cookie. API, login/logout, bukti, request tulis, serta navigasi di luar entry `/m` tidak di-cache. Navigasi online menuju server; ketika koneksi gagal, hanya shell statis publik yang dipakai. Shell offline tidak memuat akun atau tugas sebelumnya.

Versi cache mengikuti hash aset, shell, manifest, ikon, dan template worker. Worker baru menunggu; tidak ada skipWaiting otomatis. Tombol pembaruan dinonaktifkan ketika pekerjaan sibuk dan menampilkan konfirmasi kehilangan draft sebelum reload. Aktivasi membersihkan cache versi Retail sebelumnya, tanpa menghapus cache aplikasi lain. Perilaku mengikuti [siklus service worker](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers).

## Review keamanan

| Batas                   | Hasil lokal dan batas verifikasi                                                                                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Autentikasi             | Login/logout Fortify dan pemulihan sesi diuji dengan cookie nyata pada fixture Laravel                                                                                                                              |
| CSRF                    | Request tulis tanpa token mendapat 419; token valid mencapai validasi backend; fetch mengirim X-XSRF-TOKEN                                                                                                          |
| Peran                   | CS/akun nonaktif ditolak; retail/supervisor tidak dapat mengeksekusi pickup; fitur admin tidak ditampilkan                                                                                                          |
| Bukti privat            | URL tetap memerlukan autentikasi/policy; akun lain mendapat 404; no-store                                                                                                                                           |
| Idempotency/audit       | Replay POP, handover, dan cashless tidak menggandakan record; expected_version dan event audit dipertahankan                                                                                                        |
| Penyimpanan             | Tidak ada kredensial/bukti persisten pada browser; pergantian akun dan logout diuji                                                                                                                                 |
| Cache                   | Allowlist aset publik diuji pada worker dan browser; tidak ada respons operasional tersimpan                                                                                                                        |
| Kamera                  | Deteksi kemampuan, izin, stream sintetis, duplikat frame, dan penghentian track diuji; hardware nyata belum                                                                                                         |
| HTTPS/cookie deployment | Runtime menolak request operasional pada insecure context. TLS, secure cookie, proxy, HSTS, dan header aset statis pada environment tujuan belum diuji karena tidak ada deployment                                  |
| Dependency              | npm audit: 13 temuan, 10 moderate dan 3 critical, pada rantai tooling seperti vite-plus/oxfmt/tinypool dan Capacitor CLI. Paket decoder baru tidak tercantum. Tidak menjalankan audit fix atau perubahan versi lain |

Keterbatasan yang ditemukan dan diperbaiki melalui UAT otomatis: navigasi Handover awal tidak memilih panel yang tepat; penyimpanan tanda tangan menggunakan fetch data URL yang diblokir CSP; warning hasil kirim yang belum pasti belum dibersihkan setelah rekonsiliasi sukses; klasifikasi error decoder berbasis constructor.name tidak stabil setelah minifikasi. Adapter kini memakai jenis exception stabil dari decoder. CSP tidak dilonggarkan untuk data URL fetch.

## Menjalankan dan menyiapkan rilis

`npm run build` membangun web utama dan PWA. Untuk membangun PWA saja, gunakan `npm run build:pwa`. `npm run build:ssr` mencakup build PWA sebelum SSR. Decoder yang terkunci memerlukan Node 24 untuk tooling build. Hasil `public/retail` adalah artefak build yang diabaikan Git. Sediakan artefak tersebut saat deployment yang nantinya diotorisasi; controller memberikan 503 yang jelas jika shell belum dibangun. Tidak diperlukan migration baru atau Capacitor sync untuk PWA.

Buka route bernama `retail.app` pada environment yang menjalankan perubahan ini. Pada iPhone Safari: Bagikan → Tambahkan ke Layar Utama → aktifkan Open as Web App bila tersedia → Tambahkan. Panduan juga tersedia melalui Profil. Lokasi tombol Bagikan dapat berbeda menurut layout Safari; lihat [panduan resmi Apple](https://support.apple.com/en-eg/guide/iphone/iphea86e5236/ios). Instalasi dan peluncuran standalone pada perangkat fisik belum dilakukan.

## Pengujian otomatis

Perintah yang digunakan:

```text
npm run test:mobile
npm run types:check
npm run build:pwa
npm run build:mobile
node tests/Browser/retail-pwa.mjs
php -d extension=pdo_sqlite -d extension=sqlite3 vendor/bin/pest tests/Feature/RetailMobileTest.php tests/Feature/MobileAuthenticationTest.php tests/Feature/MobileExecutionTest.php tests/Feature/MobileProofTest.php tests/Feature/MobileHandoverTest.php tests/Feature/MobileCashlessHandoverTest.php tests/Feature/MobileRevocationTest.php tests/Feature/AwbSignatureTest.php tests/Feature/Auth/AuthenticationTest.php --compact --do-not-cache-result
```

Driver SQLite yang sudah terpasang diaktifkan hanya pada proses tes; php.ini tidak diubah. PHPUnit memakai SQLite `:memory:`. UAT browser membuat database baru bernama `retail-pwa.sqlite` di subdirektori unik `output/retail-pwa-*`, menolak penimpaan database, dan menjalankan server fixture lokal yang dihentikan setelah tes. Tidak ada pengujian tulis terhadap environment operasional.

| Pemeriksaan                                                  | Hasil                                                                                                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend terkait, termasuk 12 tes browser/session/shell baru  | 91 lulus, 1 dilewati, 743 assertions                                                                                                                         |
| Frontend mobile/shared                                       | 316 lulus pada 19 file                                                                                                                                       |
| TypeScript web dan mobile                                    | Lulus                                                                                                                                                        |
| PHPStan pada 9 file PHP terkait                              | Lulus, 0 error                                                                                                                                               |
| Build PWA dan frontend Android                               | Lulus; peringatan ukuran chunk utama masih ada                                                                                                               |
| Chromium dengan backend Laravel fixture                      | 11 kelompok skenario lulus, tanpa pageerror                                                                                                                  |
| Format                                                       | Pint untuk perubahan PHP dan formatter frontend dijalankan; isi 102 file PHP yang tidak terkait dilindungi/dipulihkan dari snapshot saat menjalankan --dirty |
| Lint                                                         | Perubahan baru diperiksa; pemeriksaan seluruh folder mobile juga menemukan warning yang sudah ada pada build-config.test.ts: await pada nilai non-Promise    |
| Safari/WebKit otomatis                                       | Belum dijalankan; runtime WebKit tidak terpasang                                                                                                             |
| iPhone Safari/PWA, Android Chrome fisik, APK Capacitor fisik | BELUM DIUJI                                                                                                                                                  |

Skenario Chromium mencakup login salah/benar, cookie HttpOnly, enam navigasi, viewport 320/390/430 dan landscape, wizard pickup, pemilihan foto, goresan tanda tangan, finalisasi POP dengan respons sengaja diputus, laporan pribadi, handover, input AWB valid/duplikat, izin kamera gagal, decoder Code 128 dari stream canvas sintetis, penghentian kamera, koneksi putus/pulih, worker update menunggu persetujuan, logout, isolasi akun, sesi berakhir pada foreground, pemeriksaan isi cache, dan shell offline. Stream sintetis bukan pengujian kamera perangkat fisik. Hasil tiap run tersimpan di `output/retail-pwa-*/results.json`.

Suite backend lengkap belum dijalankan untuk tugas ini. Jalankan `php artisan test --compact` pada environment tes yang mengaktifkan SQLite untuk memeriksa seluruh repositori.

## Checklist UAT perangkat fisik

Isi versi OS/browser/APK, nama penguji, waktu, hasil aktual, dan bukti pada setiap pelaksanaan. Semua kolom perangkat berikut berstatus **BELUM DIUJI**; hanya dapat diubah menjadi LULUS setelah benar-benar dilakukan.

| Skenario dan kriteria penerimaan                                                             | iPhone Safari | iPhone PWA | Android Chrome | Android Capacitor                          |
| -------------------------------------------------------------------------------------------- | ------------- | ---------- | -------------- | ------------------------------------------ |
| Login salah/benar, akun nonaktif, role yang tidak berhak                                     | Belum         | Belum      | Belum          | Belum                                      |
| Logout online dan pergantian akun tidak menampilkan data/draft akun sebelumnya               | Belum         | Belum      | Belum          | Belum                                      |
| Sesi berakhir saat aktif dan setelah kembali dari background memberi jalur login             | Belum         | Belum      | Belum          | Belum                                      |
| Daftar tugas, cari/filter, tugas tersedia, detail dan pembatasan akses                       | Belum         | Belum      | Belum          | Belum                                      |
| Mulai kunjungan, hasil terkumpul/tanpa paket, konflik versi                                  | Belum         | Belum      | Belum          | Belum                                      |
| POP: jumlah, review, finalisasi, hasil server dan audit                                      | Belum         | Belum      | Belum          | Belum                                      |
| Foto kamera/galeri, JPEG/PNG/HEIC, rotasi, batas file, hapus/preview, batal picker           | Belum         | Belum      | Belum          | Belum                                      |
| Tanda tangan dengan sentuhan, goresan kosong ditolak, hapus/ganti, unggah                    | Belum         | Belum      | Belum          | Belum                                      |
| Handover: kandidat, buat, verifikasi, close, kondisi perlu review                            | Belum         | Belum      | Belum          | Belum                                      |
| Kamera: izinkan/tolak/cabut izin, kamera belakang, fokus, cahaya rendah, stream berhenti     | Belum         | Belum      | Belum          | Belum                                      |
| AWB: signature valid/tidak valid, duplikat, scanner Bluetooth Enter, counter/progres/riwayat | Belum         | Belum      | Belum          | Belum                                      |
| Koneksi terputus sebelum/saat/sesudah POST; hasil diperiksa tanpa duplikasi                  | Belum         | Belum      | Belum          | Belum                                      |
| Lock screen, pergantian aplikasi, rotasi, OS menghentikan proses, pemulihan yang jelas       | Belum         | Belum      | Belum          | Belum                                      |
| Layar kecil/besar, notch/home indicator, keyboard, zoom, VoiceOver/TalkBack                  | Belum         | Belum      | Belum          | Belum                                      |
| Suara setelah interaksi; fallback visual tanpa audio/getaran; kegagalan jelas                | Belum         | Belum      | Belum          | Belum                                      |
| Instalasi, ikon, standalone, cold start online/offline, update ditunda/diterima              | Belum         | Belum      | Belum          | Tidak berlaku untuk PWA; regresi APK belum |
| Notifikasi exception dan riwayat; tidak ada system notification per AWB sukses               | Belum         | Belum      | Belum          | Belum                                      |

## Batas fitur dan pekerjaan lanjutan

- UAT Safari, PWA terpasang, kamera fisik, Bluetooth, dan regresi APK wajib dilakukan sebelum menyatakan siap produksi.
- Push background browser/APNs/Web Push belum diimplementasikan; feed di dalam aplikasi tersedia. FCM Android tetap memakai jalur lama.
- Draft browser belum persisten atau terenkripsi lintas restart. Full offline submission sengaja tidak ditambahkan tanpa desain sinkronisasi/enkripsi.
- Laporan mobile saat ini mencakup ringkasan harian dan riwayat pribadi; dashboard admin, ekspor, dan rentang tanggal lanjutan tidak dibangun ulang.
- Navigasi internal memakai state workspace; deep link per task/layar dan pemulihan riwayat browser belum ditambahkan.
- Fitur 2FA Fortify tidak diaktifkan pada konfigurasi saat audit. Jika diaktifkan kemudian, challenge browser workspace perlu dihubungkan ke alur tersebut sebelum rilis.
- TLS, secure cookie, CSP/header static hosting, service worker scope, dan jalur update pada domain target perlu diverifikasi ketika deployment sudah diotorisasi.
- Chunk utama PWA masih sekitar 591 kB sebelum gzip; decoder terpisah sekitar 478 kB dan dimuat saat scan. Optimasi lanjutan menunggu pengukuran pada iPhone sasaran.
- Temuan dependency tooling perlu ditangani dalam perubahan versi yang disetujui terpisah.
