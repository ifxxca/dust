import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import jneLogo from './jne-logo.svg';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInitials } from '@/hooks/use-initials';
import { EmptyState } from '@/components/operational-ui';
import {
    ArrowLeft,
    RefreshCw,
    SlidersHorizontal,
    Bell,
    Eye,
    EyeOff,
    Mail,
    LockKeyhole,
    LoaderCircle,
    ShieldCheck,
    ChevronRight,
    LogOut,
} from 'lucide-react';
import {
    BottomNavigation,
    ModuleMenu,
    PickupProgress,
    TaskCard,
    TaskSummary,
    type AppScreen,
} from './workspace-ui';
import { me } from '@/routes/mobile';
import { store, destroy } from '@/routes/mobile/auth';
import { index, candidates, show } from '@/routes/mobile/tasks';
import { ApiError, apiOrigin, request, userFacingError } from './api';
import { OperationalFeedback } from './feedback';
import {
    clearSession,
    installationId,
    lockSession,
    readSession,
    writeSession,
} from './secure-session';
import type { LoginResult, MeResult, Session, Task, TaskPage } from './types';
import ExecutionPanel from './execution-panel';
import ProofPanel from './proof-panel';
import PrivateProof from './private-proof';
import DraftList from './draft-list';
import HandoverPanel from './handover-panel';
import ManualPickup from './manual-pickup';
import { readLocal, captureResult, captureFailure } from './local-store';
import type { RestoredListenerEvent } from '@capacitor/app';
import {
    listenPush,
    registerPush,
    stopPush,
    type AssignmentLink,
} from './push';

type Tab = 'mine' | 'available' | 'handover' | 'history' | 'account';
const initialFilters = {
    q: '',
    status: '',
    date_from: '',
    date_to: '',
    pickup_type: '',
    sort: 'scheduled',
};

export default function MobileApp() {
    const getInitials = useInitials();
    const [session, setSession] = useState<Session | null>(null);
    const sessionRef = useRef<Session | null>(null);
    const generation = useRef(0);
    const network = useRef(new AbortController());
    const [booting, setBooting] = useState(true);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [featureBusy, setFeatureBusy] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    useEffect(() => {
        let fullHeight = window.innerHeight;
        const measure = () => {
            const height = window.visualViewport?.height || window.innerHeight;
            fullHeight = Math.max(fullHeight, height);
            const focused = document.activeElement?.matches('input,textarea');
            setKeyboardOpen(!!focused && height < fullHeight * 0.8);
        };
        window.visualViewport?.addEventListener('resize', measure);
        window.addEventListener('resize', measure);
        document.addEventListener('focusout', measure);
        return () => {
            window.visualViewport?.removeEventListener('resize', measure);
            window.removeEventListener('resize', measure);
            document.removeEventListener('focusout', measure);
        };
    }, []);
    const featureLocks = useRef({
        execution: false,
        proof: false,
        handover: false,
        manual: false,
    });
    const changeWorkBusy = useCallback(
        (
            kind: 'execution' | 'proof' | 'handover' | 'manual',
            value: boolean,
        ) => {
            if (value) setError('');
            featureLocks.current[kind] = value;
            setFeatureBusy(Object.values(featureLocks.current).some(Boolean));
        },
        [],
    );
    const executionBusy = useCallback(
        (value: boolean) => changeWorkBusy('execution', value),
        [changeWorkBusy],
    );
    const proofBusy = useCallback(
        (value: boolean) => changeWorkBusy('proof', value),
        [changeWorkBusy],
    );
    const handoverBusy = useCallback(
        (value: boolean) => changeWorkBusy('handover', value),
        [changeWorkBusy],
    );
    const [error, setError] = useState('');
    const [manualOpen, setManualOpen] = useState(false);
    const [manualSource, setManualSource] = useState<Task | null>(null);
    const manualBusy = useCallback(
        (value: boolean) => changeWorkBusy('manual', value),
        [changeWorkBusy],
    );
    const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>(
        {},
    );
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [screen, setScreen] = useState<AppScreen>('home');
    const [moduleFocused, setModuleFocused] = useState(false);
    const [taskMode, setTaskMode] = useState<'detail' | 'execution'>('detail');
    const [proofRecovery, setProofRecovery] = useState<{
        taskId: number;
        pending: boolean;
    } | null>(null);
    const [proofDetailsOpen, setProofDetailsOpen] = useState(false);
    const [homeSummary, setHomeSummary] = useState<TaskPage['summary']>();
    const [showPassword, setShowPassword] = useState(false);
    const [passwordHelp, setPasswordHelp] = useState(false);
    const [appVersion, setAppVersion] = useState('');
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        let active = true;
        void App.getInfo()
            .then((info) => {
                if (active) setAppVersion(`v${info.version}`);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);
    const [taskId, setTaskId] = useState<number | null>(null);
    const recoverProof = useCallback(() => setTaskMode('execution'), []);
    const proofPending =
        proofRecovery?.taskId !== taskId || proofRecovery.pending;
    const proofPendingChange = useCallback(
        (pending: boolean) => {
            if (taskId === null) return;
            setProofRecovery((previous) =>
                previous?.taskId === taskId && previous.pending === pending
                    ? previous
                    : { taskId, pending },
            );
        },
        [taskId],
    );
    useEffect(() => {
        setProofDetailsOpen(false);
    }, [taskId]);
    const [reviewingProof, setReviewingProof] = useState(false);
    const [notifications, setNotifications] = useState<AssignmentLink[]>([]);
    const [totalTasks, setTotalTasks] = useState<number | null>(null);
    const [tab, setTab] = useState<Tab>('mine');
    useEffect(() => {
        window.scrollTo({ top: 0, left: 0 });
    }, [screen, tab, taskId, taskMode]);
    const [task, setTask] = useState<Task | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [page, setPage] = useState(1);
    const [lastPage, setLastPage] = useState(1);
    const [filters, setFilters] = useState(initialFilters);
    const [search, setSearch] = useState('');
    const [refresh, setRefresh] = useState(0);
    const [loading, setLoading] = useState(false);
    const [online, setOnline] = useState(navigator.onLine);
    const [pushNotice, setPushNotice] = useState('');
    const [testPushVisible, setTestPushVisible] = useState(false);
    const [pushBusy, setPushBusy] = useState(false);
    const [pendingLink, setPendingLink] = useState<AssignmentLink | null>(null);
    const pushReady = useRef<Promise<() => Promise<void>> | null>(null);
    const [restoredCapture, setRestoredCapture] =
        useState<RestoredListenerEvent | null>(null);
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        const listener = App.addListener('appRestoredResult', (result) => {
            if (
                !['Camera', 'MobileLocal'].includes(result.pluginId) ||
                !['getPhoto', 'takePhoto', 'chooseFromGallery'].includes(
                    result.methodName,
                )
            )
                return;
            const data = result.data as {
                uri?: string;
                path?: string;
                operationId?: string;
                results?: { uri: string }[];
            };
            const uri = data?.path || data?.uri || data?.results?.[0]?.uri;
            if (!result.success) {
                void captureFailure(result.methodName)
                    .then(() =>
                        setPushNotice(
                            'Capture tidak selesai. Draft akun asal tetap tersimpan; buka draft untuk meninjau capture tertunda.',
                        ),
                    )
                    .catch(() =>
                        setPushNotice(
                            'Konteks capture belum dapat dipulihkan. Data tidak dihapus.',
                        ),
                    );
                return;
            }
            if (result.success && uri)
                void captureResult(uri, result.methodName, data?.operationId)
                    .then(() =>
                        setRestoredCapture({ ...result, data: undefined }),
                    )
                    .catch(() =>
                        setPushNotice(
                            'Hasil kamera belum dapat dipulihkan ke akun asal; data tidak ditempelkan ke akun lain.',
                        ),
                    );
        });
        return () => {
            void listener.then((handle) => handle.remove());
        };
    }, []);
    useEffect(() => {
        if (booting || !session || session.locked || !restoredCapture) return;
        let cancelled = false;
        void readLocal<{ taskId: number }>(session, 'pending-camera')
            .then((pending) => {
                if (cancelled || !pending) return;
                setScreen('pickup');
                setTab('mine');
                setTaskId(pending.taskId);
                setTask(null);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [session?.token, session?.locked, booting, restoredCapture]);

    useEffect(() => {
        const ready = listenPush(
            () => ({
                session: sessionRef.current,
                signal: network.current.signal,
            }),
            setPendingLink,
            setPushNotice,
            (link) =>
                setNotifications((previous) =>
                    [
                        link,
                        ...previous.filter(
                            (item) => item.eventId !== link.eventId,
                        ),
                    ].slice(0, 30),
                ),
            () => setTestPushVisible(true),
        );
        pushReady.current = ready;
        return () => {
            void ready.then((dispose) => dispose());
        };
    }, []);

    useEffect(() => {
        if (booting || !Capacitor.isNativePlatform()) return;
        let cancelled = false;
        void (async () => {
            await pushReady.current;
            if (cancelled) return;
            if (
                !session ||
                session.locked ||
                Date.parse(session.expiresAt) <= Date.now()
            ) {
                await stopPush();
                return;
            }
            if (online) {
                const message = await registerPush(
                    () =>
                        !cancelled &&
                        sessionRef.current?.token === session.token &&
                        !sessionRef.current?.locked,
                );
                if (!cancelled && message) setPushNotice(message);
            }
        })().catch(() => {
            if (!cancelled)
                setPushNotice(
                    'Notifikasi belum aktif. Periksa koneksi dan izin notifikasi di pengaturan perangkat.',
                );
        });
        return () => {
            cancelled = true;
        };
    }, [session?.token, session?.locked, booting, online]);

    useEffect(() => {
        if (
            booting ||
            !pendingLink ||
            !session ||
            session.locked ||
            featureBusy
        )
            return;
        if (Date.parse(session.expiresAt) <= Date.now()) {
            void clearSession().then(() => changeSession(null));
            return;
        }
        setPendingLink(null);
        if (pendingLink.recipientId !== session.user.id) {
            setPushNotice('Notifikasi berasal dari akun lain.');
            return;
        }
        setNotifications((previous) =>
            [
                pendingLink,
                ...previous.filter(
                    (item) => item.eventId !== pendingLink.eventId,
                ),
            ].slice(0, 30),
        );
        setScreen('pickup');
        setTab('mine');
        setTask(null);
        setTaskId(pendingLink.taskId);
        setTaskMode('detail');
        setError('');
    }, [pendingLink, session, booting, featureBusy]);

    const changeSession = useCallback((value: Session | null) => {
        generation.current++;
        network.current.abort();
        network.current = new AbortController();
        sessionRef.current = value;
        setSession(value);
        setNotifications([]);
        setPushNotice('');
        setTestPushVisible(false);
        setTotalTasks(null);
        setReviewingProof(false);
        setTasks([]);
        setTask(null);
        setTaskId(null);
        setTaskMode('detail');
        setHomeSummary(undefined);
        setPage(1);
        setScreen('home');
        setManualOpen(false);
        setManualSource(null);
        setTab('mine');
        setFilters(initialFilters);
        setSearch('');
    }, []);

    const fail = useCallback(
        async (failure: unknown) => {
            const message = userFacingError(failure, !sessionRef.current);
            setError(message);
            if (failure instanceof ApiError) {
                setFieldErrors(failure.errors);
                if (failure.status === 401) {
                    changeSession(null);
                    await clearSession().catch(() =>
                        setError(
                            'Sesi tidak valid; penyimpanan lokal belum dapat dibersihkan.',
                        ),
                    );
                } else if (failure.status === 403 && sessionRef.current) {
                    const locked = { ...sessionRef.current, locked: true };
                    changeSession(locked);
                    await lockSession().catch(() =>
                        setError(
                            'Akses ditolak dan penyimpanan lokal gagal dikunci. Selesaikan logout online.',
                        ),
                    );
                }
            }
        },
        [changeSession],
    );

    useEffect(() => {
        let cancelled = false;
        const controller = new AbortController();
        void (async () => {
            try {
                if (!Capacitor.isNativePlatform()) {
                    setError(
                        'Preview web tersedia. Login dan token storage hanya dapat diuji pada APK Android.',
                    );
                    return;
                }
                const saved = await readSession();
                if (cancelled || !saved) return;
                if (saved.environment !== apiOrigin) {
                    await clearSession();
                    setError(
                        'Environment berubah. Kredensial lokal dibersihkan; pencabutan sesi server lama belum terkonfirmasi.',
                    );
                    return;
                }
                if (Date.parse(saved.expiresAt) <= Date.now()) {
                    await clearSession();
                    setError(
                        'Sesi 24 jam telah berakhir. Login ulang diperlukan.',
                    );
                    return;
                }
                if (saved.locked) {
                    changeSession(saved);
                    return;
                }
                try {
                    const current = await request<MeResult>(
                        me(),
                        saved,
                        controller.signal,
                    );
                    if (!cancelled)
                        changeSession({
                            ...saved,
                            user: current.data,
                            timezone: current.meta.operational_timezone,
                        });
                } catch (failure) {
                    if (cancelled) return;
                    if (failure instanceof ApiError && failure.status === 401) {
                        await clearSession();
                    } else {
                        await lockSession();
                        changeSession({ ...saved, locked: true });
                    }
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : 'Sesi belum dapat diverifikasi.',
                    );
                }
            } catch (failure) {
                if (!cancelled)
                    setError(
                        failure instanceof Error
                            ? failure.message
                            : 'Penyimpanan sesi gagal.',
                    );
            } finally {
                if (!cancelled) setBooting(false);
            }
        })();
        return () => {
            cancelled = true;
            controller.abort();
        };
    }, [changeSession]);

    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        let disposed = false;
        const listener = Capacitor.isNativePlatform()
            ? App.addListener('appStateChange', async ({ isActive }) => {
                  const saved = sessionRef.current;
                  if (
                      !isActive ||
                      !saved ||
                      saved.locked ||
                      busyRef.current ||
                      Object.values(featureLocks.current).some(Boolean)
                  )
                      return;
                  const epoch = generation.current;
                  try {
                      const current = await request<MeResult>(
                          me(),
                          saved,
                          network.current.signal,
                      );
                      if (
                          disposed ||
                          generation.current !== epoch ||
                          busyRef.current ||
                          Object.values(featureLocks.current).some(Boolean)
                      )
                          return;
                      const updated = {
                          ...saved,
                          user: current.data,
                          timezone: current.meta.operational_timezone,
                      };
                      sessionRef.current = updated;
                      setSession(updated);
                      setRefresh((value) => value + 1);
                  } catch (failure) {
                      if (!disposed && generation.current === epoch)
                          await fail(failure);
                  }
              })
            : null;
        return () => {
            disposed = true;
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
            if (listener) void listener.then((handle) => handle.remove());
        };
    }, [fail]);

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) return;
        const listener = App.addListener('backButton', () => {
            if (
                busyRef.current ||
                Object.values(featureLocks.current).some(Boolean)
            )
                return;
            if (keyboardOpen) {
                (document.activeElement as HTMLElement | null)?.blur();
                return;
            }
            if (filtersOpen && taskId === null) {
                setFiltersOpen(false);
                return;
            }
            if (
                (manualOpen || tab === 'handover' || taskId !== null) &&
                !window.dispatchEvent(
                    new Event('mobile-back', { cancelable: true }),
                )
            )
                return;
            if (taskId !== null) {
                if (taskMode === 'execution') setTaskMode('detail');
                else setTaskId(null);
            } else if (screen === 'handover') {
                navigate('mine');
            } else if (screen !== 'home') {
                navigateScreen('home');
            } else void App.exitApp();
        });
        return () => {
            void listener.then((handle) => handle.remove());
        };
    }, [taskId, taskMode, tab, screen, keyboardOpen, filtersOpen, manualOpen]);

    useEffect(() => {
        if (
            !session ||
            session.locked ||
            manualOpen ||
            tab === 'account' ||
            tab === 'handover' ||
            (screen !== 'home' && screen !== 'pickup')
        )
            return;
        const controller = new AbortController();
        const epoch = generation.current;
        const abort = () => controller.abort();
        network.current.signal.addEventListener('abort', abort, { once: true });
        const parentSignal = network.current.signal;
        setLoading(true);
        setError('');
        if (taskId !== null)
            setTask((previous) => (previous?.id === taskId ? previous : null));
        else if (page === 1) setTasks([]);
        void (async () => {
            try {
                if (taskId !== null) {
                    const result = await request<{ data: Task }>(
                        show(taskId),
                        session,
                        controller.signal,
                    );
                    if (
                        !controller.signal.aborted &&
                        generation.current === epoch
                    )
                        setTask(result.data);
                } else {
                    const query = Object.fromEntries(
                        Object.entries(filters).filter(
                            ([, value]) => value !== '',
                        ),
                    );
                    const route =
                        tab === 'available'
                            ? candidates({
                                  query: { ...query, page, per_page: 20 },
                              })
                            : index({
                                  query: {
                                      ...query,
                                      mine: 1,
                                      ...(screen === 'home'
                                          ? { status: 'ASSIGNED', summary: 1 }
                                          : {}),
                                      ...(tab === 'history'
                                          ? { history: 1 }
                                          : {}),
                                      page,
                                      per_page: 20,
                                  },
                              });
                    const result = await request<TaskPage>(
                        route,
                        session,
                        controller.signal,
                    );
                    if (
                        !controller.signal.aborted &&
                        generation.current === epoch
                    ) {
                        setTasks((previous) =>
                            Array.from(
                                new Map(
                                    [
                                        ...(page === 1 ? [] : previous),
                                        ...result.data,
                                    ].map((item) => [item.id, item]),
                                ).values(),
                            ),
                        );
                        setLastPage(result.meta.last_page);
                        setTotalTasks(result.meta.total);
                        if (screen === 'home') setHomeSummary(result.summary);
                    }
                }
            } catch (failure) {
                if (
                    !controller.signal.aborted &&
                    generation.current === epoch
                ) {
                    if (
                        taskId !== null &&
                        failure instanceof ApiError &&
                        failure.status === 404
                    )
                        setTask(null);
                    await fail(failure);
                }
            } finally {
                if (!controller.signal.aborted && generation.current === epoch)
                    setLoading(false);
            }
        })();
        return () => {
            controller.abort();
            parentSignal.removeEventListener('abort', abort);
        };
    }, [
        session?.token,
        session?.locked,
        tab,
        screen,
        taskId,
        filters,
        page,
        refresh,
        fail,
        manualOpen,
    ]);

    async function login(event: React.FormEvent) {
        event.preventDefault();
        if (
            busyRef.current ||
            Object.values(featureLocks.current).some(Boolean)
        )
            return;
        busyRef.current = true;
        setBusy(true);
        setError('');
        setFieldErrors({});
        const controller = network.current;
        try {
            const deviceId = await installationId();
            const result = await request<LoginResult>(
                store(),
                null,
                controller.signal,
                {
                    email,
                    password,
                    device_id: deviceId,
                    device_name: 'Retail Pickup Dev Android',
                },
            );
            setPassword('');
            const saved: Session = {
                token: result.data.token,
                user: result.data.user,
                environment: apiOrigin,
                expiresAt: result.data.expires_at,
                timezone: result.meta.operational_timezone,
                locked: false,
            };
            try {
                await writeSession(saved);
            } catch (storageFailure) {
                await request(
                    destroy(),
                    saved,
                    controller.signal,
                    undefined,
                    true,
                ).catch(() => undefined);
                throw storageFailure;
            }
            changeSession(saved);
        } catch (failure) {
            await fail(failure);
        } finally {
            setPassword('');
            busyRef.current = false;
            setBusy(false);
        }
    }

    async function retryPushRegistration() {
        const saved = sessionRef.current;
        if (!saved || saved.locked || pushBusy) return;
        setPushBusy(true);
        setPushNotice('Mengaktifkan notifikasi tugas…');
        try {
            await pushReady.current;
            const message = await registerPush(
                () =>
                    sessionRef.current?.token === saved.token &&
                    !sessionRef.current?.locked,
            );
            if (message && sessionRef.current?.token === saved.token)
                setPushNotice(message);
        } catch {
            setPushNotice(
                'Notifikasi belum dapat diaktifkan. Periksa koneksi dan izin notifikasi di pengaturan perangkat.',
            );
        } finally {
            setPushBusy(false);
        }
    }

    async function localLock() {
        const saved = sessionRef.current;
        if (!saved || busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        changeSession({ ...saved, locked: true });
        try {
            await lockSession();
            setError(
                'Aplikasi terkunci. Anda belum keluar dari akun. Sambungkan internet untuk menyelesaikan proses keluar.',
            );
        } catch (failure) {
            setError(
                failure instanceof Error
                    ? failure.message
                    : 'Penyimpanan sesi gagal dikunci.',
            );
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }

    async function logout() {
        const saved = sessionRef.current;
        if (!saved || busyRef.current) return;
        busyRef.current = true;
        setBusy(true);
        setError('');
        const locked = { ...saved, locked: true };
        changeSession(locked);
        try {
            await lockSession();
            try {
                await request(
                    destroy(),
                    locked,
                    network.current.signal,
                    undefined,
                    true,
                );
            } catch (failure) {
                if (!(failure instanceof ApiError && failure.status === 401))
                    throw failure;
            }
            await clearSession();
            changeSession(null);
            setError('Anda sudah keluar. Silakan masuk kembali.');
        } catch (failure) {
            setError(
                `Aplikasi terkunci; proses keluar belum selesai. ${failure instanceof Error ? failure.message : 'Sambungkan internet dan coba lagi.'}`,
            );
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }

    function navigate(next: Tab) {
        setFiltersOpen(false);
        if (Object.values(featureLocks.current).some(Boolean)) return;
        setManualOpen(false);
        setManualSource(null);
        setScreen(next === 'handover' ? 'handover' : 'pickup');
        setTaskMode('detail');
        setTab(next);
        setReviewingProof(false);
        setTaskId(null);
        setTask(null);
        setTasks([]);
        setTotalTasks(null);
        setPage(1);
        setError('');
        setLoading(false);
    }
    function navigateScreen(next: AppScreen) {
        if (Object.values(featureLocks.current).some(Boolean)) return;
        navigate(next === 'account' ? 'account' : 'mine');
        setScreen(next);
        setFilters(initialFilters);
        setSearch('');
    }
    function openTask(id: number) {
        setScreen('pickup');
        setTaskMode('detail');
        setTab('mine');
        setTaskId(id);
        setTask(null);
        setReviewingProof(false);
        setError('');
    }
    function filter(key: keyof typeof initialFilters, value: string) {
        setPage(1);
        setFilters((previous) => ({ ...previous, [key]: value }));
    }
    const date = (value: string) =>
        new Date(value).toLocaleString('id-ID', {
            timeZone: session?.timezone || 'UTC',
        });

    return (
        <div
            className="mobile-shell w-full px-4"
            data-keyboard={keyboardOpen}
            data-focused={taskId !== null || moduleFocused || manualOpen}
            data-auth={!session}
        >
            <header
                className={!session && !booting ? 'sr-only' : 'mobile-header'}
            >
                <div className="flex items-center gap-2">
                    {session &&
                        !session.locked &&
                        (taskId !== null ||
                            screen === 'pickup' ||
                            screen === 'handover') && (
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Kembali"
                                disabled={featureBusy}
                                onClick={() =>
                                    manualOpen
                                        ? setManualOpen(false)
                                        : taskId !== null
                                          ? (() => {
                                                if (
                                                    taskMode === 'execution' &&
                                                    !window.dispatchEvent(
                                                        new Event(
                                                            'mobile-back',
                                                            {
                                                                cancelable: true,
                                                            },
                                                        ),
                                                    )
                                                )
                                                    return;
                                                if (taskMode === 'execution')
                                                    setTaskMode('detail');
                                                else setTaskId(null);
                                            })()
                                          : (() => {
                                                if (
                                                    screen === 'handover' &&
                                                    !window.dispatchEvent(
                                                        new Event(
                                                            'mobile-back',
                                                            {
                                                                cancelable: true,
                                                            },
                                                        ),
                                                    )
                                                )
                                                    return;
                                                if (screen === 'handover')
                                                    navigate('mine');
                                                else navigateScreen('home');
                                            })()
                                }
                            >
                                <ArrowLeft size={20} />
                                <span className="sr-only">Kembali</span>
                            </Button>
                        )}
                    <div>
                        <p className="text-[10px] font-semibold tracking-wide text-primary">
                            RETAIL OPERATIONS
                        </p>
                        <h1
                            className={
                                (screen === 'handover' && moduleFocused) ||
                                screen === 'home'
                                    ? 'sr-only'
                                    : 'text-lg font-semibold'
                            }
                        >
                            {manualOpen
                                ? 'Buat Pickup'
                                : taskId !== null
                                  ? taskMode === 'execution'
                                      ? `PCK-${taskId}`
                                      : 'Detail Pickup'
                                  : screen === 'home'
                                    ? 'Beranda'
                                    : screen === 'menu'
                                      ? 'Menu'
                                      : screen === 'notifications'
                                        ? 'Notifikasi'
                                        : tab === 'handover'
                                          ? 'Handover'
                                          : tab === 'history'
                                            ? 'Riwayat'
                                            : tab === 'account'
                                              ? 'Akun'
                                              : 'Pickup'}
                        </h1>
                    </div>
                </div>
                {session && !session.locked && screen === 'home' && (
                    <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Buka Notifikasi"
                        onClick={() => navigateScreen('notifications')}
                    >
                        <Bell size={20} />
                    </Button>
                )}
                {session &&
                    !session.locked &&
                    !manualOpen &&
                    tab !== 'account' &&
                    tab !== 'handover' &&
                    screen === 'pickup' &&
                    taskMode === 'detail' && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Refresh"
                            disabled={loading || featureBusy}
                            onClick={() => {
                                if (taskId === null) setPage(1);
                                setRefresh((value) => value + 1);
                            }}
                        >
                            <RefreshCw size={18} />
                            <span className="sr-only">Refresh</span>
                        </Button>
                    )}
            </header>
            {session && !session.locked && testPushVisible && (
                <div
                    role="status"
                    className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
                >
                    <p>
                        <strong>Tes notifikasi diterima.</strong> Pesan uji dari
                        Admin; tidak ada perubahan pada tugas pickup.
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTestPushVisible(false)}
                    >
                        Tutup
                    </Button>
                </div>
            )}
            {!online && (
                <div className="mb-3">
                    <OperationalFeedback
                        title="Tidak ada koneksi"
                        tone="warning"
                    >
                        Draft tetap tersimpan. Sambungkan internet untuk
                        mengambil data terbaru atau mengirim hasil.
                    </OperationalFeedback>
                </div>
            )}
            {error && (session || booting) && (
                <div className="mb-4">
                    <OperationalFeedback title={error} tone="error" />
                </div>
            )}
            {booting ? (
                <EmptyState loading />
            ) : !session ? (
                <form
                    className="login-form"
                    onSubmit={(event) => void login(event)}
                >
                    <header className="login-brand">
                        <div className="login-brand-row">
                            <img
                                src={jneLogo}
                                className="login-logo"
                                alt="JNE Express"
                                width={112}
                                height={48}
                            />
                            <span className="login-brand-label">
                                Mobile App
                            </span>
                        </div>
                        <div className="login-brand-copy">
                            <span
                                className="login-brand-accent"
                                aria-hidden="true"
                            />
                            <h1>Retail Operations</h1>
                            <p>Kelola pickup dan handover Anda.</p>
                        </div>
                    </header>
                    <div className="login-card">
                        <div className="login-heading">
                            <h2>Selamat datang</h2>
                            <p>Masuk dengan akun operasional Anda.</p>
                        </div>
                        {error && (
                            <OperationalFeedback
                                title={
                                    Object.values(fieldErrors).some(
                                        (messages) => messages.length > 0,
                                    )
                                        ? 'Periksa kembali data akun Anda.'
                                        : error
                                }
                                tone="error"
                            />
                        )}
                        <div className="login-input-group">
                            <Label htmlFor="email">Email operasional</Label>
                            <div className="login-field">
                                <Mail
                                    size={19}
                                    className="login-field-icon"
                                    aria-hidden="true"
                                />
                                <Input
                                    id="email"
                                    type="email"
                                    autoComplete="username"
                                    placeholder="nama@perusahaan.com"
                                    autoCapitalize="none"
                                    spellCheck={false}
                                    inputMode="email"
                                    aria-invalid={!!fieldErrors.email?.length}
                                    aria-describedby={
                                        fieldErrors.email?.length
                                            ? 'login-email-error'
                                            : undefined
                                    }
                                    disabled={busy}
                                    value={email}
                                    required
                                    onChange={(event) =>
                                        setEmail(event.target.value)
                                    }
                                />
                            </div>
                            {!!fieldErrors.email?.length && (
                                <p
                                    id="login-email-error"
                                    role="alert"
                                    className="text-sm text-red-700"
                                >
                                    {fieldErrors.email.join(' ')}
                                </p>
                            )}
                        </div>
                        <div className="login-input-group">
                            <Label htmlFor="password">Password</Label>
                            <div className="login-field">
                                <LockKeyhole
                                    size={19}
                                    className="login-field-icon"
                                    aria-hidden="true"
                                />
                                <Input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    placeholder="Masukkan password"
                                    aria-invalid={
                                        !!fieldErrors.password?.length
                                    }
                                    aria-describedby={
                                        fieldErrors.password?.length
                                            ? 'login-password-error'
                                            : undefined
                                    }
                                    disabled={busy}
                                    value={password}
                                    required
                                    onChange={(event) =>
                                        setPassword(event.target.value)
                                    }
                                />
                                <button
                                    type="button"
                                    className="login-password-toggle"
                                    aria-label={
                                        showPassword
                                            ? 'Sembunyikan password'
                                            : 'Tampilkan password'
                                    }
                                    aria-pressed={showPassword}
                                    disabled={busy}
                                    onClick={() =>
                                        setShowPassword((value) => !value)
                                    }
                                >
                                    {showPassword ? (
                                        <EyeOff size={20} />
                                    ) : (
                                        <Eye size={20} />
                                    )}
                                </button>
                            </div>
                            {!!fieldErrors.password?.length && (
                                <p
                                    id="login-password-error"
                                    role="alert"
                                    className="text-sm text-red-700"
                                >
                                    {fieldErrors.password.join(' ')}
                                </p>
                            )}
                        </div>
                        <Button
                            className="login-submit"
                            disabled={busy || !Capacitor.isNativePlatform()}
                        >
                            {busy && (
                                <LoaderCircle
                                    size={18}
                                    className="animate-spin"
                                    aria-hidden="true"
                                />
                            )}
                            {busy ? 'Memeriksa akun…' : 'Masuk'}
                            {!busy && (
                                <ChevronRight size={18} aria-hidden="true" />
                            )}
                        </Button>
                        <button
                            type="button"
                            className="login-help"
                            aria-expanded={passwordHelp}
                            onClick={() => setPasswordHelp((value) => !value)}
                        >
                            Lupa password?
                        </button>
                        {passwordHelp && (
                            <p role="status" className="login-help-message">
                                Gunakan menu reset password pada aplikasi web
                                atau hubungi Admin untuk bantuan akun
                                operasional.
                            </p>
                        )}
                    </div>
                    <footer className="login-footer">
                        <p className="login-session-note">
                            <ShieldCheck size={15} aria-hidden="true" />
                            Akses khusus tim operasional
                        </p>
                        <p className="login-version">{appVersion}</p>
                    </footer>
                </form>
            ) : session.locked ? (
                <section className="space-y-4">
                    <h2 className="text-lg font-semibold">
                        {busy ? 'Mengunci sesi…' : 'Sesi terkunci di perangkat'}
                    </h2>
                    <p className="text-sm">
                        Akses tugas dikunci sementara. Anda belum keluar dari
                        akun. Sambungkan internet dan selesaikan proses keluar
                        sebelum menggunakan akun lain. Draft tetap tersimpan.
                    </p>
                    <Button
                        disabled={busy || featureBusy}
                        className="w-full"
                        onClick={() => void logout()}
                    >
                        {busy ? 'Memeriksa server…' : 'Selesaikan Keluar'}
                    </Button>
                </section>
            ) : (
                <>
                    {screen === 'pickup' && taskId === null && !manualOpen && (
                        <nav
                            aria-label="Pickup workspace"
                            className="pickup-tabs mb-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
                        >
                            {(
                                [
                                    ['mine', 'Tugas Saya'],
                                    ['available', 'Tersedia'],
                                    ['history', 'Riwayat'],
                                ] as const
                            ).map(([value, label]) => (
                                <Button
                                    key={value}
                                    variant="ghost"
                                    aria-current={
                                        tab === value ? 'page' : undefined
                                    }
                                    className="px-1 text-xs"
                                    disabled={featureBusy}
                                    onClick={() => navigate(value)}
                                >
                                    {label}
                                </Button>
                            ))}
                        </nav>
                    )}
                    {screen === 'menu' ? (
                        <ModuleMenu
                            onPickup={() => navigate('mine')}
                            onHandover={() => navigate('handover')}
                        />
                    ) : screen === 'notifications' ? (
                        <section className="space-y-3">
                            <p className="text-sm text-muted-foreground">
                                Assignment yang diterima selama sesi aplikasi
                                ini. Daftar dikosongkan saat keluar dari akun
                                atau aplikasi dimulai ulang.
                            </p>
                            {pushNotice && (
                                <p
                                    role="status"
                                    className="rounded-xl border p-3 text-sm"
                                >
                                    {pushNotice}
                                </p>
                            )}
                            {notifications.length === 0 ? (
                                <EmptyState
                                    title="Belum ada notifikasi sesi ini"
                                    description="Tugas tetap dapat diperiksa di Pickup. Izinkan notifikasi perangkat agar pemberitahuan tugas baru dapat diterima."
                                />
                            ) : (
                                notifications.map((link) => (
                                    <button
                                        key={link.eventId}
                                        className="w-full rounded-xl border bg-card p-4 text-left"
                                        onClick={() => setPendingLink(link)}
                                    >
                                        <strong>Pickup baru ditugaskan</strong>
                                        <p className="text-sm">
                                            Anda memiliki tugas pickup baru.
                                            Ketuk untuk melihat detail tugas.
                                        </p>
                                    </button>
                                ))
                            )}
                        </section>
                    ) : screen === 'home' ? (
                        <section className="space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold">
                                    Halo, {session.user.name}
                                </h2>
                                <p className="text-xs text-muted-foreground">
                                    Pickup Staff
                                </p>
                            </div>
                            <div className="daily-summary">
                                <div className="flex justify-between">
                                    <strong>Aktivitas Hari Ini</strong>
                                    <span className="text-xs text-muted-foreground">
                                        {homeSummary
                                            ? homeSummary.date
                                            : 'Memuat…'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 divide-x">
                                    {[
                                        [homeSummary?.total, 'Pickup'],
                                        [homeSummary?.successful, 'Berhasil'],
                                        [
                                            homeSummary?.no_packages,
                                            'Tanpa paket',
                                        ],
                                    ].map(([count, label]) => (
                                        <div key={String(label)}>
                                            <b>{count ?? '—'}</b>
                                            <small>{label}</small>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <h3 className="font-semibold">Menu Operasional</h3>
                            <ModuleMenu
                                compact
                                onPickup={() => navigate('mine')}
                                onHandover={() => navigate('handover')}
                            />
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold">Tugas Saya</h3>
                                <span className="text-sm text-muted-foreground">
                                    {totalTasks === null
                                        ? '—'
                                        : `${totalTasks} tugas`}
                                </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Daftar tugas berjalan dari server, urut jadwal.{' '}
                                {tasks.length > 3 &&
                                    'Tiga tugas pertama ditampilkan.'}
                            </p>
                            {loading ? (
                                <EmptyState loading />
                            ) : (
                                tasks
                                    .slice(0, 3)
                                    .map((item) => (
                                        <TaskCard
                                            key={item.id}
                                            task={item}
                                            schedule={date(item.scheduled_at)}
                                            history={false}
                                            onOpen={() => openTask(item.id)}
                                        />
                                    ))
                            )}
                            {!loading && !error && tasks.length === 0 && (
                                <EmptyState
                                    title="Belum ada tugas"
                                    description="Buka Pickup untuk melihat tugas tersedia."
                                />
                            )}
                            {pushNotice && (
                                <button
                                    onClick={() =>
                                        navigateScreen('notifications')
                                    }
                                    className="w-full rounded-xl border p-3 text-left text-sm"
                                >
                                    {pushNotice}
                                </button>
                            )}
                        </section>
                    ) : tab === 'account' ? (
                        <section
                            aria-label="Profil dan pengaturan akun"
                            className="space-y-5"
                        >
                            <div className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-blue-50 p-5">
                                <div
                                    aria-hidden="true"
                                    className="flex size-16 shrink-0 items-center justify-center rounded-full bg-primary text-xl font-semibold text-primary-foreground"
                                >
                                    {getInitials(session.user.name)}
                                </div>
                                <div className="min-w-0 space-y-1">
                                    <h2 className="text-lg leading-snug font-semibold break-words">
                                        {session.user.name}
                                    </h2>
                                    <p className="text-sm text-muted-foreground">
                                        Pickup Staff
                                    </p>
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                                        <ShieldCheck
                                            size={13}
                                            aria-hidden="true"
                                        />
                                        {session.user.is_active
                                            ? 'Akun aktif'
                                            : 'Akun tidak aktif'}
                                    </span>
                                </div>
                            </div>
                            <div className="overflow-hidden rounded-2xl border bg-card">
                                <button
                                    type="button"
                                    className="flex w-full items-center gap-3 p-4 text-left disabled:opacity-50"
                                    disabled={busy || featureBusy}
                                    onClick={() =>
                                        navigateScreen('notifications')
                                    }
                                >
                                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-primary">
                                        <Bell size={20} aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block font-semibold">
                                            Notifikasi Tugas
                                        </span>
                                        <span className="block text-xs text-muted-foreground">
                                            Lihat pemberitahuan pickup Anda
                                        </span>
                                    </span>
                                    <ChevronRight
                                        size={18}
                                        className="shrink-0 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                </button>
                                <div className="space-y-3 border-t px-4 py-3">
                                    <p
                                        role="status"
                                        className="text-xs leading-relaxed text-muted-foreground"
                                    >
                                        {pushNotice ||
                                            'Izinkan notifikasi agar pemberitahuan tugas baru dapat diterima di perangkat ini.'}
                                    </p>
                                    <Button
                                        variant="outline"
                                        className="w-full"
                                        disabled={busy || pushBusy || !online}
                                        onClick={() =>
                                            void retryPushRegistration()
                                        }
                                    >
                                        {pushBusy
                                            ? 'Mengaktifkan…'
                                            : pushNotice ===
                                                'Notifikasi tugas sudah diaktifkan pada perangkat ini.'
                                              ? 'Perbarui Notifikasi'
                                              : 'Aktifkan Notifikasi'}
                                    </Button>
                                    {!online && (
                                        <p className="text-xs text-amber-700">
                                            Sambungkan internet untuk
                                            mengaktifkan notifikasi.
                                        </p>
                                    )}
                                </div>
                            </div>
                            <DraftList
                                session={session}
                                onOpen={(id) => {
                                    setScreen('pickup');
                                    setTab('mine');
                                    setTaskId(id);
                                    setTask(null);
                                    setError('');
                                }}
                            />
                            <div className="overflow-hidden rounded-2xl border bg-card">
                                <details className="p-4">
                                    <summary className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
                                        <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                                            <LockKeyhole
                                                size={20}
                                                aria-hidden="true"
                                            />
                                        </span>
                                        Keamanan Akun
                                        <ChevronRight
                                            size={18}
                                            aria-hidden="true"
                                            className="ml-auto text-muted-foreground"
                                        />
                                    </summary>
                                    <div className="mt-3 space-y-3">
                                        <p className="text-xs leading-relaxed text-muted-foreground">
                                            Kunci akses sementara di perangkat
                                            ini, termasuk saat tidak ada
                                            internet. Akun belum keluar sampai
                                            proses keluar selesai. Draft Anda
                                            tetap tersimpan.
                                        </p>
                                        <Button
                                            disabled={busy || featureBusy}
                                            variant="outline"
                                            className="w-full"
                                            onClick={() => void localLock()}
                                        >
                                            Kunci Aplikasi
                                        </Button>
                                    </div>
                                </details>
                                <div className="space-y-2 border-t p-4">
                                    <Button
                                        disabled={busy || featureBusy}
                                        variant="outline"
                                        className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                                        onClick={() => void logout()}
                                    >
                                        <LogOut size={18} aria-hidden="true" />
                                        Keluar
                                    </Button>
                                    <p className="text-center text-xs text-muted-foreground">
                                        Proses keluar memerlukan internet. Draft
                                        tetap tersimpan untuk akun Anda.
                                    </p>
                                </div>
                            </div>
                            <p className="text-center text-xs text-muted-foreground">
                                Retail Operations
                                {appVersion && ` · ${appVersion}`}
                            </p>
                        </section>
                    ) : tab === 'handover' ? (
                        <HandoverPanel
                            session={session}
                            online={online}
                            onBusyChange={handoverBusy}
                            onFocusChange={setModuleFocused}
                            onFailure={(failure) =>
                                sessionRef.current?.token === session.token &&
                                failure instanceof ApiError &&
                                [401, 403].includes(failure.status)
                                    ? fail(failure)
                                    : Promise.resolve()
                            }
                            onTask={(id) => {
                                setScreen('pickup');
                                setTab('history');
                                setTaskId(id);
                                setTask(null);
                                setError('');
                            }}
                        />
                    ) : manualOpen ? (
                        <ManualPickup
                            key={`${session.user.id}-${session.environment}`}
                            session={session}
                            online={online}
                            source={manualSource}
                            onBusyChange={manualBusy}
                            onFailure={(failure) =>
                                sessionRef.current?.token === session.token
                                    ? fail(failure)
                                    : Promise.resolve()
                            }
                            onClose={() => setManualOpen(false)}
                            onCreated={(created) => {
                                if (sessionRef.current?.token !== session.token)
                                    return;
                                setManualOpen(false);
                                setManualSource(null);
                                openTask(created.id);
                                setRefresh((value) => value + 1);
                            }}
                        />
                    ) : taskId !== null ? (
                        <section className="space-y-4">
                            {loading ? (
                                <EmptyState loading />
                            ) : task ? (
                                <>
                                    {taskMode === 'execution' &&
                                        !(
                                            task.proof &&
                                            task.status === 'PICKED_UP' &&
                                            !proofPending
                                        ) && (
                                            <PickupProgress
                                                task={task}
                                                review={reviewingProof}
                                            />
                                        )}
                                    {taskMode === 'detail' && !task.proof && (
                                        <TaskSummary
                                            task={task}
                                            schedule={date(task.scheduled_at)}
                                        />
                                    )}
                                    {task.status === 'NO_PACKAGES' && (
                                        <div
                                            role="status"
                                            className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
                                        >
                                            <h3 className="font-semibold">
                                                Pickup selesai tanpa paket
                                            </h3>
                                            <p className="text-sm">
                                                {task.visits?.at(-1)?.reason}{' '}
                                                Tidak ada POP atau paket untuk
                                                handover. Kunjungan berikutnya
                                                memakai task baru.
                                            </p>
                                            {task.can.create_follow_up && (
                                                <Button
                                                    className="w-full"
                                                    disabled={featureBusy}
                                                    onClick={() => {
                                                        setManualSource(task);
                                                        setManualOpen(true);
                                                    }}
                                                >
                                                    Buat Kunjungan Baru
                                                </Button>
                                            )}
                                            <Button
                                                className="w-full"
                                                variant="outline"
                                                disabled={featureBusy}
                                                onClick={() => navigate('mine')}
                                            >
                                                Kembali ke Tugas
                                            </Button>
                                        </div>
                                    )}
                                    {taskMode === 'detail' &&
                                        !task.proof &&
                                        (task.can.execute ||
                                            task.can.retry) && (
                                            <Button
                                                aria-label="Kerjakan Pickup"
                                                className="workflow-primary"
                                                disabled={featureBusy}
                                                onClick={() =>
                                                    setTaskMode('execution')
                                                }
                                            >
                                                {task.execution_started_at
                                                    ? 'Lanjutkan Pickup'
                                                    : 'Mulai Pickup'}
                                            </Button>
                                        )}
                                    <div
                                        hidden={
                                            taskMode !== 'execution' &&
                                            !task.can.take_over
                                        }
                                    >
                                        <ExecutionPanel
                                            schedule={date(task.scheduled_at)}
                                            onBusyChange={executionBusy}
                                            onRecoveryFound={recoverProof}
                                            task={task}
                                            session={session}
                                            online={online}
                                            onTask={(updated) => {
                                                if (
                                                    sessionRef.current
                                                        ?.token ===
                                                    session.token
                                                ) {
                                                    setTask(updated);
                                                    if (
                                                        updated.proof ||
                                                        updated.status ===
                                                            'NO_PACKAGES'
                                                    )
                                                        setTaskMode('detail');
                                                }
                                            }}
                                            onFailure={(failure) =>
                                                sessionRef.current?.token ===
                                                session.token
                                                    ? fail(failure)
                                                    : Promise.resolve()
                                            }
                                        />
                                    </div>
                                    {task.proof &&
                                        task.status === 'PICKED_UP' &&
                                        !proofPending && (
                                            <div
                                                role="status"
                                                className="space-y-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-green-950"
                                            >
                                                <h3 className="font-semibold">
                                                    Pickup selesai
                                                </h3>
                                                <p className="text-sm">
                                                    {task.reference} ·{' '}
                                                    {task.customer.name}
                                                </p>
                                                <p className="text-2xl font-semibold">
                                                    {task.proof.total} paket
                                                </p>
                                                <p className="text-sm">
                                                    POP telah dikonfirmasi
                                                    server.
                                                </p>
                                                <Button
                                                    className="w-full"
                                                    onClick={() =>
                                                        navigate('mine')
                                                    }
                                                >
                                                    Kembali ke Tugas
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="w-full"
                                                    onClick={() => {
                                                        setProofDetailsOpen(
                                                            true,
                                                        );
                                                        requestAnimationFrame(
                                                            () =>
                                                                document
                                                                    .getElementById(
                                                                        'pickup-proof-detail',
                                                                    )
                                                                    ?.scrollIntoView(
                                                                        {
                                                                            behavior:
                                                                                'smooth',
                                                                        },
                                                                    ),
                                                        );
                                                    }}
                                                >
                                                    Lihat Detail
                                                </Button>
                                            </div>
                                        )}
                                    {task.proof && (
                                        <details
                                            id="pickup-proof-detail"
                                            className="proof-completion-details"
                                            open={proofDetailsOpen}
                                            onToggle={(event) =>
                                                setProofDetailsOpen(
                                                    event.currentTarget.open,
                                                )
                                            }
                                        >
                                            <summary>
                                                Detail POP dan receipt
                                            </summary>
                                            <TaskSummary
                                                task={task}
                                                schedule={date(
                                                    task.scheduled_at,
                                                )}
                                            />
                                            <PrivateProof
                                                key={`${session.user.id}-${task.id}`}
                                                proof={task.proof}
                                                session={session}
                                            />
                                        </details>
                                    )}
                                </>
                            ) : (
                                !error && (
                                    <EmptyState title="Detail tidak tersedia" />
                                )
                            )}
                            <div
                                hidden={
                                    taskMode !== 'execution' &&
                                    !(proofPending && task?.proof)
                                }
                            >
                                <ProofPanel
                                    enabled={taskMode === 'execution'}
                                    onPendingChange={proofPendingChange}
                                    onBusyChange={proofBusy}
                                    onReviewChange={setReviewingProof}
                                    onRecoveredDraft={recoverProof}
                                    key={`${session.user.id}-${taskId}`}
                                    task={task}
                                    taskId={taskId}
                                    session={session}
                                    online={online}
                                    onTask={(updated) => {
                                        if (
                                            sessionRef.current?.token ===
                                            session.token
                                        )
                                            setTask(updated);
                                    }}
                                    onFailure={(failure) =>
                                        sessionRef.current?.token ===
                                        session.token
                                            ? fail(failure)
                                            : Promise.resolve()
                                    }
                                    restored={restoredCapture}
                                    onRestoredConsumed={() =>
                                        setRestoredCapture(null)
                                    }
                                />
                            </div>
                        </section>
                    ) : (
                        <section className="space-y-4">
                            <form
                                className="flex gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    filter('q', search.trim());
                                }}
                            >
                                <Input
                                    aria-label="Cari tugas"
                                    placeholder="Customer, alamat, atau referensi"
                                    value={search}
                                    onChange={(event) =>
                                        setSearch(event.target.value)
                                    }
                                />
                                <Button
                                    variant="outline"
                                    disabled={loading || featureBusy}
                                >
                                    Cari
                                </Button>
                            </form>
                            <div className="flex flex-wrap items-center gap-2">
                                {tab === 'mine' &&
                                    session.user.role === 'pickup_staff' && (
                                        <Button
                                            variant="outline"
                                            disabled={featureBusy}
                                            onClick={() => {
                                                setManualSource(null);
                                                setManualOpen(true);
                                            }}
                                        >
                                            Buat Pickup Manual
                                        </Button>
                                    )}
                                <Button
                                    variant="outline"
                                    disabled={featureBusy}
                                    onClick={() => navigate('handover')}
                                >
                                    Handover Pickup
                                </Button>
                            </div>

                            <Button
                                variant="ghost"
                                className="justify-start px-0 text-sm"
                                aria-expanded={filtersOpen}
                                onClick={() =>
                                    setFiltersOpen((value) => !value)
                                }
                            >
                                <SlidersHorizontal size={16} />
                                {filtersOpen
                                    ? 'Tutup Filter'
                                    : 'Filter & Urutan'}
                                {Object.entries(filters).some(
                                    ([key, value]) =>
                                        !['q', 'sort'].includes(key) && value,
                                )
                                    ? ' · aktif'
                                    : ''}
                            </Button>
                            {filtersOpen && (
                                <div className="space-y-3 rounded-xl border bg-card p-3">
                                    <div className="grid grid-cols-2 gap-3">
                                        <label className="text-xs text-muted-foreground">
                                            Status
                                            <select
                                                className="mt-1 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                                                value={filters.status}
                                                onChange={(event) =>
                                                    filter(
                                                        'status',
                                                        event.target.value,
                                                    )
                                                }
                                            >
                                                <option value="">
                                                    Semua status
                                                </option>
                                                {[
                                                    'SCHEDULED',
                                                    'ASSIGNED',
                                                    'PICKED_UP',
                                                    'NO_PACKAGES',
                                                    'CANCELLED',
                                                ].map((status) => (
                                                    <option key={status}>
                                                        {status}
                                                    </option>
                                                ))}
                                            </select>
                                        </label>
                                        <label className="text-xs text-muted-foreground">
                                            Jenis pickup
                                            <select
                                                className="mt-1 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                                                value={filters.pickup_type}
                                                onChange={(event) =>
                                                    filter(
                                                        'pickup_type',
                                                        event.target.value,
                                                    )
                                                }
                                            >
                                                <option value="">
                                                    Semua jenis
                                                </option>
                                                <option value="regular">
                                                    Regular
                                                </option>
                                                <option value="on_demand">
                                                    On-demand
                                                </option>
                                            </select>
                                        </label>
                                        <label className="text-xs text-muted-foreground">
                                            Dari tanggal
                                            <Input
                                                type="date"
                                                value={filters.date_from}
                                                onChange={(event) =>
                                                    filter(
                                                        'date_from',
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </label>
                                        <label className="text-xs text-muted-foreground">
                                            Sampai tanggal
                                            <Input
                                                type="date"
                                                value={filters.date_to}
                                                onChange={(event) =>
                                                    filter(
                                                        'date_to',
                                                        event.target.value,
                                                    )
                                                }
                                            />
                                        </label>
                                    </div>
                                    <label className="block text-xs text-muted-foreground">
                                        Urutan
                                        <select
                                            className="mt-1 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                                            value={filters.sort}
                                            onChange={(event) =>
                                                filter(
                                                    'sort',
                                                    event.target.value,
                                                )
                                            }
                                        >
                                            <option value="scheduled">
                                                Jadwal terdekat
                                            </option>
                                            <option value="newest">
                                                Terbaru dibuat
                                            </option>
                                            <option value="oldest">
                                                Terlama dibuat
                                            </option>
                                        </select>
                                    </label>
                                    <Button
                                        variant="outline"
                                        onClick={() => {
                                            setPage(1);
                                            setFilters(initialFilters);
                                            setSearch('');
                                        }}
                                    >
                                        Reset Filter
                                    </Button>
                                </div>
                            )}
                            {tasks.map((item) => (
                                <TaskCard
                                    key={item.id}
                                    task={item}
                                    schedule={date(item.scheduled_at)}
                                    history={tab === 'history'}
                                    onOpen={() => {
                                        setTaskId(item.id);
                                        setReviewingProof(false);
                                    }}
                                />
                            ))}
                            {loading ? (
                                <EmptyState loading />
                            ) : !error && tasks.length === 0 ? (
                                <EmptyState
                                    title="Belum ada tugas"
                                    description={
                                        search ||
                                        Object.entries(filters).some(
                                            ([key, value]) =>
                                                !['q', 'sort'].includes(key) &&
                                                value,
                                        )
                                            ? 'Tidak ada tugas yang sesuai. Ubah pencarian atau reset filter.'
                                            : tab === 'available'
                                              ? 'Belum ada tugas yang dapat diambil alih. Periksa kembali nanti.'
                                              : tab === 'history'
                                                ? 'Pickup yang sudah selesai akan muncul di sini.'
                                                : 'Semua tugas sudah ditangani atau belum ada penugasan. Refresh untuk memeriksa tugas terbaru.'
                                    }
                                />
                            ) : null}
                            {page < lastPage && tasks.length > 0 && (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    disabled={loading || !!error}
                                    onClick={() =>
                                        setPage((value) => value + 1)
                                    }
                                >
                                    Muat lebih banyak
                                </Button>
                            )}
                        </section>
                    )}
                </>
            )}
            {session &&
                !session.locked &&
                taskId === null &&
                !manualOpen &&
                !moduleFocused && (
                    <BottomNavigation
                        tab={screen}
                        disabled={busy || featureBusy}
                        onNavigate={navigateScreen}
                    />
                )}
        </div>
    );
}
