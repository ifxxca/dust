<!doctype html>
<html lang="id"><body>
    <h1>Receipt Pickup</h1>
    <p>Customer: {{ $values['customer_name'] }}</p>
    <p>Alamat pickup: {{ $values['pickup_address'] }}</p>
    <p>Waktu pickup: {{ $record->picked_up_at->setTimezone(config('pickup.timezone'))->format('d/m/Y H:i') }} {{ config('pickup.timezone') }}</p>
    <table cellpadding="8" border="1"><tr><th>Kategori</th><th>Jumlah</th></tr>
        <tr><td>Manual Hybrid (Non-Cashless)</td><td>{{ $values['manual_hybrid'] }}</td></tr>
        <tr><td>Cashless Hybrid</td><td>{{ $values['cashless_hybrid'] }}</td></tr>
        <tr><td>CSS / Orion</td><td>{{ $values['css_orion'] }}</td></tr>
        <tr><th>Total</th><th>{{ $values['manual_hybrid'] + $values['cashless_hybrid'] + $values['css_orion'] }}</th></tr>
    </table>
    <p>Catatan: {{ $values['notes'] ?? '—' }}</p>
    <p>Versi bukti: {{ $revision }}. Foto dan tanda tangan pickup terlampir.</p>
    @if ($revision > 0)<p>Receipt ini menggunakan data pencatatan yang dikoreksi. Bukti foto dan tanda tangan awal tetap dipertahankan.</p>@endif
    <p>Receipt ini mencatat pengambilan paket; hasil verifikasi retail disimpan terpisah.</p>
</body></html>
