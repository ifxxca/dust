# Global UI/UX audit and refactor

Date: 2 November 2026. Repository: `S:/2026/dust`.

## Completion and scope

| Deliverable | Status |
| --- | --- |
| AUDIT | **PARTIAL** — all 39 web page sources, 8 layouts, navigation and shared controls inventoried; representative browser acceptance, not exhaustive acceptance of every page/state |
| SHIPMENT MONITORING UI | **FIXED** — real authenticated list/detail integration and the revised interactions verified on isolated application fixtures |
| GLOBAL REFACTOR | **PARTIAL** — coherent monitoring/dashboard/report/reconciliation batch completed; remaining work listed below |
| TESTING | **FAIL** — TypeScript, scoped lint, 176 web unit tests, production build and focused browser acceptance pass; existing regression/configuration and supplemental fixture-dependent checks described below remain unresolved |
| DEPLOYMENT | **NOT PERFORMED** |

No commit, push, deployment, worker restart, dependency installation into the project, schema change, operational-record modification or backend change was made for this UI batch. Existing uncommitted shipment-monitoring PHP/routes/navigation work and unrelated `.env.example`, documents and `Retail_Operations_Platform` files were preserved. The existing fixture generator created a new SQLite database under `output`; all browser mutations used that synthetic database. Production integrations were not exercised.

## Method and boundaries

Reviewed actual page/component sources, shell/layout resolution, route registration, generated Wayfinder functions, existing frontend tests, older audit inventories, native controls, disclosure uses, filters, date inputs and pagination. `.ai/rules` is absent. Existing skills and project instructions informed the implementation. The older `docs/ui-ux-audit/page-inventory.md` has 29 pages and is historical; the inventory below reflects the current 39.

Severity: **High** obstructs an important task or accessibility; **Medium** creates repeated interaction/consistency friction; **Low** is a secondary consistency issue; **None confirmed** means no actionable defect established by this pass, not a comprehensive sign-off. Source review and browser verification are distinguished throughout. Native HTML and constrained form widths are evaluated in context rather than banned.

## Task analysis for the changed batch

| User / page | Primary task and essential data | Frequent action / exception | Secondary information |
| --- | --- | --- | --- |
| Admin/supervisor, shipment monitoring | Find an imported AWB and its current report-derived status/customer | Search, customer/status/period filters, reset, page, open detail; empty/invalid/unavailable response | Freshness threshold and timestamp interpretation |
| Admin/supervisor, shipment detail | Inspect current status, identity and recorded observations | Read evidence, change history mode/page; missing timestamp/history | Raw source evidence and clock definitions |
| Admin/supervisor, shipment registry | Find AWBs and inspect collection/matching context | Search, customer/status/category, dates; report needs attention | Collection/tracking management, source/mapping filters |
| Admin/supervisor, customer dashboard | Scope customer shipment metrics | Customer/mapping/server/date selection, paging; no matching shipments | Chart/data breakdowns |
| Admin/supervisor, report AWBs | Inspect source rows of a report | Search/filter/page/open AWB; empty result | Existing import/projection controls and source metadata |
| Admin/supervisor, JNE reconciliation | Inspect pickup/shipment relationships | Filter/page/follow existing detail; unmatched or ambiguous evidence | Existing domain explanations |
| Operational dashboard users | Identify next pickup work and workload | Period/presets, refresh, create pickup; errors/attention | Chart data alternatives |

## Full web page inventory

Paths in this table are relative to `resources/js/pages/`. Each row represents a source page, not a claim that every file is a currently enabled public route. Multiplexed operations and dashboard variants require additional role/state acceptance.

| # | Source page | Finding / severity | Remediation and verification |
| --- | --- | --- | --- |
| 1 | `shipment-monitoring.tsx` | High: primary period/freshness hidden together; weak action/filter hierarchy; repeated footer | Fixed: visible desktop criteria, mobile Sheet, explicit optional freshness, applied chips, reset, shared pagination; browser 3 viewports and failure recovery |
| 2 | `shipment-monitoring-detail.tsx` | Medium: identity/current status/timestamps/evidence hierarchy and repeated footer | Fixed: header/status structure, readable identity grid, secondary source disclosure, shared pagination; browser read-only detail |
| 3 | `dashboard.tsx` | High: shared overview exceeded viewport at 200% text size | Fixed in overview/charts components; 375px enlarged-text test passes; 3 normal viewports captured |
| 4 | `jne-monitoring.tsx` | Medium: native management disclosure and inconsistent filter/date controls | Fixed disclosure/shared fields; mobile dates in existing advanced Sheet restore first AWB visibility; browser captures and date draft/apply/reset |
| 5 | `jne-customer-dashboard.tsx` | Medium: repeated dates/native select styling | Fixed shared date pair and FilterSelect for mapping/server; captures at 3 viewports; broader date-specific pagination fixture remains a limitation |
| 6 | `jne-report-awbs.tsx` | Medium: custom duplicate pagination | Fixed shared pagination with real navigable hrefs, result counts and boundary disabling; 3 viewports |
| 7 | `jne-reconciliation.tsx` | Medium: duplicate pagination | Fixed shared footer, original query/link behavior preserved; 3 viewports; matching actions not executed |
| 8 | `operations.tsx` | Medium: multiplexed task/user forms, separate date controls and filter variants | Remaining: progressively reuse date/filter patterns per screen, preserve role/assignment actions; current role, draft and route regression checks pass |
| 9 | `pickup-results.tsx` | Medium: wrapper delegates to several monitoring/filter implementations | Remaining in `pickup-monitoring*`, processing and automation components; sorting regression passes |
| 10 | `pickup-result-detail.tsx` | Low: complex proof/processing/correction sections need state-specific density review | Preserve finalized quantities and evidence; browser route smoke passed; end-to-end corrections not attempted |
| 11 | `pickup-wizard.tsx` | None confirmed: task sequence and POP evidence are purposeful | Preserve workflow; role and draft tests pass; final POP upload/signature/device flow not accepted here |
| 12 | `pickup-schedules.tsx` | Low: independent editor/filter spacing patterns | Remaining: review error-focus/dirty-state/date reuse with schedule-specific fixtures; no schedule changes |
| 13 | `handover.tsx` | Medium: independent list pagination/date patterns | Remaining: adopt footer incrementally; mobile selection and quantity preservation regression passes |
| 14 | `discrepancies.tsx` | Medium: separately arranged date fields (`325–334` at audit) | Remaining: pair dates consistently and check active-filter/reset behavior; domain comparison unchanged |
| 15 | `rekonsiliasi-resi.tsx` | Medium: delegated period/filter/pagination in `pickup-automation-monitoring.tsx` | Remaining: align presentation while retaining staged drafts/polling rules; supplemental date fixture unavailable |
| 16 | `cashless-handover.tsx` | Low: its single-day filter is valid, not a missing range picker | Preserve scanner/book selection and reconciliation; scanner/mobile device acceptance remains |
| 17 | `cashless-entry-result.tsx` | Low: domain result component has its own paging | Remaining: inspect `cashless-result-view.tsx` before adopting shared footer; source inspection only |
| 18 | `customers.tsx` | None confirmed in this batch: existing search, dialogs and URL state are successful | Preserve; URL/history, validation, loading-related existing regression, dirty drafts and picker keyboard tests pass |
| 19 | `jne-shipment.tsx` | Low: source and matching information are extensive but domain-relevant | Preserve source evidence/matching decisions; consider common detail header later; no matching mutation |
| 20 | `jne-reports.tsx` | Low: complex source/account/range form has domain constraints | Preserve report limits and source semantics; incremental shared dates only after source-mode acceptance |
| 21 | `jne-report-runs.tsx` | Medium: separate footer and date filter (`344`, `470` at audit) | Remaining: shared pagination/date arrangement with retry/download/run-state regression |
| 22 | `jne-profiles.tsx` | Medium: remaining native select/editor consistency | Remaining: migrate incrementally; current Hybrid PM/Puman independence and dialogs pass |
| 23 | `jne-collection-window.tsx` | Medium: 2 native selects and nested contract/evidence presentation | Remaining: select alignment; retain read-only contract/history disclosure and confirmation constraints |
| 24 | `jne-evidence-rules.tsx` | Medium: 3 native selects, long editor and nested audit disclosure | Remaining: shared selects/date fields with source-rule fixtures; existing disabled-activation expectation conflicts with current fixture configuration |
| 25 | `jne-exceptions.tsx` | Medium: 4 native selects and fragmented review panel | Remaining: shared controls and validation-focus review; raw evidence disclosure is legitimate |
| 26 | `jne-refresh-policy.tsx` | Low: constrained configuration form and audit disclosure are appropriate | Preserve policy controls; refine density later; no source refresh/policy change |
| 27 | `jne-shipper-aliases.tsx` | Low: independent import/dialog/table flow | Remaining: review import errors, draft recovery and pagination using dedicated fixtures |
| 28 | `push-test.tsx` | Low: technical controls appropriate for an admin diagnostic page | Preserve diagnostic separation; no notification sent |
| 29 | `welcome.tsx` | None confirmed: public entry is intentionally different from operations | No appearance-only rewrite |
| 30 | `auth/login.tsx` | None confirmed | Four-role login used by regression; no authentication code changed |
| 31 | `auth/forgot-password.tsx` | None confirmed | Existing recovery-copy browser test passes; no email delivery test |
| 32 | `auth/reset-password.tsx` | Low: token/error states need separate acceptance | Source review; no real reset submitted |
| 33 | `auth/confirm-password.tsx` | None confirmed | Existing password gate exercised in regression; behavior preserved |
| 34 | `auth/verify-email.tsx` | Low: unverified/resend states not exercised here | Source review; retain pending/success feedback |
| 35 | `auth/register.tsx` | None confirmed: fallback source; no active self-signup route | Do not invent a public registration workflow |
| 36 | `settings/profile.tsx` | None confirmed: constrained account form is appropriate | Existing Indonesian settings regression passes; deletion not executed |
| 37 | `settings/security.tsx` | None confirmed: intentional sensitive settings form width | Password gate/render covered; no password changed |
| 38 | `settings/appearance.tsx` | None confirmed | Theme selection/persistence regression passes |
| 39 | `errors/not-found.tsx` | None confirmed | Existing recovery/navigation browser check passes |

## Layout, navigation and component inventory

Eight layouts: `layouts/app-layout.tsx`, `app/app-sidebar-layout.tsx`, `app/app-header-layout.tsx`, `auth-layout.tsx`, `auth/auth-simple-layout.tsx`, `auth/auth-card-layout.tsx`, `auth/auth-split-layout.tsx`, `settings/layout.tsx`. The active application resolver uses the sidebar shell; header/auth alternatives are not duplicate live pages. Settings/auth constrained widths support their task and were retained.

Navigation: `app-sidebar.tsx`, `nav-main.tsx`, `nav-user.tsx`, `breadcrumbs.tsx`, `app-sidebar-header.tsx`, and `lib/jne-navigation.ts`. Shipment monitoring list/detail routes are registered, use authenticated admin/supervisor access, have an existing JNE navigation entry and detail breadcrumb, and return fixture data (30 AWBs; first page 20). Initial emptiness was not assumed. Added navigation tests cover exact list/detail and query-string matching. Existing four-role browser checks pass; no permissions expanded.

The 28 existing UI modules are: alert, avatar, badge, breadcrumb, button, card, checkbox, collapsible, dialog, dropdown-menu, icon, input, label, navigation-menu, placeholder-pattern, select, separator, sheet, sidebar, skeleton, sonner, spinner, table, textarea, toggle, toggle-group, tooltip. All are under `resources/js/components/ui/`. There is no existing Calendar/Popover/Command/Pagination module or calendar dependency. Existing Radix components are sufficient for this increment; no new library was added.

| Shared area | Existing implementation / decision |
| --- | --- |
| Page container/header | `page-container.tsx`, Heading; new small `page-header.tsx` composes title/description/actions. Retain fluid/wide/form variants; flex pages override `space-y-0` locally |
| Filters | Existing `jne-shipment-filters.tsx`, CustomerPicker and domain filters; extracted `filter-select.tsx` uses existing Radix Select, labels, disabled/error associations and empty-value translation |
| Date range | New `date-range-fields.tsx` pairs existing styled Input date controls in a labelled fieldset. Native browser calendar is intentionally retained, with literal YYYY-MM-DD values and end-date minimum |
| Disclosure | Existing Collapsible/Dialog/Sheet; `secondary-disclosure.tsx` provides a visible button/chevron for secondary material. Force-mounted content preserves existing child state while closed CSS hides it |
| Tables/pagination | Reused `DataTablePagination` from `data-table.tsx`; optional allowed sizes and href generator support new consumers. URL-driven report footers remain actual links; boundaries remain disabled |
| Pickers | Existing CustomerPicker retained search, async loading and keyboard semantics; `aria-controls` now references its list only when open |
| Feedback | Existing Alert/InputError/EmptyState/Spinner/Skeleton/Sonner reused. Monitoring retains data during loading and has retryable 5xx/network copy |
| Domain presentation | ShipmentStatus, run/category/processing badges, source evidence, pickup proof and handover controls retain distinct meanings |
| Charts | Existing operational and customer SVG charts/data alternatives retained; operational controls now wrap under enlarged text |

Other shared workflow components inventoried include CreatePickup/Dialog, BulkPickupAssignment, CustomerForm/Dialog/DataTable, PickupOperationalList, PickupDetail/Execution/Proof, PickupMonitoring/Processing/AutomationMonitoring and drawers, Handover session/detail/verification, cashless scanner/proof/results, JneShipmentTable/DetailSheet/InlineDetail, report settings/accounts/run dialogs, source-contract/refresh-policy fields, monitoring workspace/detail/insights, signature/photo inputs, notifications and password controls. Their workflow-specific composition is not replaced by a generic framework.

## Confirmed repeated problems and decisions

1. **Primary filter discoverability (High, fixed new monitoring):** `shipment-monitoring.tsx` grouped period and freshness inside native disclosure. Desktop now shows search/customer/status/lifecycle and period; mobile has a clearly named Sheet. Apply/Reset are grouped with the criteria. Freshness is optional and secondary, without an invented default threshold.
2. **Mobile height (Medium, fixed registry):** `jne-shipment-filters.tsx` previously placed every date control inline. The shared range adds understandable labels; on mobile that range now uses the existing Filter Sheet. Search/customer/status/category remain directly available. First AWB is again within the 844px viewport (approximately 809px on the audited fixture). Date drafts survive close/reopen and apply/reset is tested.
3. **Repeated filter/date styling (Medium, partly fixed):** shared selects/ranges adopted in monitoring and customer dashboard; remaining native selects in collection/rules/exceptions/profiles are documented above. Native selects can remain accessible; the confirmed issue is inconsistent presentation/interaction, not a blanket accessibility failure.
4. **Repeated pagination (Medium, partly fixed):** new monitoring list/detail, report AWBs and JNE reconciliation reuse the existing footer. `handover.tsx`, `jne-report-runs.tsx`, cashless results and delegated monitoring require separate follow-up. Preserve URL navigation/open-in-new-tab behavior when replacing a link footer.
5. **Secondary disclosure (Medium, partly fixed):** new monitoring timestamp/source explanation and registry collection management use the shared control. Native evidence JSON, POP revisions, contract requirements and audit histories remain valid candidates for disclosure; no global `<details>` prohibition.
6. **Enlarged-text overflow (High, fixed):** `operational-dashboard-overview.tsx` date button, metric rows and preset group and `operational-dashboard-charts.tsx` metric group could exceed a 375px viewport at 200% root text. Bounded/wrapping controls fix this without changing dashboard data/calculation.
7. **Dangling picker relationship (Medium, fixed):** `customer-picker.tsx` previously referenced a listbox ID while closed. Relationship is now conditional on open state.
8. **Shell landmarks (Medium, remaining):** full-document axe reports sidebar/mobile shell content outside landmarks. Main monitoring content has no reported violations in the focused scan, but full-shell accessibility acceptance is not complete.

## Data and business semantics preserved

- Monitoring displays imported/discovered AWBs, not proof of every AWB held by the carrier. No new polling, source refresh, source access or alerting workflow.
- Date values are calendar literals passed unchanged to existing endpoints. Monitoring retains the backend 05:00 Asia/Jakarta operational-day rule. Customer dashboard retains its existing endpoint semantics; frontend components do not redefine date boundaries.
- Source status event time, snapshot observation time and local report receipt remain separate, labelled values. Missing source times remain unavailable rather than fabricated.
- Freshness depends on a user-supplied threshold. Removing the threshold clears its dependent stale filter; independent unobserved filtering is retained. No SLA or failed-final status is invented.
- Detail remains read-only and presents recorded report observations, not a synthetic courier timeline. Source evidence is retained in secondary disclosure.
- Pagination/filter query values, report navigation and existing matching/collection/POP permissions and quantities remain unchanged.

## Evidence

Synthetic screenshots and JSON: [evidence directory](S:/2026/dust/output/global-ui-ux-f87af83d). There are 21 before and 21 after page/viewport images: seven pages × 1440×900, 1366×768 and 390×844. Names use `before/after-{page}-{width}.png`. Dashboard baseline was captured separately before its CSS fix; `before-acceptance.json` was overwritten by that additional capture and is not the original six-page aggregate. Images remain intact. Final aggregate is `after-acceptance.json`.

| Page | Desktop before / after | Mobile before / after |
| --- | --- | --- |
| Shipment monitoring | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-shipment-monitoring-1440.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-shipment-monitoring-1440.png) | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-shipment-monitoring-390.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-shipment-monitoring-390.png) |
| Shipment detail | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-shipment-detail-1440.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-shipment-detail-1440.png) | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-shipment-detail-390.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-shipment-detail-390.png) |
| Shipment registry | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-shipment-registry-1440.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-shipment-registry-1440.png) | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-shipment-registry-390.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-shipment-registry-390.png) |
| Customer dashboard | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-customer-dashboard-1440.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-customer-dashboard-1440.png) | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-customer-dashboard-390.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-customer-dashboard-390.png) |
| Report AWBs | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-report-awbs-1440.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-report-awbs-1440.png) | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-report-awbs-390.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-report-awbs-390.png) |
| JNE reconciliation | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-reconciliation-1440.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-reconciliation-1440.png) | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-reconciliation-390.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-reconciliation-390.png) |
| Operational dashboard | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-dashboard-1440.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-dashboard-1440.png) | [before](S:/2026/dust/output/global-ui-ux-f87af83d/before-dashboard-390.png) / [after](S:/2026/dust/output/global-ui-ux-f87af83d/after-dashboard-390.png) |

Visual inspection covered monitoring list/detail and customer dashboard at desktop/mobile and the operational dashboard/mobile registry after the extra fixes. Automated checks cover all 21 final captures; screenshots alone are not exhaustive visual sign-off. [Dashboard enlarged-text baseline](S:/2026/dust/output/global-ui-ux-f87af83d/before-dashboard-200-percent.png) and existing regression screenshot show the accessibility-specific case.

## Verification results and unresolved failures

| Check | Result |
| --- | --- |
| `npm run types:check` | PASS, web and mobile TypeScript |
| `npx vp test resources/js --run` | PASS: 24 files, 176 tests, including seven new filter/date/reset/pagination tests and monitoring navigation cases |
| Scoped `npx vp lint … --deny-warnings` | PASS on edited frontend modules and browser scripts |
| `npm run build` | PASS; existing optional fontaine/plugin timing advisories, no dependency added |
| `tests/Browser/shipment-monitoring.mjs` | PASS: real authenticated routes, three viewports, 30 fixture shipments, search leading-zero AWBs, status filter/chip removal, reset, date/freshness 422 focus and recovery, independent chip dependencies, page 2, read-only detail, empty results, pending controls, injected 503 and retry, keyboard Sheet open/close/focus return, zero page exceptions |
| `tests/Browser/global-ui-ux.mjs` | PASS: seven routes × three viewports, HTTP 200/h1, before/after captures, no document overflow/page exceptions; final mobile registry date draft/apply/reset check |
| Existing `tests/Browser/ui-ux-remediation.mjs` | Last full run: 17/18 pass after updating obsolete dashboard/search/region selectors. Targeted rerun after mobile registry date move passes first-row visibility and reaches the later activation-checkbox failure. Earlier 200% text overflow is fixed and its targeted test passes |
| Existing `tests/Browser/jne-shipment-search.mjs` | FAIL with this fixture: expects nonempty `manual_hybrid` category and exact category totals; generic fixture creates no corresponding verified category evidence. No category rules/data changed to satisfy it |
| Existing `tests/Browser/pickup-reconciliation-range.mjs` | FAIL with this fixture: hard-coded October 2026 range has no required reconciliation row; current fixture uses the current date and lacks the expected specialized reconciliation evidence |
| Unscoped `npx vp test --run` (attempt) | Not an accepted web gate: it also collects Node worker test suites/mobile tests into the wrong runner; 33 suites/248 tests passed, 8 suites failed (Node-runner mismatch and missing mobile `__API_ORIGIN__`). Correct scoped web command above passes |

The remaining remediation regression expects **“Verifikasi dan aktifkan aturan ini”** to be disabled while the current fixture server returns that page with its evidence feature enabled. The UI source already uses `disabled={!enabled}`; this batch did not alter it. The failure is preserved rather than weakening its safety assertion or modifying production flags. Match the intended isolated feature configuration and rerun that test before declaring the existing browser gate green. The specialized supplemental scripts need their own matching fixtures; their failures are not evidence that current business matching/category behavior should change.

Backend PHP tests were not rerun for these presentation-only edits. Earlier shipment-monitoring backend verification belongs to `shipment-monitoring-v1.1-feasibility.md`, not to this UI batch. No claim is made that backend/static-analysis/release blockers from that audit are closed.

## Accessibility

- Shared controls have labels, error IDs and invalid state; date range has a fieldset/legend; page headers retain h1; decorative icons are hidden; focus styles and existing Radix focus behavior are retained.
- Browser tests verify validation focus/draft recovery, keyboard Sheet return, customer picker navigation, skip link, overlay trap/return, sorting announcements, theme state and reduced-motion behavior.
- The operational dashboard now fits at 375px with 200% root font size, without clipping/overflow. Normal desktop/laptop/mobile captures also pass.
- Final focused `main` axe scan reports 36 passing rules, zero violations and zero incomplete checks (`a11y-monitoring-main.json`); full-document final scans record one **region** rule violation from shell content outside landmarks. Desktop also has one incomplete contrast check because axe cannot parse a neutral OKLCH avatar color. See `a11y-monitoring-{desktop,mobile}.json` in evidence. These are not silently counted as passes.
- Initial mobile Sheet scan had no violations but incomplete focus-guard/contrast checks. Automated axe and Chromium keyboard checks do not establish screen-reader, Safari/date-picker, touch hardware or full WCAG conformance.
- The generic fixture supplies current shipment/source rows but no observation history for the captured detail. Empty-history handling is verified; populated history and long-history pagination still need a dedicated browser fixture. Existing backend coverage is not substituted for that visual acceptance.

## Frontend conventions / regression prevention

1. Start with user, task, essential data, frequent actions, exceptions and secondary information. Use a compact title/actions row, then search/criteria and the working table. Do not add instructional heroes or unrelated KPI cards.
2. Use the existing PageContainer width appropriate to the task; a flex/gap page explicitly sets `space-y-0`. Do not globally widen account/auth forms.
3. Reuse Input/Button/Select/Dialog/Sheet/Table and shared fields. Add a primitive only after checking inventory and installed versions. Do not add a library merely to style dates.
4. Search and frequent desktop criteria remain visible. Mobile may use a clearly named Sheet. Keep applied filters visible/removable; distinguish unapplied drafts from applied URL values. Reset clears the documented filter state predictably.
5. Use DateRangeFields for new paired calendar inputs. Keep literal dates, contextual endpoint semantics and operational timezone/boundary; do not convert a YYYY-MM-DD input through UTC Date serialization. Domain single-day inputs remain valid.
6. Put freshness thresholds and source/audit explanations behind contextual secondary controls when appropriate. Never imply source-event freshness from local receipt time or invent missing statuses/timelines.
7. Reuse DataTablePagination. Preserve actual hrefs when previous navigation was a link; retain query values, result counts, allowable page sizes and disabled boundaries.
8. Disclosures are for secondary context. Use the shared visible button pattern for revised operational sections. Native details remain acceptable for suitable evidence/history; do not introduce an indiscriminate lint ban.
9. Keep controls usable by keyboard/touch, associate errors and focus invalid inputs, retain drafts through failures, announce pending state and provide recoverable errors. Relationship IDs must exist when referenced.
10. Test changed behavior and important failure modes with shared-component unit tests and route-driven browser acceptance. Capture desktop/laptop/mobile before/after, inspect first-task visibility and document overflow, and test enlarged text on changed dashboards. Do not infer visual acceptance from TypeScript/build alone.
11. Run existing domain scripts with their documented specialized fixtures and feature flags. Selector maintenance must follow actual accessible names without deleting safety/permission/data assertions to make a test green.

## Remaining work, in order

1. Resolve the existing browser fixture/configuration mismatches and rerun those gates; complete shell landmark/contrast manual accessibility review.
2. Standardize pickup monitoring/automation ranges, active filters and footers with specialized POP/reconciliation fixtures, preserving staged drafts, polling pauses, quantities and evidence.
3. Adopt shared pagination in handover/report runs/cashless results only after their role/history/scanner workflows can be exercised.
4. Migrate collection/evidence/exception/profile native selects and long forms incrementally; verify disabled feature states, validation focus, saved drafts and evidence disclosure before altering composition.
5. Finish per-state and physical-device acceptance for cashless camera/scanner, POP signature/uploads, account/email flows, import errors and remaining administrative dialogs. No global refactor completion claim until those affected pages are verified.

The delivered result is a verified high-impact UI batch with a full source inventory and an explicit remaining backlog, not a production deployment or an all-pages usability certification.
