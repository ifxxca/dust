export class ReportError extends Error {
    constructor(code, message, status = 'NEEDS_ATTENTION') {
        super(message);
        this.code = code;
        this.status = status;
    }
}

export function log(event, fields = {}) {
    process.stdout.write(
        JSON.stringify({ time: new Date().toISOString(), event, ...fields }) +
            '\n',
    );
}

export function safeError(error) {
    return error instanceof ReportError
        ? error
        : new ReportError(
              'WORKER_ERROR',
              'Worker gagal. Periksa koneksi dan konfigurasi; tinjau History JNE sebelum membuat permintaan baru.',
          );
}
