# Handover V2 — implementation and verification

17 October 2026. Owner-approved Handover V2 replaces the older platform restriction and the earlier permission that allowed all pickup operators to verify/close. This is a focused refactor of the existing module. No database schema, dependencies, POP finalization rules, or new modules were introduced.

## Audit and gap analysis

| Requirement                                                        | Audit classification                           | Reused implementation / resulting change                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Session creation, DRAFT membership, idempotency                    | Already supported                              | Reuse CreateSession and AmendSession, global eligible cross-staff pickups, whole-list edits, UUID submission key and audit events. Existing operational read/edit scope is preserved.                                                                                                                                                          |
| Verification and closure endpoints on both platforms               | Already supported                              | Both route families already call the same VerifyItem and CloseSession Actions. No duplicate mobile business service or endpoint is added.                                                                                                                                                                                                      |
| Receiving-user mobile login                                        | Missing                                        | Allow active existing retail_staff/admin_supervisor accounts. Keep CS excluded, token-only Sanctum, 24-hour expiry, installation replacement/revocation, encrypted session storage and web Fortify/CSRF unchanged.                                                                                                                             |
| Receiving authorization                                            | Partially implemented / unsafe                 | Earlier canExecutePickup granted Pickup Staff verify/close. Add a dedicated receiving capability using existing retail_staff/admin_supervisor roles, checked in request/controller and again against the locked actor in Actions. A creator gets no permission from session ownership.                                                         |
| Counts above/below POP, zero, category discrepancies               | Already supported                              | Reuse CompareQuantities, integer0–1,000,000 rules and mandatory notes for any category difference. POP is not updated by verification.                                                                                                                                                                                                         |
| POP revisions and concurrency                                      | Already supported, reinforced                  | Preserve expected session version, actor/session/task locks, immutable first verification, correction revisions and needsReview closure blocking. Existing authorized POP correction increments the session version. Add an optional explicit expected_pickup_revision check; both current clients send it.                                    |
| Auditable original comparison                                      | Partially implemented                          | Existing original POP, received counts, verifier/time and revision chains remain. New verification audit events additionally store POP/received/difference snapshots and POP revision in the existing changes JSON. Resources expose verified revision/baseline/differences separately from current POP. Historical records are not rewritten. |
| Selection, review, success, detail, verification                   | Supported but UX needs improvement             | Replace duplicate selection/removal lists with one checkbox list, persistent selected record map, compact totals, global candidate search, separate review/success/detail, readable verification and role-aware next actions.                                                                                                                  |
| Input preservation and errors                                      | Supported but UX needs improvement             | Preserve form values across normal Back/detail navigation and 422 responses. One local summary plus affected fields. Global auth handling receives only401/403 from this module. Frozen verification versions require explicit reload/review after a conflict.                                                                                 |
| New dedicated receiver role or a new self-verification prohibition | Requires separate business approval if desired | Neither is introduced. See decisions below.                                                                                                                                                                                                                                                                                                    |

## Authorization decisions

| Active role      | Mobile login | Create / read / edit eligible DRAFT | Verify / close eligible session          |
| ---------------- | ------------ | ----------------------------------- | ---------------------------------------- |
| pickup_staff     | Yes          | Existing operational scope          | No, on both web and mobile               |
| retail_staff     | Yes          | Existing operational scope          | Yes, subject to lifecycle/version guards |
| admin_supervisor | Yes          | Existing operational scope          | Yes, subject to lifecycle/version guards |
| cs               | No           | No Handover access                  | No                                       |

Mobile writes additionally require mobile:handover. Read-only tokens expose no write capabilities. Newly issued receiver tokens contain mobile:read/mobile:handover and do not gain mobile:execute. Pickup mutations require the current pickup_staff role and mobile:execute; task projections reflect this boundary. The mobile manual-pickup button is presented only to Pickup Staff. No global canExecutePickup permission was changed.

Session resources expose server-derived edit/verify/receive capabilities and authorized closure eligibility. These flags control presentation; manually invoked unauthorized mutations still return403. Existing cross-staff eligibility and operational session read/edit scope remain unchanged. The new Session Saya filter does not restrict the existing shared receiving queue or history authorization.

Existing retail/admin users could create and verify their own session before this task. That behavior is preserved through receiving-role authorization, never inferred from created_by. Whether to introduce a separation-of-duties/self-verification prohibition remains an open owner policy decision; it is not invented here and does not block the existing receiving workflow. No discrepancy-resolution or additional approval workflow is added. Saving verification does not close a session; closing retains discrepancies and their notes. Reopen and correction continue through the existing authorized web workflows.

## Implementation

### P0 — integrity and authorization

- Dedicated User receiving capability, checked again inside locked transactional Actions.
- Minimal mobile login/middleware extension for existing receiving roles; no Fortify or global web-auth changes.
- Actor-aware capabilities on list/detail responses, Session Saya and receiving filters, global paginated candidate search and effective POP totals.
- Optional explicit POP revision guard, plus immutable comparison snapshot in existing audit JSON. Existing session-version guard continues protecting clients that omit the new field.
- Verified POP baseline/revision/differences available alongside current POP, original received values, effective correction values and audit history.
- No new table, column, backend state, role, token type or dependency.

Initial P0 checkpoint:49 feature tests /477 assertions passed, covering both platforms, authorization, quantities, original POP, revisions, competing requests, authentication, scheduling and existing correction flows. Later boundary coverage additionally checks role changes against an older execute-capable mobile token.

### P1 — mobile Handover workflow

- Landing: Session Saya, authorized Menunggu Verifikasi, Riwayat Handover and authorized Buat Handover. Receiver accounts open the receiving queue by default.
- Creation: Pilih Pickup → Review → Buat Session → separate server-confirmed success → Detail. The old information step is folded into selection/review.
- One checkbox list with distinct selected state, no Hapus PCK controls or duplicate selected list. Selection is keyed by task ID and retained across search, pagination and review Back. Editing includes current members in the same unique list. The original100-pickup limit remains.
- Review shows creator, DRAFT information, pickup/package totals and references/customer/quantity per pickup. It explains that creation is not receipt.
- Creation and closure success screens contain reference, actual server status, totals and two clear navigation actions, without management forms beneath them.
- Detail shows creator/time, counts, progress, discrepancies, permitted next action and pickup results. Technical versions/revisions and audit detail are expandable; activity remains accessible.
- Actual received inputs start empty, allow zero/excess, show signed SESUAI/KURANG/LEBIH per category, and require notes for any difference. Validation retains quantities and notes.
- Normal navigation does not prompt or erase input. Reopening an unfinished verification restores its in-memory values and frozen baseline. A stale form cannot silently rebase: explicit Muat Ulang & Tinjau POP preserves input while displaying the latest server data.
- Existing account/environment-encrypted operation journal and exact actor/version/audit reconciliation remain. Timeouts retain UNCERTAIN; retry uses the original payload/version. Known409/422 rejections clear only the rejected request journal and retain the form/selection. No automatic submit, close or background retry.
- Closure uses the existing Action and an explicit confirmation dialog with verification/discrepancy counts. Pickup Staff do not see receiving controls.

P1 checkpoint:63 client tests passed;24 focused Handover feature tests /293 assertions passed. Actual Android verification follows below.

### P2 — consistency and regression

Use existing shell, buttons, stepper, feedback and mobile-dialog primitives. Selected cards, labels, quantity rows and pagination use consistent spacing, readable inputs, visible focus and touch targets. One dominant action per screen; secondary actions use outline/ghost treatments. Labels map to real DRAFT/IN_VERIFICATION/CLOSED states. No UI-only backend status is added.

Web uses the same capability flags and Actions. The existing verification form now sends a frozen POP/session baseline, shows SESUAI/KURANG/LEBIH and hides verification/closure controls for unauthorized users. Explicit reload remounts the baseline while preserving draft fields. Existing Admin correction/reopen access is retained.

## Changed files

Backend:

- app/Models/User.php
- app/Actions/Handover/VerifyItem.php
- app/Actions/Handover/CloseSession.php
- app/Http/Controllers/HandoverController.php
- app/Http/Controllers/MobileTokenController.php
- app/Http/Middleware/EnsureMobileToken.php
- app/Http/Requests/VerifyHandoverRequest.php
- app/Http/Resources/HandoverResource.php
- app/Http/Resources/PickupTaskResource.php

Mobile/web:

- resources/mobile/src/handover-panel.tsx
- resources/mobile/src/handover.ts
- resources/mobile/src/handover.test.ts
- resources/mobile/src/app.tsx
- resources/mobile/src/styles.css
- resources/js/components/handover-session-detail.tsx
- resources/js/types/handover.ts

Tests/build/docs:

- tests/Feature/HandoverV2Test.php (new)
- tests/Feature/MobileHandoverTest.php
- tests/Feature/MobileAuthenticationTest.php
- tests/Feature/RegularSchedulingTest.php
- tests/Feature/MobileAndroidSmokeTest.php
- android/app/src/androidTest/java/com/retailpickup/mobile/dev/MobileHandoverAndroidTest.java
- android/app/src/androidTest/java/com/retailpickup/mobile/dev/MobileWorkspaceTest.java (landing-label expectation)
- android/app/build.gradle
- docs/mobile/HANDOVER_V2.md (this report)
- docs/mobile/TECHNICAL_DESIGN.md
- docs/mobile/IMPLEMENTATION_PLAN.md
- Generated Wayfinder/mobile/Android assets and the existing web build.

## Evidence and limits

Actual Android tests use only the dedicated Retail_P0_API33 AVD at emulator-5556, temporary SQLite/storage and an isolated loopback fixture API. The owner’s BlueStacks and operational LAN records are not used for mutations. Normal display1080×2340/density440, small display960×1920/density480 (approximately320×640 logical including system bars).

Handover instrumentation uses23 eligible pickups to exercise pagination/search, then creates one two-pickup session. It verifies creator controls, receiving-account login, zero/live shortage/excess feedback, notes, actual keyboard and Back, server422 input preservation, stale editor handling, lost create/verify responses, encrypted restart/reconciliation, explicit closure, read-only results and history. The known422 UI response is injected as a network contract case; real server quantity/note validation is covered by feature tests.

Before images below are retained actual Android baseline captures, not conceptual mockups; fixture names and display sizes may differ. Current captures come from the implementation tests.

| Screen       | Before                                                                                 | After                                                                                       |
| ------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Selection    | [Baseline](../../storage/handover-v2/before/handover-selection.png)                    | [Single selected list](../../storage/handover-v2/after/handover-selection.png)              |
| Created      | Before capture unavailable; prior implementation retained in before/handover-panel.tsx | [Separate success](../../storage/handover-v2/after/handover-created.png)                    |
| Verification | [Baseline](../../storage/handover-v2/before/handover-verification.png)                 | [Received counts and difference](../../storage/handover-v2/after/handover-verification.png) |
| Closed       | [Baseline](../../storage/handover-v2/before/handover-closed.png)                       | [Concise closure](../../storage/handover-v2/after/handover-closed.png)                      |

Small-screen evidence: [selection](../../storage/handover-v2/after/small-handover-selection.png), [actual keyboard](../../storage/handover-v2/after/small-handover-keyboard.png), [validation](../../storage/handover-v2/after/small-handover-validation.png), [stale verification](../../storage/handover-v2/after/small-handover-stale-verification.png), [closure confirmation](../../storage/handover-v2/after/small-handover-close-confirmation.png), [closed](../../storage/handover-v2/after/small-handover-closed.png).

These are emulator results. Physical/OEM devices, Android10/WebView101 runtime, APK upgrade with real retained journals, physical LAN/network interruption, live FCM delivery and direct web-browser UAT remain release verification tasks. Feature tests exercise the web-authenticated endpoints and build/type checks cover the web form; no unperformed browser interaction or physical-device PASS is claimed. Optimistic-lock competing requests are covered; production MySQL parallel-load testing is not claimed. Engineering results do not declare M5 complete or READY FOR PILOT.

## Final automated checks

| Check                               | Result                                                 | Evidence                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Laravel suite                  | 330 passed, 2,163 assertions; 5 opt-in tests skipped   | [Pest result](../../storage/handover-v2/laravel-tests.log)                                                                                                                            |
| Mobile client tests                 | 63 passed across 8 files                               | [Client result](../../storage/handover-v2/client-tests.log)                                                                                                                           |
| Web and mobile TypeScript           | Passed                                                 | [Type checks](../../storage/handover-v2/types.log)                                                                                                                                    |
| Oxlint                              | Passed; this repository uses Oxlint rather than ESLint | [Lint output](../../storage/handover-v2/lint.log)                                                                                                                                     |
| PHPStan                             | Passed, no errors                                      | [Static analysis](../../storage/handover-v2/phpstan.log)                                                                                                                              |
| Formatting                          | Frontend formatting and PHP Pint passed                | [Frontend](../../storage/handover-v2/format.log), [PHP](../../storage/handover-v2/pint.log)                                                                                           |
| Web build                           | Passed                                                 | [Build output](../../storage/handover-v2/web-build.log)                                                                                                                               |
| Mobile build and Capacitor sync     | Passed with the LAN API origin                         | [Mobile build](../../storage/handover-v2/mobile-build.log), [Android sync](../../storage/handover-v2/android-sync.log)                                                                |
| Android debug build                 | Passed; packaged origin and version checked            | [Gradle output](../../storage/handover-v2/android-build.log), [APK integrity](../../storage/handover-v2/apk-integrity.log), [APK metadata](../../storage/handover-v2/apk-badging.log) |
| Android Handover, normal screen     | 8 instrumentation tests passed; 12 host assertions     | [Android XML](../../storage/handover-v2/final-handover-android.xml), [host result](../../storage/handover-v2/final-handover-host.log)                                                 |
| Android Handover, small screen      | 8 instrumentation tests passed; 12 host assertions     | [Android XML](../../storage/handover-v2/small-handover-android.xml), [host result](../../storage/handover-v2/small-native-host.log)                                                   |
| Android Pickup execution regression | 8 instrumentation tests passed; 13 host assertions     | [Android XML](../../storage/handover-v2/final-execution-android.xml), [host result](../../storage/handover-v2/final-execution-host.log)                                               |
| Android POP regression              | 8 instrumentation tests passed; 9 host assertions      | [Android XML](../../storage/handover-v2/final-proof-android.xml), [host result](../../storage/handover-v2/final-proof-host.log)                                                       |
| Android workspace/auth regression   | 7 instrumentation tests passed; 6 host assertions      | [Android XML](../../storage/handover-v2/final-workspace-android.xml), [host result](../../storage/handover-v2/final-workspace-host.log)                                               |

The execution, POP and Handover groups each include the same seven native encrypted-storage/recovery cases. These counts are per run, not a claim of that many unique scenarios. The opt-in device tests skipped by the full PHP suite are accounted for separately by their actual Android runs above.

Backend and APK should be updated together for the new role/capability contract. The new UI defaults missing capabilities to denied; it does not infer receiving authority from a session creator or an older backend response. No operational server deployment is claimed by these local checks.

An earlier repeat completed all eight instrumentation cases but the emulator disconnected during Gradle cleanup; that host run was not counted as a pass. After a dedicated cold boot, both final Handover runs above completed with their server assertions. The interrupted XML/log remain under interrupted-cleanup-* for traceability. Final captures include selection and deselection across pages, with a single occurrence of each selected pickup. The task AVD display overrides were reset and the AVD shut down after testing; BlueStacks was not changed.

## Milestone results

| Priority                       | Status                                | Tests                                                                                                                           | Remaining issues                                                                                                   |
| ------------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| P0 — Integrity & Authorization | Implemented; automated checks passed  | Initial 49-test checkpoint; final 330-test suite, including web/mobile roles, immutable POP, quantities, audit and stale guards | Optional new role/self-verification policy remains a separate owner decision. No blocking new policy is needed.    |
| P1 — Handover UX               | Implemented; emulator checks passed   | 63 client tests; final Handover on normal/small Android screens, 8 instrumentation cases and 12 host assertions each            | Direct browser and physical-device UAT remain.                                                                     |
| P2 — UI Polish                 | Implemented; regression checks passed | Types, lint, PHPStan, formatting, web build; native Pickup/POP/workspace regressions and screenshot review                      | OEM/older WebView, live FCM, real journal upgrade and production-load checks remain. No pilot approval is implied. |

## Debug APK and local API

- [retail-operations-1.2.0-debug.apk](../../storage/handover-v2/retail-operations-1.2.0-debug.apk)
- Application ID: com.retailpickup.mobile.dev; version 1.2.0, versionCode 16; min SDK 29, target SDK 36.
- Size: 20,815,893 bytes. SHA-256: 452F90D61EC39777CA14549B0941CDA541FDE7488746B98A708B615ADC698F3B.
- Both packaged CSP and application bundle use http://10.20.10.13:8000. The fixture origin http://127.0.0.1:8000 is absent from the final application bundle. Native interactions used the isolated fixture build; the final LAN APK was built and inspected afterward.
- The developer host itself owns 10.20.10.13. Port 8000 initially refused connections because no development listener was running. Started php artisan serve --host=0.0.0.0 --port=8000 locally. An unauthenticated GET /api/mobile/v1/me then returned the expected 401, and Handover OPTIONS returned 204 with Access-Control-Allow-Origin: https://localhost. [Connectivity](../../storage/handover-v2/lan-connectivity.log), [preflight](../../storage/handover-v2/lan-preflight.log).
- These are host connectivity checks, not a claim of device-to-LAN authentication or production availability. The development server remains running for manual APK testing; it must be restarted if the host/process stops. No owner-device installation or operational-record mutation was performed.
