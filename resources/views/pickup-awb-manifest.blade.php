<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>Rekap pickup {{ $manifest->snapshot['reference'] }}</title>
<style>
*{box-sizing:border-box}body{margin:0;font:11px/1.5 Arial,sans-serif;color:#172033}h1{font-size:23px;line-height:1.2;margin:0 0 6px}p{margin:4px 0}.header{border-bottom:2px solid #1e3a5f;padding-bottom:14px;margin-bottom:14px}.customer{font-size:14px;font-weight:bold}.meta{color:#475569}.total{font-weight:bold;margin-top:8px}.exception{border-left:3px solid #b45309;background:#fffbeb;padding:8px 12px;margin:12px 0;white-space:pre-line;overflow-wrap:anywhere}table{border-collapse:collapse;table-layout:fixed;width:100%;margin-top:14px}th,td{padding:6px;border-bottom:1px solid #d8dee8;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#1e3a5f;color:#fff;font-weight:bold}tbody tr:nth-child(even){background:#f1f5f9}thead{display:table-header-group}tr{break-inside:avoid}.number{color:#475569;font-variant-numeric:tabular-nums}.awb{font-weight:bold;font-variant-numeric:tabular-nums}.empty{text-align:center;color:#475569;padding:18px}
</style></head><body>
<header class="header">
<h1>Rekap Pickup</h1>
<p class="customer">{{ $manifest->snapshot['customer_name'] }} · Kode {{ $manifest->snapshot['customer_code'] ?? '—' }}</p>
<p class="meta">Tanggal pickup: {{ $manifest->snapshot['pickup_date'] }} · Versi {{ $manifest->revision }}</p>
<p class="meta">Buku pickup: {{ $manifest->snapshot['reference'] }}</p>
<p class="total">Total {{ count($items) }} AWB unik</p>
</header>
@if(isset($manifest->snapshot['closure']))
<section class="exception" aria-label="Keterangan selisih">
<p><strong>Selesai dengan penjelasan selisih</strong></p>
<p>Pickup: {{ array_sum(array_column($manifest->snapshot['categories'], 'pop')) }} paket · Resi terkonfirmasi: {{ count($items) }}</p>
<p>{{ $manifest->snapshot['closure']['reason_label'] }}: {{ $manifest->snapshot['closure']['explanation'] }}</p>
</section>
@endif
<table aria-label="Daftar resi pickup">
<colgroup><col style="width:4%"><col style="width:20%"><col style="width:11%"><col style="width:18%"><col style="width:18%"><col style="width:16%"><col style="width:13%"></colgroup>
<thead><tr><th scope="col">No</th><th scope="col">Resi</th><th scope="col">Kategori</th><th scope="col">Pengirim</th><th scope="col">Penerima</th><th scope="col">Kecamatan</th><th scope="col" style="text-align:right">Amount (Rp)</th></tr></thead><tbody>
@forelse($items as $item)
@php
    $details = $manifest->snapshot['shipment_details']['awb:'.$item->awb] ?? [];
    $codFlag = $item->cod_flag ?? $details['cod_flag'] ?? null;
    $amountCents = $item->category === 'cashless_hybrid' || $codFlag === 'Y' ? 0 : ($item->amount_cents ?? $details['amount_cents'] ?? null);
@endphp
<tr><td class="number">{{ $loop->iteration }}</td><td class="awb">{{ $item->awb }}</td><td>{{ $item->category_label ?? (['manual_hybrid' => 'Manual', 'cashless_hybrid' => 'Cashless', 'css_orion' => 'CSS / Orion'][$item->category] ?? $item->category) }}@if($codFlag === 'Y')<br><span class="meta">COD</span>@endif</td><td>{{ ($item->shipper_name ?? $details['shipper_name'] ?? null) ?: '—' }}</td><td>{{ $item->consignee_name ?: '—' }}</td><td class="district">{{ ($item->consignee_district ?? $details['consignee_district'] ?? null) ?: (($details['district_status'] ?? 'UNKNOWN') === 'AMBIGUOUS' ? 'Belum pasti' : '—') }}@if(empty($item->consignee_district) && empty($details['consignee_district']) && !empty($details['destination_code']))<br><span class="meta">{{ $details['destination_code'] }}</span>@endif</td><td class="number" style="text-align:right;white-space:nowrap">{{ $amountCents !== null ? number_format($amountCents / 100, 2, ',', '.') : '—' }}</td></tr>
@empty
<tr><td colspan="7" class="empty">Belum ada resi terkonfirmasi.</td></tr>
@endforelse
</tbody></table></body></html>
