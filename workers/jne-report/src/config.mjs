import path from 'node:path';
import { ReportError } from './errors.mjs';

export function loadConfig(env = process.env) {
    const required = (key, trim = true) => {
        if (!env[key]?.trim())
            throw new ReportError(
                'CONFIG_REQUIRED',
                'Konfigurasi wajib belum diisi: ' + key,
                'FAILED',
            );
        return trim ? env[key].trim() : env[key];
    };
    const number = (key, fallback, minimum = 1) => {
        const value = Number(env[key] ?? fallback);
        if (!Number.isSafeInteger(value) || value < minimum)
            throw new ReportError(
                'CONFIG_INVALID',
                'Konfigurasi angka tidak valid: ' + key,
                'FAILED',
            );
        return value;
    };
    const apiUrl = new URL(required('RETAIL_OPERATIONS_URL'));
    const loginUrl = new URL(required('APEX_LOGIN_URL'));
    for (const url of [apiUrl, loginUrl]) {
        if (
            !['http:', 'https:'].includes(url.protocol) ||
            url.username ||
            url.password
        )
            throw new ReportError(
                'CONFIG_INVALID',
                'URL harus HTTP(S) tanpa kredensial.',
                'FAILED',
            );
        if (
            url.protocol !== 'https:' &&
            !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
            !url.hostname.endsWith('.test')
        )
            throw new ReportError(
                'CONFIG_INVALID',
                'Gunakan HTTPS di luar pengembangan lokal.',
                'FAILED',
            );
    }
    const token = required('JNE_REPORT_WORKER_TOKEN');
    if (token.length < 32)
        throw new ReportError(
            'CONFIG_INVALID',
            'Worker token minimal 32 karakter.',
            'FAILED',
        );
    let extraFields;
    try {
        extraFields = JSON.parse(env.APEX_EXTRA_FIELDS_JSON || '{}');
        if (
            !extraFields ||
            Array.isArray(extraFields) ||
            typeof extraFields !== 'object' ||
            Object.values(extraFields).some(
                (value) => typeof value !== 'string',
            )
        )
            throw new Error();
    } catch {
        throw new ReportError(
            'CONFIG_INVALID',
            'APEX_EXTRA_FIELDS_JSON harus objek selector dan nilai string.',
            'FAILED',
        );
    }
    const instance = number('JNE_APEX_INSTANCE', 0, 0);
    if (instance > 20)
        throw new ReportError(
            'CONFIG_INVALID',
            'Instance APEX maksimal 20.',
            'FAILED',
        );
    const baseDataDir = path.resolve(
        env.JNE_WORKER_DATA_DIR || '../../storage/app/private/jne-worker',
    );
    const dataDir = instance
        ? path.join(baseDataDir, 'instances', 'apex-' + instance)
        : baseDataDir;
    const publicDir = path.resolve('../../public');
    if (dataDir === publicDir || dataDir.startsWith(publicDir + path.sep))
        throw new ReportError(
            'CONFIG_INVALID',
            'Sesi harus disimpan di luar public.',
            'FAILED',
        );
    return {
        apiUrl: apiUrl.toString().replace(/\/$/, ''),
        token,
        workerId:
            (env.JNE_REPORT_WORKER_ID || 'jne-report-1') +
            (instance ? '-instance-' + instance : ''),
        instance,
        strictHistoryIdentity: instance > 0,
        loginUrl: loginUrl.toString(),
        username: required('APEX_USERNAME'),
        password: required('APEX_PASSWORD', false),
        baseUrl: env.APEX_BASE_URL || '',
        appId: env.APEX_APP_ID || '',
        dateFormat: env.APEX_DATE_FORMAT || '',
        historyDateFormat: env.APEX_HISTORY_DATE_FORMAT || '',
        timezone: env.APEX_TIMEZONE || 'Asia/Jakarta',
        processSelector: env.APEX_PROCESS_SELECTOR || '',
        successSelector:
            env.APEX_SUBMISSION_SUCCESS_SELECTOR ||
            '.t-Alert--success, .apex-page-success',
        extraFields,
        dataDir,
        sessionPath: path.join(dataDir, 'apex-session.json'),
        navigationTimeout: number('JNE_NAVIGATION_TIMEOUT_MS', 30000),
        reportTimeout: number('JNE_REPORT_TIMEOUT_MS', 1200000),
        jobTimeout: number('JNE_JOB_TIMEOUT_MS', 1500000),
        downloadTimeout: number('JNE_DOWNLOAD_TIMEOUT_MS', 120000),
        apiTimeout: number('JNE_API_TIMEOUT_MS', 60000),
        pollInterval: number('JNE_POLL_INTERVAL_MS', 10000),
        historyRenderWait: number('JNE_HISTORY_RENDER_WAIT_MS', 2000, 0),
        claimInterval: number('JNE_CLAIM_INTERVAL_MS', 5000),
        maxFileBytes: number('JNE_MAX_FILE_BYTES', 20971520),
        clockSkew: number('JNE_CLOCK_SKEW_MS', 120000, 0),
    };
}
