import { openAsBlob } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { ReportError } from './errors.mjs';

export class WorkerApi {
    constructor(config) {
        this.config = config;
    }

    async request(endpoint, makeBody, claimToken = '') {
        for (let attempt = 0; attempt < 3; attempt++) {
            try {
                const body = await makeBody();
                const headers = {
                    Authorization: 'Bearer ' + this.config.token,
                    'X-Worker-ID': this.config.workerId,
                    Accept: 'application/json',
                };
                if (claimToken) headers['X-Report-Claim'] = claimToken;
                if (!(body instanceof FormData))
                    headers['Content-Type'] = 'application/json';
                const response = await fetch(
                    this.config.apiUrl +
                        '/api/internal/report-jobs/' +
                        endpoint,
                    {
                        method: 'POST',
                        headers,
                        body:
                            body instanceof FormData
                                ? body
                                : JSON.stringify(body),
                        signal: AbortSignal.timeout(this.config.apiTimeout),
                        redirect: 'error',
                    },
                );
                if (response.status === 204) return null;
                if (response.status >= 500 || response.status === 429)
                    throw new ReportError(
                        'API_TRANSIENT',
                        'Laravel belum dapat menerima pembaruan worker.',
                    );
                if (!response.ok)
                    throw new ReportError(
                        'API_REJECTED',
                        'Laravel menolak identitas, kepemilikan, status, atau file worker. Periksa konfigurasi dan job.',
                    );
                return (await response.json()).data;
            } catch (error) {
                if (
                    error instanceof ReportError &&
                    error.code === 'API_REJECTED'
                )
                    throw error;
                if (attempt === 2)
                    throw new ReportError(
                        'API_UNAVAILABLE',
                        'Komunikasi dengan Laravel gagal setelah percobaan terbatas.',
                    );
                await sleep(500 * (attempt + 1));
            }
        }
    }

    claim(key) {
        return this.request('claim', () => ({ claim_key: key }));
    }
    progress(job, status) {
        return this.request(
            job.id + '/progress',
            () => ({ status }),
            job.claim_token,
        );
    }
    fail(job, error) {
        return this.request(
            job.id + '/fail',
            () => ({
                status: error.status,
                error_message: error.code + ': ' + error.message,
            }),
            job.claim_token,
        );
    }
    uploadSource(job, filePath) {
        return this.upload(job, filePath, 'source-upload');
    }
    upload(job, filePath, endpoint = 'upload') {
        return this.request(
            job.id + '/' + endpoint,
            async () => {
                const form = new FormData();
                form.set(
                    'file',
                    await openAsBlob(filePath, { type: 'text/csv' }),
                    'report.csv',
                );
                return form;
            },
            job.claim_token,
        );
    }
}
