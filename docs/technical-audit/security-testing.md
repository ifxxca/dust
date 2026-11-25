# Security, tests and production reliability

## Security posture from reviewed code

| Boundary | Positive evidence | Unverified / concern |
|---|---|---|
| Web auth | Fortify custom active-user authentication; login throttle; standard web middleware/CSRF | Deployed session-cookie/TLS/proxy settings not established |
| Mobile auth | Bearer-only mobile tokens; 24-hour expiry; abilities, active-role checks, private no-store; device token revocation | Real device/session rotation and logout offline drills |
| Object authorization | PickupTaskPolicy; actor/task checks inside Actions; creator-scoped cashless result | Handover visibility intentionally shared with operational staff; no tenant boundary should be invented |
| Admin corrections | active admin_supervisor check, reason, version and audit events | Concurrent deactivation/correction interleavings not dynamically tested |
| Input / mass assignment | Form Requests and explicit safe field allowlists at reviewed writes | guarded=['id'] requires continued endpoint discipline; not an identified exploit |
| Uploads / evidence | image/type/size/signature checks; authenticated evidence download; private/no-store/nosniff | Very large image pixel dimensions and runtime limits need profiling; no exploit demonstrated |
| Worker auth | shared token minimum length/hash_equals, allowlisted worker IDs, per-job claim token/lease; encrypted hidden claim tokens | Shared token compromise affects worker trust domain; rotation practices not verified |
| Exports / rendering | CSV formula-prefix escaping in results/JNE exports; manifest XLSX uses inline strings/XML escaping; PDF browser disables JS and blocks network | Raw downloadable source CSV intentionally preserves original values; treat as original evidence |
| Mobile storage | Keystore AES-GCM, AtomicFile, scoped encrypted drafts, no backups, release HTTPS guard | Device compromise/signing/rollout controls outside this audit |
| Secrets / logs | .gitignore excludes environments/signing/FCM files; worker safe error messages | No full secret-history scan or vulnerability advisory lookup performed; broad swallowed exceptions TA-08 |

No serious security exposure or object-level authorization bypass was reproduced. Internal operational collaboration is not customer tenancy; do not restrict shared handover workflows based on a tenant model that does not exist.

## Risk-based coverage

Existing tests cover more than CRUD. Inspected cases include:
- Stale takeover owner/version and execution denial for previous owners.
- POP revision/verification baseline and authenticated private evidence.
- Constant query count as pickup-results page size changes.
- AWB replay/conflicting payload, normalized duplicate scans, closed collection guards and Admin correction.
- Four-source and split-server Hybrid cycles, empty sources and expired-source attention.
- Shared/ambiguous customer evidence, candidate-only matching, conflicting references and late observations.
- Older tracking snapshots retained without replacing current status.
- Customer-day aggregation, pending cross-day rules, uncertain-delivery blocks and manifest deduplication.
- Mobile persisted attempts, API timeout/errors, encrypted-store bridge contracts, camera listener teardown, signature validation and push recipient parsing.
- Worker history correlation, single external Process, lost upload/checkpoint acknowledgment and uncertain cashless approval.

Test names and source are evidence of intent; only the executions recorded below establish current local passes.

## Executed

| Check | Result | What it establishes |
|---|---|---|
| First selected Pest run with default CLI | 57 setup errors; no assertions | SQLite drivers disabled in CLI; not 57 application defects |
| Same selection with existing SQLite drivers enabled per process | 57 passed, 773 assertions | Pickup results, mobile execution, confidence monitoring, cashless state machine and customer-day local behavior |
| Second selected Pest selection | 64 passed, 1 failed; 493 assertions reported | Monitoring/import ordering, configured reconciliation, cashless handover and split source behavior; one raw-attribute mismatch |
| Web/mobile TypeScript | Passed | Installed type contracts compile; not runtime/device reliability |
| PHPStan level 7 | 1 error | Alert factory return-union typing fails declared gate |
| Scoped client Vitest | 245 passed, 1 failed across 32 files | Local client logic/render tests; one stale closed-editor copy assertion |
| Six Node worker files | 112 passed | Local loopback/Chromium integration and uncertainty/retry scenarios |

Combined selected backend total: **122 tests, 121 passed, 1 failed** after SQLite activation. Failed raw snapshot adds nullable cashless_capture_hash on refresh; it does not demonstrate changed finalized quantities. Full details and commands are in verification.md and TA-11.

## Missing high-value regression work

| Risk | Present coverage | Additional targeted case |
|---|---|---|
| N+1 | pickup list constant-query assertion | handover create/amend, pending cross-day eligibility and projection entry-date fallback counts |
| Concurrent writes | MySQL takeover/claim tests exist | customer/task and correction/verification barrier interleavings (TA-07) |
| Duplicate/retry import | import/projection replay and duplicate tests | duplicates crossing future streaming boundaries; queue publication loss |
| Shared accounts/code typo/alias | dedicated reconciliation/confidence/code tests | retain contradictory historical sources when optimizing matcher |
| Late/closed data | late attestation and finalized/closure tests | new datum after customer-day lock, no unauthorized evidence correction |
| Partial/empty batch | source completeness and worker tests | cross-batch conflicting rows at PHP import; crash between durable stages |
| Tracking ordering | out-of-order and unchanged-newer tests | equal observed timestamp/job tie-break at realistic concurrent projection |
| SMTP / queue failure | safe uncertainty states and manifest recovery code | killed receipt sender; SMTP response lost; aged QUEUED recovery |
| Offline mobile | unit/bridge/contract tests | physical process death, actual encrypted file recovery, poor network, Bluetooth keyboard, logout/account switch |

## Skipped and why

No full PHP suite: MySQL concurrency tests deliberately CREATE/DROP DATABASE and migrations. Those tests may be appropriate in disposable CI, but were excluded under the audit's non-destructive constraint. Browser QA helpers can seed databases and submit transactions and were not run. Existing local browser fixtures were used only by the Node worker's self-contained tests.

No external Hybrid/APEX/FCM/SMTP calls, real worker execution, dependency installation/upgrades, production load/security probes, APK build or real mobile acceptance. Dependency vulnerability status is **not assessed**; installed package versions and Dependabot configuration are inventory evidence, not proof of no vulnerabilities.

After the isolated fixes are separately authorized, run the complete `php artisan test --compact` only in a disposable test environment with SQLite and MySQL test privileges. It was not run against the attached operational database.

## Observability / production readiness

Business FAILED/UNKNOWN/NEEDS_ATTENTION states and retained source artifacts provide useful recovery evidence. Queue failed_jobs alone is insufficient because some exceptions are caught and normal-returned (TA-08). /up confirms boot/health route response, not source freshness or all named consumers. No production latency, queue-age, scheduler-heartbeat, backup/restore or physical-device evidence was supplied. TA-13 records these as unknowns, not as confirmed missing infrastructure.

