import { ReportError } from './errors.mjs';
import { hybridFailure } from './hybrid-service.mjs';

export async function runHybridReportJob(job, api, client, source, emit) {
    let status = 'RUNNING';
    let heartbeat;
    let pending = Promise.resolve();
    let heartbeatError;
    let stage = 'job';
    const progress = (next = status) => {
        const operation = pending.then(async () => {
            if (heartbeatError) {
                throw heartbeatError;
            }
            await api.progress(job, next);
            status = next;
        });
        pending = operation.catch((error) => {
            heartbeatError = error;
        });
        return operation;
    };
    try {
        if (
            job.status !== 'RUNNING' ||
            job.source !== source ||
            !['cashless', 'manual'].includes(job.report_type) ||
            job.date_from !== job.date_thru
        ) {
            throw new ReportError(
                'HYBRID_JOB',
                'Job Hybrid tidak sesuai sumber, jenis, atau periode.',
            );
        }
        heartbeat = setInterval(
            () => {
                void progress().catch(() => {});
            },
            Math.max(1000, Math.min(30000, (job.lease_seconds * 1000) / 3)),
        );
        stage = 'queue_progress';
        await progress('WAITING_REPORT');
        emit('hybrid_job_started', {
            job_id: job.id,
            source,
            report: job.report_type,
        });
        stage = 'collect';
        const result = await client.retrieve(job.report_type, job.date_from, {
            automaticRetry: job.automatic_retry,
        });
        stage = 'source_upload';
        clearInterval(heartbeat);
        await pending;
        await progress('DOWNLOADING');
        const uploaded = await api.uploadSource(
            job,
            result.file,
            result.collectionEvidence,
        );
        if (uploaded?.source_saved !== true) {
            throw new ReportError(
                'UPLOAD_UNCONFIRMED',
                'Laravel belum mengonfirmasi penyimpanan sumber dan antrean AWB Hybrid ke APEX.',
            );
        }
        emit('hybrid_job_handed_to_apex', {
            job_id: job.id,
            source,
            rows: result.rows,
            awbs: uploaded.awb_count,
        });
        return true;
    } catch (error) {
        clearInterval(heartbeat);
        await pending;
        const failure = hybridFailure(error);
        let rootCause =
            error instanceof ReportError ? 'REPORTED_ERROR' : 'UNCLASSIFIED';
        if (job.automatic_retry && !(error instanceof ReportError)) {
            if (error.name === 'TimeoutError') {
                failure.code = 'NETWORK_TIMEOUT';
                rootCause = 'TIMEOUT';
            } else if (
                /ERR_CONNECTION|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND/.test(
                    error.message || error.code || '',
                )
            ) {
                failure.code = 'NETWORK_CONNECTION';
                rootCause = 'CONNECTION_FAILURE';
            } else if (/strict mode violation/i.test(error.message || '')) {
                failure.code = 'HYBRID_STRUCTURE';
                rootCause = 'AMBIGUOUS_LOCATOR';
            } else if (
                /Execution context was destroyed|Cannot find context with specified id|ERR_EMPTY_RESPONSE|ERR_NETWORK_CHANGED|ERR_ABORTED/.test(
                    error.message || '',
                )
            ) {
                failure.code = 'HYBRID_PAGE_TRANSIENT';
                rootCause = 'PAGE_LOADING';
            }
        }
        const errorStage = stage === 'collect' ? client.phase || 'job' : stage;
        failure.message = '[' + errorStage + '] ' + failure.message;
        try {
            const reported = new ReportError(failure.code, failure.message);
            reported.httpStatus = error.httpStatus;
            reported.retryAfter = error.retryAfter;
            reported.errorStage = errorStage;
            reported.rootCause = rootCause;
            await api.fail(job, reported);
            emit('hybrid_job_failed', {
                job_id: job.id,
                source,
                ...failure,
                stage: errorStage,
                root_cause: rootCause,
                attempt: job.attempt_count,
            });
        } catch {
            emit('hybrid_job_failure_unconfirmed', {
                job_id: job.id,
                source,
                code: failure.code,
            });
        }
        return false;
    } finally {
        clearInterval(heartbeat);
    }
}
