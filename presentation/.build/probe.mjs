import fs from 'node:fs/promises';
import { Presentation, PresentationFile } from '@oai/artifact-tool';
const p = Presentation.create({ slideSize: { width: 1600, height: 900 } });
const s = p.slides.add();
s.background.fill = '#FFFFFF';
const t = s.shapes.add({
    geometry: 'textbox',
    position: { left: 80, top: 80, width: 1300, height: 100 },
    fill: 'none',
    line: { fill: 'none', width: 0 },
});
t.text = 'Retail Operations Platform';
t.text.style = {
    fontSize: 62,
    typeface: 'Arial',
    bold: true,
    color: '#162F69',
    insets: 0,
};
await (
    await PresentationFile.exportPptx(p)
).save('S:/2026/dust/presentation/.build/probe.pptx');
try {
    await fs.writeFile(
        'S:/2026/dust/presentation/.build/probe.png',
        new Uint8Array(
            await (
                await p.export({ slide: s, format: 'png', scale: 1 })
            ).arrayBuffer(),
        ),
    );
    console.log('render ok');
} catch (e) {
    console.log('render unavailable', String(e).slice(0, 500));
}
console.log('export ok');
