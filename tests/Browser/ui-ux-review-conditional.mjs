import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.UI_UX_BASE_URL;
assert(base && ['127.0.0.1', 'localhost'].includes(new URL(base).hostname));
const phase = process.env.UI_UX_PHASE;
assert(['before', 'after'].includes(phase));
const fixture = path.resolve(
    process.env.UI_UX_FIXTURE_IDS.replace(/\.ids\.json$/, ''),
);
assert(
    fixture.startsWith(path.resolve('output') + path.sep) &&
        fixture.endsWith('.sqlite'),
);
const database = new DatabaseSync(fixture);
const account = database
    .prepare('SELECT id, email_verified_at FROM users WHERE email = ?')
    .get('audit-admin_supervisor@example.test');
assert(
    account && account.email_verified_at,
    'Use the isolated, verified audit account',
);
const resetToken = database
    .prepare('SELECT * FROM password_reset_tokens WHERE email = ?')
    .get('audit-admin_supervisor@example.test');
const require = createRequire(path.resolve('workers/jne-report/package.json'));
const { chromium } = require('playwright');
const browser = await chromium.launch({ headless: true });
const root = 'docs/ui-ux-review/evidence';
await fs.mkdir(path.join(root, phase), { recursive: true });
const forgotOnly = process.env.UI_UX_CONDITIONAL_CASES === 'forgot-success';
const records = forgotOnly
    ? JSON.parse(
          await fs.readFile(
              path.join(root, `${phase}-conditional.json`),
              'utf8',
          ),
      ).filter((r) => r.key !== 'forgot-success')
    : [];
async function contrast(page, element) {
    return element.evaluate((e) => {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        const color = (value) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = value;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data].map((v, i) =>
                i === 3 ? v / 255 : v,
            );
        };
        const blend = (fg, bg) =>
            fg
                .slice(0, 3)
                .map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]))
                .concat(1);
        const luminance = (rgb) =>
            rgb
                .slice(0, 3)
                .map((v) => v / 255)
                .map((v) =>
                    v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
                )
                .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
        const ancestors = [];
        for (let node = e; node; node = node.parentElement)
            ancestors.push(color(getComputedStyle(node).backgroundColor));
        let bg = [255, 255, 255, 1];
        for (const c of ancestors.reverse()) bg = blend(c, bg);
        const fg = blend(color(getComputedStyle(e).color), bg);
        const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
        return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
    });
}
try {
    database
        .prepare('UPDATE users SET email_verified_at = NULL WHERE id = ?')
        .run(account.id);
    const context = await browser.newContext({
        colorScheme: 'light',
        locale: 'id-ID',
        deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/login');
    await page.locator('#email').fill('audit-admin_supervisor@example.test');
    await page.locator('#password').fill('password');
    await page
        .getByRole('button', { name: 'Masuk ke workspace', exact: true })
        .click();
    await page.waitForURL((url) => url.pathname !== '/login');
    if (!forgotOnly) {
        for (const viewport of [
            { width: 1366, height: 768 },
            { width: 768, height: 1024 },
            { width: 390, height: 844 },
            { width: 320, height: 740 },
        ]) {
            await page.setViewportSize(viewport);
            const response = await page.goto(base + '/email/verify');
            assert.equal(response.status(), 200);
            await page.waitForLoadState('networkidle');
            await page.evaluate(() => document.fonts.ready);
            assert.equal(new URL(page.url()).pathname, '/email/verify');
            await page
                .getByRole('button', {
                    name: 'Kirim ulang email verifikasi',
                    exact: true,
                })
                .waitFor();
            const screenshot = `${phase}/verify-email-${viewport.width}.png`;
            await page.screenshot({ path: path.join(root, screenshot) });
            const metrics = await page.evaluate(() => ({
                overflow: document.documentElement.scrollWidth > innerWidth + 1,
                title: {
                    top: Math.round(
                        document.querySelector('h1').getBoundingClientRect()
                            .top,
                    ),
                },
                unnamedControls: [
                    ...document.querySelectorAll('button,a'),
                ].filter(
                    (e) =>
                        e.getClientRects().length &&
                        !e.textContent.trim() &&
                        !e.getAttribute('aria-label'),
                ).length,
            }));
            assert(!metrics.overflow && !metrics.unnamedControls);
            records.push({
                key: 'verify-email',
                role: 'admin_supervisor (unverified)',
                route: '/email/verify',
                viewport,
                screenshot,
                status: response.status(),
                ...metrics,
                errors: [...errors],
            });
        }
        await page.setViewportSize({ width: 390, height: 844 });
        await page
            .getByRole('button', {
                name: 'Kirim ulang email verifikasi',
                exact: true,
            })
            .click();
        const message = page.getByText(
            'Tautan verifikasi baru telah dikirim ke alamat email Anda.',
            { exact: true },
        );
        await message.waitFor();
        const announced = (await message.getAttribute('role')) === 'status';
        if (phase === 'after')
            assert(
                announced,
                'Resend success is exposed as an accessible status',
            );
        const screenshot = `${phase}/verify-email-success-390.png`;
        await page.screenshot({ path: path.join(root, screenshot) });
        const contrastRatio = await contrast(page, message);
        if (phase === 'after')
            assert(contrastRatio >= 4.5, 'Verification success text contrast');
        let darkContrastRatio = null;
        if (phase === 'after') {
            await page.emulateMedia({ colorScheme: 'dark' });
            await page.waitForFunction(() =>
                document.documentElement.classList.contains('dark'),
            );
            darkContrastRatio = await contrast(page, message);
            assert(
                darkContrastRatio >= 4.5,
                'Verification success contrast in system dark mode',
            );
        }
        records.push({
            key: 'verify-email-success',
            viewport: { width: 390, height: 844 },
            screenshot,
            announced,
            contrastRatio,
            darkContrastRatio,
            errors: [...errors],
        });
    }
    const publicPage = await browser.newPage({
        viewport: { width: 390, height: 844 },
        colorScheme: 'light',
        locale: 'id-ID',
        deviceScaleFactor: 1,
    });
    publicPage.on('pageerror', (error) => errors.push(error.message));
    database
        .prepare('DELETE FROM password_reset_tokens WHERE email = ?')
        .run('audit-admin_supervisor@example.test');
    await publicPage.goto(base + '/forgot-password');
    await publicPage
        .locator('#email')
        .fill('audit-admin_supervisor@example.test');
    await publicPage
        .getByRole('button', { name: 'Kirim tautan atur ulang', exact: true })
        .click();
    const status = publicPage.getByRole('status');
    await status.waitFor();
    await publicPage.waitForLoadState('networkidle');
    const forgotContrast = await contrast(publicPage, status);
    if (phase === 'after')
        assert(forgotContrast >= 4.5, 'Password reset success text contrast');
    const forgotScreenshot = `${phase}/forgot-success-390.png`;
    await publicPage.screenshot({ path: path.join(root, forgotScreenshot) });
    let forgotDarkContrast = null;
    if (phase === 'after') {
        await publicPage.emulateMedia({ colorScheme: 'dark' });
        await publicPage.waitForFunction(() =>
            document.documentElement.classList.contains('dark'),
        );
        forgotDarkContrast = await contrast(publicPage, status);
        assert(
            forgotDarkContrast >= 4.5,
            'Password reset success contrast in system dark mode',
        );
    }
    records.push({
        key: 'forgot-success',
        viewport: { width: 390, height: 844 },
        screenshot: forgotScreenshot,
        contrastRatio: forgotContrast,
        darkContrastRatio: forgotDarkContrast,
        errors: [...errors],
    });
    assert.deepEqual(errors, []);
} finally {
    database
        .prepare('DELETE FROM password_reset_tokens WHERE email = ?')
        .run('audit-admin_supervisor@example.test');
    if (resetToken)
        database
            .prepare(
                'INSERT INTO password_reset_tokens (email, token, created_at) VALUES (?, ?, ?)',
            )
            .run(resetToken.email, resetToken.token, resetToken.created_at);
    database
        .prepare('UPDATE users SET email_verified_at = ? WHERE id = ?')
        .run(account.email_verified_at, account.id);
    assert.equal(
        database
            .prepare('SELECT email_verified_at FROM users WHERE id = ?')
            .get(account.id).email_verified_at,
        account.email_verified_at,
    );
    database.close();
    await browser.close();
    await fs.writeFile(
        path.join(root, `${phase}-conditional.json`),
        JSON.stringify(records, null, 2),
    );
}
console.log(
    `Captured ${records.length} ${phase} conditional email-verification states; fixture account restored.`,
);
