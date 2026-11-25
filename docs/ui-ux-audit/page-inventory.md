# Page and Frontend Inventory

Tanggal: 24 Oktober 2026. Inventaris mencakup working copy yang ada saat audit. Semua 29 file halaman Inertia didata; file tidak otomatis berarti route publik atau fitur selesai.

## Cakupan dan metode

- Router aktual: 135 definisi, 63 GET/HEAD; lihat lampiran lengkap di bawah dan [JSON route](evidence/routes.json).
- Frontend: 215 file / 48.988 baris pada `resources/js`, `resources/css`, dan `resources/mobile`, termasuk test, CSS, HTML, types, dan utilities. File TypeScript route/action hasil generate, vendor, node_modules, build/dist, dan artefak presentasi dikecualikan dari hitungan sumber UI yang ditinjau. Router tetap diinventarisasi terpisah.
- AST scan memetakan import, tag UI, kontrol, dan kandidat state untuk semua file tersebut. Pembacaan manual berfokus pada entry point, halaman, komponen bersama, navigasi, formulir, workflow, dan temuan. Ini bukan klaim setiap baris dieksekusi atau setiap branch diuji.
- Frekuensi di tabel adalah **perkiraan tugas berdasarkan alur dan peran**, bukan telemetry penggunaan. Complexity berdasarkan jumlah state, keputusan, dan aksi; bukan ukuran bundle.
- Status browser berarti dirender/dijalankan pada fixture audit, bukan bukti worker, email, notifikasi, atau integrasi produksi berhasil.

## Seluruh file halaman Inertia

| ID | Page / route | Peran operasional | Tugas utama | Frekuensi perkiraan | Complexity | Status implementasi / verifikasi |
| --- | --- | --- | --- | --- | --- | --- |
| P01 | [welcome](../../resources/js/pages/welcome.tsx)<br>`/` | Publik | Memahami produk dan menuju login | Sesekali | Low | Aktif; browser. [Screenshot](screenshots/public-welcome.png). |
| P02 | [auth/login](../../resources/js/pages/auth/login.tsx)<br>`/login` | Semua pengguna | Masuk ke workspace | Awal shift / session habis | Low | Aktif; login empat role berhasil pada fixture. [Screenshot](screenshots/auth-login.png). |
| P03 | [auth/forgot-password](../../resources/js/pages/auth/forgot-password.tsx)<br>`/forgot-password` | Pengguna kehilangan akses | Meminta tautan reset | Sesekali | Low | Aktif; render, pengiriman email tidak diuji. [Screenshot](screenshots/auth-forgot.png). |
| P04 | [auth/reset-password](../../resources/js/pages/auth/reset-password.tsx)<br>`/reset-password/{token}` | Pengguna reset password | Membuat password baru | Sesekali | Low | Aktif; form token audit invalid dirender; reset tidak dikirim. [Screenshot](screenshots/auth-reset-token-form.png). |
| P05 | [auth/verify-email](../../resources/js/pages/auth/verify-email.tsx)<br>`/email/verify` | Pengguna belum terverifikasi, jika kontrak/config berlaku | Verifikasi email dan kirim ulang | Kondisional | Low | Route/file ada; state unverified belum diuji. Code review saja untuk state ini. |
| P06 | [auth/confirm-password](../../resources/js/pages/auth/confirm-password.tsx)<br>`/user/confirm-password` | Pengguna menuju aksi sensitif | Konfirmasi password sebelum Security | Sesekali | Low | Gate dan submit password fixture berhasil. [Screenshot](screenshots/settings-security-gate.png). |
| P07 | [auth/register](../../resources/js/pages/auth/register.tsx)<br>`Tidak ada GET /register aktif` | Publik, fallback source | Menjelaskan akun dibuat Admin | Tidak rutin | Low | File fallback saja; self-registration tidak tersedia. Code review saja untuk state ini. |
| P08 | [dashboard](../../resources/js/pages/dashboard.tsx)<br>`/dashboard` | Admin/Supervisor, CS, Retail, Pickup melalui role dispatch | Memilih pekerjaan berikutnya / memantau ringkasan | Harian / per shift | High | Aktif; admin, CS, retail dirender; role pickup melalui tugasnya. [Screenshot](screenshots/dashboard.png). |
| P09 | [customers](../../resources/js/pages/customers.tsx)<br>`/operations/customers` | CS, Admin/Supervisor | Cari, tambah, edit, aktif/nonaktif customer | Harian | Medium | Aktif; filter, pagination, dialog, 422, loading/error/retry diuji. [Screenshot](screenshots/customers.png). |
| P10 | [operations](../../resources/js/pages/operations.tsx)<br>`/operations/{screen?}/{task?}` | Tergantung screen; lihat matriks di bawah | Kelola task, penugasan, detail, dan pengguna | Harian | High | Aktif multiplex; customers legacy tidak dirutekan ke file ini. [Screenshot](screenshots/pickup-operations.png). |
| P11 | [pickup-schedules](../../resources/js/pages/pickup-schedules.tsx)<br>`/pickup-schedules` | CS, Admin/Supervisor | Kelola jadwal pickup regular | Harian / berkala | High | Aktif; default dan responsive dirender; jadwal tidak diubah. [Screenshot](screenshots/schedules.png). |
| P12 | [pickup-wizard](../../resources/js/pages/pickup-wizard.tsx)<br>`/operations/execute/{task}` | Pickup/Retail/Admin yang ditugaskan dan memenuhi policy | Hasil kunjungan → jumlah → bukti → review POP | Setiap pickup | High | Aktif; kunjungan fixture disimpan; sampai tahap bukti diuji; final tidak dikirim. [Screenshot](screenshots/pop-evidence-step.png). |
| P13 | [pickup-results](../../resources/js/pages/pickup-results.tsx)<br>`/hasil-pickup` | Admin/Supervisor | Monitoring processing atau hasil pickup | Harian | High | Aktif wrapper dua mode; default processing dan mode pickup/sorting diuji. [Screenshot](screenshots/pickup-results.png). |
| P14 | [pickup-result-detail](../../resources/js/pages/pickup-result-detail.tsx)<br>`/hasil-pickup/{task}` | Admin/Supervisor | Periksa hasil, koreksi, processing, receipt, keterkaitan handover/JNE | Harian, saat pengecekan | High | Aktif; detail dirender, mutation/kirim receipt tidak diuji. [Screenshot](screenshots/pickup-result-detail.png). |
| P15 | [handover](../../resources/js/pages/handover.tsx)<br>`/handover/{session?}; ?history=1` | Pickup Staff, Retail Staff, Admin/Supervisor sesuai kapabilitas | Buat/temukan session, kelola anggota, verifikasi fisik, tutup/reopen | Harian / per serah terima | High | Aktif list/detail/history; admin dan retail dirender; pemilihan mobile diuji. [Screenshot](screenshots/handover-detail.png). |
| P16 | [discrepancies](../../resources/js/pages/discrepancies.tsx)<br>`/discrepancies` | Role dengan canExecutePickup | Temukan selisih dan telusuri session/task | Harian / exception | High | Aktif; daftar fixture dengan selisih dirender. [Screenshot](screenshots/discrepancies.png). |
| P17 | [jne-customer-dashboard](../../resources/js/pages/jne-customer-dashboard.tsx)<br>`/admin/jne-monitoring/customer-dashboard` | Admin/Supervisor | Pilih customer, analisis volume, nilai, layanan, tujuan, server | Harian / analisis | High | Aktif; chart/table dan filter tersedia; default fixture dirender. [Screenshot](screenshots/customer-dashboard.png). |
| P18 | [jne-monitoring](../../resources/js/pages/jne-monitoring.tsx)<br>`/admin/jne-monitoring` | Admin/Supervisor | Cari AWB, status, customer, filter, quick detail | Harian / berulang | High | Aktif; filter DELIVERED, empty, Sheet, responsive diuji. [Screenshot](screenshots/shipments.png). |
| P19 | [jne-shipment](../../resources/js/pages/jne-shipment.tsx)<br>`/admin/jne-monitoring/{shipment}` | Admin/Supervisor | Periksa detail, sumber snapshot, dan kecocokan shipment | Harian / exception | High | Aktif; detail dirender; matching tidak dikirim. [Screenshot](screenshots/shipment-detail.png). |
| P20 | [jne-reconciliation](../../resources/js/pages/jne-reconciliation.tsx)<br>`/admin/jne-monitoring/reconciliation` | Admin/Supervisor | Cocokkan pickup dengan shipment/report | Harian / exception | High | Aktif; render fixture; kecocokan produksi tidak diuji. [Screenshot](screenshots/reconciliation.png). |
| P21 | [jne-profiles](../../resources/js/pages/jne-profiles.tsx)<br>`/admin/jne-monitoring/profiles` | Admin/Supervisor | Atur interval, sumber Hybrid/APEX, unresolved, account dan national flag | Berkala / konfigurasi | High | Aktif; editor/bulk/source components ditemukan; fixture profile disabled; tidak dijalankan. [Screenshot](screenshots/report-settings.png). |
| P22 | [jne-reports](../../resources/js/pages/jne-reports.tsx)<br>`/admin/jne-reports` | Admin/Supervisor | Minta report manual satu/banyak account dan tanggal | Sesuai kebutuhan | High | Aktif; form, limit/rencana bagian, responsive dirender; tidak menarik eksternal. [Screenshot](screenshots/report-request.png). |
| P23 | [jne-report-runs](../../resources/js/pages/jne-report-runs.tsx)<br>`/admin/report-runs` | Admin/Supervisor / developer berwenang | Pantau antrean, hasil, retry/recovery dan log | Harian / troubleshooting | High | Aktif; run fixture dan dialog log dibuka; retry tidak dikirim. [Screenshot](screenshots/report-history.png). |
| P24 | [jne-report-awbs](../../resources/js/pages/jne-report-awbs.tsx)<br>`/admin/jne-reports/{reportJob}/awbs` | Admin/Supervisor | Periksa AWB hasil report, filter/import/projection sesuai state | Saat pemeriksaan report | High | Aktif; table detail dirender; import/reproject tidak dikirim. [Screenshot](screenshots/report-awbs.png). |
| P25 | [jne-shipper-aliases](../../resources/js/pages/jne-shipper-aliases.tsx)<br>`/admin/jne-shipper-aliases` | Admin/Supervisor | Kelola alias shipper/customer, import dan sync | Berkala / saat identitas ambigu | High | Aktif; source dan halaman fixture dirender; import/sync tidak dikirim. [Screenshot](screenshots/shipper-aliases.png). |
| P26 | [push-test](../../resources/js/pages/push-test.tsx)<br>`/admin/push-test` | Admin/Supervisor | Diagnostik perangkat dan pengiriman notifikasi | Sesekali / developer | High | Aktif; UI dirender; push nyata tidak dikirim. [Screenshot](screenshots/admin-push-test.png). |
| P27 | [settings/profile](../../resources/js/pages/settings/profile.tsx)<br>`/settings/profile` | Pengguna login | Edit profil, status verifikasi, konfirmasi hapus akun | Sesekali | Medium | Aktif; dirender; perubahan/hapus tidak dikirim. [Screenshot](screenshots/settings-profile.png). |
| P28 | [settings/security](../../resources/js/pages/settings/security.tsx)<br>`/settings/security` | Pengguna verified, password confirmation | Mengganti password | Sesekali | Medium | Aktif; gate dilalui; form dirender; password tidak diubah. [Screenshot](screenshots/settings-security.png). |
| P29 | [settings/appearance](../../resources/js/pages/settings/appearance.tsx)<br>`/settings/appearance` | Pengguna verified | Pilih Light/Dark/System | Sesekali | Low | Aktif; state semantics dan tema header diperiksa. [Screenshot](screenshots/settings-appearance.png). |

## Varian screen di route operasi

Satu route Laravel memiliki beberapa layar nyata. Gate role dan policy diperiksa pada `routes/web.php:89`–`:132`; kebijakan backend tidak diubah atau dinilai sebagai security penetration test.

| Screen | Peran yang diterima route | Tugas | Implementasi / bukti |
| --- | --- | --- | --- |
| tasks / default | CS, Admin, Pickup, Retail | Daftar dan pengelolaan task sesuai kapabilitas | operations.tsx + PickupOperationalList; admin/CS dirender |
| mine | Pickup, Retail, Admin | Tugas yang ditangani / riwayat melalui history=1 | Daftar role pickup dirender; filter/pagination source ada |
| available | Pickup, Retail, Admin | Tugas/kandidat yang bisa diambil sesuai policy | Source + fixture staff-available; takeover tidak dikirim |
| create | CS, Admin, Pickup | Buat pickup on-demand | CreatePickup + CustomerPicker; form dan dialog pemilih dibuka |
| detail/{task} | CS, Admin, Pickup, Retail + view policy | Periksa task, hasil, bukti, aksi lifecycle | Detail task fixture dirender; aksi assignment/cancel/retry tidak dikirim |
| execute/{task} | Pickup, Retail, Admin + penugasan ke pengguna tersebut | Jalankan kunjungan dan POP | pickup-wizard.tsx; tahap hasil, jumlah dan bukti diuji pada fixture |
| customers | CS, Admin | Master customer | Early return ke customers.tsx; cabang customer di operations.tsx bukan halaman aktif kedua |
| users | Admin | Daftar, tambah/edit akun/role/active | operations.tsx, editor/dialog dan table; dirender desktop/mobile, akun tidak diubah |
| screen lain | Tidak ada role yang diterima | Tidak tersedia | 403 dari whitelist; bukan halaman placeholder yang harus diselesaikan |

## Jalur kerja yang benar-benar tersedia

| Workflow | Entry → hasil kerja | Komponen / state penting | Batas verifikasi |
| --- | --- | --- | --- |
| Scheduling | Customer → jadwal regular atau pickup on-demand → task | CreatePickup, CustomerPicker, PickupSchedules; jadwal dan petugas | Form dirender, picker diuji; jadwal baru tidak disimpan |
| Pickup execution | Tugas saya → detail → outcome → jumlah → bukti → review | PickupWizard, SignaturePad, proof/gallery; penanganan no-package, dirty navigation | Kunjungan fixture disimpan, sampai bukti; final POP tidak dikirim |
| Hasil / processing | Hasil Pickup default processing atau mode pickup → detail | PickupProcessingMonitoring, PickupMonitoring, detail sheet, koreksi/receipt | Default, sort/filter, detail dirender; koreksi/receipt tidak dikirim |
| Handover | Session → anggota → task → jumlah fisik → selisih/verifikasi → close | HandoverSessionList/Detail; independently counted quantities, guard dirty state, trace | Pilih task/scroll mobile diperiksa; verify/close/reopen tidak dikirim |
| Exceptions | Discrepancies → session/task; JNE reconciliation → resi/pickup | Table, status, detail links, matching | State fixture dirender; resolusi kasus bisnis belum diuji pengguna |
| Report manual | Tarik report → account/national/date → antrean → run/AWB → monitoring | JneReports, report period/limits/flow helpers, JneRunState, RunDialog | UI dan log fixture; tidak ada request eksternal atau download file live |
| Report otomatis | Pengaturan → Hybrid/APEX/unresolved/account/interval → run history | JnePullSettings, JneApexAccounts, bulk editor, interval/profile state | Source + UI, profile fixture disabled; scheduler/worker tidak dinilai end-to-end |
| Shipment/customer analysis | Monitoring/customer dashboard → status/filter → Sheet/detail | JneShipmentTable, CustomerDashboardCharts, prefix/server grouping, destination labels | Filter/empty/Sheet dan fixture; kebenaran master tujuan/amount produksi di luar audit UI |
| Identity/admin | Customer, alias shipper, pengguna, profil/security, push diagnostic | Forms, dialogs, import controls, confirmation | Render/read-only, kecuali invalid customer submit dan fixture password confirmation |

## Frontend native/mobile yang terpisah

`resources/mobile/src/main.tsx` memuat `MobileApp` dengan stylesheet sendiri yang mengimpor token web. Ini **bukan sekadar breakpoint halaman Inertia**. Ada 31 file frontend mobile, termasuk tests. Seluruhnya termasuk inventaris sumber; runtime Capacitor tidak dijalankan di perangkat fisik.

| Layar / state mobile | Sumber utama | Peran/tugas, frekuensi, complexity | Status |
| --- | --- | --- | --- |
| Boot/session/login | app.tsx, secure-session.ts | Petugas; awal shift; Medium | Implementasi source; secure session/error input tersedia; runtime native belum diverifikasi |
| Home / module menu | app.tsx, workspace-ui.tsx | Petugas; pilih pekerjaan; harian; Low | Source aktif untuk Pickup dan Handover Pickup |
| Pickup mine/available/history + filter | app.tsx, workspace-ui.tsx | Petugas; temukan tugas; berulang; High | Source pagination/filter/task cards; tidak disamakan dengan hasil browser web |
| Task detail / private proof | app.tsx, private-proof.tsx | Petugas; periksa tugas dan bukti; setiap task; High | Source implemented |
| Execution/outcome | execution-panel.tsx | Petugas; mulai/rekam kunjungan; setiap task; High | Source implemented; status/pending locks/recovery perlu device test |
| POP / foto / tanda tangan / review | proof-panel.tsx, photo-gallery.tsx, signature.ts, proof-draft.ts | Petugas/customer sender; setiap pickup berhasil; High | Source implemented; kamera dan gesture hardware belum diuji |
| Draft / offline recovery | draft-list.tsx, local-store.ts, secure-session.ts | Petugas; pulihkan pekerjaan; saat gangguan; High | Source implemented dan test files ada; audit tidak menjalankan bukti restart/offline native |
| Manual pickup | manual-pickup.tsx | Petugas; pencatatan pickup manual; sesuai kebutuhan; High | Source implemented; bukan portal publik |
| Handover session/detail/verification | handover-panel.tsx, handover.ts | Petugas berwenang; serah terima; harian; High | Source implemented; banyak state, physical-device verification masih perlu |
| Notifications | app.tsx, push.ts | Petugas; buka penugasan; per event; Medium | Source implemented; pengiriman FCM/permission tidak diuji |
| Account | app.tsx | Petugas; session/logout/info aplikasi; sesekali; Low | Source implemented |
| Modul lain bertanda Segera Hadir | workspace-ui.tsx:292–324 | Belum tersedia | Cashless/fleet/absensi/lainnya disabled; tidak dihitung sebagai workflow selesai atau defect fitur |

Sumber file pada tabel mobile berada di `resources/mobile/src/`. Source hanya merupakan bukti implementasi, bukan usability sign-off native.

## Layout, navigasi, dan komponen bersama

| Area | Implementasi aktif / reusable | Alternatif / catatan |
| --- | --- | --- |
| Resolver layout | resources/js/app.tsx:16; AppLayout → AppSidebarLayout | welcome tanpa shell; auth memakai AuthLayout; settings menambahkan SettingsLayout |
| App shell | AppShell, AppSidebar, AppSidebarHeader, AppContent/SidebarInset | AppHeaderLayout/AppHeader adalah alternatif source yang tidak dipilih resolver aktif; tidak dihitung sebagai halaman kedua |
| Auth shell | auth/auth-simple-layout.tsx | auth-card-layout dan auth-split-layout tersedia tetapi tidak aktif melalui AuthLayout saat ini |
| Sidebar | AppSidebar + NavMain/NavUser, role groups dan active matching | JNE memakai lib/jne-navigation.ts untuk menu/breadcrumb bersama; mobile sidebar memakai Sheet |
| Page width/spacing | PageContainer: fluid, wide max 1440, form max-w-3xl; Heading | Monitoring dapat lebih padat; auth/mobile memakai shell khusus secara wajar |
| Table | DataTable + pagination; 8 pemakai produksi langsung | CustomerDataTable, HandoverSessionList, JneShipmentTable, OperationalRoleDashboard, PickupOperationalList, Discrepancies, Operations, PickupSchedules |
| Table khusus | PickupMonitoring/Processing, reconciliation, report AWB, alias, chart data | Sticky/grouped table domain tidak harus dipaksa ke generic table |
| Filter/search | CustomerPicker, JneAccountInput, MonitoringWorkspace, period controls | URL-backed pada sebagian monitoring; local state pada daftar lain; UI-05 |
| Forms | CustomerForm, CreatePickup, user/schedule editors, JnePullSettings/ApexAccounts, settings/auth, verification | Pendekatan Inertia Form/useForm/useHttp hidup berdampingan; yang perlu seragam adalah perilakunya, bukan memaksa satu API |
| Dialog | CustomerDialog, CreatePickupDialog, CustomerPicker, schedule/user/profile editors, run log, delete account | Title/Description umumnya ada; dirty state dan error focus belum seragam |
| Sheet | MonitoringDetailSheet, JneShipmentDetailSheet, mobile sidebar | Focus trap/return diuji pada shipment Sheet; bukan bukti semua dialog telah diaudit keyboard penuh |
| Status | StatusBadge, ShipmentStatusBadge, JneRunState, processing/handover statuses | Perbedaan makna domain sah; jangan menggabungkan semua “selesai” ke satu enum |
| Feedback | Sonner Toaster, Alert/AlertError, InputError, EmptyState, Spinner, Skeleton, OperationalFeedback mobile | Customer loading/error/retry diuji; state lain sebagian source review |
| Charts | operational-dashboard-charts.tsx; jne-customer-dashboard-charts.tsx | Custom SVG + nilai/legenda; daily activity memiliki tabel alternatif; tidak perlu chart dependency baru |
| Input khusus | PasswordInput, SignaturePad, photo gallery, account parser, CustomerPicker | Form association, keyboard, hardware perlu evaluasi sesuai fungsi, bukan hanya primitive shadcn |

## Inventaris kontrol dan state per keluarga layar

| Keluarga | Form / actions | Table / filters | Overlay / feedback / loading / empty / error |
| --- | --- | --- | --- |
| Auth/settings | Login, remember, password show, reset request/reset, confirm, profile, password, delete account, appearance | Tidak memerlukan data grid | Inline InputError/spinner, delete confirmation; email success/token flow belum diuji |
| Customer/admin users | Create/edit, status, contact/location, role/active/password user | Search/status/pagination/columns; long name fixture | Customer dialog/mobile, skeleton, empty/error/retry; invalid contact diuji; draft loss |
| Operational task/schedule | Create/edit schedule, assign/bulk, takeover, cancel/retry, task detail | Status/type/date/staff/search, queue/list/cards, pagination | Create/picker/editor dialogs, notifications, loading/errors source; destructive actions tidak dijalankan |
| POP | Outcome, reason, kategori counts, notes, photo upload, signature, review/final | Detail proof dan comparison | Step feedback/dirty guard; physical camera/upload limits/recovery hanya source review |
| Hasil pickup | Monitoring switch, export/detail/correction/receipt/processing | Date basis/period/status/staff/customer/category/search, sort, columns, pagination | Detail Sheet, counts/snapshot state, empty/error/loading source; sort semantics diuji |
| Handover/discrepancy | Session create/amend, physical counts, notes, verify/close/reopen/correction | Session/history/status/search, member/task lists, discrepancy table | Confirmation/edit dialogs, guard dirty, trace, inline states; mobile selection friction verified |
| Shipment/customer dashboard | Filter, refresh, detail, match/reconciliation links | AWB/customer/server/status/service/destination/date sesuai screen; pagination | Quick Sheet, full detail, filtered/empty, freshness labels, charts; live data semantics belum diuji |
| Report request/settings/runs | Single/bulk account, national YES/NO, date presets, profile interval/source, unresolved, retry/recovery/download | Run status/source/search/page, AWB filters, logs | Form errors, disabled/busy state, stage badges, detail log dialog; report side effects tidak dijalankan |
| Shipper aliases | Create/edit/import/sync, customer linking | Search/filter/list/mapping table | Dialog/status/error source; import file dan sync tidak dijalankan |
| Push diagnostic | Select device/task, message/test/status | Device list/filter | Diagnostic feedback source/render; tidak mengirim notifikasi |

## Duplikasi dan status aktual

1. **Terbukti perlu dibersihkan setelah validasi entry point:** cabang customer legacy di operations.tsx sedangkan route aktif merender customers.tsx (UI-13).
2. **Pola berulang yang perlu penyelarasan perilaku:** busy-only close guard CustomerDialog/CreatePickupDialog, input/error association, local filter state, loading/empty descriptions. Reuse komponen existing sebelum menambah abstraction.
3. **Variasi sah:** status shipment versus pickup versus run; workflow tabel grouped/sticky versus master-data flat; mobile field execution versus admin desktop; lebar form versus monitoring. Tidak dihitung sebagai defect duplikasi.
4. **Source alternatif, bukan implementasi aktif ganda:** layout auth/card/split dan AppHeaderLayout. Keberadaannya bukan bukti menu tidak konsisten.
5. **Di luar fitur saat ini:** Customer Portal, self-service pickup publik, tracking publik pelanggan, dan official JNE API AWB generation. Tidak ada halaman aktif yang dapat disimpulkan hanya dari rencana masa depan tersebut.

## Lampiran A — Semua definisi route aktual

Tabel ini adalah inventaris router, **bukan audit kontrak API**. Placeholder `{id}` menunjukkan model binding/parameter, bukan URL bisnis sebenarnya. Endpoint data/file/framework ditandai agar tidak dihitung sebagai halaman.

| Method | Route pattern | Nama | Jenis |
| --- | --- | --- | --- |
| `GET|HEAD` | `/` | `home` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `_boost/browser-logs` | `boost.browser-logs` | Framework/dev/file/health; bukan halaman produk |
| `GET|HEAD` | `_inertia/devtools/entries` | `—` | Framework/dev/file/health; bukan halaman produk |
| `GET|HEAD` | `_inertia/devtools/entries/{id}` | `—` | Framework/dev/file/health; bukan halaman produk |
| `GET|HEAD` | `admin/jne-monitoring` | `jne-monitoring.index` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `admin/jne-monitoring/customer-dashboard` | `jne-monitoring.customer-dashboard` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `admin/jne-monitoring/profiles` | `jne-monitoring.profiles` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `admin/jne-monitoring/profiles` | `jne-monitoring.profile-store` | Action/auth mutation; bukan halaman |
| `POST` | `admin/jne-monitoring/profiles/bulk` | `jne-monitoring.profile-bulk` | Action/auth mutation; bukan halaman |
| `PUT` | `admin/jne-monitoring/profiles/{profile}` | `jne-monitoring.profile-update` | Action/auth mutation; bukan halaman |
| `POST` | `admin/jne-monitoring/rebuild` | `jne-monitoring.rebuild` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `admin/jne-monitoring/reconciliation` | `jne-monitoring.reconciliation` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `admin/jne-monitoring/reports/{reportJob}/review` | `jne-monitoring.review-report` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `admin/jne-monitoring/{shipment}` | `jne-monitoring.show` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `admin/jne-monitoring/{shipment}/match` | `jne-monitoring.match` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `admin/jne-reports` | `jne-reports.index` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `admin/jne-reports` | `jne-reports.store` | Action/auth mutation; bukan halaman |
| `POST` | `admin/jne-reports/recover` | `jne-reports.recover` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `admin/jne-reports/{reportJob}/awbs` | `jne-reports.awbs` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `admin/jne-reports/{reportJob}/download` | `jne-reports.download` | File/partial/action/redirect; bukan halaman mandiri |
| `POST` | `admin/jne-reports/{reportJob}/import-awbs` | `jne-reports.import-awbs` | Action/auth mutation; bukan halaman |
| `POST` | `admin/jne-reports/{reportJob}/project` | `jne-reports.project` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `admin/jne-shipper-aliases` | `jne-shipper-aliases.index` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `admin/jne-shipper-aliases` | `jne-shipper-aliases.store` | Action/auth mutation; bukan halaman |
| `POST` | `admin/jne-shipper-aliases/import` | `jne-shipper-aliases.import` | Action/auth mutation; bukan halaman |
| `POST` | `admin/jne-shipper-aliases/sync/{run}` | `jne-shipper-aliases.retry-sync` | Action/auth mutation; bukan halaman |
| `PUT` | `admin/jne-shipper-aliases/{alias}` | `jne-shipper-aliases.update` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `admin/push-test` | `push-test` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `admin/report-runs` | `report-runs.index` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `admin/report-runs` | `report-runs.store` | Action/auth mutation; bukan halaman |
| `POST` | `admin/report-runs/recover` | `report-runs.recover` | Action/auth mutation; bukan halaman |
| `POST` | `admin/report-runs/{reportJob}/retry-sources` | `report-runs.retry-sources` | Action/auth mutation; bukan halaman |
| `POST` | `api/internal/report-jobs/claim` | `internal.report-jobs.claim` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/internal/report-jobs/{reportJob}/fail` | `internal.report-jobs.fail` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/internal/report-jobs/{reportJob}/progress` | `internal.report-jobs.progress` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/internal/report-jobs/{reportJob}/source-upload` | `internal.report-jobs.source-upload` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/internal/report-jobs/{reportJob}/upload` | `internal.report-jobs.upload` | Endpoint data/mutation; bukan halaman |
| `DELETE` | `api/mobile/v1/auth/token` | `mobile.auth.destroy` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/auth/tokens` | `mobile.auth.store` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/customers` | `mobile.customers.index` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/handovers` | `mobile.handovers.index` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/handovers` | `mobile.handovers.store` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/handovers/candidates` | `mobile.handovers.candidates` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/handovers/{session}` | `mobile.handovers.show` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/handovers/{session}/close` | `mobile.handovers.close` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/handovers/{session}/items/{item}/verification` | `mobile.handovers.verify` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/handovers/{session}/members` | `mobile.handovers.amend` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/me` | `mobile.me` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/pickup-evidence/{attachment}` | `mobile.evidence` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/pickup-tasks` | `mobile.tasks.index` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/pickup-tasks` | `mobile.tasks.store` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/pickup-tasks/takeover-candidates` | `mobile.tasks.candidates` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/pickup-tasks/{task}` | `mobile.tasks.show` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/pickup-tasks/{task}/execution` | `mobile.tasks.start` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/pickup-tasks/{task}/proof` | `mobile.tasks.proof` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/pickup-tasks/{task}/retry` | `mobile.tasks.retry` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/pickup-tasks/{task}/takeover` | `mobile.tasks.takeover` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/pickup-tasks/{task}/visits` | `mobile.tasks.visit` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/mobile/v1/push-device` | `mobile.push.store` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/mobile/v1/submissions/{submission_key}` | `mobile.submissions.show` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/admin/push-test` | `api.push-test.store` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/admin/push-test/devices` | `api.push-test.devices` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/admin/push-test/{testId}` | `api.push-test.show` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/customers` | `api.customers.index` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/customers` | `api.customers.store` | Endpoint data/mutation; bukan halaman |
| `PATCH` | `api/v1/customers/{customer}` | `api.customers.update` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/discrepancies` | `api.discrepancies.index` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/handovers` | `api.handovers.index` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/handovers` | `api.handovers.store` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/handovers/candidates` | `api.handovers.candidates` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/handovers/{session}` | `api.handovers.show` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/handovers/{session}/close` | `api.handovers.close` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/handovers/{session}/items/{item}/corrections` | `api.handovers.correct` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/handovers/{session}/items/{item}/verification` | `api.handovers.verify` | Endpoint data/mutation; bukan halaman |
| `PATCH` | `api/v1/handovers/{session}/members` | `api.handovers.amend` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/handovers/{session}/reopen` | `api.handovers.reopen` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/me` | `api.me` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/pickup-evidence/{attachment}` | `api.evidence` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/pickup-notifications` | `api.pickup-notifications.index` | Endpoint data/mutation; bukan halaman |
| `PATCH` | `api/v1/pickup-notifications/read` | `api.pickup-notifications.update` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/pickup-schedules` | `api.schedules.index` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-schedules` | `api.schedules.store` | Endpoint data/mutation; bukan halaman |
| `PATCH` | `api/v1/pickup-schedules/{schedule}` | `api.schedules.update` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/pickup-staff` | `api.staff` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/pickup-tasks` | `api.tasks.index` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks` | `api.tasks.store` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/bulk-assignment` | `api.tasks.bulkAssign` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/pickup-tasks/takeover-candidates` | `api.tasks.candidates` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/pickup-tasks/{task}` | `api.tasks.show` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/assignment` | `api.tasks.assign` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/cancel` | `api.tasks.cancel` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/corrections` | `api.tasks.correct` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/execution` | `api.tasks.start` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/processing` | `api.tasks.processing` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/proof` | `api.tasks.proof` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/receipt` | `api.tasks.receipt` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/retry` | `api.tasks.retry` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/takeover` | `api.tasks.takeover` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/pickup-tasks/{task}/visits` | `api.tasks.visit` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `api/v1/users` | `api.users.index` | Endpoint data/mutation; bukan halaman |
| `POST` | `api/v1/users` | `api.users.store` | Endpoint data/mutation; bukan halaman |
| `PATCH` | `api/v1/users/{user}` | `api.users.update` | Endpoint data/mutation; bukan halaman |
| `GET|HEAD` | `dashboard` | `dashboard` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `discrepancies` | `discrepancies` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `email/verification-notification` | `verification.send` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `email/verify` | `verification.notice` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `email/verify/{id}/{hash}` | `verification.verify` | File/partial/action/redirect; bukan halaman mandiri |
| `GET|HEAD` | `forgot-password` | `password.request` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `forgot-password` | `password.email` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `handover/{session?}` | `handover` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `hasil-pickup` | `pickup-results.index` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `hasil-pickup/export` | `pickup-results.export` | File/partial/action/redirect; bukan halaman mandiri |
| `GET|HEAD` | `hasil-pickup/{task}` | `pickup-results.show` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `hasil-pickup/{task}/quick` | `pickup-results.quick` | File/partial/action/redirect; bukan halaman mandiri |
| `GET|HEAD` | `login` | `login` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `login` | `login.store` | Action/auth mutation; bukan halaman |
| `POST` | `logout` | `logout` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `operations/{screen?}/{task?}` | `operations` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `pickup-schedules` | `pickup-schedules` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `reset-password` | `password.update` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `reset-password/{token}` | `password.reset` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `sanctum/csrf-cookie` | `sanctum.csrf-cookie` | Framework/dev/file/health; bukan halaman produk |
| `GET|HEAD` | `settings` | `—` | File/partial/action/redirect; bukan halaman mandiri |
| `GET|HEAD` | `settings/appearance` | `appearance.edit` | Entry UI/auth; render/role dijelaskan di atas |
| `PUT` | `settings/password` | `user-password.update` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `settings/profile` | `profile.edit` | Entry UI/auth; render/role dijelaskan di atas |
| `PATCH` | `settings/profile` | `profile.update` | Action/auth mutation; bukan halaman |
| `DELETE` | `settings/profile` | `profile.destroy` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `settings/security` | `security.edit` | Entry UI/auth; render/role dijelaskan di atas |
| `GET|HEAD` | `storage/{path}` | `storage.local` | Framework/dev/file/health; bukan halaman produk |
| `PUT` | `storage/{path}` | `storage.local.upload` | Framework/dev/file/health; bukan halaman produk |
| `GET|HEAD` | `up` | `—` | Framework/dev/file/health; bukan halaman produk |
| `GET|HEAD` | `user/confirm-password` | `password.confirm` | Entry UI/auth; render/role dijelaskan di atas |
| `POST` | `user/confirm-password` | `password.confirm.store` | Action/auth mutation; bukan halaman |
| `GET|HEAD` | `user/confirmed-password-status` | `password.confirmation` | File/partial/action/redirect; bukan halaman mandiri |

## Lampiran B — Semua file frontend yang diinventarisasi

Per-file import, kontrol beserta baris/atribut, dan marker state tersedia dalam [frontend-inventory.json](evidence/frontend-inventory.json). Marker otomatis hanya kandidat pencarian; tidak dianggap defect tanpa pemeriksaan konteks. Counts JSX bersifat struktural dan dapat melewatkan komponen dinamis; file test tidak dianggap layar produksi.

| File | Baris (scan) | Primitive/struktur UI yang terdeteksi |
| --- | --- | --- |
| [resources/js/app.tsx](../../resources/js/app.tsx) | 44 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/alert-error.tsx](../../resources/js/components/alert-error.tsx) | 25 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/app-content.tsx](../../resources/js/components/app-content.tsx) | 20 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/app-header.tsx](../../resources/js/components/app-header.tsx) | 249 | Sheet, Button ×3 |
| [resources/js/components/app-logo-icon.tsx](../../resources/js/components/app-logo-icon.tsx) | 14 | svg |
| [resources/js/components/app-logo.tsx](../../resources/js/components/app-logo.tsx) | 20 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/app-shell.tsx](../../resources/js/components/app-shell.tsx) | 22 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/app-sidebar-header.tsx](../../resources/js/components/app-sidebar-header.tsx) | 74 | Button |
| [resources/js/components/app-sidebar.tsx](../../resources/js/components/app-sidebar.tsx) | 224 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/appearance-tabs.tsx](../../resources/js/components/appearance-tabs.tsx) | 46 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/breadcrumbs.tsx](../../resources/js/components/breadcrumbs.tsx) | 62 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/bulk-pickup-assignment.tsx](../../resources/js/components/bulk-pickup-assignment.tsx) | 223 | form, Dialog, Button ×4, Select |
| [resources/js/components/create-pickup-dialog.tsx](../../resources/js/components/create-pickup-dialog.tsx) | 54 | Dialog |
| [resources/js/components/create-pickup.tsx](../../resources/js/components/create-pickup.tsx) | 311 | form, Input, Button ×2 |
| [resources/js/components/customer-data-table.tsx](../../resources/js/components/customer-data-table.tsx) | 211 | DataTable, Button ×2 |
| [resources/js/components/customer-dialog.tsx](../../resources/js/components/customer-dialog.tsx) | 63 | Dialog |
| [resources/js/components/customer-form.tsx](../../resources/js/components/customer-form.tsx) | 434 | form, Input ×3, Button ×3, Select |
| [resources/js/components/customer-picker.tsx](../../resources/js/components/customer-picker.tsx) | 345 | Dialog, Input, Button ×5 |
| [resources/js/components/data-table.tsx](../../resources/js/components/data-table.tsx) | 382 | Table, Button ×5, Select, Skeleton |
| [resources/js/components/delete-user.tsx](../../resources/js/components/delete-user.tsx) | 121 | Form, Dialog, Button ×3 |
| [resources/js/components/handover-session-detail.tsx](../../resources/js/components/handover-session-detail.tsx) | 970 | form, Table ×2, Input ×2, Button ×6, EmptyState |
| [resources/js/components/handover-session-list.tsx](../../resources/js/components/handover-session-list.tsx) | 583 | DataTable, Input ×3, Button ×4, Select ×2, EmptyState ×2 |
| [resources/js/components/heading.tsx](../../resources/js/components/heading.tsx) | 27 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/input-error.tsx](../../resources/js/components/input-error.tsx) | 18 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/jne-account-input.tsx](../../resources/js/components/jne-account-input.tsx) | 109 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/jne-apex-accounts.tsx](../../resources/js/components/jne-apex-accounts.tsx) | 298 | form, Dialog, Input ×3, Button ×5 |
| [resources/js/components/jne-customer-charts.tsx](../../resources/js/components/jne-customer-charts.tsx) | 366 | Table, Button ×3, svg |
| [resources/js/components/jne-customer-overview.tsx](../../resources/js/components/jne-customer-overview.tsx) | 288 | Button ×4 |
| [resources/js/components/jne-pull-settings.tsx](../../resources/js/components/jne-pull-settings.tsx) | 591 | Button ×3 |
| [resources/js/components/jne-report-requests.tsx](../../resources/js/components/jne-report-requests.tsx) | 343 | Button ×4 |
| [resources/js/components/jne-run-list.tsx](../../resources/js/components/jne-run-list.tsx) | 271 | Table, Button ×2 |
| [resources/js/components/jne-run-state.tsx](../../resources/js/components/jne-run-state.tsx) | 97 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/jne-shipment-detail-sheet.tsx](../../resources/js/components/jne-shipment-detail-sheet.tsx) | 390 | Sheet, Button ×7, Skeleton ×2 |
| [resources/js/components/jne-shipment-filters.tsx](../../resources/js/components/jne-shipment-filters.tsx) | 332 | form, Sheet, Input, Button ×6, Select |
| [resources/js/components/jne-shipment-status.tsx](../../resources/js/components/jne-shipment-status.tsx) | 43 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/jne-shipment-summary.tsx](../../resources/js/components/jne-shipment-summary.tsx) | 119 | Select |
| [resources/js/components/jne-shipment-table.tsx](../../resources/js/components/jne-shipment-table.tsx) | 394 | DataTable, Button ×5 |
| [resources/js/components/jne-tracking-refresh-card.tsx](../../resources/js/components/jne-tracking-refresh-card.tsx) | 239 | Button ×4 |
| [resources/js/components/jne-workspace-metrics.tsx](../../resources/js/components/jne-workspace-metrics.tsx) | 54 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/monitoring-detail-sheet.tsx](../../resources/js/components/monitoring-detail-sheet.tsx) | 138 | Sheet, Button |
| [resources/js/components/monitoring-insights.tsx](../../resources/js/components/monitoring-insights.tsx) | 353 | Dialog, Sheet, Table, Button ×4 |
| [resources/js/components/monitoring-workspace.tsx](../../resources/js/components/monitoring-workspace.tsx) | 234 | form, Input, Button ×6 |
| [resources/js/components/nav-footer.tsx](../../resources/js/components/nav-footer.tsx) | 50 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/nav-main.tsx](../../resources/js/components/nav-main.tsx) | 60 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/nav-user.tsx](../../resources/js/components/nav-user.tsx) | 62 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/operational-change.tsx](../../resources/js/components/operational-change.tsx) | 211 | form, Dialog, Input, Button ×2 |
| [resources/js/components/operational-dashboard-charts.tsx](../../resources/js/components/operational-dashboard-charts.tsx) | 354 | Table, Button, svg ×2 |
| [resources/js/components/operational-dashboard-overview.tsx](../../resources/js/components/operational-dashboard-overview.tsx) | 801 | form, Table, Input ×2, Button ×8 |
| [resources/js/components/operational-role-dashboard.tsx](../../resources/js/components/operational-role-dashboard.tsx) | 735 | DataTable, Button ×9, EmptyState, svg |
| [resources/js/components/operational-ui.tsx](../../resources/js/components/operational-ui.tsx) | 94 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/package-processing-monitoring.tsx](../../resources/js/components/package-processing-monitoring.tsx) | 666 | form, Table ×2, Input ×2, Button ×5, EmptyState |
| [resources/js/components/package-processing-ui.tsx](../../resources/js/components/package-processing-ui.tsx) | 194 | Button ×2 |
| [resources/js/components/page-container.tsx](../../resources/js/components/page-container.tsx) | 27 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/password-input.tsx](../../resources/js/components/password-input.tsx) | 42 | Input |
| [resources/js/components/pickup-detail.tsx](../../resources/js/components/pickup-detail.tsx) | 675 | Dialog, Button ×9 |
| [resources/js/components/pickup-execution.tsx](../../resources/js/components/pickup-execution.tsx) | 197 | form, Button ×2, Select |
| [resources/js/components/pickup-monitoring-period.tsx](../../resources/js/components/pickup-monitoring-period.tsx) | 399 | Input ×2, Button ×3 |
| [resources/js/components/pickup-monitoring-views.tsx](../../resources/js/components/pickup-monitoring-views.tsx) | 58 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/pickup-monitoring.tsx](../../resources/js/components/pickup-monitoring.tsx) | 867 | form, Table ×2, Input ×2, Button ×6, EmptyState ×2 |
| [resources/js/components/pickup-notifications.tsx](../../resources/js/components/pickup-notifications.tsx) | 306 | Sheet, Button ×5 |
| [resources/js/components/pickup-operational-list.tsx](../../resources/js/components/pickup-operational-list.tsx) | 579 | DataTable, Button ×4, Select, EmptyState ×2 |
| [resources/js/components/pickup-preview.tsx](../../resources/js/components/pickup-preview.tsx) | 155 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/pickup-processing-detail.tsx](../../resources/js/components/pickup-processing-detail.tsx) | 227 | Table, EmptyState ×2 |
| [resources/js/components/pickup-processing-drawer.tsx](../../resources/js/components/pickup-processing-drawer.tsx) | 319 | Button ×2, EmptyState |
| [resources/js/components/pickup-proof.tsx](../../resources/js/components/pickup-proof.tsx) | 508 | form, Dialog, Input ×2, Button ×4, canvas |
| [resources/js/components/pickup-result-actions.tsx](../../resources/js/components/pickup-result-actions.tsx) | 619 | form, Dialog, Input ×2, Button ×5 |
| [resources/js/components/pickup-result-drawer.tsx](../../resources/js/components/pickup-result-drawer.tsx) | 470 | Button ×8 |
| [resources/js/components/pickup-result-ui.tsx](../../resources/js/components/pickup-result-ui.tsx) | 191 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/record-processing-dialog.tsx](../../resources/js/components/record-processing-dialog.tsx) | 404 | form, Dialog, Input ×2, Button ×4 |
| [resources/js/components/signature-pad.tsx](../../resources/js/components/signature-pad.tsx) | 91 | Button, canvas |
| [resources/js/components/text-link.tsx](../../resources/js/components/text-link.tsx) | 24 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/alert.tsx](../../resources/js/components/ui/alert.tsx) | 67 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/avatar.tsx](../../resources/js/components/ui/avatar.tsx) | 52 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/badge.tsx](../../resources/js/components/ui/badge.tsx) | 47 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/breadcrumb.tsx](../../resources/js/components/ui/breadcrumb.tsx) | 110 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/button.tsx](../../resources/js/components/ui/button.tsx) | 59 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/card.tsx](../../resources/js/components/ui/card.tsx) | 69 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/checkbox.tsx](../../resources/js/components/ui/checkbox.tsx) | 31 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/collapsible.tsx](../../resources/js/components/ui/collapsible.tsx) | 32 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/dialog.tsx](../../resources/js/components/ui/dialog.tsx) | 134 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/dropdown-menu.tsx](../../resources/js/components/ui/dropdown-menu.tsx) | 256 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/icon.tsx](../../resources/js/components/ui/icon.tsx) | 15 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/input.tsx](../../resources/js/components/ui/input.tsx) | 22 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/label.tsx](../../resources/js/components/ui/label.tsx) | 23 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/navigation-menu.tsx](../../resources/js/components/ui/navigation-menu.tsx) | 169 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/placeholder-pattern.tsx](../../resources/js/components/ui/placeholder-pattern.tsx) | 21 | svg |
| [resources/js/components/ui/select.tsx](../../resources/js/components/ui/select.tsx) | 194 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/separator.tsx](../../resources/js/components/ui/separator.tsx) | 27 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/sheet.tsx](../../resources/js/components/ui/sheet.tsx) | 140 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/sidebar.tsx](../../resources/js/components/ui/sidebar.tsx) | 720 | Sheet, Input, Button, Skeleton ×2 |
| [resources/js/components/ui/skeleton.tsx](../../resources/js/components/ui/skeleton.tsx) | 14 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/sonner.tsx](../../resources/js/components/ui/sonner.tsx) | 28 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/spinner.tsx](../../resources/js/components/ui/spinner.tsx) | 17 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/table.tsx](../../resources/js/components/ui/table.tsx) | 29 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/textarea.tsx](../../resources/js/components/ui/textarea.tsx) | 8 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/toggle-group.tsx](../../resources/js/components/ui/toggle-group.tsx) | 72 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/toggle.tsx](../../resources/js/components/ui/toggle.tsx) | 46 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/ui/tooltip.tsx](../../resources/js/components/ui/tooltip.tsx) | 56 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/user-info.tsx](../../resources/js/components/user-info.tsx) | 33 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/components/user-menu-content.tsx](../../resources/js/components/user-menu-content.tsx) | 69 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/hooks/use-appearance.tsx](../../resources/js/hooks/use-appearance.tsx) | 121 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/hooks/use-clipboard.ts](../../resources/js/hooks/use-clipboard.ts) | 33 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/hooks/use-current-url.ts](../../resources/js/hooks/use-current-url.ts) | 84 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/hooks/use-flash-toast.ts](../../resources/js/hooks/use-flash-toast.ts) | 20 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/hooks/use-initials.tsx](../../resources/js/hooks/use-initials.tsx) | 27 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/hooks/use-mobile-navigation.ts](../../resources/js/hooks/use-mobile-navigation.ts) | 11 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/hooks/use-mobile.tsx](../../resources/js/hooks/use-mobile.tsx) | 37 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/layouts/app/app-header-layout.tsx](../../resources/js/layouts/app/app-header-layout.tsx) | 17 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/layouts/app/app-sidebar-layout.tsx](../../resources/js/layouts/app/app-sidebar-layout.tsx) | 21 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/layouts/app-layout.tsx](../../resources/js/layouts/app-layout.tsx) | 17 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/layouts/auth/auth-card-layout.tsx](../../resources/js/layouts/auth/auth-card-layout.tsx) | 49 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/layouts/auth/auth-simple-layout.tsx](../../resources/js/layouts/auth/auth-simple-layout.tsx) | 88 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/layouts/auth/auth-split-layout.tsx](../../resources/js/layouts/auth/auth-split-layout.tsx) | 45 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/layouts/auth-layout.tsx](../../resources/js/layouts/auth-layout.tsx) | 18 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/layouts/settings/layout.tsx](../../resources/js/layouts/settings/layout.tsx) | 79 | Button |
| [resources/js/lib/customer-data-table.test.tsx](../../resources/js/lib/customer-data-table.test.tsx) | 75 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/data-table.test.tsx](../../resources/js/lib/data-table.test.tsx) | 145 | DataTable |
| [resources/js/lib/jne-accounts.test.ts](../../resources/js/lib/jne-accounts.test.ts) | 38 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-accounts.ts](../../resources/js/lib/jne-accounts.ts) | 51 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-monitoring.test.tsx](../../resources/js/lib/jne-monitoring.test.tsx) | 395 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/jne-monitoring.ts](../../resources/js/lib/jne-monitoring.ts) | 62 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-navigation.test.ts](../../resources/js/lib/jne-navigation.test.ts) | 47 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-navigation.ts](../../resources/js/lib/jne-navigation.ts) | 71 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-report-awbs.test.tsx](../../resources/js/lib/jne-report-awbs.test.tsx) | 128 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/jne-report-flow.test.tsx](../../resources/js/lib/jne-report-flow.test.tsx) | 142 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/jne-report-flow.ts](../../resources/js/lib/jne-report-flow.ts) | 39 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-report-limits.test.ts](../../resources/js/lib/jne-report-limits.test.ts) | 67 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-report-limits.ts](../../resources/js/lib/jne-report-limits.ts) | 39 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-shipment-detail.ts](../../resources/js/lib/jne-shipment-detail.ts) | 55 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/jne-shipment-ui.test.tsx](../../resources/js/lib/jne-shipment-ui.test.tsx) | 391 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/package-processing.test.tsx](../../resources/js/lib/package-processing.test.tsx) | 168 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/pickup-monitoring-navigation.test.tsx](../../resources/js/lib/pickup-monitoring-navigation.test.tsx) | 53 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/pickup-monitoring-navigation.ts](../../resources/js/lib/pickup-monitoring-navigation.ts) | 52 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/pickup-notifications.test.ts](../../resources/js/lib/pickup-notifications.test.ts) | 37 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/pickup-notifications.ts](../../resources/js/lib/pickup-notifications.ts) | 20 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/pickup-time.ts](../../resources/js/lib/pickup-time.ts) | 24 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/pickup-work-queues.ts](../../resources/js/lib/pickup-work-queues.ts) | 42 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/pickup-workspace.test.tsx](../../resources/js/lib/pickup-workspace.test.tsx) | 269 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/push-test-page.test.tsx](../../resources/js/lib/push-test-page.test.tsx) | 40 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/lib/scraping.ts](../../resources/js/lib/scraping.ts) | 33 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/submission-key.ts](../../resources/js/lib/submission-key.ts) | 11 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/lib/utils.ts](../../resources/js/lib/utils.ts) | 13 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/pages/auth/confirm-password.tsx](../../resources/js/pages/auth/confirm-password.tsx) | 52 | Form, Button |
| [resources/js/pages/auth/forgot-password.tsx](../../resources/js/pages/auth/forgot-password.tsx) | 70 | Form, Input, Button |
| [resources/js/pages/auth/login.tsx](../../resources/js/pages/auth/login.tsx) | 152 | Form, Input, Button |
| [resources/js/pages/auth/register.tsx](../../resources/js/pages/auth/register.tsx) | 12 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/pages/auth/reset-password.tsx](../../resources/js/pages/auth/reset-password.tsx) | 97 | Form, Input, Button |
| [resources/js/pages/auth/verify-email.tsx](../../resources/js/pages/auth/verify-email.tsx) | 47 | Form, Button |
| [resources/js/pages/customers.tsx](../../resources/js/pages/customers.tsx) | 253 | Input, Button ×6, Select |
| [resources/js/pages/dashboard.tsx](../../resources/js/pages/dashboard.tsx) | 20 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/pages/discrepancies.tsx](../../resources/js/pages/discrepancies.tsx) | 838 | Dialog, DataTable, Input ×3, Button ×7, Select ×3, EmptyState ×3 |
| [resources/js/pages/handover.tsx](../../resources/js/pages/handover.tsx) | 516 | Dialog ×2, Input, Button ×6, EmptyState |
| [resources/js/pages/jne-customer-dashboard.tsx](../../resources/js/pages/jne-customer-dashboard.tsx) | 745 | form, Table, Input ×2, Button ×8 |
| [resources/js/pages/jne-monitoring.tsx](../../resources/js/pages/jne-monitoring.tsx) | 263 | Button ×3 |
| [resources/js/pages/jne-profiles.tsx](../../resources/js/pages/jne-profiles.tsx) | 707 | form, Dialog, Input ×6, Button ×6, Select ×3 |
| [resources/js/pages/jne-reconciliation.tsx](../../resources/js/pages/jne-reconciliation.tsx) | 214 | form, Table, Input, Button ×3 |
| [resources/js/pages/jne-report-awbs.tsx](../../resources/js/pages/jne-report-awbs.tsx) | 389 | form ×2, Table, Input ×2, Button ×8 |
| [resources/js/pages/jne-report-runs.tsx](../../resources/js/pages/jne-report-runs.tsx) | 829 | form ×3, Dialog ×2, Input ×3, Button ×13, Select ×3 |
| [resources/js/pages/jne-reports.tsx](../../resources/js/pages/jne-reports.tsx) | 605 | form, Input ×3, Button ×9, Select |
| [resources/js/pages/jne-shipment.tsx](../../resources/js/pages/jne-shipment.tsx) | 404 | form, Table ×2, Input ×2, Button ×4 |
| [resources/js/pages/jne-shipper-aliases.tsx](../../resources/js/pages/jne-shipper-aliases.tsx) | 830 | form ×3, Dialog, Table, Input ×3, Button ×12 |
| [resources/js/pages/operations.tsx](../../resources/js/pages/operations.tsx) | 1928 | form, Dialog, DataTable ×2, Input ×4, Button ×22, Select ×4, EmptyState ×4 |
| [resources/js/pages/pickup-result-detail.tsx](../../resources/js/pages/pickup-result-detail.tsx) | 744 | Dialog, Table ×2, Button, EmptyState ×3 |
| [resources/js/pages/pickup-results.tsx](../../resources/js/pages/pickup-results.tsx) | 39 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/pages/pickup-schedules.tsx](../../resources/js/pages/pickup-schedules.tsx) | 604 | form, Dialog, DataTable, Input ×5, Button ×5, Select, EmptyState ×2 |
| [resources/js/pages/pickup-wizard.tsx](../../resources/js/pages/pickup-wizard.tsx) | 1042 | form, Dialog, Input ×2, Button ×9, Select, EmptyState |
| [resources/js/pages/push-test.tsx](../../resources/js/pages/push-test.tsx) | 430 | form, Input, Button ×7, EmptyState ×2 |
| [resources/js/pages/settings/appearance.tsx](../../resources/js/pages/settings/appearance.tsx) | 33 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/js/pages/settings/profile.tsx](../../resources/js/pages/settings/profile.tsx) | 139 | Form, Input ×2, Button |
| [resources/js/pages/settings/security.tsx](../../resources/js/pages/settings/security.tsx) | 133 | Form, Button |
| [resources/js/pages/welcome.tsx](../../resources/js/pages/welcome.tsx) | 312 | Button ×3 |
| [resources/js/types/auth.ts](../../resources/js/types/auth.ts) | 17 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/global.d.ts](../../resources/js/types/global.d.ts) | 19 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/handover.ts](../../resources/js/types/handover.ts) | 63 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/index.ts](../../resources/js/types/index.ts) | 4 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/jne-customer-dashboard.ts](../../resources/js/types/jne-customer-dashboard.ts) | 106 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/jne.ts](../../resources/js/types/jne.ts) | 88 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/navigation.ts](../../resources/js/types/navigation.ts) | 15 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/operational-dashboard.ts](../../resources/js/types/operational-dashboard.ts) | 72 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/package-processing.ts](../../resources/js/types/package-processing.ts) | 80 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/pickup-result.ts](../../resources/js/types/pickup-result.ts) | 96 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/ui.ts](../../resources/js/types/ui.ts) | 22 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/js/types/vite-env.d.ts](../../resources/js/types/vite-env.d.ts) | 2 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/index.html](../../resources/mobile/index.html) | 20 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/api.test.ts](../../resources/mobile/src/api.test.ts) | 214 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/api.ts](../../resources/mobile/src/api.ts) | 121 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/app.tsx](../../resources/mobile/src/app.tsx) | 2073 | form ×2, Input ×5, Button ×21, EmptyState ×8 |
| [resources/mobile/src/draft-list.tsx](../../resources/mobile/src/draft-list.tsx) | 110 | Button |
| [resources/mobile/src/env.d.ts](../../resources/mobile/src/env.d.ts) | 2 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/execution-panel.tsx](../../resources/mobile/src/execution-panel.tsx) | 673 | Input ×2, Button ×13 |
| [resources/mobile/src/execution.test.ts](../../resources/mobile/src/execution.test.ts) | 74 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/execution.ts](../../resources/mobile/src/execution.ts) | 51 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/feedback.tsx](../../resources/mobile/src/feedback.tsx) | 49 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/mobile/src/handover-panel.tsx](../../resources/mobile/src/handover-panel.tsx) | 2015 | form ×2, Dialog, Input ×4, Button ×35 |
| [resources/mobile/src/handover.test.ts](../../resources/mobile/src/handover.test.ts) | 327 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/handover.ts](../../resources/mobile/src/handover.ts) | 270 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/local-store.test.ts](../../resources/mobile/src/local-store.test.ts) | 99 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/local-store.ts](../../resources/mobile/src/local-store.ts) | 219 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/main.tsx](../../resources/mobile/src/main.tsx) | 11 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/mobile/src/manual-pickup.test.ts](../../resources/mobile/src/manual-pickup.test.ts) | 47 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/manual-pickup.tsx](../../resources/mobile/src/manual-pickup.tsx) | 540 | form, Input ×2, Button ×10 |
| [resources/mobile/src/photo-gallery.tsx](../../resources/mobile/src/photo-gallery.tsx) | 293 | Dialog ×3, Button ×6 |
| [resources/mobile/src/private-proof.tsx](../../resources/mobile/src/private-proof.tsx) | 142 | Button ×2 |
| [resources/mobile/src/proof-draft.test.ts](../../resources/mobile/src/proof-draft.test.ts) | 164 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/proof-draft.ts](../../resources/mobile/src/proof-draft.ts) | 202 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/proof-panel.tsx](../../resources/mobile/src/proof-panel.tsx) | 1555 | Dialog ×2, Input ×2, Button ×21 |
| [resources/mobile/src/push.test.ts](../../resources/mobile/src/push.test.ts) | 279 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/push.ts](../../resources/mobile/src/push.ts) | 207 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/secure-session.ts](../../resources/mobile/src/secure-session.ts) | 57 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/signature.test.ts](../../resources/mobile/src/signature.test.ts) | 20 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/signature.ts](../../resources/mobile/src/signature.ts) | 44 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/styles.css](../../resources/mobile/src/styles.css) | 1132 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/types.ts](../../resources/mobile/src/types.ts) | 99 | Test / types / hook / utility / stylesheet / supporting source |
| [resources/mobile/src/workspace-ui.tsx](../../resources/mobile/src/workspace-ui.tsx) | 384 | Komposisi domain / layout; lihat import dan kontrol di JSON |
| [resources/css/app.css](../../resources/css/app.css) | 144 | Test / types / hook / utility / stylesheet / supporting source |

## Lampiran C — Primitive shadcn/ui yang tersedia

`alert`, `avatar`, `badge`, `breadcrumb`, `button`, `card`, `checkbox`, `collapsible`, `dialog`, `dropdown-menu`, `icon`, `input`, `label`, `navigation-menu`, `placeholder-pattern`, `select`, `separator`, `sheet`, `sidebar`, `skeleton`, `sonner`, `spinner`, `table`, `textarea`, `toggle-group`, `toggle`, `tooltip`.

Ada **27** primitive; konfigurasi `components.json` memakai new-york, Radix, CSS variables, TSX, neutral base dan Lucide. Field/InputGroup/Empty terbaru tidak terpasang dan tidak diwajibkan audit ini.
