# Retail Operations Mobile V1.1 — targeted UI/UX refinement

Date: 16 October 2026. Scope: approved P0 → validation → P1 → validation → P2 → final regression. This is an engineering refinement of the existing Android application. It does **not** complete M5 or declare Mobile V1 ready for pilot.

The latest login-width follow-up is **1.1.3/code14**; its APK, screenshots and scoped verification are recorded at the end. The P0–P2 results below describe the 1.1.0 baseline.

## Decisions and boundaries

- References: `../PRD_MOBILE_V1.md`, `TECHNICAL_DESIGN.md` (including current addenda), `IMPLEMENTATION_PLAN.md` §13 and subsequent approved changes, installed API requests/resources and current mobile source.
- The latest task explicitly restores a final POP confirmation. Routine outcome selection, normal substep navigation and saving visit results do not open extra confirmations. Takeover and existing irreversible handover verification/closure protections remain.
- Backend Actions, routes, database, authorization, Sanctum, FCM registration/assignment delivery, expected versions, and POP idempotency are unchanged.
- OD-04/05 remain: encrypted account/environment-scoped drafts, separate draft Keystore key, retain on logout, 200 MiB quota, seven-day reminder rather than expiry, no automatic unfinished/UNCERTAIN deletion, verified-server cleanup.
- POP draft discard is now available only for EDITING/BLOCKED drafts without a frozen attempt. An unresolved SENDING/UNCERTAIN POP must be reconciled first; the UI cannot discard its manifest/key/evidence. No new expiry or backend state is introduced.
- Photos remain optional (0–4, existing file limits). A PNG signature with actual ink and positive integer total remain mandatory. Mobile client validation supplements the existing server validation.

## Completion matrix

| Priority | Status                               | Changes                                                                                                                                                            | Tests                                                                                                                                  | Remaining issues                                     |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| P0       | Implemented; stage validation passed | Unselected outcome radio-cards; guarded save; concise draft states; signature pixel validation; mandatory-data checks; final confirmation; protected discard       | 47 client tests; 16 Laravel cases/120 assertions; Android execution and POP groups each 7 cases passed                                 | Physical-device UAT remains separate                 |
| P1       | Implemented; validation passed       | Compact start context; quantity controls/validation/total; four persistent substeps; Pickup handover shortcut; scan-friendly workspace/search/filter/manual action | 48 client tests; 15 Laravel cases/117 assertions; workspace, POP, handover Android groups each 7 cases passed; small viewport passed   | Physical-device UAT remains separate                 |
| P2       | Implemented; final regression passed | Consistent spacing/type/contrast; subtle navigation selection; shared feedback; responsive JNE login; version 1.1.0                                                | 49 client tests; full Laravel 313 passed/5 skipped; TypeScript, lint, formatting, web/mobile/debug builds; final Android groups passed | Physical-device/live FCM and pilot gates remain open |

The Android groups repeat shared storage/security cases; their counts must not be added together as distinct tests.

## Screens and behavior

| Screen                          | Result                                                                                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Login                           | JNE logo retained, balanced responsive form, inline field errors, prominent login action, unobtrusive version, actual IME handling                          |
| Home / Menu                     | Existing modules retained; future modules disabled with Segera Hadir; Handover Pickup explicitly marked Pintasan Pickup                                     |
| Pickup workspace                | Customer first, reference/status/address/schedule, Lihat & Kerjakan retained, search visible, secondary manual/handover actions, advanced filters collapsed |
| Pickup start                    | Four-step progress retained, useful customer/address/schedule context replaces decorative play icon, bottom action respects safe areas                      |
| Visit outcome                   | No preselection; selection never submits; one save action; NO_PACKAGES requires reason; loading/single-flight guard and authoritative recovery              |
| POP quantities                  | Three original categories, large +/- controls, negative/fraction/excessive input rejected, total shown clearly, zero-total continue blocked                 |
| POP evidence                    | Optional photo count, required signature state, readable signature preview, completed substeps accessible without losing data/key                           |
| Review / Submit                 | Quantities/customer/reference/total/evidence/notes, required vs optional labels, explicit authorized-correction warning in final dialog                     |
| Draft management                | Secondary danger action inside Kelola draft; explicit irreversible local-deletion warning; unresolved POP cannot be discarded                               |
| Completion / History / Handover | Server-authoritative results and receipt distinction preserved; consistent status/error presentation; existing verify/close/version checks retained         |

## Files changed

Mobile implementation:

- `resources/mobile/src/app.tsx`
- `resources/mobile/src/workspace-ui.tsx`
- `resources/mobile/src/execution-panel.tsx`
- `resources/mobile/src/proof-panel.tsx`
- `resources/mobile/src/proof-draft.ts`
- `resources/mobile/src/styles.css`
- `resources/mobile/src/api.ts`
- `resources/mobile/src/handover-panel.tsx`
- `resources/mobile/src/manual-pickup.tsx`
- `resources/mobile/src/private-proof.tsx`
- New `resources/mobile/src/feedback.tsx` (shared operational feedback, reused across workflows).
- New `resources/mobile/src/signature.ts` (image/ink preflight, matching the server's dark/visible-pixel rule).

Tests and build:

- `resources/mobile/src/api.test.ts`, `proof-draft.test.ts`, new `signature.test.ts`.
- `android/app/src/androidTest/java/com/retailpickup/mobile/dev/MobileWorkspaceTest.java`.
- `MobileExecutionAndroidTest.java`, `MobileProofAndroidTest.java`, `MobileHandoverAndroidTest.java` in the same directory.
- `android/app/build.gradle`: versionName 1.1.0, versionCode 11.
- Generated mobile assets, Wayfinder files, web bundle and Android synced assets rebuilt. No dependency changes.
- This report and references appended to the existing Technical Design / Implementation Plan.

## Automated verification

- `npm run types:check`: web and mobile pass.
- Project lint: `npx vp lint resources/mobile/src` passes. This repository uses Vite+/Oxlint rather than ESLint; no new lint dependency was introduced.
- `npx vp fmt resources/mobile/src --check`: formatted source verified.
- `npx vitest run --config vite.mobile.config.ts --mode development`: 49 passed, 8 files. Covers encrypted local storage/API guards, push intent/session guards, execution reconciliation, draft status/retention, quantity validity and signature ink.
- Full Laravel suite: **313 passed / 5 skipped, 1,955 assertions**. Normal feature-gated Fortify cases and the opt-in device wrapper account for skips; Android checks are run separately with explicit fixture opt-in.
- Relevant Laravel regression: 83 passed / 494 assertions across mobile authentication, workspace, execution, proof, handover, revocation, assignment push and web execution/POP/handover baseline.
- Web build and mobile build pass; Gradle debug and instrumentation APKs build. The optional pre-existing fontaine web-build notice does not prevent bundling; dependencies were not changed.
- Host test requirements: PHP process flags `-d extension=pdo_sqlite -d extension=sqlite3`; mocked FCM RSA fixtures require `OPENSSL_CONF=C:/laragon/bin/php/php-8.5.10-Win32-vs17-x64/extras/ssl/openssl.cnf`. The initial missing-OpenSSL-config fixture failure was rerun successfully with that existing host configuration. Global php.ini and Firebase credentials were not modified.
- The first final POP native run hit a harness timing race: the test attempted to click Review while autosave intentionally kept the tab disabled. The harness now waits for durable-save completion; the existing UI guard and server assertions were retained, and the complete POP/native storage group passed on rerun.

## Android evidence

Actual instrumentation interactions use the dedicated Retail_P0_API33 AVD (Android 13), isolated SQLite/storage/backend and loopback ADB reverse. They do not mutate operational LAN tasks or the owner's physical device/BlueStacks data. Native camera/gallery use emulator sensor and MediaStore fixtures; keyboard and signature use actual Android interactions. Synthetic notification intents test routing, **not** actual FCM delivery.

Final instrumentation results:

| Group                    | Native result             | Host/API assertions              | Evidence                                                                                                                          |
| ------------------------ | ------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Workspace/session        | 7 passed                  | 1 wrapper passed / 6 assertions  | `storage/mobile-v11/final-workspace-android.xml`                                                                                  |
| Execution                | 7 passed                  | 1 wrapper passed / 13 assertions | `storage/mobile-v11/final-execution-android.xml`                                                                                  |
| POP/reconciliation       | 7 passed                  | 1 wrapper passed / 9 assertions  | `storage/mobile-v11/final-proof-android.xml`                                                                                      |
| Handover/history         | 7 passed                  | 1 wrapper passed / 12 assertions | `storage/mobile-v11/final-handover-android.xml`                                                                                   |
| Process death            | Two phases, 1 passed each | 1 wrapper passed / 9 assertions  | Actual force-stop between process IDs 14259 and 14462; quantities, photo and submission key restored without automatic submission |
| Small viewport workspace | 7 passed                  | 1 wrapper passed / 6 assertions  | `storage/mobile-v11/final-small-workspace-android.xml`                                                                            |

The normal AVD uses 1080×2340 / density 440. The small-viewport check used 960×1920 / density 480 (approximately 320×640 logical pixels including system bars), then restored the original display settings. Actual IME, Android Back, login errors, search, task detail and notification routing passed. Small captures use the `small-` filename prefix. Login CTA remains visible above the keyboard; workspace content scrolls. These are emulator results, not physical-device or Android 10 certification.

Final POP checks include unselected outcome/no premature mutation, NO_PACKAGES reason validation, quantity validation and rapid increments, optional photo step, empty-signature rejection, native camera/gallery, readable signature preview, backward/forward draft retention, confirmed discard, A/B/A account isolation and logout recovery, final confirmation double-tap, lost-response UNCERTAIN protection/reconciliation, exactly one POP with five attachments, and private evidence. Execution and handover checks preserve expected-version conflicts and server-authoritative advancement. Synthetic notification tests cover cold-login routing and unauthorized task rejection.

Evidence files are stored under `storage/mobile-v11/`; before snapshots are preserved under `before/` and final captures under `after/`. The dedicated test emulator was stopped after testing; operational data and the existing LAN server were not changed.

## V1.1.0 baseline debug APK

- Version: **1.1.0 / versionCode 11**, application ID `com.retailpickup.mobile.dev`, minSdk 29 / targetSdk 36.
- Historical build output: `android/app/build/outputs/apk/debug/retail-operations-1.1.0-debug.apk`. Gradle replaced the output directory during the 1.1.1 build; use the preserved latest artifact linked in the follow-up below.
- Size: **20,791,512 bytes**.
- SHA256: `B158B3BE4048B9C98BD9B459780A5DB1868AB9E30118395FB6BBA1E1859A15D9`.
- Final bundled CSP and runtime JavaScript both verified to use **http://10.20.10.13:8000**. The isolated loopback test bundle was replaced before producing this artifact.
- Read-only LAN check after build: unauthenticated `GET /api/mobile/v1/me` returns expected **401**; Capacitor-origin CORS preflight returns **204**, allowing `https://localhost`. The server responded during verification; this does not certify connectivity from a physical phone's network.
- No installation to the owner's device or external distribution performed. Native interaction tests above used the same source with the isolated fixture API; the final LAN APK was verified by ZIP contents and Android package metadata.

## Before / after evidence

Fixture customer/address data and capture times differ; comparisons demonstrate layout and interaction, not a data change.

| Screen       | Before                                                                           | After                                                                               |
| ------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Login        | [Baseline](../../storage/mobile-v11/before/mobile-jne-login.png)                 | [V1.1](../../storage/mobile-v11/after/jne-login.png)                                |
| Workspace    | [Baseline](../../storage/mobile-v11/before/mobile-ux-tasks.png)                  | [V1.1](../../storage/mobile-v11/after/tasks.png)                                    |
| Start        | [Baseline](../../storage/mobile-v11/before/mobile-mockup-pickup-start.png)       | [V1.1](../../storage/mobile-v11/after/pickup-start-step.png)                        |
| Outcome      | [Baseline](../../storage/mobile-v11/before/mobile-ux-streamlined-outcome.png)    | [V1.1](../../storage/mobile-v11/after/outcome.png)                                  |
| Quantities   | [Baseline](../../storage/mobile-v11/before/mobile-ux-pop-quantities.png)         | [V1.1](../../storage/mobile-v11/after/pop-quantities.png)                           |
| Review       | [Baseline](../../storage/mobile-v11/before/mobile-ux-streamlined-pop-review.png) | [V1.1](../../storage/mobile-v11/after/pop-review.png)                               |
| Confirmation | Extra confirmation was previously removed                                        | [V1.1 final-only confirmation](../../storage/mobile-v11/after/pop-confirmation.png) |

## Remaining release/UAT gates

Physical-device/fleet testing including minimum Android 10, physical LAN and upload interruption, live FCM delivery in foreground/background/cold start, APK upgrade with real prior drafts, signed distribution, HTTPS pilot configuration and owner UAT/sign-off remain separate. Passing this refinement does not approve deployment or pilot distribution.

## Login UI follow-up — 1.1.1/code12

The owner requested a stronger mobile login design after reviewing 1.1.0. The login now uses a navy JNE header with a red accent, a white form card, a clear welcome heading, persistent field labels, email/password icons, visible focus states, and a prominent Masuk action. The header compacts when the Android keyboard opens; help and errors remain readable in the scrollable form. Field errors retain the server explanation, with a concise summary rather than repeating the same full message. Password visibility is disabled while a login request is in progress. Backend authentication, sessions, draft policy and routes are unchanged.

Changed source: `resources/mobile/src/app.tsx`, `resources/mobile/src/styles.css`, and `android/app/build.gradle`; mobile/Android assets rebuilt. This report and the existing design/plan references updated. No dependencies or PHP changes.

Verification: web/mobile TypeScript, scoped Oxlint, formatting, 49 client tests, mobile build and Android debug build passed. Actual Android 13 instrumentation passed 7 cases on the normal 1080×2340/density440 AVD and 7 on the 960×1920/density480 viewport. Each host wrapper passed 6 assertions. Normal-size instrumentation was rerun successfully after the final error-copy/email-padding polish. Tests cover password visibility/help, actual IME and Back, failed and successful login, session locking/restart/logout, and notification routing. Shared security cases repeat across runs; these are emulator results. The full Laravel suite was not rerun for this login-only presentation change; the earlier full-suite result remains the 1.1.0 baseline.

- [Before](../../storage/mobile-v11/after/jne-login.png) / [After](../../storage/mobile-v11/login-refresh/jne-login-final.png).
- [Keyboard](../../storage/mobile-v11/login-refresh/login-keyboard-final.png) / [Validation](../../storage/mobile-v11/login-refresh/login-validation-final.png) / [Small viewport](../../storage/mobile-v11/login-refresh/small-login.png).
- Native XML evidence: `storage/mobile-v11/login-refresh/workspace-final-android.xml` and `small-workspace-android.xml`.
- Latest [debug APK 1.1.1/code12](../../storage/mobile-v11/login-refresh/retail-operations-1.1.1-debug.apk), **20,792,440 bytes**, application ID `com.retailpickup.mobile.dev`. Preserved outside Gradle's replaceable output directory; matching build output is `android/app/build/outputs/apk/debug/app-debug.apk`.
- SHA256: `9D4827448E1FBCAF131B7D23EABFA43DCAD357C2F62AD36090AE49AE1823ADC2`.
- Packaged CSP and runtime JavaScript both verified as **http://10.20.10.13:8000**. Native tests used isolated fixture API; the final artifact replaces the test loopback bundle. No installation on an owner's physical device or distribution performed. Dedicated emulator stopped after testing.

Physical-device UAT and all previously recorded pilot/release gates remain open.

## BlueStacks compatibility follow-up — 1.1.2/code13

The owner's Android screenshots exposed a rendering compatibility defect, not an API timeout. The target at ADB 127.0.0.1:5555 reported Android 13 and system WebView 101.0.4951.61, despite a newer standalone Chrome installation. Live CSS.supports checks returned false for dvh viewport units, individual translate and oklch. The old login header therefore had zero padding, its form height was only about632px inside a1043px viewport, and its description overlapped the card. The existing dialog depended on unsupported individual translate, leaving its left edge at50% of the screen.

The mobile stylesheet now selects vh-based viewport variables by default and switches to dvh only inside a feature query. This covers the shell, login, start/workflow and dialog height. Header shrink is disabled. Mobile dialogs use one traditional transform to center, zero Tailwind translation variables, explicit viewport-constrained width/height, wrapping and no transform animation. The mobile build targets Chrome101 CSS lowering without changing JavaScript target or dependencies. This is a targeted compatibility fix, not a claim that all Tailwind v4 features support old WebViews; the framework's documented browser baseline remains Chrome111.

Changed files: `resources/mobile/src/styles.css`, `vite.mobile.config.ts`, `android/app/build.gradle`, `MobileWorkspaceTest.java` and `MobileProofAndroidTest.java` under the existing androidTest directory; generated mobile/Android assets and this report. No backend, authorization, session, draft-retention or schema changes.

Verification:

- TypeScript, scoped lint/formatting, 49 client tests, mobile and Android debug builds passed.
- Native workspace/security group:7 passed, host wrapper1 passed/6 assertions. Added actual rendered-height, header-padding and non-overlap assertions.
- Native POP/storage group:7 passed, host wrapper1 passed/9 assertions. Added checks that the real final dialog is centered and every button stays inside the screen; existing signature/evidence, draft recovery, UNCERTAIN and duplicate-finalization assertions remain. The first geometry check caught a double-translation conflict on a newer WebView; the final rule fixed that and complete POP reruns passed.
- Actual BlueStacks WebView101 login preview with the compiled CSS: header padding48px24px56px, shell height1043px, description bottom239px versus card top271px. [Before](../../storage/mobile-v11/bluestacks-fix/login-before.png) / [corrected live CSS preview](../../storage/mobile-v11/bluestacks-fix/login-preview.png). That preview ran on the old1.1.1 APK; it is not evidence of an installed1.1.2 artifact.
- [Real final dialog in the isolated Android test](../../storage/mobile-v11/bluestacks-fix/dialog-native.png). XML evidence: `storage/mobile-v11/bluestacks-fix/workspace-android.xml` and `proof-android.xml`. The fixture dialog HTML is also retained for future rendering checks.
- The BlueStacks process exited before final installation/dialog verification. Its ADB port then refused connection; launching it through the tool was rejected with `blocked by policy`. The owner subsequently requested skipping installation and will test manually. No uninstall, data clear, fixture tests or operational submission was run on the owner's BlueStacks. Full POP interaction was tested only on the isolated AVD; final dialog interaction on BlueStacks remains manual UAT.

Latest [debug APK1.1.2/code13](../../storage/mobile-v11/bluestacks-fix/retail-operations-1.1.2-debug.apk), **20,647,959 bytes**, SHA256 `FA39FA9DF16049C33388BF4ACC07C66EA0159B837563DE775CAF813CC8CA3CD9`. Application ID remains `com.retailpickup.mobile.dev`. Packaged CSP and runtime JavaScript both verified to use **http://10.20.10.13:8000**. Artifact preserved outside Gradle's replaceable outputs; normal build output is still `android/app/build/outputs/apk/debug/app-debug.apk`.

Manual check on BlueStacks: install as an update, open login and verify complete branding/subtitle and a full-height background; open an existing POP review and verify the entire confirmation dialog and both buttons are visible. Cancel the dialog to review without submitting if no finalization is intended. Data/session policies and all earlier pilot gates remain unchanged.

## Full-width login follow-up — 1.1.3/code14

17 October 2026. The owner reported that the 1.1.2 header still had side gutters. The remaining cause was `.login-form` max-width32rem, which constrained the background as well as the form. That wrapper now takes the full available width. The brand content and form card have their own readable width limits; at the reported600px logical viewport the card uses the available width with16px side margins. The navy background spans both screen edges. Existing WebView101 viewport and dialog fallbacks remain.

Changed: `resources/mobile/src/styles.css`, `android/app/build.gradle`, the existing `MobileWorkspaceTest.java` geometry assertions, generated mobile/Android assets, and the existing documentation references. No authentication, API, backend, draft or dependency changes.

Verification: mobile TypeScript, scoped lint and formatting, mobile build and Android debug build passed. The isolated Android13 AVD was configured to900×1600/density240, matching the earlier BlueStacks display configuration (600px logical width). All7 workspace/security instrumentation cases passed, with1 host wrapper/6 API assertions. A new rendered-bounds assertion checks that the header's left and right edges match the viewport; existing height, padding, non-overlap, login errors/success, password help/visibility, actual keyboard/Back, session and notification checks also passed. Android's tablet taskbar is visible in this AVD capture; it belongs to the operating system. This was an emulator check, not another interaction with the owner's BlueStacks. The full Laravel/client suites were not rerun for the CSS-only change.

[Owner screenshot before](../../storage/mobile-v11/login-width-fix/login-before.png) / [wide Android capture after](../../storage/mobile-v11/login-width-fix/login-wide.png) / [keyboard](../../storage/mobile-v11/login-width-fix/login-keyboard-wide.png). Native evidence: `storage/mobile-v11/login-width-fix/workspace-wide-android.xml`. Dedicated AVD display overrides were reset and the AVD was stopped after testing.

Latest [debug APK1.1.3/code14](../../storage/mobile-v11/login-width-fix/retail-operations-1.1.3-debug.apk), **20,790,765 bytes**, SHA256 `38DEEA2CF6D017FF684B1B1E11E007F2B4D4E7FB4366CE8AD0F0BF30D0FD3A63`. Application ID `com.retailpickup.mobile.dev`; packaged CSP and runtime API origin verified as **http://10.20.10.13:8000**. Normal build output remains `android/app/build/outputs/apk/debug/app-debug.apk`. No owner-device installation performed; manual UAT and pilot gates remain open.

## POP photo and wizard refinement — 1.1.4/code15

17 October 2026. Focused changes preserve the current shell and pickup lifecycle. No backend business code, database schema, dependencies, authentication, upload contracts, evidence limits, Keystore keys, retention policy, or idempotency rules were changed.

| Priority       | Changes                                                                                                                                                                                                                                                                 | Validation                                                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1 — Photos     | Two-column square thumbnails; add tile below four photos; explicit camera/gallery choices; full-screen contain preview; accessible 44px delete control with confirmation; failed-preview recovery.                                                                      | Actual native camera/gallery, 0–4 photos, sampled preview bounds, deletion/cancel, Back, original-file integrity.     |
| 2 — Feedback   | One draft status; remove repetitive local-save success messages and duplicate outcome feedback after COLLECTED. Storage/cleanup errors and UNCERTAIN warnings remain visible.                                                                                           | Native gallery and server-loss scenario; optional-photo API finalization and replay.                                  |
| 3 — Wizard     | Initialize a draft after confirmed COLLECTED only after successful scoped local recovery; preserve the explicit new-draft action after discard. Preview Back closes the preview first. Completion waits for local reconciliation as well as authoritative server proof. | Draft navigation/restart/logout/account isolation, blocked/UNCERTAIN protection, double-tap finalization, actual IME. |
| 4 — Completion | Show completion, reference/customer, package total and server-confirmed POP; primary Kembali ke Tugas, secondary Lihat Detail. Revision/evidence/receipt details are collapsed separately.                                                                              | Native lost-response reconciliation, exactly one server POP, collapsed details and private evidence access.           |

The native preview bridge checks active account/environment/session and the original SHA256 before producing a derivative. Bounds-only inspection precedes power-of-two sampled decoding on a single worker; thumbnail edge is at most512px and full-screen preview at most1600px. EXIF orientation and transparency are respected. The original encrypted evidence bytes are never rewritten by preview generation and existing uploads still read the original. Derivatives remain in component memory, with no new plaintext disk cache. Failed previews expose a retry without deleting evidence. Existing camera import quality/resizing behavior is preserved.

The existing signature validator remains unchanged: the pad requires drawing movement and the restored evidence validator checks visible ink, matching the server contract. This task adds no minimum stroke-length/count policy that could reject previously valid evidence. Photos remain optional.

Changed source and tests:

- `resources/mobile/src/photo-gallery.tsx` (new), `proof-panel.tsx`, `execution-panel.tsx`, `app.tsx`, `styles.css`, `local-store.ts`, `local-store.test.ts`.
- `android/app/src/main/java/com/retailpickup/mobile/dev/MobileImagePreview.java` (new) and `MobileLocalPlugin.java`.
- `android/app/src/androidTest/java/com/retailpickup/mobile/dev/MobileImagePreviewTest.java` (new), `MobileProofAndroidTest.java`, `MobileDraftProcessDeathTest.java`, `MobileExecutionAndroidTest.java`, `MobileLocalStoreTest.java`.
- `tests/Feature/MobileProofTest.php`, `tests/Feature/MobileAndroidSmokeTest.php`, `android/app/build.gradle`, this report and the existing technical-design/implementation-plan references. Generated mobile/Android assets and the normal web build were regenerated.

Automated checks: web/mobile TypeScript, scoped Oxlint, formatting, all54 mobile client tests, web build, mobile build and Android debug build pass. The project uses Oxlint rather than ESLint. Full Laravel suite:314 passed /1963 assertions,5 opt-in device tests skipped in that run; device tests are executed separately. PHP files formatted with Pint. Evidence logs are in `storage/mobile-pop-refinement/`.

Android testing uses only the dedicated Retail_P0_API33 AVD at `emulator-5556`, temporary SQLite/storage and the isolated loopback API. The owner's BlueStacks was not installed, cleared, or used for operational mutations. Wide configuration is900×1600/density240 (600px logical); small configuration is960×1920/density480 (320px logical). Fixture photos include a solid magenta MediaStore image and the emulator camera scene; they are actual test evidence, not design mockups.

Camera and gallery process-death cases each passed both instrumentation phases and9 host/API assertions. The app was force-stopped between separate PIDs while the external capture UI was foregrounded. Recovery preserved previous photo/counts/submission key, retained the pending-capture recovery action, allowed explicit cancellation, and performed no automatic submission. Successful camera/gallery returns and completed-photo restart recovery are covered separately; these results do not certify every OEM camera's delivery of a result after process death.

| Android group                                                      | Result                                                       | Saved evidence                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------- |
| Wide POP and encrypted storage                                     | 7 native cases passed;1 host wrapper/9 assertions            | `storage/mobile-pop-refinement/pop-android.xml`           |
| Small POP and encrypted storage, including preview bridge security | 8 native cases passed;1 host wrapper/9 assertions            | `storage/mobile-pop-refinement/small-pop-android.xml`     |
| Start/outcome/retry and encrypted storage                          | 8 native cases passed;1 host wrapper/13 assertions           | `storage/mobile-pop-refinement/execution-android.xml`     |
| Workspace/login/session/notification routing                       | 7 native cases passed;1 host wrapper/6 assertions            | `storage/mobile-pop-refinement/workspace-android.xml`     |
| Handover/history and encrypted storage                             | 8 native cases passed;1 host wrapper/12 assertions           | `storage/mobile-pop-refinement/handover-android.xml`      |
| Sampled image helper                                               | 4 native cases passed                                        | `storage/mobile-pop-refinement/preview-native.log`        |
| Process death while gallery foreground                             | Both phases passed;1 host wrapper/9 assertions;PIDs7066→7274 | `storage/mobile-pop-refinement/gallery-process-death.log` |
| Process death while camera foreground                              | Both phases passed;1 host wrapper/9 assertions;PIDs7505→7753 | `storage/mobile-pop-refinement/camera-process-death.log`  |

These group totals include repeated shared storage cases. Full-flow native POP finalization uses four photos; zero-photo finalization and idempotent replay are verified by the Laravel feature test, and Android verifies advancing without photos. Actual native signatures, four-photo limit, original deletion after manifest save, navigation/restart/logout recovery, final confirmation and server-loss reconciliation passed on the small viewport. The isolated backend asserts exactly one final POP and five attachments despite rapid final taps and a lost response.

Large-image native evidence: a12000×8000 (96MP),1,256,847-byte PNG produced a375×250 thumbnail using375,000 decoded bitmap bytes and a1500×1000 full-screen derivative using6,000,000 decoded bitmap bytes. The final emulator run measured180ms for encrypted read plus thumbnail generation; this excludes bridge/UI timing and is not a physical low-end-device guarantee. Original encrypted-file SHA256 remained unchanged. EXIF90° rotation, transparent PNG and corrupt-input handling also passed. See `storage/mobile-pop-refinement/preview-performance.log`. The standalone helper test required reinstalling the fixture APKs after Gradle's connected-test cleanup; the final four-case run passed.

Initial testing exposed a preview-Back event-order defect; centralizing the modal Back callback in the proof panel fixed it. The deletion test now waits for its confirmation dialog to finish before inspecting asynchronous file cleanup. Small-screen testing also corrected harness assumptions: scroll to totals before checking sticky-button overlap, and tap the fixture image away from the system picker's preview overlay. No production picker or package-count policy was changed for those harness corrections.

Actual screenshots:

| Screen        | Before                                                                                  | After                                                                          |
| ------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Photo gallery | [Expanded evidence](../../storage/mobile-pop-refinement/before/pop-photos.png)          | [Two-column grid](../../storage/mobile-pop-refinement/after/pop-photos.png)    |
| Completion    | [Expanded technical details](../../storage/mobile-pop-refinement/before/completion.png) | [Compact completion](../../storage/mobile-pop-refinement/after/completion.png) |

[Zero photos](../../storage/mobile-pop-refinement/after/pop-zero-photos.png), [one photo and add tile](../../storage/mobile-pop-refinement/after/pop-one-photo.png), [full-screen preview](../../storage/mobile-pop-refinement/after/pop-fullscreen.png), [delete confirmation](../../storage/mobile-pop-refinement/after/pop-delete-confirmation.png), [actual keyboard](../../storage/mobile-pop-refinement/after/pop-keyboard.png), [review](../../storage/mobile-pop-refinement/after/pop-review.png), [final confirmation](../../storage/mobile-pop-refinement/after/pop-confirmation.png).

Small-screen actual captures: [gallery](../../storage/mobile-pop-refinement/after/small-pop-photos.png), [fullscreen](../../storage/mobile-pop-refinement/after/small-pop-fullscreen.png), [keyboard/CTA](../../storage/mobile-pop-refinement/after/small-pop-keyboard.png), [completion](../../storage/mobile-pop-refinement/after/small-completion.png). The gallery uses the page's normal vertical scroll on short screens; there is no separate thumbnail scroller.

Latest [debug APK1.1.4/code15](../../storage/mobile-pop-refinement/retail-operations-1.1.4-debug.apk), **20,811,320 bytes**, SHA256 `E0545DF0B5A2A4ED80DDA872B5E0064F0C2DB2F21CA850307D3E278D542625E2`. Application ID is `com.retailpickup.mobile.dev`, minSdk29/targetSdk36. Stable artifact is preserved outside Gradle's replaceable outputs; matching normal output is `android/app/build/outputs/apk/debug/app-debug.apk`.

Packaged CSP and runtime JavaScript both verified to use **http://10.20.10.13:8000**. The loopback fixture bundle was replaced before building this artifact. Read-only host connectivity check returned expected401 from unauthenticated `/api/mobile/v1/me`, and CORS preflight returned204 allowing `https://localhost`; this does not certify the phone's network path. See `storage/mobile-pop-refinement/apk-integrity.log` and `lan-check.log`. Final LAN APK was verified by package inspection; native interaction used the same source with the isolated API. No installation on the owner's BlueStacks or external distribution was performed. The dedicated AVD display settings were reset and the task-owned emulator stopped after verification.

Remaining release/UAT limits: physical low-memory/OEM devices, minimum Android10/WebView101 runtime with the new gallery, real LAN upload interruption, real-draft APK upgrade and live FCM delivery still require owner/fleet testing. Emulator performance is not a slow-device certification. No pilot readiness or M5 completion is declared by this refinement.
