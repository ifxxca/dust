<?php

use App\Models\Customer;
use App\Models\JneReportAwb;
use App\Models\JneShipment;
use App\Models\PickupTask;
use App\Models\ReportJob;
use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('operational metrics distinguish observation grain confidence and global failures while honoring shipment filters', function () {
    $this->withoutVite();
    config(['jne-reports.evidence_policies_enabled' => true, 'jne-reports.category_reconciliation_enabled' => true]);
    $admin = User::factory()->create(['role' => 'admin_supervisor']);
    $owner = Customer::factory()->create();
    $other = Customer::factory()->create();
    $task = PickupTask::factory()->create(['customer_id' => $owner->id]);
    foreach ([['OK', $owner->id, 'MATCHED'], ['AMBIGUOUS', $owner->id, 'CONFLICT'], ['OTHER', $other->id, 'MATCHED']] as [$awb, $customerId, $state]) {
        JneShipment::factory()->create(['awb' => $awb, 'customer_id' => $customerId, 'pickup_task_id' => $task->id, 'customer_match_status' => $state, 'match_status' => 'MATCHED', 'category' => 'css_orion', 'category_status' => 'MATCHED']);
        JneReportAwb::factory()->create(['awb' => $awb]);
    }
    JneReportAwb::factory()->create(['awb' => 'OK']);
    ReportJob::factory()->create(['status' => 'NEEDS_ATTENTION', 'reviewed_at' => null]);
    $this->actingAs($admin)->get(route('jne-monitoring.index', ['customer_id' => $owner->id]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('identitySummary.collected', 2)->where('operationsSummary.source_observations', 3)
        ->where('operationsSummary.category_confirmed', 1)->where('operationsSummary.global_collection_failures', 1));
    $this->get(route('jne-monitoring.index', ['customer_id' => $other->id]))->assertOk()->assertInertia(fn (Assert $page) => $page
        ->where('operationsSummary.source_observations', 1)->where('operationsSummary.category_confirmed', 0));
    config(['jne-reports.category_reconciliation_enabled' => false]);
    $this->get(route('jne-monitoring.index'))->assertOk()->assertInertia(fn (Assert $page) => $page->where('operationsSummary.category_confirmed', null)->where('operationsSummary.gates.categories', false));
});
