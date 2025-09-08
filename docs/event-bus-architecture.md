# Event Bus System Architecture

## System Overview

```mermaid
graph TB
    subgraph "Event Bus Core"
        EB[Event Bus]
        ET[Event Types]
        EH[Event History]
    end

    subgraph "Event Emitters"
        FU[File Upload Service]
        AR[AutoRAG Service]
        CM[Campaign Management]
        SA[Snippet Agent]
    end

    subgraph "Event Listeners"
        RL[ResourceList]
        RSP[ResourceSidePanel]
        RU[ResourceUpload]
        CS[CampaignsSection]
        LS[LibrarySection]
    end

    subgraph "Custom Hooks"
        UFUS[useFileUploadStatus]
        UARS[useAutoRAGStatus]
        UAS[useAsyncState]
        UAP[useAutoRAGPolling]
    end

    subgraph "Event Flow"
        E1[FILE_UPLOAD.STARTED]
        E2[FILE_UPLOAD.COMPLETED]
        E3[AUTORAG_SYNC.STARTED]
        E4[AUTORAG_SYNC.COMPLETED]
        E5[CAMPAIGN.CREATED]
    end

    %% Event Emitters to Event Bus
    FU -->|send| EB
    AR -->|send| EB
    CM -->|send| EB
    SA -->|send| EB

    %% Event Bus to Event Types
    EB --> ET
    EB --> EH

    %% Event Bus to Event Flow
    EB --> E1
    EB --> E2
    EB --> E3
    EB --> E4
    EB --> E5

    %% Event Flow to Listeners
    E1 --> RL
    E2 --> RL
    E3 --> RL
    E4 --> RL
    E2 --> RSP
    E4 --> RSP
    E5 --> CS

    %% Custom Hooks Integration
    UFUS -->|listen| EB
    UARS -->|listen| EB
    UAS -->|listen| EB
    UAP -->|send| EB

    %% Components using Hooks
    RSP --> UFUS
    RSP --> UARS
    RU --> UFUS
    RL --> UFUS
    RL --> UARS

    %% Styling
    classDef eventBus fill:#e1f5fe,stroke:#01579b,stroke-width:3px
    classDef emitter fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef listener fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef hook fill:#fff3e0,stroke:#e65100,stroke-width:2px
    classDef event fill:#fce4ec,stroke:#880e4f,stroke-width:2px

    class EB,ET,EH eventBus
    class FU,AR,CM,SA emitter
    class RL,RSP,RU,CS,LS listener
    class UFUS,UARS,UAS,UAP hook
    class E1,E2,E3,E4,E5 event
```

## Component Interaction Flow

```mermaid
sequenceDiagram
    participant User
    participant RU as ResourceUpload
    participant FU as useFileUpload
    participant EB as Event Bus
    participant RL as ResourceList
    participant AR as AutoRAG Service
    participant UAP as useAutoRAGPolling

    User->>RU: Upload file
    RU->>FU: handleUpload()
    FU->>EB: send FILE_UPLOAD.STARTED
    EB->>RL: notify listeners
    RL->>RL: update UI (uploading state)

    FU->>FU: upload to R2 storage
    FU->>EB: send FILE_UPLOAD.COMPLETED
    EB->>RL: notify listeners
    RL->>RL: update UI (completed state)

    FU->>AR: triggerAutoRAGSync()
    AR->>UAP: startPolling()
    UAP->>EB: send AUTORAG_SYNC.STARTED
    EB->>RL: notify listeners
    RL->>RL: update UI (processing state)

    UAP->>UAP: poll job status
    UAP->>EB: send AUTORAG_SYNC.COMPLETED
    EB->>RL: notify listeners
    RL->>RL: refresh resource list
```

## Event Types and Data Flow

```mermaid
graph LR
    subgraph "File Upload Events"
        FUS[FILE_UPLOAD.STARTED<br/>fileKey, filename]
        FUP[FILE_UPLOAD.PROGRESS<br/>fileKey, progress]
        FUC[FILE_UPLOAD.COMPLETED<br/>fileKey, filename]
        FUF[FILE_UPLOAD.FAILED<br/>fileKey, error]
    end

    subgraph "AutoRAG Events"
        ARS[AUTORAG_SYNC.STARTED<br/>ragId, jobId, fileKey]
        ARP[AUTORAG_SYNC.PROGRESS<br/>ragId, jobId, progress]
        ARC[AUTORAG_SYNC.COMPLETED<br/>ragId, jobId, fileKey]
        ARF[AUTORAG_SYNC.FAILED<br/>ragId, jobId, error]
    end

    subgraph "Campaign Events"
        CC[CAMPAIGN.CREATED<br/>campaignId, name]
        CU[CAMPAIGN.UPDATED<br/>campaignId, changes]
        CD[CAMPAIGN.DELETED<br/>campaignId]
    end

    subgraph "Snippet Events"
        SG[SNIPPET.GENERATED<br/>snippetId, campaignId]
        SA[SNIPPET.APPROVED<br/>snippetId, campaignId]
        SR[SNIPPET.REJECTED<br/>snippetId, campaignId]
    end

    %% Event flow connections
    FUS --> FUP
    FUP --> FUC
    FUP --> FUF
    FUC --> ARS
    ARS --> ARP
    ARP --> ARC
    ARP --> ARF
    ARC --> SG
    SG --> SA
    SG --> SR

    %% Styling
    classDef fileEvent fill:#e3f2fd,stroke:#1976d2,stroke-width:2px
    classDef autoragEvent fill:#f1f8e9,stroke:#388e3c,stroke-width:2px
    classDef campaignEvent fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef snippetEvent fill:#fff3e0,stroke:#f57c00,stroke-width:2px

    class FUS,FUP,FUC,FUF fileEvent
    class ARS,ARP,ARC,ARF autoragEvent
    class CC,CU,CD campaignEvent
    class SG,SA,SR snippetEvent
```

## Hook Architecture

```mermaid
graph TB
    subgraph "Base Hooks"
        UAS[useAsyncState<br/>Generic async state management]
        UEE[useEvent<br/>Event emission capability]
        UEB[useEventBus<br/>Event listening capability]
    end

    subgraph "Specialized Hooks"
        UFUS[useFileUploadStatus<br/>File upload tracking]
        UARS[useAutoRAGStatus<br/>AutoRAG job tracking]
        UAP[useAutoRAGPolling<br/>Polling with events]
        UFU[useFileUpload<br/>Upload logic + events]
        UCM[useCampaignManagement<br/>Campaign operations]
    end

    subgraph "Component Integration"
        RSP[ResourceSidePanel]
        RU[ResourceUpload]
        RL[ResourceList]
        CS[CampaignsSection]
        LS[LibrarySection]
    end

    %% Base to Specialized
    UAS --> UFUS
    UAS --> UARS
    UEE --> UAP
    UEE --> UFU
    UEE --> UCM
    UEB --> UFUS
    UEB --> UARS

    %% Specialized to Components
    UFUS --> RSP
    UFUS --> RU
    UFUS --> RL
    UARS --> RSP
    UARS --> RL
    UAP --> RSP
    UFU --> RU
    UCM --> RSP
    UCM --> CS

    %% Styling
    classDef baseHook fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px
    classDef specializedHook fill:#e0f2f1,stroke:#00695c,stroke-width:2px
    classDef component fill:#fff8e1,stroke:#ff8f00,stroke-width:2px

    class UAS,UEE,UEB baseHook
    class UFUS,UARS,UAP,UFU,UCM specializedHook
    class RSP,RU,RL,CS,LS component
```

## Benefits and Key Features

```mermaid
mindmap
  root((Event Bus System))
    Decoupling
      Components don't know about each other
      Services send events independently
      Easy to add new listeners
    Real-time Updates
      Automatic UI updates
      No manual state synchronization
      Event-driven reactivity
    Debugging
      Event history tracking
      Source identification
      Flow visualization
    Type Safety
      TypeScript event types
      Compile-time validation
      IDE autocomplete
    Performance
      Efficient event filtering
      Automatic cleanup
      Minimal re-renders
    Scalability
      Easy to extend
      New event types
      Multiple listeners
    Testing
      Event mocking
      State isolation
      Predictable flows
```

This architecture shows how the event bus system provides a clean, scalable solution for managing asynchronous state across the application, with clear separation of concerns and excellent debugging capabilities.
