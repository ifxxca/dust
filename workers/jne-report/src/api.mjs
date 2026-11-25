import { openAsBlob } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ReportError } from './errors.mjs';

export class WorkerApi {
    constructor(config) {
        this.config = config;
    }

    async request(endpoint, makeBody, claimToken = '') {
        const attempts = this.automaticRetry ? 1 : 3;
        for (let attempt = 0; attempt < attempts; attempt++) {
            try {
                const body = await makeBody();
                const headers = {
                    Authorization: 'Bearer ' + this.config.token,
                    'X-Worker-ID': this.config.workerId,
                    Accept: 'application/json',
                };
                if (claimToken)
                    headers[this.config.claimHeader || 'X-Report-Claim'] =
                        claimToken;
                if (!(body instanceof FormData))
                    headers['Content-Type'] = 'application/json';
                const response = await fetch(
                    this.config.apiUrl +
                        (this.config.apiBasePath ||
                            '/api/internal/report-jobs/') +
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
                if (response.status >= 500 || response.status === 429) {
                    const error = new ReportError(
                        'API_TRANSIENT',
                        'Laravel belum dapat menerima pembaruan worker.',
                    );
                    error.httpStatus = response.status;
                    error.retryAfter = response.headers.get('retry-after');
                    throw error;
                }
                if (!response.ok) {
                    const rejected = await response.json().catch(() => null);
                    const fields = Object.keys(rejected?.errors || {})
                        .filter(
                            (field) =>
                                field.length <= 100 &&
                                /^[a-z_]+(?:\.(?:[a-z_]+|[0-9]+))*$/.test(
                                    field,
                                ),
                        )
                        .slice(0, 8);
                    const error = new ReportError(
                        'API_REJECTED',
                        `Laravel menolak pembaruan worker (HTTP ${response.status}${fields.length ? `; kolom: ${fields.join(', ')}` : ''}). Periksa konfigurasi dan status batch.`,
                    );
                    error.httpStatus = response.status;
                    error.validationFields = fields;
                    throw error;
                }
                return (await response.json()).data;
            } catch (error) {
                if (
                    error instanceof ReportError &&
                    error.code === 'API_REJECTED'
                )
                    throw error;
                if (attempt === attempts - 1) {
                    const unavailable = new ReportError(
                        'API_UNAVAILABLE',
                        'Komunikasi dengan Laravel gagal setelah percobaan terbatas.',
                    );
                    unavailable.httpStatus = error.httpStatus;
                    unavailable.retryAfter = error.retryAfter;
                    throw unavailable;
                }
                await sleep(500 * (attempt + 1));
            }
        }
    }

    async claim(key) {
        const job = await this.request('claim', () => ({
            claim_key: key,
            ...(!this.config.apiBasePath ||
            this.config.apiBasePath.includes('report-jobs')
                ? { retry_protocol: 1 }
                : {}),
        }));
        this.automaticRetry = Boolean(job?.automatic_retry);
        return job;
    }
    checkpoint(job, evidence) {
        return this.request(
            job.id + '/retry-checkpoint',
            () => evidence,
            job.claim_token,
        );
    }
    beginBatch(job, number) {
        const key = randomUUID();
        return this.request(
            job.id + '/batches/' + number,
            () => ({ start_key: key }),
            job.claim_token,
        );
    }
    saveBatch(job, number, filePath) {
        return this.upload(job, filePath, 'batches/' + number);
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
                ...(job.automatic_retry
                    ? {
                          http_status: error.httpStatus ?? null,
                          retry_after: error.retryAfter ?? null,
                          ...(error.errorStage
                              ? {
                                    error_stage: error.errorStage,
                                    root_cause: error.rootCause,
                                }
                              : {}),
                      }
                    : {}),
            }),
            job.claim_token,
        );
    }
    uploadSource(job, filePath, collectionEvidence) {
        return this.upload(job, filePath, 'source-upload', collectionEvidence);
    }
    upload(job, filePath, endpoint = 'upload', collectionEvidence) {
        return this.request(
            job.id + '/' + endpoint,
            async () => {
                const form = new FormData();
                if (collectionEvidence) {
                    form.set(
                        'collection_evidence',
                        JSON.stringify(collectionEvidence),
                    );
                }
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
