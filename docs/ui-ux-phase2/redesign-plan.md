# Phase 2 — product experience redesign plan

The existing discovery and UI/UX policy are retained. This phase reviews information hierarchy, not route discovery or technical compliance scores.

## Benchmark: Admin Operational Dashboard

Primary decisions:
1. Which incomplete pickups require intervention? Use the deduplicated attention total, the existing six oldest attention records, reasons, and task detail links.
2. Where is handover or physical verification blocked? Keep waiting-handover and discrepancy counts visible with the queue; inspect the existing monitoring records before acting.
3. How much pickup work is occurring in the selected operational period? Show pickup activity, finalized packages, successful pickups, and one daily activity visualization. Do not imply targets or historical status snapshots.

Current hierarchy: date/filter card → four decorative KPI cards with repetitive definitions/comparisons → secondary KPI strip → activity chart and shipping donut → staff/type/category cards → exception queue and customer ranking → customer cohort/destination cards → recent activity. The exception queue competes with analytics and occurs after the chart and staff breakdown.

Proposed hierarchy: title/actions → compact date toolbar and explicit operational-day scope → three operational totals → exception queue and one daily activity chart → secondary pickup breakdown/comparisons, customer/staff tables, shipping snapshot/destination links, and recent activity disclosures. On narrow screens, exceptions precede the chart. Source definitions remain accessible; actionable exceptions remain expanded.

Preserve: the unchanged overview payload, four comparison measures, status/type/category totals, cohort definitions, staff and customer rankings, final-proof semantics, JNE snapshot freshness/calendar-date semantics, date presets, creation/refresh actions, role restrictions, all existing drill-down URLs.

Classification: information architecture + visual hierarchy + disclosure interaction. No user-tested usability claim. Verification must show exception/task visibility and reduction of competing charts/cards, in addition to regression checks.

## Sequence

1. Capture baseline at 1366×768, 768×1024, 390×844, and 320×740 with light theme, zoom/DPR 1, the same fixture and roles.
2. Implement and verify the Admin benchmark; verify CS because it shares the overview.
3. Review the already-discovered pages individually for the same structural problems. Prioritize role dashboards and customer analytics, then monitoring/detail/workspace pages. Retain concise forms and lists where restructuring has no evidenced benefit.
4. Capture identical after states and exercise filters, metrics, disclosure, drill-downs, empty/error states, and authorization. Record remaining limitations and unrelated in-progress changes separately.

Do not edit the user's report/profile/auth changes or backend business rules. Native pages require a device limitation statement unless runtime evidence becomes available.

## Page-by-page priority and disposition

High/medium priorities are based on observed displacement of current work, not arbitrary scores. Use frequency is inferred from the operational role and task, not measured telemetry.

| ID / page | Priority | Primary-task impact | Inferred use | Complexity / dependencies | Disposition |
|---|---|---|---|---|---|
| P01 Halaman utama | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Preserve user-owned work |
| P02 Masuk | Low | No justified additional structural change | Awal shift | Low · Existing page and capability contracts | Preserve user-owned work |
| P03 Lupa kata sandi | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Intentionally retain |
| P04 Reset kata sandi | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Intentionally retain |
| P05 Verifikasi email | Low | No justified additional structural change | Kondisional | Low · Existing page and capability contracts | Intentionally retain |
| P06 Konfirmasi kata sandi | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Intentionally retain |
| P07 Registrasi nonaktif | Low | No justified additional structural change | Tidak aktif | Low · Existing page and capability contracts | Intentionally retain |
| P08 Dashboard Admin | High | Brings current work or analysis ahead of secondary summaries/history | Harian | Medium · Overview / RoleDashboard / activity chart | Implement; verify with paired captures and task checks |
| P09 Dashboard CS | High | Brings current work or analysis ahead of secondary summaries/history | Harian | Medium · Overview / RoleDashboard / activity chart | Implement; verify with paired captures and task checks |
| P10 Dashboard Retail | High | Brings current work or analysis ahead of secondary summaries/history | Per shift | Medium · Overview / RoleDashboard / activity chart | Implement; verify with paired captures and task checks |
| P11 Dashboard Pickup | High | Brings current work or analysis ahead of secondary summaries/history | Per shift | Medium · Overview / RoleDashboard / activity chart | Implement; verify with paired captures and task checks |
| P12 Master customer | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P13 Operasional Pickup | Medium | Brings current work or analysis ahead of secondary summaries/history | Berulang per shift | Medium · Operations / PickupSummaryCards | Implement; verify with paired captures and task checks |
| P14 Tugas Saya | Low | No justified additional structural change | Setiap pickup | Low · Existing page and capability contracts | Intentionally retain |
| P15 Tugas tersedia | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P16 Riwayat Pickup | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P17 Buat Pickup | Low | No justified additional structural change | Berulang per shift | Low · Existing page and capability contracts | Intentionally retain |
| P18 Detail Pickup | Low | No justified additional structural change | Setiap pickup | Low · Existing page and capability contracts | Intentionally retain |
| P19 Pengguna | Low | No justified additional structural change | Berkala | Low · Existing page and capability contracts | Intentionally retain |
| P20 Eksekusi Pickup / POP | Low | No justified additional structural change | Setiap pickup | Low · Existing page and capability contracts | Intentionally retain |
| P21 Jadwal Regular | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P22 Monitoring pemrosesan | Low | No justified additional structural change | Berulang per shift | Low · Existing page and capability contracts | Intentionally retain |
| P23 Monitoring hasil pickup | Low | No justified additional structural change | Berulang per shift | Low · Existing page and capability contracts | Intentionally retain |
| P24 Detail Hasil Pickup | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P25 Daftar Handover | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P26 Riwayat Handover | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P27 Verifikasi Handover | Low | No justified additional structural change | Setiap serah terima | Low · Existing page and capability contracts | Intentionally retain |
| P28 Monitoring Selisih | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P29 Dashboard customer | High | Brings current work or analysis ahead of secondary summaries/history | Harian | Medium · CustomerServerSummary / existing analytics components | Implement; verify with paired captures and task checks |
| P30 Pengiriman JNE | Low | No justified additional structural change | Berulang per shift | Low · Existing page and capability contracts | Intentionally retain |
| P31 Detail AWB | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P32 Rekonsiliasi POP & AWB | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P33 Pengaturan penarikan | Low | No justified additional structural change | Berkala | Low · Existing page and capability contracts | Preserve user-owned work |
| P34 Penarikan Report | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P35 Riwayat run | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Preserve user-owned work |
| P36 AWB dalam report | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P37 Customer & nama pengirim | High | Brings current work or analysis ahead of secondary summaries/history | Berkala | Medium · Mapping status / customer directory | Implement; verify with paired captures and task checks |
| P38 Aturan bukti JNE | Low | No justified additional structural change | Berkala | Low · Existing page and capability contracts | Intentionally retain |
| P39 Pemeriksaan exception | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Intentionally retain |
| P40 Koleksi eksternal | Low | No justified additional structural change | Per pemeriksaan | Low · Existing page and capability contracts | Intentionally retain |
| P41 Kebijakan tracking | Low | No justified additional structural change | Berkala | Low · Existing page and capability contracts | Intentionally retain |
| P42 Tes Notifikasi | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Intentionally retain |
| P43 Profil | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Intentionally retain |
| P44 Keamanan | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Intentionally retain |
| P45 Tampilan | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Intentionally retain |
| P46 Halaman tidak ditemukan | Low | No justified additional structural change | Saat error | Low · Existing page and capability contracts | Intentionally retain |
| P47 Mobile: boot/session/login | Low | No justified additional structural change | Awal shift | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P48 Mobile: beranda | Low | No justified additional structural change | Per shift | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P49 Mobile: modul | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P50 Mobile: tugas/tersedia/riwayat | Low | No justified additional structural change | Setiap pickup | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P51 Mobile: detail/private proof | Low | No justified additional structural change | Setiap pickup | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P52 Mobile: hasil kunjungan | Low | No justified additional structural change | Setiap pickup | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P53 Mobile: POP/foto/signature/review | Low | No justified additional structural change | Setiap pickup | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P54 Mobile: pemulihan draft | Low | No justified additional structural change | Saat gangguan | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P55 Mobile: pickup manual | Low | No justified additional structural change | Harian | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P56 Mobile: handover | Low | No justified additional structural change | Setiap handover | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P57 Mobile: notifikasi | Low | No justified additional structural change | Per event | Low · Existing page and capability contracts | Retain source; device verification outstanding |
| P58 Mobile: akun | Low | No justified additional structural change | Sesekali | Low · Existing page and capability contracts | Retain source; device verification outstanding |
