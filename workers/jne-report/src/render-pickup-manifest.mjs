import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const [input, output] = process.argv.slice(2);
if (!input || !output || path.extname(input) !== '.html' || path.extname(output) !== '.pdf' || path.dirname(path.resolve(input)) !== path.dirname(path.resolve(output))) {
    throw new Error('Expected an HTML manifest and PDF output in the same directory.');
}
await mkdir(path.dirname(output), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    await page.setContent(await readFile(input, 'utf8'), { waitUntil: 'load' });
    await page.pdf({ path: output, format: 'A4', printBackground: true, margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' }, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font-size:9px;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>' });
} finally {
    await browser.close();
}
