<!doctype html>
<html lang="id">
<head><meta charset="utf-8"><title>Daftar resi {{ $manifest->snapshot['reference'] }}</title>
<style>
body{font:11px Arial,sans-serif;color:#172033}h1{font-size:19px;margin-bottom:8px}p{margin:5px 0}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{padding:6px 8px;border-bottom:1px solid #d8dee8;text-align:left;overflow-wrap:anywhere}th{background:#edf2f7}thead{display:table-header-group}tr{break-inside:avoid}.meta{margin-bottom:16px}.awb{white-space:nowrap}
</style></head><body>
<h1>Daftar Resi Pengiriman</h1>
<div class="meta"><p>{{ $manifest->snapshot['customer_name'] }} · Kode {{ $manifest->snapshot['customer_code'] }}</p>
<p>Pickup {{ $manifest->snapshot['reference'] }} · {{ $manifest->snapshot['pickup_date'] }} · Versi {{ $manifest->revision }}</p>
<p>Total {{ count($items) }} AWB unik</p></div>
<table><thead><tr><th>No.</th><th>Resi</th><th>Kategori</th><th>Penerima</th></tr></thead><tbody>
@foreach($items as $item)
<tr><td>{{ $loop->iteration }}</td><td class="awb">{{ $item->awb }}</td><td>{{ ['manual_hybrid' => 'Manual', 'cashless_hybrid' => 'Cashless', 'css_orion' => 'Orion'][$item->category] ?? $item->category }}</td><td>{{ $item->consignee_name }}</td></tr>
@endforeach
</tbody></table></body></html>
