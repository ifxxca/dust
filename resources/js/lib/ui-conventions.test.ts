import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, test } from 'vitest';

function uiSources(directory: string): string[] {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                return ['actions', 'routes', 'wayfinder', 'ui'].includes(
                    entry.name,
                )
                    ? []
                    : uiSources(file);
            }
            return file.endsWith('.tsx') && !file.includes('.test.')
                ? [file]
                : [];
        });
}

test('application UI uses shared disclosure and form controls rather than browser defaults', () => {
    const violations: string[] = [];
    const files = [
        ...uiSources('resources/js'),
        ...uiSources('resources/mobile/src'),
    ];
    for (const file of files) {
        const source = ts.createSourceFile(
            file,
            fs.readFileSync(file, 'utf8'),
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX,
        );
        function visit(node: ts.Node) {
            if (
                ts.isJsxOpeningElement(node) ||
                ts.isJsxSelfClosingElement(node)
            ) {
                const tag = node.tagName.getText(source);
                const attributes = node.attributes.properties.filter(
                    ts.isJsxAttribute,
                );
                const value = (name: string) => {
                    const attribute = attributes.find(
                        (item) => item.name.getText(source) === name,
                    );
                    return attribute?.initializer &&
                        ts.isStringLiteral(attribute.initializer)
                        ? attribute.initializer.text
                        : '';
                };
                const hiddenSelect =
                    tag === 'select' && value('className') === 'sr-only';
                if (
                    (['details', 'summary', 'textarea', 'select'].includes(
                        tag,
                    ) &&
                        !hiddenSelect) ||
                    (tag === 'input' && value('type') === 'checkbox')
                ) {
                    const line =
                        source.getLineAndCharacterOfPosition(
                            node.getStart(source),
                        ).line + 1;
                    violations.push(`${file}:${line} <${tag}>`);
                }
            }
            ts.forEachChild(node, visit);
        }
        visit(source);
    }
    expect(files.length).toBeGreaterThan(100);
    expect(violations).toEqual([]);
});
