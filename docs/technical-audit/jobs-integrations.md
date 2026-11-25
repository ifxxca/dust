# Jobs, scheduler and external integrations

## Pipeline verification

| Required question | Evidence and result | Limit |
|---|---|---|
| Four Hybrid sources distinguishable | ReportJob HYBRID_PARTS stores server + manual/cashless; server profiles select their own pair | Current architecture supports both old four-part combined and split server cycles |
| Provenance survives merging/APEX | CombineHybridReports validates exact expected parts/dates/checksums; ReadJneSourceEvidence builds per-AWB origin lists; source_evidence and raw_data retained | Capture depends on provenance/evidence/category flags; production activation not verified |
| Duplicate AWBs avoid wrong counts | Hybrid union keys by AWB; importer deduplicates identical normalized rows and rejects conflicting duplicates; unique report/AWB and global registry AWB | Cross-batch conflicting content must remain a regression case |
| Partial success not complete | Exact source-set requirement; failed source -> NEEDS_ATTENTION; workflow READY requires IMPORTED + PROJECTED; APEX validator requires the exact AWB set | Empty sources and failed sources are different states |
| Late data safe | New observations retained; current tracking changes only for newer observed_at with job-ID tie-break; reconciliation independent of handover reopening | Real JNE timestamp semantics still require operator verification |
| Retry does not duplicate effects | claim key/ownership, content checksum, batch checkpoints, source-observation uniqueness, cashless event payload hash | Does not provide generic exactly-once external HTTP delivery |
| Older snapshot cannot replace newer tracking | ProjectJneShipments.php:34–42 and passing JneMonitoringTest cases | Matching can still flag a conflict from older contradictory evidence; that is distinct from overwriting tracking |
| Failures diagnosable without secrets | Node safeError, structured phase/control/error-code fields, private diagnostics and recovery artifacts | Laravel broad catches lose cause (TA-08); no credential-output test against real accounts |
| Report processing avoids interactive scraping | Durable job claim and queued PHP import; no report-browser execution in request handlers | File validation/storage is synchronous; automation producer fanout can still delay requests |

## Lifecycle and queue topology

Source collection -> SOURCE_SAVED -> combined WAITING_APEX -> external RUNNING/WAITING_REPORT/DOWNLOADING -> COMPLETED CSV -> import/projection -> READY is explicit. NO_DATA is not the same as a failed or partial report. Upstream History/Process/Download stages are correlated to account, period, filename and authenticated creator; worker tests exercise uncertainty without repeating Process.

Laravel jobs occupy default, reconciliation, documents, deliveries and mobile-push queues. ReconcilePickupProcessingJob uses four tries, 60-second timeout, [15,60,180] backoff and a unique customer-day key. Render jobs allow four attempts and 75 seconds; delivery jobs use one try and 60 seconds. Import/mapping jobs use one try and 60 seconds. Default database/Redis retry_after is 90 seconds. The configured class timeouts are below that default; runtime overrides and supervisor settings were not read from a deployed host.

AppServiceProvider dev commands separate queues. penarikan.bat:84 runs a combined default/reconciliation/documents/deliveries worker; start-local.ps1 also supports dedicated consumers. That local default worker prioritizes queues in order, so long default backlog can delay later queues if it is the only consumer. Dedicated consumers mitigate this; deployed consumer counts are unknown. Do not claim starvation or parallel capacity from launch scripts alone.

Scheduler overlap guards protect command overlap. They do not demonstrate a scheduler is actually running, and withoutOverlapping is not a cluster-wide single-host scheduling policy. Profile row locks and schedule_key uniqueness provide additional duplicate protection. No duplicate scheduling corruption was found.

External report leases are renewed by a heartbeat; expired work becomes NEEDS_ATTENTION rather than blindly rerunning an uncertain external submission. Cashless batches serialize each source lane. A batch that may have performed an external action becomes UNKNOWN and holds the lane for review. Confirmed safe retry categories and the explicit Orion refusal recovery should remain.

## Cashless status meaning

1. Local draft: encrypted device data, not application acceptance.
2. Server saved: AWB evidence + queued/waiting-source batch exist; not proof of Hybrid/JNE processing.
3. CLAIMED / CREATING_HO / ENTERING: worker accepted work; per-AWB ACCEPTED means the external input reply was accepted.
4. APPROVING: full HO contents compared with the accepted AWB set.
5. DONE / PARTIAL: explicit approval evidence checked; FAILED / UNKNOWN require attention.

UI labels distinguish these stages. A batch DONE proves the implemented Hybrid HO approval contract, not final end-to-end shipment delivery or independent real-time JNE tracking. Real provider acceptance semantics must be signed off with representative source evidence.

## Resource and recovery concerns

TA-05/06 cover synchronous producers, full report/history materialization and long transactions. There is a 20 MiB default file cap and a direct-APEX 6000-row cap; a combined result can exceed 6000 AWBs and is deliberately batched in the Node workflow. Do not impose the direct-report cap on that path without reviewing its contract.

Worker temporary directories are cleaned on completion/shutdown; checkpoint-enabled failed work can be retained in recovery directories. RenderPickupAwbManifest creates UUID HTML/XLSX/PDF artifacts; a retention strategy for failed/superseded artifacts was not established. This is a storage-growth measurement item, not authorization to delete source evidence.

QueuePickupAutomation.php:32–35 converts stale SENDING manifest deliveries to UNKNOWN and stale RENDERING manifests to FAILED. This is a good bounded recovery pattern. No analogous stale receipt PROCESSING recovery was found (TA-09). Import work can also strand after an enqueue/crash failure window (TA-10, Potential).

## Tests and operating gaps

The six selected Node worker test files passed **112/112**, using loopback HTTP/Chromium fixtures and temporary directories. They include lost acknowledgments, >50 cashless accepted AWBs, 6001 AWBs split into APEX batches, inconsistent columns, timeout/unknown results, history identity correlation, session recovery and no repeated Process call. They do not certify the current external JNE UI, credentials, rate limits or availability.

No real report pulling, external cashless submission, FCM send, email or production worker was triggered. Source availability windows, terminal-confirmation thresholds and evidence policies already have explicit configuration/contracts; do not invent values. Verify production queue age, source freshness, UNKNOWN lanes, failed render/import states, credential rotation and worker restart behavior before stronger readiness claims.

