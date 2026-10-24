# UI/UX Remediation Results

Branch: `codex/ui-ux-remediation`. Baseline: `56dd4db2636bfc4fd702d3d8569230d09bb4eb26`.

The approved roadmap is being implemented sequentially. Business rules, role permissions, API payloads, report automation and shipment processing are outside the changes. The four pre-existing modified application files and the untracked audit/presentation/output files are preserved; they are not swept into remediation commits.

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

## Reproducible browser checks

`tests/Browser/ui-ux-remediation.mjs` uses the Playwright dependency already installed in the report worker; no dependency was added. It requires an isolated loopback fixture application and a JSON fixture-ID file. It refuses non-loopback origins. The fixture login belongs only to synthetic test data.

```powershell
$env:UI_UX_BASE_URL='http://127.0.0.1:59634'
$env:UI_UX_FIXTURE_IDS='output/ui-ux-audit/fixture-ids.json'
$env:UI_UX_EVIDENCE_DIR='output/ui-ux-remediation/wave-1'
node --test --test-name-pattern='wave 1' tests/Browser/ui-ux-remediation.mjs
php -d extension=pdo_sqlite vendor/bin/pest --compact tests/Feature/CustomerManagementTest.php tests/Feature/HandoverVerificationTest.php tests/Feature/OperationalWorkspaceTest.php
```

## Verification boundaries

Browser evidence uses synthetic data and actual application routes, not production transactions. External JNE/APEX/Hybrid retrieval, native Android hardware, email delivery and screen-reader software have not been tested. No claim of complete WCAG conformance or user-study success is made. Each subsequent wave records its own checks below.
