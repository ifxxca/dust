import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import {
    confirmedCashlessHandover,
    readableCashlessDraft,
} from './cashless-handover';
import { ModuleMenu, BottomNavigation } from './workspace-ui';
import { createElement } from 'react';

const draft = {
    schema: 1,
    pickupId: 12,
    awbs: ['TG0001'],
    submissionKey: '91e5d581-489c-4fe0-86fe-01df509e1056',
    pending: true,
};

test('an immutable pending cashless attempt can be restored without changing its retry key', () => {
    const restored = JSON.parse(JSON.stringify(draft));
    expect(readableCashlessDraft(restored)).toBe(true);
    expect(restored.submissionKey).toBe(draft.submissionKey);
});

test.each([
    null,
    [],
    { ...draft, schema: 2 },
    { ...draft, pickupId: 0 },
    { ...draft, awbs: ['TG1', 'TG1'] },
    { ...draft, awbs: [] },
    { ...draft, awbs: ['bad value'] },
    { ...draft, submissionKey: '-'.repeat(36) },
    { ...draft, source: 'unrecognized-server' },
])(
    'unsupported drafts are preserved as unreadable instead of silently reset: %j',
    (value) => {
        expect(readableCashlessDraft(value)).toBe(false);
    },
);

test('the chosen server survives draft restoration and an immutable retry', () => {
    for (const source of ['roberto', 'nuralamt']) {
        const restored = JSON.parse(JSON.stringify({ ...draft, source }));
        expect(readableCashlessDraft(restored)).toBe(true);
        expect(restored.source).toBe(source);
        expect(restored.submissionKey).toBe(draft.submissionKey);
    }
});

test('a draft is cleared only after the server confirms the correct book and batch count', () => {
    expect(
        confirmedCashlessHandover(
            { data: { pickup_task_id: 12, saved: 2, stored_count: 5 } },
            12,
            2,
        ),
    ).toBe(true);
    for (const reply of [
        null,
        {},
        { data: { pickup_task_id: 13, saved: 2, stored_count: 5 } },
        { data: { pickup_task_id: 12, saved: 1, stored_count: 5 } },
        { data: { pickup_task_id: 12, saved: 2, stored_count: 0 } },
    ]) {
        expect(confirmedCashlessHandover(reply, 12, 2)).toBe(false);
    }
});

test('cashless uses Pickup instead of a separate module while legacy screens retain their navigation context', () => {
    const menu = renderToStaticMarkup(
        createElement(ModuleMenu, {
            onPickup: () => {},
            onHandover: () => {},
            onCashless: () => {},
        }),
    );
    expect(menu).not.toContain('Handover Cashless');
    expect(menu).toMatch(/<button[^>]*aria-label="Pickup"(?![^>]*disabled)/);
    const navigation = renderToStaticMarkup(
        createElement(BottomNavigation, {
            tab: 'cashless',
            disabled: false,
            onNavigate: () => {},
        }),
    );
    expect(navigation).toMatch(
        /aria-current="page"[^>]*>[\s\S]*?<span>Menu<\/span>/,
    );
});
