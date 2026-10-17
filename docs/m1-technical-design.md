# M1 Technical Design — Retail Pickup Management

Tanggal: 12 Oktober 2026  
Status: **READY WITH ASSUMPTIONS** untuk memulai implementasi incremental.  
Sumber kebutuhan: [Retail Pickup Management PRD V1.1](prd.md), serta M1-DEC-001–004 yang disetujui pengguna.  
Deliverable: desain teknis saja. Tidak ada kode aplikasi, migration, atau implementasi test dalam dokumen ini. PRD tidak diubah.

CONFIRMED adalah kebutuhan/keputusan bisnis yang sudah disetujui. PROPOSED adalah pilihan desain atau default yang belum menjadi kebijakan approved. OPEN adalah keputusan yang masih diperlukan. Seluruh rancangan schema, route, payload, komponen, dan algoritma di bawah adalah **PROPOSED technical design** untuk memenuhi kebutuhan CONFIRMED; pencantumannya tidak mengesahkan kebijakan operasional yang masih OPEN.

## 1. Scope and Approved Decisions

### 1.1 Keputusan approved

| ID         | Keputusan CONFIRMED                                                                                      | Dampak M1                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| M1-DEC-001 | Satu retail/outlet awal                                                                                  | Tidak ada tabel/kolom outlet, tenant, company, atau filter multi-outlet         |
| M1-DEC-002 | Tepat satu role operasional per user                                                                     | Satu kolom role; tidak ada role pivot, multi-role, atau permission builder      |
| M1-DEC-003 | Customer minimal: nama, alamat pickup, informasi kontak                                                  | Ketiganya wajib pada create customer; format kontak masih OPEN                  |
| M1-DEC-004 | Staff langsung mengambil alih task staff lain tanpa approval CS, hanya ASSIGNED dan belum mulai eksekusi | Eligibility diperiksa backend; assignment berubah atomik; status tetap ASSIGNED |

Keputusan ini menggantikan bagian OPEN OQ-01, OQ-02, OQ-03 dan OQ-29 PRD yang bersesuaian **untuk M1**. Single-outlet/single-role/hak direct takeover/batas ASSIGNED belum mulai tidak dibuka kembali.

### 1.2 Scope dan traceability

| Kemampuan M1                                | PRD / acceptance terkait                                       |
| ------------------------------------------- | -------------------------------------------------------------- |
| Login/logout, active user, authorization    | NFR-002; bagian 14 PRD; AC-016                                 |
| Search/create customer dengan alamat/kontak | FR-CU-001/002; M1-DEC-003                                      |
| Snapshot customer/address/contact pada task | FR-CU-003, AC-019; tetap PROPOSED                              |
| CS create on-demand, list/detail            | FR-PU-001/003; AC-001                                          |
| CS initial assignment ke staff aktif        | FR-PU-002/004; FR-WS-001; AC-001                               |
| Workspace mobile, discovery dan takeover    | FR-WS-001/002/006; FR-PU-010; BR-022; AC-016/025               |
| Audit create/assign/takeover                | FR-MO-006, bagian 14 PRD; AC-025; scope audit minimum pengguna |

Selesai M1 berarti CS membuat task, assign, staff membaca tujuan, dan staff lain dapat mengambil alih eligible task secara aman. Task belum dieksekusi dalam aplikasi. Tidak ada endpoint mulai pickup, finalisasi, cancel, reassign oleh CS sesudah ASSIGNED, atau handover.

## 2. Assumptions and Remaining Open Decisions

| Ref / PRD      | OPEN detail                                           | Default minimum PROPOSED                                                                                                                                                               | Gate                                                                                              |
| -------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| TD-01 / OQ-03  | Format/validasi kontak                                | Satu field `contact` string wajib, trim, 1–255 karakter; tidak memaksa email/WhatsApp dan tidak mengklaim valid untuk receipt                                                          | Konfirmasi sebelum acceptance customer operasional; tidak menghalangi design/build dengan default |
| TD-02 / OQ-28  | Edit alamat customer/task                             | M1 search/create master saja, tanpa endpoint edit. CS memilih default atau memasukkan alamat task saat create; snapshot disimpan saat create dan tidak otomatis mengikuti master       | Tidak blocking M1; edit master/task ditunda                                                       |
| TD-03 / OQ-15a | Timezone retail                                       | Satu konfigurasi IANA `operational_timezone`; UTC dalam penyimpanan; input API memakai ISO 8601 dengan offset. `Asia/Jakarta` hanya kandidat bila outlet WIB, bukan keputusan otomatis | Nilai sebenarnya wajib sebelum penggunaan operasional/UAT waktu                                   |
| TD-04 / OQ-02  | Owner akun/customer dan arti Admin/Supervisor         | CS dan Admin/Supervisor create/search customer; akun hanya Admin/Supervisor. Empat role tetap: `cs`, `pickup_staff`, `retail_staff`, `admin_supervisor`                                | Konfirmasi matriks sebelum penggunaan; satu role per user tetap approved                          |
| TD-05 / OQ-29  | Alasan takeover wajib?                                | Opsional, maksimal 500 karakter; actor/waktu/old-new staff selalu dicatat                                                                                                              | Tidak blocking desain; konfirmasi sebelum UAT takeover                                            |
| TD-06 / OQ-29  | Notifikasi ke assignee lama?                          | Tidak ada push/email/WhatsApp M1. Workspace refresh dan backend menolak ownership lama; pesan UI saat state berubah                                                                    | Tidak blocking; notifikasi proaktif dapat ditunda                                                 |
| TD-07 / OQ-29  | Integrasi penanda mulai saat M2                       | `execution_started_at` server-owned pada task, null di M1. M2 wajib mengisinya dengan transaksi/version guard sebelum eksekusi pertama                                                 | Tidak blocking M1, gate integrasi M2                                                              |
| TD-08          | User dinonaktifkan/role berubah ketika masih assigned | Tolak perubahan active/role yang membuat user bukan staff aktif jika ia masih mempunyai task ASSIGNED. Selesaikan ownership secara terkontrol sebelum perubahan                        | Default pengamanan PROPOSED; konfirmasi untuk pengelolaan akun                                    |
| TD-09          | Email verification starter dan provisioning password  | Tidak mewajibkan email verification pada route M1; akun dibuat Admin dengan password initial sesuai aturan proyek, tanpa email onboarding baru                                         | Konfirmasi provisioning sebelum penggunaan; jangan mengisi verification fiktif                    |

Contact tidak boleh kosong karena M1-DEC-003; default kontak opsional pada bagian M1 PRD sebelumnya tidak berlaku setelah keputusan ini. Bila format khusus disetujui, ubah validasi dan contract sebelum acceptance; tidak membuat tabel receipt atau multi-channel pada M1.

No-public-registration sudah CONFIRMED. Akun pertama Admin perlu disiapkan lewat mekanisme provisioning internal Laravel yang diotorisasi saat implementasi; tidak membuat endpoint bootstrap publik. Tidak ada permission hierarchy walaupun label role gabungan Admin/Supervisor digunakan sebagai default desain.

## 3. Architecture

### 3.1 Baseline proyek yang diperiksa

| Komponen              | Versi/kondisi sumber lokal                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| PHP / Laravel         | PHP 8.5 / `laravel/framework` 13.35.0                                                                         |
| Authentication        | `laravel/fortify` 1.41.0, guard `web`; login/logout sudah tersedia                                            |
| Inertia               | `inertiajs/inertia-laravel` 3.5.1; `@inertiajs/react` lockfile 3.9.1                                          |
| Frontend              | React lockfile 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3; shadcn/ui lokal berbasis Radix                       |
| Routing typed         | Wayfinder 0.1.21; Vite plugin sudah dikonfigurasi                                                             |
| Database/session      | MySQL pada konfigurasi aplikasi yang dilaporkan Boost; session database                                       |
| Tests                 | Pest 5.3.1; feature tests memakai SQLite in-memory dan RefreshDatabase                                        |
| Frontend test tooling | Manifest belum mendeklarasikan React Testing Library atau browser-test dependency; jangan menganggap tersedia |

Versi JS di atas berasal dari lockfile, bukan klaim bahwa node_modules sudah terpasang. `.ai/rules` tidak tersedia ketika desain disusun. Tidak ada dependency yang ditambahkan.

### 3.2 Bentuk aplikasi minimum

Satu Laravel backend melayani Inertia page shell/navigasi React + TypeScript serta REST JSON M1, pada origin yang sama. Satu MySQL database menyimpan transaksi dan session. Staff menggunakan halaman yang sama dengan layout responsif. Tidak membangun SPA terpisah, native app, backend kedua, CORS lintas origin, bearer-token storage, ataupun Sanctum baru untuk aplikasi same-origin ini.

PROPOSED: route JSON `/api/v1/*` ditempatkan pada group route **dengan middleware web/session/CSRF**, ditambah `auth` dan pemeriksaan active-user. Prefix API tidak otomatis menjadikannya stateless. Gunakan route file/struktur existing; tidak harus menjalankan API scaffolding yang memasang dependency baru. HTML/page routes memakai Inertia; domain mutations mengembalikan JSON, tidak redirect ke halaman.

Frontend menggunakan `useHttp` Inertia v3 untuk endpoint JSON; Inertia Link untuk page navigation. Wayfinder named route functions digunakan untuk URL backend. Tidak memakai hardcoded route strings dalam implementasi frontend, tidak memakai Inertia page visit untuk JSON mutation. Form login dapat mempertahankan pola Fortify/Inertia existing, dengan kontrak XHR JSON yang didefinisikan di bagian 5.

### 3.3 Batas modul tanpa layer berlebihan

| Area                | Tanggung jawab                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Authentication/User | Fortify login/logout; active-user check; single role; akun Admin                              |
| Customer            | Search/create master dan validasi minimum                                                     |
| PickupTask          | Create/list/detail; initial assignment; candidate list dan takeover; eligibility dan snapshot |
| Audit task          | Insert jejak create/assign/takeover dalam transaksi yang sama                                 |

Gunakan direktori Laravel existing: model Eloquent, HTTP controllers, Form Requests untuk mutations, policies/gates, API Resources dan React pages/components. Satu operasi takeover terfokus dapat diekstrak agar transaksi jelas; tidak wajib service/repository/interface untuk setiap tabel. Tidak ada event sourcing, CQRS, message bus, Redis lock, queue, scheduler atau audit platform.

Dasar teknis: [Fortify](https://github.com/laravel/docs/blob/13.x/fortify.md), [JSON/HTTP requests Inertia v3](https://inertiajs.com/docs/v3/the-basics/http-requests), [Wayfinder](https://github.com/laravel/wayfinder/blob/main/README.md). Dokumen tersebut diperiksa melalui Laravel Boost sesuai versi paket.

## 4. Data Model

Semua bentuk schema berikut PROPOSED. **Empat tabel domain M1:** `users` existing yang diperluas, `customers`, `pickup_tasks`, `pickup_task_events`. Tidak ada schema modul masa depan. Jenis MySQL disajikan sebagai spesifikasi, bukan migration/DDL.

### 4.1 users — perluas tabel existing

| Column                 | Type                              | Null/default                                       | Tujuan                                                     |
| ---------------------- | --------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| id                     | BIGINT UNSIGNED PK auto increment | Tidak null                                         | ID existing                                                |
| name                   | VARCHAR(255)                      | Tidak null                                         | Nama akun                                                  |
| email                  | VARCHAR(255) UNIQUE               | Tidak null                                         | Login; dinormalisasi lowercase                             |
| password               | VARCHAR(255)                      | Tidak null                                         | Hash Laravel; tidak ada plaintext di response              |
| role                   | VARCHAR(32)                       | Tidak null, tanpa default privilege                | Tepat satu dari empat nilai TD-04                          |
| is_active              | BOOLEAN                           | Tidak null; default true untuk create terotorisasi | Login/operasi dibatasi                                     |
| email_verified_at      | TIMESTAMP                         | Nullable, existing                                 | Tetap kompatibel starter; bukan mandatory gate M1 PROPOSED |
| remember_token         | VARCHAR(100)                      | Nullable, existing                                 | Dukungan auth existing                                     |
| created_at, updated_at | TIMESTAMP                         | Ikuti existing                                     | Timestamp record                                           |

Tidak ada roles/permissions/pivot table. Unique email existing dipertahankan. Index `(role, is_active, name, id)` PROPOSED untuk picker staff/admin list; validasi manfaat terhadap query nyata, jangan duplikasi index existing. Tidak melakukan backfill user lama menjadi Admin otomatis; role/active existing harus dipetakan terotorisasi saat implementasi.

### 4.2 customers

| Column                 | Type                     | Null/default | Tujuan                |
| ---------------------- | ------------------------ | ------------ | --------------------- |
| id                     | BIGINT UNSIGNED PK       | Tidak null   | Identitas master      |
| name                   | VARCHAR(255)             | Tidak null   | Nama customer         |
| pickup_address         | TEXT                     | Tidak null   | Default alamat pickup |
| contact                | VARCHAR(255)             | Tidak null   | Kontak minimum TD-01  |
| created_by             | BIGINT UNSIGNED FK users | Tidak null   | Actor pembuatan       |
| created_at, updated_at | TIMESTAMP                | Tidak null   | Waktu server UTC      |

PROPOSED: index `(name, id)` untuk pencarian prefix dan pagination stabil. Search `name starts-with q`, setelah trim; tidak menjanjikan index mempercepat `%contains%`. Nama tidak unique karena dua customer dapat bernama sama. Tidak ada address table, deduplication engine, soft-delete atau active flag customer yang belum digunakan scope M1. Create customer belum menyediakan edit/deactivate.

### 4.3 pickup_tasks

| Column                 | Type                         | Null/default                      | Tujuan                                                                      |
| ---------------------- | ---------------------------- | --------------------------------- | --------------------------------------------------------------------------- |
| id                     | BIGINT UNSIGNED PK           | Tidak null                        | FK/internal ID                                                              |
| reference              | CHAR(26) UNIQUE              | Tidak null, server-generated ULID | Reference task tetap, tidak berubah saat takeover                           |
| customer_id            | BIGINT UNSIGNED FK customers | Tidak null                        | Hubungan master                                                             |
| customer_name_snapshot | VARCHAR(255)                 | Tidak null                        | Nama master saat create                                                     |
| pickup_address         | TEXT                         | Tidak null                        | Alamat task yang dipilih CS saat create, menjadi snapshot operasional       |
| contact_snapshot       | VARCHAR(255)                 | Tidak null                        | Kontak master saat create, server-derived                                   |
| scheduled_at           | DATETIME(6)                  | Tidak null                        | Waktu pickup UTC                                                            |
| notes                  | TEXT                         | Nullable                          | Catatan task, bukan catatan Proof of Pickup                                 |
| status                 | VARCHAR(32)                  | Tidak null, SCHEDULED             | M1 hanya SCHEDULED/ASSIGNED                                                 |
| assigned_staff_id      | BIGINT UNSIGNED FK users     | Nullable                          | Kosong sampai initial assignment                                            |
| version                | INT UNSIGNED                 | Tidak null, default 1             | Monotonic version untuk stale/concurrent guard                              |
| execution_started_at   | DATETIME(6)                  | Nullable, null                    | Guard eligibility, server-owned; M1 tidak memiliki operasi untuk mengisinya |
| created_by             | BIGINT UNSIGNED FK users     | Tidak null                        | CS creator                                                                  |
| created_at, updated_at | TIMESTAMP                    | Tidak null                        | Timestamp server UTC                                                        |

`execution_started_at` adalah guard minimum untuk M1-DEC-004, bukan implementasi execution M2. Pada deployment M1 murni semua task mempunyai marker null karena eksekusi di aplikasi belum tersedia. Saat M2 ditambahkan, marker harus menjadi authoritative bersama version guard; M1 tidak dapat mengetahui petugas sudah berangkat di dunia fisik tanpa pencatatan aplikasi. Ini merupakan batas pilot M1, bukan janji eligibility fisik yang tidak terukur.

Tidak ada `pickup_record_id`, quantities, photo/signature, receipt state, schedule_id atau handover fields. Jenis task tidak perlu kolom `pickup_type` pada M1 karena seluruh task on-demand; response menyatakan `pickup_type: on_demand`. M5 dapat menambah kolom/type melalui migration terpisah dengan backfill on-demand ketika dibutuhkan.

Index PROPOSED: UNIQUE(reference); `(assigned_staff_id, status, scheduled_at, id)` untuk My Tasks; `(status, execution_started_at, scheduled_at, id)` untuk candidates/antrean CS; index FK customer/created_by bila belum dicakup. Tidak ada unique assigned_staff_id—staff boleh memiliki banyak task. Sort list `scheduled_at ASC, id ASC`.

### 4.4 pickup_task_events

| Column            | Type                            | Null/default | Tujuan                                       |
| ----------------- | ------------------------------- | ------------ | -------------------------------------------- |
| id                | BIGINT UNSIGNED PK              | Tidak null   | Urutan event                                 |
| pickup_task_id    | BIGINT UNSIGNED FK pickup_tasks | Tidak null   | Target                                       |
| action            | VARCHAR(32)                     | Tidak null   | `created`, `assigned`, `taken_over`          |
| actor_id          | BIGINT UNSIGNED FK users        | Tidak null   | User authenticated                           |
| previous_staff_id | BIGINT UNSIGNED FK users        | Nullable     | Null pada create/initial assign              |
| new_staff_id      | BIGINT UNSIGNED FK users        | Nullable     | Null pada create; target assignment/takeover |
| task_version      | INT UNSIGNED                    | Tidak null   | Versi task setelah mutation                  |
| reason            | VARCHAR(500)                    | Nullable     | Reason takeover TD-05                        |
| occurred_at       | DATETIME(6)                     | Tidak null   | Waktu server                                 |

UNIQUE `(pickup_task_id, task_version)` mencegah dua audit transition untuk versi yang sama. Urut history berdasarkan task_version; index unique itu sudah mendukung task history, tidak menambah index identik. Event create v1, assign v2, takeover v3, dan seterusnya. Gagal mutation tidak membuat event sukses. Event audit append-only bagi user, tanpa endpoint edit/delete. Business state dibaca dari task, bukan direkonstruksi dari events.

### 4.5 Relationships, constraints dan snapshot

Customer mempunyai banyak task; user dapat menjadi creator, assignee dan actor banyak task/events; task mempunyai banyak events. FK mencegah orphan. PROPOSED delete RESTRICT pada master/akun/task yang direferensikan; tidak ada hard-delete endpoint M1. Sessions tetap dikelola framework, bukan ownership task.

Invariant M1: SCHEDULED → assignee null; ASSIGNED → assignee tidak null; version ≥1; takeover hanya status ASSIGNED dan marker null. Gunakan CHECK yang didukung MySQL aktual saat implementasi serta validation/transaksi sebagai authoritative boundary. Jangan menambah constraint bahwa status hanya boleh dua nilai untuk selamanya; jika CHECK enum status dibatasi M1, M2 memperluasnya secara eksplisit. Kondisi role/active staff tidak dapat dijamin FK sederhana, sehingga diperiksa saat mutation.

Master snapshot: server mengambil nama/kontak dari customer ketika create; `pickup_address` berasal dari alamat yang secara eksplisit dipilih CS, bukan hasil join yang mengikuti master setiap pembacaan. Nilai create task adalah catatan historis; perubahan master kelak tidak memperbarui task otomatis. Tidak menyediakan endpoint edit task di M1. Panjang maksimum API address 2.000 dan notes 2.000 karakter PROPOSED, meskipun penyimpanan TEXT lebih besar.

Sessions/password_reset_tokens/cache/jobs yang sudah ada dari starter tidak didesain ulang atau dianggap modul M1 baru. Tidak menambah tabel login token, idempotency registry, assignment history terpisah, atau feature masa depan.

## 5. REST API Contract

### 5.1 Konvensi umum

API domain `/api/v1`, session same-origin, JSON; header `Accept: application/json`, `Content-Type: application/json` untuk JSON body; mutasi mengirim token CSRF. Tidak memasukkan token/password ke query string. Eloquent API Resources membatasi field; models tidak diserialisasi seluruhnya. Semua angka ID/version integer, timestamp ISO 8601 UTC, nullable eksplisit.

| Bentuk          | Shape kontrak                                                                               |
| --------------- | ------------------------------------------------------------------------------------------- |
| Sukses singular | `{data: Resource, meta: {}}`                                                                |
| Sukses list     | `{data: Resource[], meta: {current_page, per_page, total, last_page}, links: {prev, next}}` |
| Sukses logout   | `{data: null, meta: {}}`, HTTP 200                                                          |
| Error           | `{message: string, code: string, errors: {field: string[]}, meta: {}}`                      |

`errors` kosong untuk non-validation. `meta` konflik dapat memuat current_version setelah otorisasi; tidak membocorkan snapshot/contact task yang sudah tidak berhak dibaca. Pagination default 20, maksimum 50 PROPOSED; sort tetap, tanpa arbitrary sort expression dari client. Field di luar kontrak mutation ditolak 422, khususnya status, assignee/creator di create, role di self-service, dan execution marker. Actor/timestamp/reference/snapshot/status berasal dari server.

Semua endpoint mempunyai error umum: 401 `UNAUTHENTICATED`; 403 `FORBIDDEN` atau `ACCOUNT_INACTIVE`; 419 `CSRF_TOKEN_MISMATCH` untuk mutation; 422 `VALIDATION_FAILED`; 429 `RATE_LIMITED` bila limiter diterapkan; 500 generic `INTERNAL_ERROR` tanpa SQL/stack trace. Unknown path/model →404 `NOT_FOUND`. Read task tanpa access →404, sehingga ID guessing tidak mengungkap data; mutation role tidak berhak →403. Error body dinormalisasi pada exception handling existing, bukan diulang di tiap controller.

Session inactive: active-user middleware menolak operasi baru walaupun session lama masih ada, invalidasi session request tersebut PROPOSED; logout tetap diizinkan untuk membersihkan session. Permission dari UI hanya petunjuk, bukan otorisasi backend.

### 5.2 Resource shapes

| Resource            | Field response                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| UserSelf            | `id, name, role, is_active`; email hanya self/Admin bila dibutuhkan                                                                                                                  |
| UserAdmin           | `id, name, email, role, is_active, created_at, updated_at`; tidak ada hash/token                                                                                                     |
| StaffOption         | `id, name`; hanya staff aktif                                                                                                                                                        |
| Customer            | `id, name, pickup_address, contact, created_at`                                                                                                                                      |
| TaskSummary         | `id, reference, pickup_type: on_demand, customer: {id, name: snapshot}, pickup_address, scheduled_at, status, assigned_staff: {id,name} atau null, version, can: {assign,take_over}` |
| TaskDetailOwned     | TaskSummary + `contact: contact_snapshot, notes, execution_started_at, created_at, updated_at, events`                                                                               |
| TaskDetailCandidate | TaskSummary + `can: {assign:false,take_over:true}`; tanpa contact, notes, audit events atau bukti                                                                                    |
| TaskEvent           | `action, actor:{id,name}, previous_staff:{id,name} atau null, new_staff:{id,name} atau null, task_version, reason, occurred_at`                                                      |

Detail penuh dibaca CS/Admin atau assigned staff. Staff lain hanya projection candidate jika eligible; kehilangan ownership tidak selalu berarti kehilangan hak melihat projection kandidat yang masih eligible. Retail Staff tidak diberi akses transaksi M1 dalam default matriks, karena verifikasi belum tersedia.

### 5.3 Authentication

| Endpoint / role                                     | Request                                               | Response dan validation                                                                            | State / concurrency / errors khusus                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/login`, guest                                | `{email, password}`; remember opsional sesuai starter | 200 UserSelf dalam envelope, XHR JSON; email valid, password required, kredensial valid dan active | Fortify session regenerated; kredensial salah atau inactive saat login →422 pesan generik tanpa account enumeration; limiter login existing 5 per menit email+IP →429 |
| POST `/logout`, authenticated atau inactive session | `{}`                                                  | 200 data null                                                                                      | Session invalidated dan CSRF regenerated; tidak mengubah task; CSRF invalid →419                                                                                      |
| GET `/api/v1/me`, semua role aktif                  | Tidak ada payload                                     | 200 UserSelf; meta `operational_timezone`                                                          | 401 bila belum login; 403 inactive; tidak ada transisi                                                                                                                |

Gunakan Fortify route existing `/login` dan `/logout`, bukan controller authentication kedua. Kontrak response XHR sukses disesuaikan melalui contract Fortify jika diperlukan; error JSON auth mengikuti envelope yang sama. Page GET `/login` tetap Inertia. Setelah JSON login sukses, frontend memuat ulang konteks halaman/session agar token CSRF baru dipakai; token dari sebelum login tidak digunakan untuk mutation berikutnya.

Disable public registration route/fitur **dan** link UI saat implementasi; POST/GET `/register` tidak tersedia (404), bukan hanya tombol disembunyikan. Tidak mewajibkan email verification/password reset/passkey/2FA sebagai kemampuan M1 baru. Starter memiliki registration, verified middleware, password recovery, profile dan self-delete; saat slice auth, audit exposure existing agar route di luar scope tidak membuka pembuatan akun/ubah role/delete user tanpa policy. Jangan hapus test lama; sesuaikan coverage perilaku yang memang berubah.

### 5.4 Customer dan staff picker

| Endpoint / role                      | Request                           | Response / validation                                                             | State / errors / concurrency                                                                                |
| ------------------------------------ | --------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| GET `/api/v1/customers`, CS/Admin    | Query `q?, page?, per_page?`      | 200 list Customer; q string max100; page≥1/per_page≤50                            | Search prefix name, order name/id; tidak ada mutation; role lain403                                         |
| POST `/api/v1/customers`, CS/Admin   | `{name, pickup_address, contact}` | 201 Customer; trim; name/contact1–255; address1–2000; ketiganya wajib             | Insert created_by server; invalid422; nama sama diperbolehkan; tidak melakukan auto-retry POST saat timeout |
| GET `/api/v1/pickup-staff`, CS/Admin | Query `q?`                        | 200 list StaffOption, pagination sama; filter Pickup/Retail/Admin aktif di server | Read-only; tidak memberi CS akses email/role management; actor selain CS/Admin403                           |

Tidak perlu endpoint customer detail terpisah: list/select response sudah memuat fields untuk create task. Tidak ada PUT/PATCH/DELETE customer M1. Admin yang mengelola akun menggunakan endpoint Admin, bukan memanfaatkan picker CS.

### 5.5 Task dan takeover

| Endpoint / role                                                     | Request                                                   | Response / validation                                                                                                      | Transition / concurrency / errors khusus                                                                                                                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST `/api/v1/pickup-tasks`, CS/Admin                               | `{customer_id, pickup_address, scheduled_at, notes?}`     | 201 TaskDetailOwned; customer exists; address1–2000; scheduled_at ISO8601 dengan offset yang valid; notes nullable max2000 | Create SCHEDULED, assignee null, version1, marker null; snapshot/name/contact server; create event atomic. Invalid customer/address/time422. Tidak menerima status/staff di payload                                    |
| GET `/api/v1/pickup-tasks`, CS/Admin/Pickup/Retail                  | Query `status?, date_from?, date_to?, page?, per_page?`   | 200 list TaskSummary; status hanya dua nilai; tanggal YYYY-MM-DD, range valid                                              | CS/Admin semua task outlet tunggal; staff selalu WHERE assigned_staff_id=current_user, client tidak boleh override staff filter; Pickup/Retail tetap dibatasi ownership                                                |
| GET `/api/v1/pickup-tasks/{task}`, CS/Admin/Pickup/Retail           | Tidak ada payload                                         | 200 full detail untuk CS/Admin/owner; candidate projection untuk non-owner eligible                                        | Di luar hak baca404; Pickup/Retail tetap dibatasi ownership; policy/scope diperiksa setiap request                                                                                                                     |
| POST `/api/v1/pickup-tasks/{task}/assignment`, CS/Admin             | `{assigned_staff_id, expected_version}`                   | 200 TaskDetailOwned; staff exists+role pickup_staff+active; version integer≥1                                              | SCHEDULED→ASSIGNED, version+1 dan audit assigned. Hanya initial assign; version/status conflict409, staff invalid/inactive422; tidak menjadi endpoint reassign/unassign                                                |
| GET `/api/v1/pickup-tasks/takeover-candidates`, Pickup/Retail/Admin | Query `q?, date_from?, date_to?, page?, per_page?`        | 200 list TaskSummary projection candidate; q prefix customer snapshot max100; pagination/tanggal seperti list              | Filter ASSIGNED, marker null, assignee nonnull≠actor; actor aktif. Tidak menjadikan scheduled date sebagai syarat eligibility. Register route statis sebelum `{task}`                                                  |
| POST `/api/v1/pickup-tasks/{task}/takeover`, Pickup/Retail/Admin    | `{expected_version, expected_assigned_staff_id, reason?}` | 200 TaskDetailOwned; expected version/id wajib positive integer; reason nullable max500                                    | ASSIGNED→ASSIGNED; assignee=actor server; version+1; marker harus null. Stale409 TASK_STALE; sudah mulai/status tidak eligible409 TASK_NOT_ELIGIBLE; self-takeover409 ALREADY_ASSIGNED_TO_YOU; non-role403; missing404 |

Waktu lampau tidak otomatis ditolak: policy “harus future” belum dikonfirmasi. Format/offset/tanggal must valid; server mengonversi UTC. Filters tanggal dipetakan ke batas UTC dari timezone retail (awal tanggal inklusif, awal hari setelah date_to eksklusif). UI menampilkan timezone yang digunakan; tidak menebak dari perangkat browser.

Takeover tidak menerima target staff ID untuk assignment baru: target selalu authenticated actor. `expected_assigned_staff_id` adalah precondition, bukan izin mengubah siapa saja. Payload actor/old/new timestamp dari client tidak dipercaya. Response409 tidak otomatis di-retry dengan version terbaru—staff harus review dan konfirmasi ulang.

Create customer/task tidak memakai idempotency framework baru. PROPOSED: tombol pending mencegah double click; saat timeout ambigu, UI meminta reload list sebelum resubmit dan tidak otomatis menyatakan gagal/sukses. Bila exactly-once retry create kemudian diwajibkan, tambahkan request key terukur melalui perubahan desain; jangan mengklaim unique reference mencegah dua create berbeda.

### 5.6 Admin account management

| Endpoint / role                                | Request                                                      | Response / validation                                                                                                                                | State / errors / concurrency                                                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET `/api/v1/users`, Admin/Supervisor          | `q?, role?, is_active?, page?, per_page?`                    | 200 UserAdmin list; role allowlist, boolean valid                                                                                                    | Read-only; role lain403                                                                                                                                                                                               |
| POST `/api/v1/users`, Admin/Supervisor         | `{name,email,password,password_confirmation,role,is_active}` | 201 UserAdmin; name1–255, email format/unique lowercase≤255, password mengikuti rule proyek, confirmation cocok, satu role allowlist, boolean active | Hash password; tidak ada mail/registration publik; duplicate email422 termasuk DB unique race; actor audit aplikasi tanpa password                                                                                    |
| PATCH `/api/v1/users/{user}`, Admin/Supervisor | `{role?,is_active?}`; sedikitnya satu field                  | 200 UserAdmin; allowlist/boolean; fields lain ditolak                                                                                                | Lock user ketika mutation. TD-08: menonaktifkan/mengubah staff dengan task ASSIGNED →409 USER_HAS_ASSIGNED_TASKS. PROPOSED menolak demotion/deactivation akun sendiri pada UI/API →409 SELF_ACCESS_CHANGE_NOT_ALLOWED |

Tidak ada delete user, role builder, invite/reset-email workflow, atau penggantian password massal. Privilege escalation lewat profil/self-service tetap ditolak. PROPOSED UI akun hanya mengganti role/active untuk user lain; account initial/provisioning/password handoff disepakati tanpa membangun lifecycle account enterprise. Perubahan akun sensitif dicatat dalam log terstruktur existing (actor, target, waktu, field berubah; tanpa secret), tidak menambah general audit table.

## 6. Authorization Matrix

**CONFIRMED — revisi permission oleh pengguna:** Admin/Supervisor mempunyai seluruh kemampuan M1, termasuk create/assign dan takeover. Pickup Staff dan Retail Staff mempunyai permission yang sama. Role tetap tunggal dan terpisah; tidak ada permission builder. Matriks berikut menggantikan batas role pada endpoint, screen dan TD-04 versi sebelumnya. Semua role tetap mengikuti active-user, eligibility, transaksi, version guard dan audit. Fitur verifikasi retail belum tersedia pada M1; ketika M4 dibangun, orang pickup boleh memverifikasi pickup sendiri tanpa menyatukan dua set data.

| Operasi                         | CS                                   | Pickup Staff                                | Retail Staff             | Admin/Supervisor                             |
| ------------------------------- | ------------------------------------ | ------------------------------------------- | ------------------------ | -------------------------------------------- |
| Login/logout/self               | Ya jika aktif; logout tetap tersedia | Sama                                        | Sama                     | Sama                                         |
| Read task full/list             | Semua task M1                        | Own assigned task                           | Sama dengan Pickup Staff | Semua task; filter mine=1 untuk Tugas Saya   |
| Read candidate projection       | Melalui list/detail CS               | Eligible non-own, data minimum              | Sama dengan Pickup Staff | Ya; full detail tetap tersedia sebagai Admin |
| Create task                     | Ya                                   | Tidak                                       | Tidak                    | Ya                                           |
| Initial assign                  | Ya; SCHEDULED saja                   | Tidak                                       | Tidak                    | Ya; target Pickup/Retail/Admin aktif         |
| View takeover candidates        | Tidak perlu endpoint staff           | Ya                                          | Ya                       | Ya                                           |
| Direct takeover                 | Tidak                                | Ya, ASSIGNED belum mulai; tanpa approval CS | Sama dengan Pickup Staff | Ya, eligibility tetap berlaku                |
| Search/create customer          | Ya                                   | Tidak; data melalui task projection         | Sama dengan Pickup Staff | Ya                                           |
| Edit/delete customer            | Tidak dalam M1                       | Tidak                                       | Tidak                    | Tidak dalam M1                               |
| Manage users/single role/active | Tidak                                | Tidak                                       | Tidak                    | Ya sesuai TD-08 dan guard akun sendiri       |
| Read task audit                 | Ya                                   | Own task detail; tidak candidate audit      | Sama dengan Pickup Staff | Ya                                           |

Policies/gates dan query scope memeriksa user aktif/role/ownership/eligibility. Role dan active tidak berasal dari browser/session props yang basi; baca state akun server terkini. List authorization dan single-record authorization sama pentingnya. User yang kehilangan assignment kehilangan hak full detail/recording; kemungkinan tetap dapat melihat projection candidate tidak menyatakan ownership.

## 7. UI / UX Screen Specifications

Screen route di bawah adalah page shell Inertia, terpisah dari JSON API. Route names dan fungsi Wayfinder dibuat saat implementasi. Komponen existing yang dipakai: AppLayout/sidebar, Input/Label/Button, Select, Card, Badge, Dialog/Sheet, Spinner/Skeleton, InputError/Alert, toast Sonner. Tidak mensyaratkan tabel library baru.

| Screen / page route PROPOSED            | Pengguna                  | Fields/components dan interaksi minimum                                                                                                                                           |
| --------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login `/login`                          | Guest                     | Email/password, pending/error, tanpa register link; password tidak dipersisten ke browser storage                                                                                 |
| Customers `/customers`                  | CS/Admin                  | Search prefix, list/pagination, button Tambah; Dialog/Sheet name/address/contact; server field errors; nama sama tidak ditolak                                                    |
| Task List `/pickup-tasks`               | CS/Admin                  | Reference, customer snapshot, waktu/timezone, address ringkas, assignee, status; filter dua status/date; create oleh CS/Admin                                                     |
| Create `/pickup-tasks/create`           | CS                        | Customer search/select; default address terlihat dan dapat dipilih/diganti saat create; scheduled date/time; contact preview dari master; optional notes; submit create SCHEDULED |
| Detail `/pickup-tasks/{task}`           | CS/Admin/authorized staff | Detail snapshot, waktu/timezone, assignee/status, audit sesuai hak; CS mendapat Assign hanya SCHEDULED; tidak ada Edit/Cancel/Record Pickup M1                                    |
| Assignment dialog                       | CS                        | Staff aktif search/select; konfirmasi, expected_version tersimpan; pending/error;409 reload detail/picker, tidak overwrite                                                        |
| My Tasks `/my-pickup-tasks`             | Pickup                    | Card mobile: reference, customer, alamat, waktu, status; hanya tugas miliknya; detail penuh setelah assign                                                                        |
| Takeover list `/pickup-tasks/available` | Pickup                    | Candidate cards: reference, customer snapshot, alamat, waktu, assignee; tanpa contact/notes/audit non-own; empty/loading/error, pagination, refresh                               |
| Takeover confirmation                   | Pickup                    | Dialog nama staff asal, task/customer/waktu, optional reason; tombol Ambil Alih; tanpa permintaan approval; simpan expected version/assignee dari data yang dilihat               |
| Users `/users`                          | Admin/Supervisor          | List/search, create name/email/password/single-role/active; dialog role/active user lain; inactive badge; konflik tugas assigned jelas; tidak ada delete                          |

Pickup Staff dan Retail Staff menggunakan workspace serta menu M1 yang sama: Tugas Saya dan Ambil Alih Pickup. Admin mengakses semua menu, create/assign, dan workspace operator; CS mengakses customer dan task. Verifikasi retail tetap ditunda ke M4. Admin memakai filter mine=1 untuk daftar task miliknya; daftar utama Admin tetap semua task.

PROPOSED target QA minimum: viewport 360px dan 390px untuk mobile serta 1280px desktop. Form satu kolom di mobile; list card atau scroll table terbatas, tanpa overflow halaman; kontrol touch minimum sekitar44px sebagai target teknis; label/error keyboard-accessible, state tidak warna saja. Dialog dapat ditutup sebelum pending; ketika pending hindari submit kedua. Tidak menggunakan optimistic ownership untuk takeover.

Success takeover: tampilkan staff baru, pindahkan konteks ke detail own task dan refresh kedua daftar pada client tersebut. Client staff lama mengetahui perubahan pada refresh/request berikutnya, bukan push real-time. Conflict409: pesan “Tugas berubah atau sudah diambil petugas lain. Muat ulang dan tinjau kembali.” Tidak ada silent retry dengan token baru. Timeout: “Hasil belum diketahui”; reload task/My Tasks untuk memastikan hasil, tidak otomatis mengambil lagi.

## 8. Task Lifecycle and Takeover Concurrency

### 8.1 Transisi M1

| Transisi             | Actor                                    | Guard                                                      | Update dan audit                                                  |
| -------------------- | ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Create → SCHEDULED   | CS/Admin aktif                           | Customer/address/contact snapshot/waktu valid              | Assignee null; marker null; version1; created event               |
| SCHEDULED → ASSIGNED | CS/Admin aktif                           | Expected version cocok; target staff aktif dan role sesuai | Assign target; version+1; assigned event                          |
| ASSIGNED → ASSIGNED  | Pickup aktif yang bukan current assignee | Expected version+assignee cocok; marker null               | Assign actor; version+1; taken_over event; tanpa task/status baru |

Tidak ada reassign CS, unassign, execution-start, PICKED_UP, cancellation atau handover endpoint pada M1. Pengamanan server melarang client mengirim status/marker langsung.

### 8.2 Algoritma takeover minimum PROPOSED

1. Autentikasi dan active/role check; validasi payload integer/version/reason. Role CS ditolak403; operator Pickup/Retail/Admin harus aktif.
2. Mulai transaksi database. Untuk menghindari race active/role, lock row user actor, lalu lock row task target dengan `lockForUpdate`; recheck akun saat terkunci. Assignment memakai pola lock target staff lalu task; update akun memakai user lock yang sama sebelum cek task assigned. Urutan user→task konsisten pada operations M1.
3. Jika task missing404. Bandingkan `expected_version` dan `expected_assigned_staff_id` dengan row **di dalam transaksi**, bukan model dari halaman sebelumnya. Jika berubah409 TASK_STALE.
4. Periksa status ASSIGNED, assignee nonnull/bukan actor dan `execution_started_at` null. Tidak eligible409, tidak melakukan mutation.
5. Simpan old assignee; update assigned_staff_id ke actor; tambah version satu; status/reference/customer/address/scheduled_at tetap. Old staff tidak perlu menyetujui atau aktif online.
6. Insert satu `taken_over` event dengan actor, waktu server, old/new staff, versi baru dan reason jika ada, pada transaksi sama. Audit insert gagal → rollback seluruh assignment. Audit tidak didefer atau di-queue.
7. Commit sebelum respons200. Seluruh pengecekan selanjutnya memakai assignment terbaru. Jika lock timeout/deadlock tidak terselesaikan dengan retry transaksi terbatas, kirim503 STATE_TEMPORARILY_UNAVAILABLE; jangan klaim sukses. Retry internal mengulang seluruh transaksi termasuk validasi versi.

Pessimistic row lock memberi serialisasi write; **expected_version** mencegah request kedua yang menunggu kemudian mengambil task lagi tanpa review. Lock saja tanpa versi belum cukup untuk menolak dua stale request.

Contoh: task dimiliki A, version2; B dan C sama-sama membaca v2. B commit assignee B/v3 dengan satu event. C setelah memperoleh lock melihat v3 dan mendapat409; tidak ada event takeover C. C boleh memuat ulang v3 dan mengambil alih dalam tindakan baru jika tetap eligible—larangan takeover berantai tidak ditambahkan karena belum menjadi kebijakan bisnis.

ABA case: task A→B→A menghasilkan version yang berbeda meskipun assignee kembali sama. Request memakai version lama tetap ditolak. Expected assignee saja atau updated_at detik bukan guard yang cukup. Database transaction/lock menjadi satu-satunya koordinasi; tidak ada Redis atau distributed lock. Lihat [pessimistic locking Laravel 13](https://github.com/laravel/docs/blob/13.x/queries.md#pessimistic-locking).

### 8.3 Batas M1 dan integrasi M2

M1 tidak menawarkan tombol Mulai. Semua task yang dibuat M1 mempunyai execution marker null. Pilot M1 memvalidasi create/assign/takeover, bukan mencatat keseluruhan operasi lapangan. Sebelum M2 execution dipakai, operasi start wajib memeriksa current assignee/expected version, mengunci task, mengisi marker dan increment version atomik. Start dan takeover bersamaan: yang commit pertama menentukan hasil; takeover setelah marker terisi ditolak, start dari assignee lama setelah takeover ditolak. Detail execution/status M2 tidak dirancang di sini. M1 tables/API tidak perlu dibangun ulang; guard yang sama diperluas melalui perubahan M2 yang terukur.

## 9. Security and Audit

- Session cookie HttpOnly/Secure pada HTTPS, same-site sesuai deployment same-origin; CSRF berlaku pada seluruh mutations termasuk JSON/login/logout. Jangan mengecualikan `/api/v1/*` karena label API. Dokumentasi: [CSRF Laravel 13](https://github.com/laravel/docs/blob/13.x/csrf.md).
- Login memakai Fortify, hash password dan rate limiter existing. Inactive user gagal login; existing inactive session tidak boleh melakukan operasi baru. Logout invalidates session/token sesuai auth framework.
- Tidak ada public registration, privilege self-edit, user delete atau password/token di resource/log. Akun role terbaru diperiksa backend; tidak mengandalkan props frontend.
- Validate/allowlist fields; Form Requests dan policies pada mutations; API Resources mencegah bocornya full customer data lewat candidate/task list. Escaping UI untuk name/address/notes; query filters parameterized, sort allowlist.
- Audit operational create/assign/takeover berada dalam transaksi yang sama dengan perubahan task. Tulis actor/waktu server; audit tidak menerima actor dari client. Candidate non-owner tidak menerima history penuh.
- Audit Admin account memakai log aplikasi existing yang aksesnya dibatasi. Jangan merekam password, session/CSRF token atau payload auth lengkap.
- FK RESTRICT dan ketiadaan hard-delete endpoints melindungi jejak akun/customer/task. User nonaktif tidak menghapus history. Retention/backup production tetap gate terpisah, bukan dependency desain M1.

## 10. Test Plan

Desain pengujian saja, belum dijalankan karena fitur belum diimplementasikan. Backend feature tests menggunakan Pest existing, factories dan RefreshDatabase mengikuti sibling tests. Freeze time untuk timestamp/scheduled filters. Assert HTTP/resource/state/event yang dapat diamati; tidak hanya menyalin isi policy atau deklarasi schema.

### 10.1 Backend feature coverage

| ID     | Skenario                                                                                          | Hasil/asser­tion penting                                                                                                                                   | Traceability           |
| ------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| M1-T01 | CS create pickup valid                                                                            | 201, SCHEDULED/null assignee/version1, snapshot benar, satu created event actor/time                                                                       | FR-PU-001; AC-001      |
| M1-T02 | Customer invalid, address kosong, time invalid/tanpa offset; customer contact kosong              | 422 field error yang benar; task/event tidak dibuat; customer contact required                                                                             | FR-CU-001; M1-DEC-003  |
| M1-T03 | CS assign active pickup staff                                                                     | 200, ASSIGNED/version+1, satu assigned event dan task tampak pada staff                                                                                    | FR-PU-002; AC-001      |
| M1-T04 | Staff inactive/role salah dipilih                                                                 | 422; assignment/event tetap; candidate picker tidak memasukkan user tersebut                                                                               | FR-PU-002              |
| M1-T05 | Staff list/detail authorized                                                                      | Own list hanya miliknya; eligible task lain hanya candidate projection; tidak ada contact/notes/audit bocor; SCHEDULED non-own404                          | AC-016; FR-WS-001/006  |
| M1-T06 | Eligible takeover tanpa approval                                                                  | 200, assignee actor, reference/ID tetap, tidak ada request approval                                                                                        | M1-DEC-004; AC-025     |
| M1-T07 | Status setelah takeover                                                                           | Tetap ASSIGNED; version naik satu; tidak ada task baru/status baru                                                                                         | FR-PU-010; AC-025      |
| M1-T08 | Previous assignee loses ownership                                                                 | Tidak muncul My Tasks lama; detail full tidak tersedia; boleh projection jika masih eligible. Guard operasi owner menolak actor lama                       | AC-016/025             |
| M1-T09 | Dua contender memakai version/assignee sama                                                       | Satu200, satu409; owner/version/event sesuai satu winner                                                                                                   | AC-025; NFR-004        |
| M1-T10 | Role bukan Pickup, inactive session, task SCHEDULED, marker nonnull, self takeover, stale version | 403 untuk role/active;409 untuk state/precondition; tidak ada mutation/event sukses                                                                        | M1-DEC-004; AC-016/025 |
| M1-T11 | Audit create/assign/takeover                                                                      | Actor, server timestamp, old/new staff dan version tepat; failure event insert rollback perubahan                                                          | Audit scope; AC-025    |
| M1-T12 | Snapshot tidak mengikuti master                                                                   | Fixture master berubah; task snapshot tetap, task baru memakai master baru                                                                                 | FR-CU-003; AC-019      |
| M1-T13 | Assignment stale/double submit                                                                    | Satu assign; request stale409; tidak dua events atau CS reassign sesudah ASSIGNED                                                                          | Lifecycle M1           |
| M1-T14 | Login/logout/public registration                                                                  | Login valid, inactive/wrong password rejected; logout401 pada operasi lanjut; GET/POST register404; login limiter; active changed saat session berjalan403 | Auth scope             |
| M1-T15 | Account/create/policy/mass assignment                                                             | Single-role valid; duplicate email422; non-Admin403; client role/status/actor/marker injection ditolak; TD-08 conflict409                                  | M1-DEC-002; security   |
| M1-T16 | Timeout/retry dan ABA                                                                             | Stale replay tidak menambah event; version lama ditolak walaupun staff asal kembali sama                                                                   | AC-025                 |

Karena recording tidak ada pada M1, M1-T08 menguji policy ownership dan resource access sekarang; actual recording request oleh staff lama menjadi integration test ketika M2–M3 menambah endpoint, bukan membuat endpoint palsu untuk test M1. Marker nonnull pada M1-T10 diatur sebagai fixture guard test, tanpa route mulai eksekusi.

### 10.2 Concurrency test yang membuktikan race

Sequential feature test dua stale payload membuktikan version rejection, tetapi bukan bukti row-lock contention. Untuk slice takeover, tambahkan test concurrency pada MySQL test database terisolasi (engine yang sama dengan aplikasi), menggunakan dua connection/request/process independen dan task yang telah committed, bukan transaksi fixture SQLite in-memory yang tidak dapat dibaca proses lain.

Sinkronkan contender setelah keduanya membaca version sama; biarkan keduanya mencoba mutation, tunggu completion dan verifikasi satu sukses/ satu konflik, satu takeover event, satu assignee. Uji rollback audit dan race account deactivation bila default TD-08 diterapkan. Tidak menggunakan arbitrary sleep sebagai bukti race. Hindari menjalankan test ini terhadap database operasional. Driver test standar SQLite tetap dipakai untuk feature cases biasa; menambahkan group/config test MySQL tidak mengganti seluruh suite atau menambah service baru bila database test tersedia.

### 10.3 Frontend interaction tests dan mobile QA

| ID      | Interaksi                        | Expected result                                                                                                 |
| ------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| M1-UI01 | Login/logout dan role navigation | Register link tidak ada, menu sesuai role; refresh session sukses; inactive response menghentikan operasi       |
| M1-UI02 | Search/create customer           | Required fields/error422 jelas; input dipertahankan; customer hasil create dapat dipilih                        |
| M1-UI03 | Create task                      | Address pilihan CS dan timezone jelas; pending mencegah submit ganda; sukses tampil task SCHEDULED              |
| M1-UI04 | Assign staff                     | Picker aktif saja; detail/My Tasks sesuai staff;409 memuat state baru, bukan overwrite                          |
| M1-UI05 | Candidate + confirm takeover     | Data minimum terlihat; reason optional sesuai default; tanpa approval CS; sukses pindah ke own detail           |
| M1-UI06 | Conflict/timeout takeover        | 409 menampilkan pesan/review ulang; timeout tidak false success; no optimistic ownership/no automatic retry     |
| M1-UI07 | Dua session staff A/B            | B takeover; refresh A menghapus ownership; B melihat task; A tidak mendapat full detail meski URL lama dibuka   |
| M1-UI08 | Mobile 360/390px, desktop1280px  | Form/list/dialog dapat dipakai tanpa overflow halaman; focus/keyboard/label/pending/error/touch targets memadai |
| M1-UI09 | Admin single role/active         | Hanya satu role dipilih; invalid/assignment conflict jelas; password tidak ditampilkan di list                  |

Plan dapat dieksekusi sebagai interaction QA manual/browser tooling yang tersedia dengan langkah dan bukti hasil tersimpan. Belum ada automated React/browser test runner yang diverifikasi dari manifest; jangan menyatakan automation siap atau menambahkan dependency diam-diam. Jika tim memerlukan automated frontend tests, pemilihan runner/dependency diajukan terpisah, sementara skenario di atas tetap acceptance test yang wajib dijalankan. Backend coverage tidak menggantikan mobile/layout interaction QA.

## 11. Implementation Slices

Urutan ini PROPOSED. Kerjakan satu slice, uji dan review, baru lanjut. Setiap slice mempertahankan scope kecil; delivery awal bukan full M1 production.

| Slice                        | Objective                                    | Backend work                                                                                                                         | Frontend work                                                   | Tests                                               | Definition of Done                                                                                                             | Explicit exclusions                                                                   |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| S1 — bootstrap/auth          | Akun terotorisasi login dan akses dasar      | Reuse Fortify/session, role/active, no registration, JSON error envelope, Admin account minimum/provisioning; audit exposure starter | Login/logout, role shell, Users list/create/role-active minimum | M1-T14/15; UI01/09; CSRF request boundary           | Akun pilot terotorisasi tersedia; active/role enforced; tidak ada register publik; target timezone configured untuk berikutnya | OAuth,2FA baru, email onboarding, public reset flow baru, business tables selain user |
| S2 — customer minimum        | CS dapat memilih/membuat customer            | Customers table/model/resource, search/create, owner policy, contact default TD-01                                                   | List/search/create dialog                                       | Validation/authorization customer; UI02             | Tiga field required; search/create bekerja; contact format default dinyatakan                                                  | Edit/deactivate, multi-address, CRM/dedup engine                                      |
| S3 — task create/list/detail | CS menghasilkan pekerjaan tujuan/waktu jelas | Task/events, snapshot, UTC conversion, status SCHEDULED, scope/resources/create event                                                | CS list/create/detail, operasi penuh Admin                      | T01/02/12; UI03; date filtering/access              | Create→SCHEDULED dan audit atomik; snapshots benar; responsive detail                                                          | Assignment inline, task edit/cancel, execution                                        |
| S4 — initial assignment      | Task menjadi milik staff aktif               | Staff picker, SCHEDULED-only mutation, transaction/version guard/audit                                                               | Assign dialog, refreshed detail/list                            | T03/04/13; UI04                                     | SCHEDULED→ASSIGNED saja; wrong/stale/ inactive rejected; audit                                                                 | Reassign CS/unassign, bulk assign, dispatch optimization                              |
| S5 — staff workspace         | Staff membaca tugasnya mobile                | Assigned list/detail scope; own/candidate projection policy disiapkan                                                                | My Tasks/detail/mobile nav, empty/loading/error                 | T05/08 untuk hak baca; UI07/08 pada scope available | Own list/full detail benar; no data leakage; mobile usable                                                                     | Recording,attempt outcomes, GPS,offline                                               |
| S6 — direct takeover         | Staff berpindah ownership tanpa approval     | Candidate endpoint; takeover transaksi/locks/versions dan event                                                                      | Candidate list/dialog, pending/success/conflict/timeout         | T06–11/16, MySQL concurrency; UI05–08               | Satu winner dari stale version yang sama; audit dan ownership konsisten; no CS approval                                        | Push notification, approval, execution start, takeover task sudah mulai               |
| S7 — regression/UAT M1       | Kemampuan M1 lengkap dapat diterima          | Resolve related defects; run affected feature suite dan MySQL race test; verify policies/error shapes                                | Run all interaction/mobile cases; fix defects                   | Semua relevant T/UI; UAT walkthrough                | CS create→assign→A read→B takeover→ownership update; no regression in supported auth; asumsi operasional accepted              | M2–M6, production migration/cutover                                                   |

Pada implementasi gunakan generator Artisan sesuai aturan proyek, format PHP dengan Pint, static analysis dan TypeScript checks/build yang tersedia. Perintah/implementasi belum dijalankan dalam task desain. Existing tests yang bertentangan dengan registration scope direvisi, bukan dihapus. Pengujian sempit per slice lebih dahulu; complete suite sebelum sign-off M1.

## 12. M1 Definition of Done

M1 selesai ketika:

1. Approved M1-DEC-001–004 diterapkan; tidak ada multi-outlet/multi-role/permission builder.
2. Login/logout dan active/role authorization backend benar; public registration tidak tersedia.
3. CS search/create customer dengan name/address/contact mandatory, lalu create on-demand SCHEDULED dengan tujuan/waktu/notes valid dan snapshot sesuai desain yang disetujui.
4. CS assign staff aktif, task ASSIGNED terlihat pada workspace staff; version dan audit consistent.
5. Staff menemukan kandidat dan langsung takeover tanpa approval CS hanya ASSIGNED/marker null; task ID/status tetap, assignment berubah; pemilik lama kehilangan hak operasi/full detail.
6. Concurrent/stale takeover ditolak dengan hasil HTTP/UI yang jelas; MySQL test membuktikan satu owner dan audit atomic. Tidak hanya mengandalkan sequential SQLite test.
7. Role/payload/ID guessing tidak membuka customer contact/history atau operasi sensitif yang tidak berhak.
8. Audit create/assignment/takeover mencatat actor/waktu serta old/new assignee; audit failure rollback mutation.
9. Semua relevant backend features, frontend interaction cases/mobile QA, type/static checks dan build lulus setelah implementasi; hasil UAT CS/staff/Admin tercatat.
10. TD-01/03/04/05/08/09 dikonfirmasi atau default diterima secara eksplisit sebelum pemakaian operasional yang bergantung padanya. TD-06 notifikasi proaktif dapat ditunda; integrasi start TD-07 menunggu M2.

Sign-off M1 bukan sign-off production cutover, bukan bukti pickup/receipt/retail verification selesai. Tidak menguji acceptance M2–M6 sebagai gate M1.

## 13. Deferred Features and Future Compatibility

Di luar M1: Proof of Pickup, quantities, photos/signature, WhatsApp/email receipt, failure/attempt outcomes, recurring schedule/generation, Handover Session, retail verification/discrepancy, AWB, ERP integration/migration, multi-outlet/tenant, multi-role, permission builder, complex dashboard, offline synchronization.

Kompatibilitas sederhana: task ID/reference tetap untuk modul kemudian; snapshots dan audit dipertahankan; status strings dapat diperluas lewat perubahan tervalidasi; task version dan marker dipakai guard start M2; tables baru hanya ketika milestone relevan dibangun. Kontak generic dapat dipetakan/ditambah field kanal saat receipt M3 memang diperlukan, melalui perubahan contract/migration saat itu. Tidak mendesain schema atau API future modules sekarang.

User role gabungan Admin/Supervisor adalah usulan pemetaan M1. Jika nanti supervisory read-only terpisah dibutuhkan, tambah satu nilai role dan policy yang jelas; tetap tidak otomatis multi-role. Single outlet approved tidak menjadi alasan menambahkan outlet_id nullable “untuk nanti”.

## 14. Technical Risks and Mitigations

| Risk                                                      | Mitigasi minimum / batas                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Dua takeover stale sama-sama berhasil secara berurutan    | Row lock + expected version/assignee; retry harus review; no automatic conflict retry                                              |
| M1 tidak mengetahui eksekusi fisik di luar aplikasi       | Pilot M1 terbatas; marker authoritative ditulis M2 sebelum eksekusi; jangan menjanjikan deteksi otomatis                           |
| SQLite memberi rasa aman palsu tentang lock               | MySQL concurrency test terisolasi sebelum S6 DoD                                                                                   |
| Account active/role berubah saat assignment/takeover      | Lock/recheck actor/target user + task; account updates memakai user lock dan TD-08; consistent order user→task                     |
| Starter auth melanggar scope                              | Disable registration backend/link; audit verified gate/self-delete/profile routes; adjust existing tests tanpa deletion            |
| Candidate projection membocorkan contact/history          | Policy dan API Resource terpisah; request resource shape test, no raw-model serialization                                          |
| Kontak/timezone diasumsikan approved                      | TD-01/03 explicit PROPOSED; time with offset/UTC; contact nonempty; konfirmasi sebelum operasional                                 |
| Audit terpisah dari mutation                              | Task/event dalam satu transaksi; failure rollback test; no async audit                                                             |
| Double submit create saat timeout                         | Pending state/no auto-retry; reconcile list sebelum resubmit; jangan klaim exactly-once yang belum didesain                        |
| Admin deactivation meninggalkan tugas tanpa petugas aktif | TD-08 reject sampai ownership ditangani; no delete user; approve temporary handling sebelum operasi Admin                          |
| Frontend automated test dependency belum tersedia         | Interaction/manual QA wajib dengan evidence; automation tooling terpisah, tidak menghambat design atau memasang package tanpa izin |
| Desain membesar karena fitur PRD berikutnya               | Scope whitelist endpoints/tables/slices; receipt/handover/scheduling tetap deferred                                                |

### Technical Design Readiness Assessment

**READY WITH ASSUMPTIONS.** Desain lengkap untuk memulai S1 dan melanjutkan slice M1 secara bertahap. Tidak ada blocker dari M2–M6, provider receipt, handover atau ERP. Single-outlet/single-role/contact minimum/direct takeover telah approved; tidak perlu dikonfirmasi ulang.

Gate yang tersisa terbatas dan konkret: konfirmasi format kontak TD-01, timezone retail TD-03, pemetaan role/manajemen akun/customer TD-04, reason TD-05, guard account changes TD-08 dan provisioning/verified handling TD-09 sebelum UAT operasional terkait. Default PROPOSED memungkinkan build internal tanpa menunggu semua jawaban. Uji race membutuhkan MySQL test database terisolasi sebelum slice takeover dinyatakan selesai; ini kebutuhan verifikasi implementasi, bukan blocker menulis desain.

Notifikasi proaktif assignee lama dan detail execution-start M2 dapat ditunda. Tidak diperlukan migration, application code, dependency baru atau layanan eksternal untuk menerima dokumen desain ini.
