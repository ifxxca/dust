import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { ModuleMenu } from '../../resources/mobile/src/workspace-ui';
import Alerts from '../../resources/mobile/src/cashless-alerts-panel';
import Results from '../../resources/mobile/src/cashless-result-panel';
import type { Task } from '../../resources/mobile/src/types';
import type { Session } from '../../resources/mobile/src/types';
import '../../resources/mobile/src/styles.css';

if (!['127.0.0.1', 'localhost'].includes(location.hostname)) throw new Error('Local QA fixture only.');

type Scope = { account: string; environment: string; name: string };
const scopeKey = (scope: Scope) => `cashless-qa:${scope.account}:${scope.environment}:${scope.name}`;
const storageQa = (window as unknown as { cashlessStorageQa: { delay: number; writes: number; signatures: number; failWrites: boolean } }).cashlessStorageQa ??= { delay: 0, writes: 0, signatures: 0, failWrites: false };
const delay = () => new Promise((resolve) => setTimeout(resolve, storageQa.delay));
registerPlugin('MobileLocal', { web: async () => ({
    read: async (scope: Scope) => ({ value: localStorage.getItem(scopeKey(scope)) }),
    write: async (scope: Scope & { value: string }) => { storageQa.writes++; await delay(); if (storageQa.failWrites) throw new Error('QA storage unavailable'); localStorage.setItem(scopeKey(scope), scope.value); },
    remove: async (scope: Scope) => { localStorage.removeItem(scopeKey(scope)); },
    list: async (scope: Scope) => {
        const prefix = scopeKey({ ...scope, name: '' });
        return { names: Object.keys(localStorage).filter((name) => name.startsWith(prefix)).map((name) => name.slice(prefix.length)) };
    },
    signature: async (scope: Scope & { base64: string }) => {
        storageQa.signatures++;
        await delay();
        const bytes = Uint8Array.from(atob(scope.base64), (value) => value.charCodeAt(0));
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(scopeKey(scope), JSON.stringify({ base64: scope.base64, sha256 }));
        return { name: scope.name, kind: 'signature', mime: 'image/png', bytes: bytes.length, sha256 };
    },
    evidence: async (scope: Scope) => JSON.parse(localStorage.getItem(scopeKey(scope))!),
}) });
if ((window as unknown as { cashlessCameraQa?: boolean }).cashlessCameraQa) {
    const createCamera = () => ({
        handlers: new Map<string, (event: unknown) => void>(),
        permission: 'granted',
        starts: 0, stops: 0, torch: false, events: [] as string[],
        emit(barcodes: string[]) { this.handlers.get('barcodesScanned')?.({ barcodes: barcodes.map((rawValue) => ({ rawValue })) }); },
    });
    const qa = window as unknown as { cashlessCamera?: ReturnType<typeof createCamera> };
    const camera = qa.cashlessCamera ??= createCamera();
    const handlers = camera.handlers;
    registerPlugin('BarcodeScanner', { web: async () => ({
        isSupported: async () => ({ supported: true }),
        checkPermissions: async () => ({ camera: camera.permission }),
        requestPermissions: async () => ({ camera: camera.permission }),
        startScan: async () => { camera.starts++; },
        stopScan: async () => { camera.stops++; camera.torch = false; },
        addListener: async (name: string, handler: (event: unknown) => void) => {
            camera.events.push('listen:' + name);
            handlers.set(name, handler);
            return { remove: async () => { camera.events.push('remove:' + name); handlers.delete(name); } };
        },
        isTorchAvailable: async () => ({ available: true }),
        isTorchEnabled: async () => ({ enabled: camera.torch }),
        toggleTorch: async () => { camera.torch = !camera.torch; },
        openSettings: async () => {},
    }) });
    Capacitor.isNativePlatform = () => true;
    (window as unknown as { cashlessCamera: typeof camera }).cashlessCamera = camera;
}
const { default: Panel } = await import('../../resources/mobile/src/cashless-handover-panel');
const { default: ProofPanel } = await import('../../resources/mobile/src/proof-panel');
const { default: ExecutionPanel } = await import('../../resources/mobile/src/execution-panel');
const session = (window as unknown as { cashlessQaSession: Session }).cashlessQaSession;
if (!session || new URL(session.environment).port !== '8019') throw new Error('Use the isolated QA API.');

function Harness() {
    const [screen, setScreen] = useState(location.search.includes('view=execution') ? 'execution' : location.search.includes('view=alerts') ? 'notifications' : location.search.includes('view=proof') ? 'proof' : location.search.includes('view=cashless') ? 'cashless' : 'menu');
    const [target, setTarget] = useState<number>();
    const [result, setResult] = useState<number>();
    const [task, setTask] = useState<Task>((window as unknown as { cashlessQaTask: Task }).cashlessQaTask);
    const [busy, setBusy] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);
    const [failure, setFailure] = useState('');
    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update); window.addEventListener('offline', update);
        return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
    }, []);
    return <main className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-background p-4 text-foreground"><header className="flex items-center justify-between gap-3"><h1 className="text-xl font-semibold">{screen === 'execution' ? 'Pickup tersedia' : screen === 'menu' ? 'Menu' : screen === 'proof' ? 'Pickup · POP' : screen === 'result' ? 'Hasil pemrosesan cashless' : screen === 'notifications' ? 'Notifikasi' : 'Handover Cashless'}</h1>{screen !== 'menu' && <button disabled={busy} className="min-h-11 px-3" onClick={() => { if (window.dispatchEvent(new Event('mobile-back', { cancelable: true }))) setScreen('menu'); }}>Kembali</button>}</header>{failure && <p role="alert">{failure}</p>}{screen === 'execution' ? <ExecutionPanel task={task} schedule="29 Okt 2026, 10.00" session={session} online={online} onTask={setTask} onFailure={async (error) => setFailure(String(error))} onBusyChange={setBusy} onRecoveryFound={() => {}} /> : screen === 'proof' ? <ProofPanel task={task} taskId={task.id} session={session} online={online} onTask={setTask} onFailure={async (error) => setFailure(String(error))} restored={null} onRestoredConsumed={() => {}} onBusyChange={setBusy} onReviewChange={() => {}} onRecoveredDraft={() => {}} enabled={true} onPendingChange={() => {}} /> : screen === 'result' && result ? <Results session={session} batchId={result} onBack={() => setScreen('notifications')} /> : screen === 'notifications' ? <Alerts session={session} online={online} onOpen={(link) => { setResult(link.batchId); setScreen('result'); }} /> : screen === 'menu' ? <ModuleMenu onPickup={() => {}} onHandover={() => {}} onCashless={() => setScreen('cashless')} /> : <Panel initialPickupId={target} session={session} online={online} onBusyChange={setBusy} onFocusChange={() => {}} onFailure={async (error) => setFailure(String(error))} />}</main>;
}
createRoot(document.getElementById('root')!).render(<Harness />);
