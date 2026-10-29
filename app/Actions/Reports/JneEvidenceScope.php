<?php

namespace App\Actions\Reports;

use App\Models\JneReportAwb;
use Illuminate\Database\Eloquent\Model;

class JneEvidenceScope
{
    public function allows(Model $mapping, JneReportAwb $source): bool
    {
        $account = $mapping->getRawOriginal('account_scope');
        $from = $mapping->getRawOriginal('valid_from');
        $thru = $mapping->getRawOriginal('valid_thru');
        if ($account === null && $from === null && $thru === null) {
            return true;
        }
        if (! config('jne-reports.evidence_policies_enabled') || $mapping->getRawOriginal('verified_at') === null) {
            return false;
        }
        if ($account !== null && mb_strtoupper(trim($source->customer_account ?? '')) !== $account) {
            return false;
        }
        $date = $source->entry_at?->setTimezone(config('jne-reports.source_timezone'))->toDateString();

        return ! (($from !== null || $thru !== null) && $date === null)
            && ($from === null || $date >= $from) && ($thru === null || $date <= $thru);
    }
}
