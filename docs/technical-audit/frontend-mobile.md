# Frontend and Android reliability

## Web / Inertia

The web client uses React 19 and Inertia 3 with typed Wayfinder routes, shared shadcn/Radix primitives and Vite integration. Existing task-first UI patterns were reviewed with ui-ux-pro-max, web-design-guidelines and shadcn guidance; no visual redesign or new components were produced.

Main working lists are server-paginated. JneMonitoringController.php:67 selects the fields needed by the row and eager-loads source/customer/pickup. Expensive summary props use closures and a request-local shared metrics result. JneCustomerDashboardController memoizes statistics across chart props and fetches shipment rows separately; paging can request shipments only. These patterns should remain.

Monitoring polls every 30 seconds with partial props, pauses hidden tabs, and stops during filter editing/loading. Pickup notifications have a per-effect busy guard, visibility/online recovery, 30-second cancellation, permission-loss stop and cleanup. The shipment detail hook aborts on ID/snapshot change, marks disposed responses and cancels timers. No confirmed rerender-request loop or stale-response overwrite was found in these paths.

TA-12 identifies unconditional five-second polling on terminal report details. It is a small targeted opportunity, not a reason to remove polling from operational screens. Initial monitoring loads include the whole customer ID/name/code catalog; payload bytes and user counts were not measured. Generic tables render the supplied page, not the entire database. Do not add virtualization or broad React.memo wrappers without render profiling.

The mobile bundle is a separate React SPA, not an embedded Inertia page runtime. The web Vite config uses the React compiler preset; mobile uses the React plugin. No bundle build was run because it would regenerate artifacts/routes and change the audited build. Bundle size, chunk loading, hydration/render timing and real browser network waterfalls remain unassessed.

## Mobile persistence and session

Native SecureSessionStore.java uses Android Keystore AES-GCM, package-bound authenticated data and AtomicFile in no-backup storage. SecureSession is native-only; the JS API refuses a cross-environment token and redirects. EnsureMobileToken requires a mobile token with read/execute/handover abilities and active operational role. Tokens expire in 24 hours at issuance; logout revokes the current token online and supports a local locked state when revocation cannot be confirmed.

MobileLocalStore encrypts account/environment-scoped draft/evidence files, serializes native writes and enforces a storage quota. local-store.ts serializes JS writes per scope and checks evidence size/hash before turning it into an upload Blob. Drafts distinguish EDITING, SENDING, UNCERTAIN, BLOCKED and CONFIRMED; submitted payloads are frozen and response recovery checks server state. The existing policy is online submission with offline draft recovery, not unattended background transaction synchronization.

Process-death support includes capture metadata and App appRestoredResult recovery, atomic local records and durable evidence. Proof input changes are debounced and flushed on background/unmount. A very abrupt process kill can still precede an asynchronous/debounced flush; test it on devices rather than assert zero lost keystrokes from code. Local data is deliberately retained across session interruption; any retention/cleanup policy change requires explicit agreement.

## Camera, keyboard and app lifecycle

CameraScanSession tracks start/stop promises and listener handles, serializes scan writes, deduplicates visible frames and waits for pending persistence before closing. Errors release the seen key to permit a deliberate retry. The UI supports manual/Bluetooth-style input alongside camera scanning. App foreground/background, camera permission denial and late callbacks have dedicated source tests. Native manifests disable backup and release cleartext traffic; debug-specific origin support is intentional.

The release Gradle guard requires production assets and an HTTPS CSP connection origin. vite.mobile.config.ts rejects credentials, paths and unapproved origins. capacitor.config.ts allowMixedContent=true is a development-sensitive setting, but release manifest/CSP/origin checks substantially constrain it; this audit did not prove a release cleartext bypass. Signing, device distribution and deployed TLS were not verified.

Large evidence crosses the bridge as base64 and then Uint8Array/Blob, so transient memory exceeds final file bytes. Upload requests have a 30-second timeout; the backend accepts up to four 5 MiB photos plus a signature. Weak uplink and low-RAM devices need measurement. No production crash or evidence loss was demonstrated. Do not reduce supported evidence or change the offline policy on this basis.

## Cashless operator status

proof-draft.ts exposes “Tersimpan di perangkat”, sending, uncertain, blocked and server-confirmed completion labels. cashless-handover.ts validates response identity/count separately from local draft state. CashlessEntryStatus and result panels show queued/worker/approval and FAILED/PARTIAL/UNKNOWN states, HO and per-item messages. Results paginate exceptions. The additive AWB list is not presented as an independently observed shipment status.

The reviewed server result endpoint restricts results to the active creator and mobile middleware enforces token scope. No cross-account local draft or result access bypass was demonstrated. Device logout/login with another account, app kill at scan/write boundaries and actual Bluetooth keyboard behavior still require physical-device acceptance.

## Verification and limits

Both TypeScript projects passed. Scoped Vitest ran **246 client tests: 245 passed, 1 failed**. The failure expects help text inside the initially closed pickup editor (TA-11); it is not evidence that backend manual decisions are overwritten. All 32 client test files were discovered, including mobile API, storage, draft, camera, signature, execution, handover and push tests.

No Android build, emulator/device session or live UI was exercised. Prior UI audit/remediation documents and mobile design/refinement reports were read as historical context; their screenshots and pass counts were not attributed to this audit. Accessibility, touch targets and desktop/mobile layout were not re-certified through browser testing. Preserve current task-first layout while addressing technical issues.

