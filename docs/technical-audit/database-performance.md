# Database and query performance

## Evidence and limits

MySQL schema/index metadata and two read-only EXPLAIN plans were inspected through Boost. No migrations, ANALYZE TABLE, data mutations or EXPLAIN ANALYZE were run against the attached database. It was not established as representative of production. information_schema estimates were customers 1082, pickup_tasks 781, report_jobs 98, jne_report_awbs 14683, jne_shipments 28215, observations 21063, jobs/failed_jobs 0. These are approximate optimizer metadata, not exact business counts, workload measurements or proof of healthy consumers. Seed/test artifacts may contribute.

The selected pickup-results test explicitly verifies constant query count at page sizes 10 and 50 and passed in the isolated 57-test run (PickupResultTest.php:113). No new runtime N+1 regression was reproduced. Three additional per-record read patterns are strongly evidenced by implementation, with exact call sites and verification recipes in [findings](findings.md).

## N+1 and repeated-read register

| Path | Growth attributable to this pattern | Existing protection | Assessment / targeted improvement |
|---|---|---|---|
| PickupTaskController::index -> PickupTaskResource | No row-dependent lazy relationship read identified on list | assignedStaff/visits eager loaded; withExists(handoverItem); eligibleFor reads scalar fields | No action needed; do not eager-load full proof history into every list |
| PickupResultController monitoring | Existing 10/50 query-growth assertion passes | QueryPickupResults projects latest/effective values in SQL; pagination | Preserve regression; not a production latency benchmark |
| JneMonitoringController::index | Batch relationship queries per page | selected fields; with latestSource, customer, pickup; metrics closure memoized | No N+1 identified; aggregate cost still needs profiling |
| HandoverController::index/resource | Batched reads; hydration grows with members/revisions | items.proof.revisions, items.revisions, items.task.assignedStaff | No ordinary N+1 found; all histories loaded to calculate effective baselines, a separate potential hydration cost |
| CreateSession / AmendSession | About 3N creation relationship SELECTs, separate from necessary writes | Task locks and membership uniqueness; no proof preload | TA-02: batch only needed proof IDs/membership reads |
| ReconcilePickupProcessing / customer-day eligibility | About K extra exists SELECTs for K cross-day rows that reach eligibility | proof/latestSource preloaded | TA-03: preload processed pending key set, not every relationship |
| ProjectJneShipments -> matcher new-link branch | Up to one lazy latestSource read per eligible shipment | pickup eager loaded; entry_at omitted from selected sources | TA-04: select required date and preserve true-missing fallback |
| CashlessHandoverController list | No per-task policy reads identified after preload | proof.revisions, handoverItem.session, processingReconciliation; withCount | Preserve |
| ResolveJneCategories | Batched source/job/claim/contract reads | grouped source history, ID maps | No ordinary N+1; history size still matters |
| QueuePickupReconciliations producer | O(T) reconciliation reads/updates; constructors read task/proof per dispatch attempt | unique customer-day execution; after-commit | TA-05: execution uniqueness does not bound producer cost |

These are logical growth estimates from code paths, not invented measured query totals. Request middleware/authentication queries and required writes are excluded. None of the new N+1 findings is classified Confirmed without an actual trace.

## Query efficiency

TA-05 and TA-06 are the main growth risks. get()->chunk() operates on an already materialized Collection. The importer streams bytes into a spillable php://temp stream but stores normalized unique rows/raw JSON in memory. The matcher reloads historical sources for relevant AWBs; necessary identity conflicts make blind latest-only truncation unsafe.

Frontend lists usually paginate 10/20/50, report/detail histories have independent pagination, and pickup CSV exports chunk up to 500 rows. JNE export uses batched iteration and eager-loaded relationships. There is no basis to replace these with cursor pagination universally: total-page navigation and deterministic sorts are part of the current UI contract.

Contains searches exist in CustomerController.php:35, PickupTaskController.php:75 and JNE shipment filters. B-tree indexes generally cannot seek arbitrary leading-wildcard text. This is a profiling hypothesis at larger volume; do not silently change search semantics to prefix-only or add an index for every search field. Customer pickers paginate, but JneMonitoringController.php:101 sends the full id/name/code catalog on initial loads. At the metadata estimate of around 1000 customers that may be proportionate; remeasure payload before adding another search endpoint.

QueryPickupOperations makes multiple separate SQL aggregates; that is constant query count rather than N+1. QueryJneCustomerDashboard computes SQL summaries, capped top-10 breakdowns and date series, with controller closure memoization and independent shipment pagination. Preserve this design until an actual slow query is identified.

## Index-to-query assessment

Focused live schema inspected:

| Query / invariant | Existing indexes / constraints | Conclusion |
|---|---|---|
| Global shipment newest-first list | jne_shipment_list_order(last_observed_at,id) | EXPLAIN selected this index with Backward index scan, estimated 20 rows. Positive access-path evidence only |
| Exact AWB registry | unique awb; older unique(customer_account,awb) | Global AWB uniqueness is essential; account is not identity. The older composite may be redundant but do not remove without workload/FK review |
| Per-report import duplicate prevention | unique(report_job_id,awb); awb index on source history | Appropriate; retained source rows support cross-report evidence |
| Observation dedup / timeline | unique(jne_report_awb_id); timeline(jne_shipment_id,observed_at,id) | Appropriate current timeline; refresh queries on created_at/status still need realistic plans before another index |
| Task list by staff/status/schedule | tasks_staff_list(assigned_staff_id,status,scheduled_at,id) | Well-aligned when leading predicates are supplied |
| Global task schedule / results | tasks_results_schedule(scheduled_at,id); tasks_customer_schedule(customer_id,scheduled_at) | Useful complementary leading columns; not interchangeable |
| Available takeover list | tasks_candidates(status,execution_started_at,scheduled_at,id) | Fits eligibility filters; OR branches still need representative plans |
| Customer exact code | unique customer_code | Function-wrapped resolver does full scan in inspected plan (TA-01) |
| Alias lookup | normalized code/name mapping columns in evidence migrations | Exact aliases have explicit normalized keys; conflict/scoping checks should remain |
| Worker claims | report_jobs(source,status,id), status/id; unique active_slot, claim_key, schedule_key | Good claim/idempotency support; do not recommend locking every report |
| Cashless batches | source/status/id, unique(source,ho_number), event(batch_id,event_key), lane source key | Good source serialization and replay safeguards |
| Handover/POP | unique task membership, proof task and submission keys, revision uniqueness | Important integrity guarantees; preserve |
| Dashboard date metrics | source covering(entry_at,id,...), shipment covering(latest_report_awb_id,...) | Present in live schema and 27 October migrations; maintenance/write cost and actual filtered plans require measurement |

The 28 October retry migration replaces the initial globally unique cashless-entry-item evidence FK with per-batch uniqueness. Review the full migration chain, not only the create-table migration. Retrying an eligible failed AWB is intended; it does not imply duplicate active Sertim evidence is allowed.

## Growth scenarios, not capacity claims

| Population at 10× / 100× | Candidate pressure | Measurement needed first |
|---|---|---|
| Historical pickups/customers | alias-save fanout; whole customer catalog payload | producer queries, p95 request time, callback/memory size |
| AWBs / repeated report imports | complete source history in matching; provenance scan | peak RSS per unique AWB and history depth; raw JSON bytes |
| Tracking observations | terminal confirmation correlated subqueries and freshness max | EXPLAIN on representative due/terminal queries, examined rows |
| Reconciliation events/manifests/audit | snapshot JSON and retained private artifacts | table/file growth per day, retention/restore cost |
| Queue history / failed jobs | stale reservations and operator backlog | queue age by queue, failed versus business-failed ratio, pruning practice |

Keep source evidence and audit history until an explicit retention policy is agreed. No deletion, partitioning, archival or index migration is recommended as an immediate action solely from these scenarios.

