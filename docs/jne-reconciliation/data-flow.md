# Data flow and evidence boundaries

```mermaid
flowchart TD
    P[Report profile / administrator request] --> H[Hybrid combined parent run]
    H --> R1[Roberto cashless child]
    H --> R2[Roberto manual child]
    H --> N1[Nuralamt cashless child]
    H --> N2[Nuralamt manual child]
    R1 & R2 & N1 & N2 --> S[Private original CSV + checksum per child]
    S --> C[Wait for four validated outputs / deduplicate AWB upload list]
    C --> A[APEX Upload Connote / correlated history / download]
    P --> Q[APEX account parameter report]
    Q --> F[Private standardized CSV + report job]
    A --> F
    F --> I[Checksum + schema + exact request validation]
    I --> RAW[jne_report_awbs: original raw cells and row]
    RAW --> O[jne_shipment_observations: source history]
    O --> REG[jne_shipments: current registry projection]
    RAW --> ID[Verified customer evidence / unresolved candidates]
    ID --> PK[Independent pickup reference / future Sertim evidence]
    PK --> REC[Compare effective POP category expectations]
    REG --> T[Separate scheduled tracking refresh by AWB]
    T --> A
    ID & PK & REC --> EX[Existing monitoring / review / audit history]
```

Current tables are retained. Raw CSV and `raw_data` are evidence, report rows/observations preserve each import, and the registry is a derived current view. Customer and pickup decisions belong to separate status fields/events. A tracking snapshot is an observation at a stated time; it is not a real-time feed.

Hybrid outputs may finish at different times. The parent waits; saved children survive another child's failure. Safe local import/projection replay reuses stored data. Unknown external Process outcomes remain attention states and are not blindly resubmitted. Multi-batch APEX intermediate recovery is not currently durable and remains an explicit limitation.

The Sertim-to-registry and category-reconciliation parts are target boundaries, not a claim of completed implementation. Business gates are listed in `business-rules.md`.
