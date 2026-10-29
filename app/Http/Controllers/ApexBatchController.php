<?php

namespace App\Http\Controllers;

use App\Actions\Reports\ManageApexBatches;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

class ApexBatchController extends Controller
{
    public function checkpoint(Request $request, int $reportJob, int $number, ManageApexBatches $batches): JsonResponse
    {
        abort_unless($request->attributes->get('report_source') === 'apex', 403);
        $request->validate(['start_key' => ['required_without:file', 'uuid'], 'file' => ['nullable', 'file', 'extensions:csv', 'max:'.config('jne-reports.max_file_kb')]]);
        if ($request->hasFile('file')) {
            $batches->save($reportJob, $number, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $request->file('file'));

            return response()->json(['data' => ['status' => 'SAVED']]);
        }

        return response()->json(['data' => $batches->begin($reportJob, $number, $request->header('X-Worker-ID'), $request->header('X-Report-Claim', ''), $request->string('start_key')->toString())]);
    }

    public function review(Request $request, int $reportJob, ManageApexBatches $batches): RedirectResponse
    {
        $data = $request->validate(['number' => ['nullable', 'integer', 'min:1'], 'reason' => ['required', 'string', 'max:500'], 'confirmed_not_submitted' => ['exclude_with:file', 'required', 'accepted'], 'file' => ['nullable', 'file', 'extensions:csv', 'max:'.config('jne-reports.max_file_kb')]]);
        $batches->review($request->user(), $reportJob, isset($data['number']) ? (int) $data['number'] : null, $data['reason'], $request->file('file'));

        return back();
    }
}
