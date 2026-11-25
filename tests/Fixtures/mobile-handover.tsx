import { registerPlugin } from '@capacitor/core';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '../../resources/mobile/src/types';
import '../../resources/mobile/src/styles.css';

type Scope = { account: string; environment: string; name: string };
const key = (scope: Scope) =>
    `handover-qa:${scope.account}:${scope.environment}:${scope.name}`;
if (location.hostname !== '127.0.0.1') throw new Error('Local fixture only.');
registerPlugin('MobileLocal', {
    web: async () => ({
        read: async (scope: Scope) => ({
            value: localStorage.getItem(key(scope)),
        }),
        write: async (scope: Scope & { value: string }) => {
            localStorage.setItem(key(scope), scope.value);
        },
        remove: async (scope: Scope) => {
            localStorage.removeItem(key(scope));
        },
    }),
});
const { default: HandoverPanel } =
    await import('../../resources/mobile/src/handover-panel');
const session = (window as unknown as { handoverQaSession: Session })
    .handoverQaSession;
if (!session || new URL(session.environment).origin !== 'http://127.0.0.1:8019')
    throw new Error('Use isolated handover API.');
const focus = () => {};

function Harness() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    return (
        <main
            className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-background p-4 text-foreground"
            aria-busy={busy}
        >
            {error && <p role="alert">{error}</p>}
            <HandoverPanel
                session={session}
                online={true}
                onBusyChange={setBusy}
                onFocusChange={focus}
                onTask={() => {}}
                onFailure={async (failure) => setError(String(failure))}
            />
        </main>
    );
}
createRoot(document.getElementById('root')!).render(<Harness />);
