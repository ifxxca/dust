# UI/UX Remediation Results

Branch: `codex/ui-ux-remediation`. Baseline: `56dd4db2636bfc4fd702d3d8569230d09bb4eb26`.

**Completed: Wave 1–4, all 14 documented issues Fixed within their audited scope. No issue is Blocked or Partially Fixed.** This is the current remediation status; the original audit documents remain historical baseline evidence. Business rules, role permissions, API payload structures, report automation and shipment processing are outside the changes. The four pre-existing modified application files and pre-existing untracked audit/presentation/output files are preserved; they are not swept into remediation commits.

## Wave 1 — Usability

Commit subject: `fix(ui): resolve wave 1 usability issues`.

| Issue | Status | Fix and changed files | Verification | Remaining limitations |
| --- | --- | --- | --- | --- |
| UI-01 | Fixed | `resources/css/app.css`: darker light primary; readable dark primary foreground; matching sidebar tokens | Actual computed contrast: light primary 5.50, hover 4.58, active navigation 4.76; dark primary 6.78, hover 5.73, navigation 5.36 | Measurements cover the affected controls, not every color pair in the application |
| UI-02 | Fixed | `customer-dialog.tsx`, `customer-form.tsx`: track dirty separately from busy and confirm discard on Escape, X and Cancel | Browser verifies clean Escape, rejecting discard through all three paths preserves input, accepting discard closes and resets the new form | Uses native accessible browser confirmation, consistent with existing workflow guards; OS dialog appearance varies |
| UI-03 | Fixed | `customer-form.tsx`: invalid/error association for all fields; focus and scroll first invalid field after unsuccessful submit | Real fixture 422, contact focused and visible, aria-describedby resolves to message, name retained; component regression test | Contact requirement unchanged; localization follows in Wave 3; no screen-reader certification |
| UI-04 | Fixed | `handover-session-detail.tsx`: focus/scroll selected verification panel below desktop breakpoint; return to selected task; retain existing per-task drafts | 375×812 with 12 task fixture; panel top 79.5 px; counts survive task switches and return | No verification/finalization submitted; physical Android is not tested |

Files above are in `resources/js/components/` unless a full path is shown. No DataTable or Radix focus implementation was replaced.

Checks completed:

- Frontend regression: 3 files / 10 tests passed, including new `resources/js/lib/customer-form.test.tsx`.
- PHP regression: CustomerManagement, HandoverVerification, OperationalWorkspace — 35 tests / 339 assertions passed.
- `npm run types:check`: web and mobile TypeScript passed.
- `npm run build`: passed, using a fresh bundle for browser checks.
- Targeted lint: passed for changed application TSX and new frontend test.
- Browser: 4 checks passed; [machine results](remediation/wave-1/browser-results.json), [contrast](remediation/wave-1/wave-1-contrast-primary-and-active-navigation.png), [validation](remediation/wave-1/wave-1-customer-422-focuses-visible-invalid-field-and-preserves-draft.png), [mobile handover](remediation/wave-1/wave-1-mobile-handover-opens-selected-panel-and-retains-quantities.png).

The before-fix reproduction used the fresh baseline bundle and confirmed the audit scenarios in an isolated SQLite application. Browser infrastructure initially lacked a process-level SQLite driver; enabling the already-installed PDO SQLite extension for that process resolved it. Artisan's test child process did not inherit the flag, so the successful PHP run uses the direct Pest runner with the extension enabled. These setup failures are not represented as application regressions.

## Wave 2 — Accessibility

Commit subject: `fix(ui): resolve wave 2 accessibility issues`. Wave 1 commit: `458808d`.

| Issue | Status | Fix and changed files | Verification | Remaining limitations |
| --- | --- | --- | --- | --- |
| UI-07 | Fixed | `operational-dashboard-charts.tsx`: responsive max-width/aspect ratio for donut containers | 375 px with root text size 200%: document width remains 375 px | Root text enlargement is not a complete browser zoom/assistive technology certification |
| UI-08 | Fixed | `pickup-monitoring.tsx`: active TH aria-sort and directional icons | Browser changes customer sorting descending → ascending and finds exactly one active sort column; existing component test covers default sort | Table data/business ordering unchanged |
| UI-09 | Fixed | `create-pickup.tsx`, `customer-picker.tsx`: linked label/trigger ID; existing Radix DialogTrigger composition | Find picker by stable Customer label; Enter, arrow-key selection, close and return focus succeed | Native screen-reader software not tested |
| UI-10 | Fixed | `app-shell.tsx`, `app-content.tsx`: first-focus skip link and focusable main landmark | First Tab exposes skip link; Enter focuses main-content | Does not change focus during filter/refetch operations |
| UI-11 | Fixed | `appearance-tabs.tsx`: named group and aria-pressed state | Dark selection, reload persistence, System selection and emulated OS dark preference pass | OS preference is browser emulation, not a hardware test |
| UI-14 | Fixed | `resources/css/app.css`, `ui/sidebar.tsx`: reduced-motion overlay rules including overridden slots; shared Radix Sheet root and real trigger for mobile focus return | Dialog and mobile Sheet animation none; transition 0s; 12 Tabs stay trapped; Escape returns to trigger | Scoped nonessential overlay motion; loading feedback remains; no vestibular user study |

Component paths above are under `resources/js/components/`. Existing `DataTable` and operational workflow contracts are unchanged.

Checks: 3 frontend files / 11 tests passed; PickupMonitoringWorkspace and OperationalDashboardAnalytics: 10 PHP tests / 264 assertions passed; web/mobile TypeScript, build and targeted lint passed. Six browser checks passed: [results](remediation/wave-2/browser-results.json). A first theme-persistence check incorrectly reset localStorage on every navigation; the fixture initialization now only supplies a default to empty storage. Browser checks also exposed the sidebar slot and focus-return cases; both were corrected and the six-check run repeated successfully before committing.

## Wave 3 — Workflow consistency

Commit subject: `fix(ui): resolve wave 3 workflow consistency`. Wave 2 commit: `4c33ca5`.

| Issue | Status | Fix and changed files | Verification | Remaining limitations |
| --- | --- | --- | --- | --- |
| UI-05 | Fixed | `resources/js/pages/customers.tsx`, `resources/js/lib/customer-list-navigation.ts`: URL owns query/status/page; debounced search replaces history, explicit page/status/reset changes push history; out-of-range page canonicalized | Browser checks direct page 2, reload, previous/back/forward, query reload, status history, reset, page 999 clamp; helper regression tests | Scope is the documented customer defect; other lists retain their existing workflow-specific behavior |
| UI-06 | Fixed | Auth recovery/confirmation/verification, settings/profile/security/appearance, delete confirmation, shared close/sidebar text; `lang/id/*`; request-scoped locale in `HandleInertiaRequests.php` | Actual contact 422 and failed login use Indonesian; settings/recovery browser checks; original process locale restored; user-modified login/password components preserved | Translation assets cover these workflows and common validation messages; third-party/external free text may remain in its source language; delivery/native devices not tested |
| UI-12 | Fixed | `resources/js/pages/errors/not-found.tsx`, resolver `resources/js/app.tsx`, existing `bootstrap/app.php` responder: useful HTML/Inertia 404 with known named recovery routes | Guest/missing shipment HTML remain 404; JSON 404/code/envelope preserved; guest dashboard recovery reaches login; [404 screenshot](remediation/wave-3/wave-3-404-recovery.png) | Only HTML GET/HEAD 404 is customized; existing 403/500 and API behavior retained |

Checks: 3 frontend files / 5 tests passed; UiUxRemediation, CustomerManagement and ProfileUpdate: 40 PHP tests / 248 assertions passed; web/mobile TypeScript, build, targeted lint and Pint passed. Three browser scenarios passed: [results](remediation/wave-3/browser-results.json).

An initial standalone Inertia exception callback replaced the existing JSON responder and was rejected by regression tests. The final implementation adds the HTML-only branch inside the original responder, retaining machine-readable error codes/envelopes and existing conflict responses. No route, permission, validation rule or worker locale default was changed.

## Wave 4 — Maintainability and final regression

Commit subject: `refactor(ui): complete wave 4 cleanup`. Wave 3 commit: `fc0a077`.

| Issue | Status | Fix and changed files | Verification | Remaining limitations |
| --- | --- | --- | --- | --- |
| UI-13 | Fixed | `resources/js/pages/operations.tsx`: remove unreachable customer list/editor/modal/filter/state/import/type branches, while retaining routed task/user screens | Route tracing confirms the existing early return to `customers`; no remaining legacy customer branch/import; existing customer/operational tests; browser walkthrough of 21 admin routes and 12 role/access cases | Operations still composes its active screens; a larger page decomposition was intentionally avoided |

Related consistency improvements use existing components: CreatePickup/CreatePickupDialog and CustomerPicker now apply the same dirty-versus-busy discard behavior as CustomerDialog, including returning from embedded customer creation. The remaining operational CustomerPicker label is associated with its trigger. Existing DataTable, domain statuses, layouts and workflow-specific density are retained. No second design system or dependency was introduced.

Final visual review caught and corrected an intermediate UI-03 regression: scrolling the invalid input could also scroll the dialog header. CustomerForm now scrolls only its body in dialogs. The final regression verifies the title stays visible after submit and after editing another field, without stealing focus while typing. [Final validation state](remediation/final-validation/customer-error-visible.png). The original Wave 1 image is kept as a historical intermediate result, not the final layout.

`tests/Fixtures/ui-ux-browser.php` makes the browser regression reproducible using existing factories. It requires APP_ENV=testing, only accepts a new SQLite file inside the project's existing output directory, refuses to overwrite either database or ID manifest, and fakes queues/notifications while preventing stray HTTP calls. Browser tests refuse non-loopback origins. This adds no test dependency and does not seed the operational database.

## Final verification

| Check | Result | Evidence / scope |
| --- | --- | --- |
| Complete PHP suite | **686 passed, 5 skipped, 6,373 assertions**; 691 cases total | Existing feature/device gates account for skips; [check summary](remediation/wave-4/checks.json) |
| Frontend web | **114 passed** in 16 files | Full resources/js suite; after the final scroll correction, the affected 3 files / 10 tests also passed |
| Mobile source tests | **63 passed** in 8 files | Run with vite.mobile.config.ts, which supplies the mobile compile-time API origin; not an Android device test |
| Report worker | **74 passed** | Existing local fake APEX/Hybrid fixtures; no live JNE retrieval |
| Browser | **16 passed**, plus final focused validation regression | [Combined results](remediation/wave-4/browser-results.json), [final validation](remediation/final-validation/browser-results.json); all checks assert no unhandled page JavaScript errors |
| Routes and roles | **135 route signatures unchanged**; 21 admin routes and 12 role/access cases checked | [Scope check](remediation/wave-4/scope-check.json); expected 403 responses retained |
| TypeScript | Passed, web and mobile | `npm run types:check` |
| Build | Passed after each Wave and final correction | `npm run build`; fresh JNE customer/settings/run/monitoring screenshots in Wave 4 remove the original stale-build verification limitation |
| PHPStan / Pint / targeted frontend lint | Passed | PHPStan level 7: zero errors; Pint dirty and fixture checks; changed TSX checked without auto-formatting user files |
| Git scope | Protected user-file hashes unchanged; no business/worker/route/dependency changes | [Scope check](remediation/wave-4/scope-check.json); no automatic push |

Environment corrections were confined to test processes: the existing Windows OpenSSL configuration was supplied via OPENSSL_CONF so mocked push tests could generate keys. The failed push subset then passed (52 tests), followed by a successful full PHP suite. An initial combined web/mobile Vitest invocation lacked the mobile compile-time constant; rerunning mobile tests with their actual Vite configuration passed all 63 cases. No application workaround, skipped assertion, package installation, or global PHP configuration edit was used to hide these failures.

Representative before-fix reproductions from the fresh baseline bundle are retained in [before-results](remediation/evidence/before-results.json). Selected [old validation](remediation/screenshots/before-customer-server-validation.png), [old mobile handover](remediation/screenshots/before-handover-mobile-selection.png), and [old 404](remediation/screenshots/before-not-found.png) can be compared to the per-Wave evidence. Setup-failure screenshots are excluded.

## Reproducible browser checks

`tests/Browser/ui-ux-remediation.mjs` uses the Playwright dependency already installed in the report worker. Generate a new fixture, serve it in a separate terminal with process-scoped SQLite/session/queue settings, then run the checks. Never point this suite at operational data. The existing `.env` supplies application encryption keys; do not copy or publish those values.

```powershell
New-Item -ItemType Directory -Force output/ui-ux-test | Out-Null
$env:APP_ENV='testing'
$env:UI_UX_DATABASE=(Join-Path (Get-Location) 'output/ui-ux-test/fixture.sqlite')
php -d extension=pdo_sqlite tests/Fixtures/ui-ux-browser.php
```

In the server terminal, from the repository root:

```powershell
$env:APP_ENV='local'
$env:APP_DEBUG='false'
$env:APP_URL='http://127.0.0.1:59634'
$env:DB_CONNECTION='sqlite'
$env:DB_URL=''
$env:DB_DATABASE=(Join-Path (Get-Location) 'output/ui-ux-test/fixture.sqlite')
$env:SESSION_DRIVER='database'
$env:SESSION_COOKIE='ui-ux-remediation-session'
$env:SESSION_DOMAIN=''
$env:SESSION_SECURE_COOKIE='false'
$env:CACHE_STORE='array'
$env:QUEUE_CONNECTION='sync'
$fixtureRouter=(Join-Path (Get-Location) 'vendor/laravel/framework/src/Illuminate/Foundation/resources/server.php')
Set-Location public
php -d extension=pdo_sqlite -S 127.0.0.1:59634 $fixtureRouter
```

In the test terminal, from the repository root:

```powershell
$env:UI_UX_BASE_URL='http://127.0.0.1:59634'
$env:UI_UX_FIXTURE_IDS='output/ui-ux-test/fixture.sqlite.ids.json'
$env:UI_UX_EVIDENCE_DIR='output/ui-ux-test/evidence'
node --test tests/Browser/ui-ux-remediation.mjs
# To run one wave, add --test-name-pattern='wave 1' before the filename.
npx --no-install vp test run resources/js
$env:MOBILE_API_URL='https://mobile.example.test'
npx --no-install vp test run --config vite.mobile.config.ts
# Windows may require OPENSSL_CONF pointing to the installed PHP extras/ssl/openssl.cnf.
php -d extension=pdo_sqlite vendor/bin/pest --compact
```

## Localization file detail

UI-06 changes `app/Http/Middleware/HandleInertiaRequests.php`; `lang/id/auth.php`, `passwords.php`, `validation.php`; `resources/js/layouts/settings/layout.tsx`; `resources/js/pages/auth/{forgot-password,reset-password,confirm-password,verify-email}.tsx`; `resources/js/pages/settings/{profile,security,appearance}.tsx`; `resources/js/components/{appearance-tabs,delete-user}.tsx`; and shared `resources/js/components/ui/{dialog,sheet,sidebar}.tsx` labels. Login and PasswordInput already contain pre-existing user changes and were preserved byte-for-byte.

Guidance applied: installed web-design-guidelines with a fresh Vercel guideline fetch, and installed ui-ux-pro-max with supporting references and targeted error/focus/shadcn searches. Native-only ergonomic recommendations were not presented as blanket WCAG web requirements.

## Inventory delta

One implemented standalone frontend error page was added (`errors/not-found`), without a new route or menu item. The existing customer page remains authoritative; its duplicate branch was removed. The 27 existing UI primitives and DataTable remain the component foundation. Human-readable web validation/auth messages are localized while request fields, response structures, stable codes and validation rules are preserved.

## Verification boundaries

Browser evidence uses synthetic data and actual application routes, not production transactions. External JNE/APEX/Hybrid retrieval, native Android hardware, actual email delivery and screen-reader software have not been tested. Source/unit tests and mocked delivery tests are not hardware or live-service evidence. No claim of complete WCAG conformance, production performance, or user-study success is made. The original R-01–R-04 research/device questions remain outside the 14 implementation findings. Stop the temporary fixture server after verification.
