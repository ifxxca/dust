import fs from 'node:fs/promises';
import sharp from 'sharp';
const root = 'S:/2026/dust';
const dir = root + '/presentation/assets';
/** @type {Array<[string, string, { left: number, top: number, width: number, height: number } | null]>} */
const specs = [
    ['mobile-home', 'storage/mobile-mockup-home.png', null],
    ['mobile-tasks', 'storage/mobile-mockup-tasks.png', null],
    ['mobile-detail', 'storage/mobile-mockup-detail.png', null],
    ['mobile-quantities', 'storage/mobile-mockup-pop-quantities.png', null],
    ['mobile-photos', 'storage/mobile-mockup-pop-photos.png', null],
    ['mobile-review', 'storage/mobile-mockup-pop-review.png', null],
    ['mobile-verification', 'storage/mobile-handover-verification.png', null],
    ['mobile-closed', 'storage/mobile-handover-closed.png', null],
    ['mobile-no-packages', 'storage/mobile-no-packages-complete.png', null],
    [
        'web-create',
        'storage/app/ui-qa-fluid-operations-create-1920.png',
        { left: 720, top: 85, width: 720, height: 855 },
    ],
    [
        'web-dashboard',
        'storage/app/ui-qa-dashboard-refinement-desktop.png',
        { left: 280, top: 90, width: 1225, height: 710 },
    ],
];
const metadata = [];
for (const [name, source, crop] of specs) {
    let img = sharp(root + '/' + source);
    if (crop) img = img.extract(crop);
    else {
        const m = await img.metadata();
        img = img.extract({
            left: 0,
            top: 65,
            width: m.width,
            height: m.height - 130,
        });
    }
    await img.png().toFile(dir + '/' + name + '.png');
    const m = await sharp(dir + '/' + name + '.png').metadata();
    metadata.push({ name, source, crop, width: m.width, height: m.height });
}
await fs.writeFile(
    dir + '/asset-manifest.json',
    JSON.stringify(metadata, null, 2),
);
const thumbs = await Promise.all(
    metadata.map(async (m, i) => ({
        input: await sharp(dir + '/' + m.name + '.png')
            .resize({
                width: 280,
                height: 490,
                fit: 'contain',
                background: '#ecf0f5',
            })
            .png()
            .toBuffer(),
        left: (i % 6) * 300,
        top: Math.floor(i / 6) * 510,
    })),
);
await sharp({
    create: { width: 1800, height: 1020, channels: 3, background: '#d4dae3' },
})
    .composite(thumbs)
    .png()
    .toFile(root + '/presentation/.build/assets-contact.png');
console.log(metadata);
