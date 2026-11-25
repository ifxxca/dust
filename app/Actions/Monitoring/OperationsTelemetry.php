<?php

namespace App\Actions\Monitoring;

use Illuminate\Database\QueryException;
use Throwable;

class OperationsTelemetry
{
    /** @var array<string, list<array<string, mixed>>> */
    private array $readCache = [];

    /** @param array<string, mixed> $data */
    public function write(string $kind, string $identity, array $data): void
    {
        unset($this->readCache[$kind]);
        if (! config('control-center.enabled')) {
            return;
        }
        try {
            $directory = config('control-center.path').'/'.$kind;
            if (! is_dir($directory) && ! @mkdir($directory, 0700, true) && ! is_dir($directory)) {
                return;
            }
            $path = $directory.'/'.hash('sha256', $identity).'.json';
            if (! is_file($path)) {
                $this->prune($directory);
            }
            $json = json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
            if (strlen($json) > 65536) {
                return;
            }
            $handle = @fopen($path, 'c');
            if ($handle === false) {
                return;
            }
            try {
                if (flock($handle, LOCK_EX | LOCK_NB)) {
                    ftruncate($handle, 0);
                    fwrite($handle, $json);
                    fflush($handle);
                    flock($handle, LOCK_UN);
                }
            } finally {
                fclose($handle);
            }
            @chmod($path, 0600);
        } catch (Throwable) {
            // Observability must not interrupt business operations or recursively report itself.
        }
    }

    /** @return list<array<string, mixed>> */
    public function read(string $kind): array
    {
        if (array_key_exists($kind, $this->readCache)) {
            return $this->readCache[$kind];
        }
        $rows = [];
        try {
            $directory = config('control-center.path').'/'.$kind;
            if (! is_dir($directory)) {
                return [];
            }
            $visited = 0;
            foreach (new \DirectoryIterator($directory) as $file) {
                if (++$visited > 512) {
                    break;
                }
                if (! $file->isFile() || $file->isLink() || $file->getExtension() !== 'json' || $file->getSize() > 65536) {
                    continue;
                }
                $handle = @fopen($file->getPathname(), 'r');
                if ($handle === false) {
                    continue;
                }
                try {
                    if (! flock($handle, LOCK_SH | LOCK_NB)) {
                        continue;
                    }
                    $data = json_decode(stream_get_contents($handle, 65536), true);
                    if (is_array($data)) {
                        $rows[] = $data;
                    }
                } finally {
                    fclose($handle);
                }
            }
        } catch (Throwable) {
            return [];
        }
        usort($rows, fn (array $a, array $b): int => (strtotime($b['observed_at'] ?? '') ?: 0) <=> (strtotime($a['observed_at'] ?? '') ?: 0));

        return $this->readCache[$kind] = array_slice($rows, 0, 128);
    }

    /** @return array<string, mixed>|null */
    public function find(string $kind, string $identity): ?array
    {
        try {
            $path = config('control-center.path').'/'.$kind.'/'.hash('sha256', $identity).'.json';
            if (! is_file($path) || is_link($path) || filesize($path) > 65536) {
                return null;
            }
            $handle = @fopen($path, 'r');
            if ($handle === false) {
                return null;
            }
            try {
                if (! flock($handle, LOCK_SH | LOCK_NB)) {
                    return null;
                }
                $data = json_decode(stream_get_contents($handle, 65536), true);

                return is_array($data) ? $data : null;
            } finally {
                fclose($handle);
            }
        } catch (Throwable) {
            return null;
        }
    }

    /** @return array{code: string, summary: string} */
    public function error(?string $message): array
    {
        $code = match (true) {
            preg_match('/deadlock|40001|1213/i', $message ?? '') === 1 => 'DB_DEADLOCK',
            preg_match('/timeout|timed out|batas waktu/i', $message ?? '') === 1 => 'TIMEOUT',
            preg_match('/\b(FORM_VALUE|HISTORY_STRUCTURE|REPORT_TIMEOUT|JOB_TIMEOUT|API_REJECTED|API_UNAVAILABLE|HYBRID_SOURCE_FAILED|HYBRID_TIMEOUT|HYBRID_HTTP|HYBRID_ERROR|CASHLESS_UNKNOWN|CASHLESS_ACCOUNT|WORKER_STOPPED|SESSION_EXPIRED|CONFIG_REQUIRED|CONFIG_INVALID|APEX_NO_DATA|APEX_PARTIAL_NO_DATA|CSV_INVALID|IMPORT_FAILED|PROJECTION_FAILED|TIMEOUT|DB_DEADLOCK):/', $message ?? '', $match) === 1 => $match[1],
            default => 'OPERATION_FAILED',
        };

        return ['code' => $code, 'summary' => match ($code) {
            'DB_DEADLOCK' => 'Transaksi database bertabrakan.',
            'TIMEOUT', 'REPORT_TIMEOUT', 'JOB_TIMEOUT' => 'Operasi melewati batas waktu.',
            default => 'Operasi perlu diperiksa. Buka catatan sumber melalui ID korelasi.',
        }];
    }

    /** @return array{code: string, summary: string} */
    public function exception(Throwable $exception): array
    {
        if ($exception instanceof QueryException) {
            return $this->error((string) ($exception->errorInfo[0] ?? '').' '.(string) ($exception->errorInfo[1] ?? ''));
        }

        return $this->error(class_basename($exception));
    }

    private function prune(string $directory): void
    {
        $files = [];
        foreach (new \DirectoryIterator($directory) as $file) {
            if ($file->isFile() && ! $file->isLink() && $file->getExtension() === 'json') {
                $files[$file->getPathname()] = $file->getMTime();
            }
            if (count($files) >= 512) {
                break;
            }
        }
        arsort($files);
        foreach (array_slice(array_keys($files), 127) as $path) {
            @unlink($path);
        }
    }
}
