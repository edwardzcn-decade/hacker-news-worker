# Hacker News Worker

Mainly work on Cloudflare Workers to fetch and process Hacker News data, forward to email/telegram bot/webhook/db record.

## TODO list

+ [x] Scheduler trigger (cron)
+ [x] Devide into API redirect and page redirect
+ [x] Notify for Telegram bot
+ [ ] Notify Email
+ [ ] LLM summary and scoring
+ [ ] Implement Email notification

## Flowchart

```mermaid
flowchart LR
    Trigger1["Scheduler<br/>(Cron)"]:::source
    Trigger2["Router / Forwarder<br/>(Basic route / Hono)"]:::source
    HN_API["Hacker News API<br/>(Firebase API)"]:::process

    Trigger1 --> HN_API
    Trigger2 --> HN_API

    HN_API --> DATA_PROCESS

    subgraph DATA_PROCESS["Data Process"]
      direction TB
      Process1["HN Item / HN Live Data<br/>(item, maxitem, topsories)"]:::process
      Process2["Filter Logic<br/>(score, LLM process, etc)"]:::process
      Output1["LLM Summary<br/>"]:::output
      Output2["LLM Score"]:::output
      Process1 --> Process2
      Process2 --> |Optional| Output1
      Process2 --> |Optional| Output2
    end


    E["Notification Channels<br/>Telegram / Email / Webhook"]:::output
    F[Daily Project / Reading Queue]:::output
    E --> F

    %% --- classes ---
    %% --- source color color:#0d47a1; ---
    %% --- process color:#1b5e20; ---
    %% --- output color:#e65100; ---
    classDef source  fill:#e3f2fd,stroke:#1e88e5,stroke-width:2px;
    classDef process fill:#e8f5e9,stroke:#43a047,stroke-width:1px;
    classDef output  fill:#fff3e0,stroke:#fb8c00,stroke-width:1px;
    classDef default color:#000000;
```