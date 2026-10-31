<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Uji coba pickup dan resi</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f6fa;color:#172033;font-family:Arial,sans-serif;font-size:14px;line-height:1.6">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px">
        <tr><td style="padding:24px">
            <p style="margin:0 0 8px;color:#a15c00;font-weight:bold">UJI COBA EMAIL · DATA CONTOH</p>
            <h1 style="margin:0 0 16px;font-size:24px">Ringkasan pickup</h1>
            <p>Yth. {{ $customerName }},</p>
            <p>Berikut contoh ringkasan pengambilan paket beserta daftar resinya.</p>
            <p><strong>Customer:</strong> {{ $customerName }}<br><strong>Waktu pickup:</strong> {{ $pickupTime }} WIB<br><strong>Referensi:</strong> <span style="word-break:break-all">{{ $reference }}</span></p>
            <table width="100%" cellpadding="10" cellspacing="0" style="border-collapse:collapse;text-align:left">
                <thead><tr style="background:#f1f5f9"><th scope="col">Kategori paket</th><th scope="col" style="text-align:right">Jumlah</th></tr></thead>
                <tbody>
                    <tr><td>Manual Hybrid</td><td style="text-align:right">{{ $manual }}</td></tr>
                    <tr><td>Cashless Hybrid</td><td style="text-align:right">{{ $cashless }}</td></tr>
                    <tr style="background:#eff6ff;font-weight:bold"><td>Total paket</td><td style="text-align:right">{{ $manual + $cashless }}</td></tr>
                </tbody>
            </table>
            <h2 style="margin-top:24px;font-size:18px">Daftar resi contoh ({{ count($awbs) }})</h2>
            <p>Daftar lengkap juga tersedia pada lampiran CSV.</p>
            <table width="100%" cellpadding="8" cellspacing="0" style="border-collapse:collapse;text-align:left;font-size:13px">
                <thead><tr style="background:#f1f5f9"><th scope="col">Resi contoh</th><th scope="col">Kategori</th></tr></thead>
                <tbody>@foreach ($awbs as $row)
                    <tr><td style="border-bottom:1px solid #e2e8f0;font-family:monospace">{{ $row['awb'] }}</td><td style="border-bottom:1px solid #e2e8f0">{{ $row['category'] }}</td></tr>
                @endforeach</tbody>
            </table>
            <p style="margin-top:24px;color:#64748b;font-size:12px">Email ini hanya untuk pengujian SMTP. Nomor resi berawalan TEST adalah fiktif, bukan resi JNE aktual. Tidak ada data pickup, customer, atau resi operasional yang dibuat.</p>
        </td></tr>
    </table>
</body>
</html>
