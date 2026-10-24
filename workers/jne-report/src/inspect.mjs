import { mkdir } from 'node:fs/promises';
import { loadConfig } from './config.mjs';
import { ApexClient } from './apex.mjs';
import { safeError, log } from './errors.mjs';
import { acquireProcessLock } from './worker.mjs';
import { readHistory } from './history.mjs';

let apex;
let release;
try {
    process.umask(0o077);
    const config = loadConfig();
    await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
    release = await acquireProcessLock(config.dataDir);
    apex = new ApexClient(config);
    await apex.open(45);
    // Parameter controls are rendered by APEX only after changing the default upload mode.
    await apex.setControl('#P45_PARAM_TYPE', 'P');
    await apex.page.locator('#P45_CUST').waitFor({ state: 'visible' });
    const form = await apex.page
        .locator(
            'input:visible, select:visible, textarea:visible, button:visible',
        )
        .evaluateAll((elements) =>
            elements.map((element) => ({
                id: element.id,
                tag: element.tagName.toLowerCase(),
                type: element.type,
                label: [...(element.labels || [])]
                    .map((label) => label.textContent.trim())
                    .join(' '),
                required:
                    element.required ||
                    element.getAttribute('aria-required') === 'true',
                placeholder: element.getAttribute('placeholder'),
                date_format: (() => {
                    const attribute =
                        element.getAttribute('format') ||
                        element.getAttribute('data-format');
                    if (attribute) return attribute;
                    try {
                        if (
                            element.classList.contains('hasDatepicker') &&
                            typeof window.apex?.jQuery?.fn?.datepicker ===
                                'function'
                        ) {
                            return window.apex
                                .jQuery(element)
                                .datepicker('option', 'dateFormat');
                        }
                    } catch {
                        /* Some date controls do not expose a datepicker instance. */
                    }
                    return null;
                })(),
                // Only mode options and button labels; no account values, report rows, or session URLs.
                options:
                    element.id === 'P45_PARAM_TYPE' && element.options
                        ? [...element.options].map((option) => ({
                              value: option.value,
                              label: option.label,
                          }))
                        : undefined,
                button: ['submit', 'button'].includes(element.type)
                    ? element.textContent.trim()
                    : undefined,
            })),
        );
    await apex.open(46);
    const headers = await apex.page
        .locator('table.a-IRR-table th')
        .allTextContents();
    const historyColumns = await apex.page
        .locator('table.a-IRR-table th')
        .evaluateAll((elements) =>
            elements.map((element) => ({
                id: element.id,
                label: element.textContent.trim(),
            })),
        );
    const historyRows = await readHistory(apex.page);
    log('apex_inspection', {
        form,
        history_headers: headers,
        history_columns: historyColumns,
        history_row_count: historyRows.length,
    });
} catch (error) {
    const safe = safeError(error);
    const diagnostics = await apex?.diagnostics().catch(() => undefined);
    log('inspection_failed', {
        code: safe.code,
        message: safe.message,
        diagnostics,
    });
    process.exitCode = 1;
} finally {
    await apex?.close();
    await release?.();
}
