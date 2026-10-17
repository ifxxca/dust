import { finalizePresentation } from 'file:///C:/Users/copol/.codex/plugins/cache/openai-primary-runtime/presentations/26.1013.11914/skills/presentations/container_tools/artifact_tool_utils.mjs';
const root = 'S:/2026/dust/presentation';
const skill =
    'C:/Users/copol/.codex/plugins/cache/openai-primary-runtime/presentations/26.1013.11914/skills/presentations';
const result = await finalizePresentation({
    workspaceDir: root,
    candidatePath: root + '/.build/candidate.pptx',
    finalPath:
        root + '/deliverables/Retail_Operations_Platform_Presentation.pptx',
    pythonExecutable:
        'C:/Users/copol/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe',
    integrityValidatorPath:
        skill + '/container_tools/inspect_presentation_package_integrity.py',
    layoutValidatorPath:
        skill + '/container_tools/inspect_presentation_layout_geometry.py',
    layoutArgs: [
        '--expected-slide-size-emu',
        '15240000,8572500',
        '--validate-heading-fit',
        ...[4, 13, 15].flatMap((n) => [
            '--require-native-table-slide',
            String(n),
        ]),
    ],
    explicitTotalSlideCount: 18,
    requiredNativeTableOwnerSlides: [4, 13, 15],
    fontPolicy: { basis: 'design', families: ['Arial'] },
    verifyArtifactToolImport: true,
    receiptPath: root + '/.build/validation-final.json',
});
console.log(
    JSON.stringify({
        passed: true,
        slides: result.presentationLayout.slide_count,
        findings: result.presentationLayout.findingCount,
        path: result.finalPath,
        sha256: result.finalSha256,
    }),
);
