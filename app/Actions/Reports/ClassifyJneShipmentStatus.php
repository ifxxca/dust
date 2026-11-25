<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;

class ClassifyJneShipmentStatus
{
    public function handle(JneReportAwb $source): string
    {
        if ($this->cancelled($source)) {
            return 'CANCELLED';
        }
        $code = $this->normalize($source->getAttribute('coding') ?? ($source->raw_data['CODING'] ?? null));
        if (preg_match('/^="([^"]*)"$/D', $code, $matches)) {
            $code = $matches[1];
        }
        if ($status = config('jne-statuses.'.$code.'.tracking_status')) {
            return $status;
        }
        $web = $this->normalize($source->status_web);
        $pod = $this->normalize($source->status_pod);
        if (in_array($web, ['CANCEL BY SHIPPER', 'RESI CANCEL CONNOTE', 'CANCELLED', 'CANCELED'], true)) {
            return 'CANCELLED';
        }
        if (str_starts_with($web, 'DELIVERED TO ') || in_array($web, ['DELIVERED', 'TERKIRIM'], true) || $pod === 'DELIVERED') {
            return 'DELIVERED';
        }
        if (in_array($web, ['RETURNED', 'RETURNED TO SHIPPER'], true) || str_starts_with($web, 'RETURNED TO SHIPPER [') || str_starts_with($web, 'RETURN SHIPMENT TO [')) {
            return 'RETURNED';
        }
        if (in_array($pod, ['UNDEL', 'UNDELIVERED'], true)) {
            return 'EXCEPTION';
        }
        foreach (['INCOMPLETE CONSIGNEE ADDRESS', 'CONSIGNEE UNKNOWN', 'CONSIGNEE NOT AT HOME', 'COMPLETE ADDRESS- BUT CONSIGNEE UNKNOWN', 'SHIPMENT PROBLEM', 'SHIPPING PROBLEM', 'SHIPMENT RETURN', 'DELIVERY PROBLEM', 'PACKAGE FAILED TO RETURN', 'SHIPMENT FAILED TO BE RETURNED', 'SHIPMENT BEING HELD'] as $prefix) {
            if ($this->startsWithStatus($web, $prefix)) {
                return 'EXCEPTION';
            }
        }
        foreach (['SHIPMENT RECEIVED AT', 'WITH DELIVERY COURIER', 'RECEIVED AT', 'DEPARTED FROM', 'DEPART FROM TRANSIT', 'PROCESSED AT', 'SHIPMENT FORWARDED', 'PROCESS AND FORWARD TO', 'SHIPMENT PICKED UP BY JNE COURIER', 'ARRIVE AT LAST FACILITY', 'ON DESTINATION CUSTOM CLEARANCE PROCESS', 'ON PROCESS', 'ON-PROCESS', 'ON PROGRESS', 'IN TRANSIT'] as $prefix) {
            if ($this->startsWithStatus($web, $prefix)) {
                return 'IN_TRANSIT';
            }
        }

        return 'UNKNOWN';
    }

    public function signature(JneReportAwb $source): string
    {
        return hash('sha256', json_encode([
            $this->handle($source), $this->normalize($source->status_web), $this->normalize($source->status_pod), $this->cancelled($source),
        ], JSON_THROW_ON_ERROR));
    }

    private function cancelled(JneReportAwb $source): bool
    {
        return in_array($this->normalize($source->awb_cancel), ['Y', 'YES', '1'], true);
    }

    private function startsWithStatus(string $value, string $prefix): bool
    {
        return $value === $prefix || str_starts_with($value, $prefix.' ') || str_starts_with($value, $prefix.'-');
    }

    private function normalize(mixed $value): string
    {
        return is_string($value) ? mb_strtoupper(trim(preg_replace('/\s+/u', ' ', $value) ?? '')) : '';
    }
}
