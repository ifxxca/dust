import { ReportError } from './errors.mjs';
import { hybridFailure } from './hybrid-service.mjs';

export async function runHybridReportJob(job, api, client, source, emit) {
    let status = 'RUNNING';
    let heartbeat;
    let pending = Promise.resolve();
    let heartbeatError;
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
        await progress('WAITING_REPORT');
        emit('hybrid_job_started', {
            job_id: job.id,
            source,
            report: job.report_type,
        });
        const result = await client.retrieve(job.report_type, job.date_from);
        clearInterval(heartbeat);
        await pending;
        await progress('DOWNLOADING');
        const uploaded = await api.uploadSource(job, result.file);
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
        failure.message =
            '[' + (client.phase || 'job') + '] ' + failure.message;
        try {
            await api.fail(job, new ReportError(failure.code, failure.message));
            emit('hybrid_job_failed', { job_id: job.id, source, ...failure });
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
