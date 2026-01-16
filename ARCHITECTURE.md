# Boss AI Architecture

## Canonical Domain

**Boss AI Core is a standalone API service.**

```
Production:  https://api.boss.ai
Development: https://*.pages.dev/api (temporary)
```

**All integrations (D-ID, mobile apps, web apps) connect to ONE canonical Boss API host.**

Boss AI is:
- ✅ App-agnostic (works with any frontend)
- ✅ Domain-permanent (canonical API URL)
- ✅ Single source of truth for memory, decisions, checkpoints

Boss AI is NOT:
- ❌ Tied to any specific frontend
- ❌ Tied to any avatar or presentation layer
- ❌ Dependent on D-ID or any single integration

## Unified System Design

Boss AI is a **single integrated system**, not separate components. The D-ID avatar is a **presentation layer** that sits on top of the Boss AI Core.

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│                                                              │
│   ┌──────────────────┐    ┌──────────────────────────────┐  │
│   │   D-ID Avatar    │    │      Chat UI / Mobile App    │  │
│   │  (speaks Boss's  │    │   (displays Boss's responses │  │
│   │   responses)     │    │    and memory receipts)      │  │
│   └────────┬─────────┘    └─────────────┬────────────────┘  │
│            │                            │                    │
└────────────┼────────────────────────────┼────────────────────┘
             │                            │
             ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API BOUNDARY                            │
│                                                              │
│   /api/boss/message      - Send message, get Boss response  │
│   /api/boss/memory-receipt - See what memory was used       │
│   /api/memory/*          - Memory CRUD operations           │
│   /api/checkpoints/*     - Checkpoint management            │
│   /api/decisions/*       - Decision tracking                │
│   /api/projects/*        - Project scoping                  │
│   /api/avatar/generate   - Generate D-ID video of response  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│                    BOSS AI CORE                              │
│                 (Single Source of Truth)                     │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                 MEMORY ENGINE                        │   │
│   │                                                      │   │
│   │   L0 Prime    - Global user preferences             │   │
│   │   L1 Workspace - Org policies                       │   │
│   │   L2 Project  - Project-scoped truth (dominant)     │   │
│   │   L3 Session  - Ephemeral, never trusted            │   │
│   │                                                      │   │
│   │   Event-Sourced: Append-only log → Derived state    │   │
│   │   Rebuildable: State can be rebuilt from events     │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                   AUTOPILOT                          │   │
│   │                                                      │   │
│   │   Default: Keep going automatically                 │   │
│   │   Never ask "should I proceed?"                     │   │
│   │                                                      │   │
│   │   Hard Stop Checkpoints ONLY for:                   │   │
│   │   - Sending/sharing externally                      │   │
│   │   - Spending money                                  │   │
│   │   - Deleting/overwriting data                       │   │
│   │   - Legal/medical claims                            │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │              MULTI-MODEL ROUTING                     │   │
│   │                                                      │   │
│   │   Boss chooses models automatically:                │   │
│   │   - GPT for general tasks                           │   │
│   │   - Claude for reasoning                            │   │
│   │   - Gemini for speed                                │   │
│   │                                                      │   │
│   │   Users NEVER select models                         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
│   ┌─────────────────────────────────────────────────────┐   │
│   │               DECISION MEMORY                        │   │
│   │                                                      │   │
│   │   Boss remembers DECISIONS, not conversations       │   │
│   │   Decisions are stored and referenced               │   │
│   │   Chat history is NOT injected into context         │   │
│   └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Core Principles

### 1. Single Source of Truth
- All memory managed by Boss AI Core
- All decisions made by Boss AI Core  
- All checkpoints triggered by Boss AI Core
- D-ID avatar only speaks what Boss decides

### 2. Avatar is Presentation Only
```
The avatar speaks what Boss decides.
Boss does not live inside the avatar.
```

- D-ID receives Boss AI's text response
- D-ID generates video of that response
- D-ID has NO AI logic of its own
- No parallel state, no duplicated logic

### 3. Memory Architecture
- **Event-Sourced**: All changes are append-only events
- **Rebuildable**: State can be rebuilt from event log
- **Scoped**: Memory respects L0-L3 scope hierarchy
- **Visible**: Users can see what memory was used (receipts)

### 4. Autopilot Contract
- Boss proceeds automatically by default
- Only stops at checkpoints (send/spend/delete/legal)
- Never asks "should I proceed?" for normal operations

## Unified Flow

```
User Input (text/voice)
       │
       ▼
┌─────────────────────────┐
│   Boss AI Core API      │
│   /api/boss/message     │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Memory Context        │
│   Load L0 + L2 memory   │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   Checkpoint Check      │
│   (send/spend/delete?)  │
└───────────┬─────────────┘
            │
       ┌────┴────┐
       │         │
       ▼         ▼
   Checkpoint  Continue
   Required    Processing
       │         │
       │         ▼
       │    ┌─────────────────────────┐
       │    │   LLM Processing        │
       │    │   (auto-selected model) │
       │    └───────────┬─────────────┘
       │                │
       │                ▼
       │    ┌─────────────────────────┐
       │    │   Record Decision       │
       │    │   Update Memory Events  │
       │    └───────────┬─────────────┘
       │                │
       └────────┬───────┘
                │
                ▼
┌─────────────────────────┐
│   Boss Response         │
│   (text + memory used)  │
└───────────┬─────────────┘
            │
            ▼
┌─────────────────────────┐
│   D-ID Avatar           │
│   (generate video of    │
│    Boss's response)     │
└───────────┬─────────────┘
            │
            ▼
       User sees/hears
       Boss's response
```

## File Structure

```
/app
├── backend/
│   └── server.py           # Boss AI Core - ALL logic here
│       ├── Memory Engine   # Event-sourced memory
│       ├── Autopilot       # Checkpoint detection
│       ├── Multi-model     # LLM routing
│       ├── Decisions       # Decision tracking
│       └── D-ID Avatar API # Video generation (presentation only)
│
└── frontend/
    └── app/
        ├── boss.tsx        # Chat UI - calls Boss AI APIs
        ├── memory.tsx      # Memory viewer - calls Boss AI APIs
        ├── projects.tsx    # Project selector - calls Boss AI APIs
        └── decisions.tsx   # Decision viewer - calls Boss AI APIs
```

## What NOT to Do

❌ Do NOT store chat history in context  
❌ Do NOT let memory bleed across projects  
❌ Do NOT ask users to pick models  
❌ Do NOT add "Are you sure?" prompts except at checkpoints  
❌ Do NOT build D-ID as a parallel AI system  
❌ Do NOT duplicate logic between frontend and backend  
❌ Do NOT have the avatar make its own decisions  

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `POST /api/boss/message` | Send message to Boss, get response |
| `GET /api/boss/memory-receipt` | See what memory was used |
| `POST /api/memory/events` | Create memory event |
| `GET /api/memory/state` | Get derived memory state |
| `POST /api/memory/rebuild` | Rebuild state from events |
| `POST /api/checkpoints` | Create checkpoint |
| `PUT /api/checkpoints/{id}` | Resolve checkpoint |
| `POST /api/decisions` | Record decision |
| `GET /api/decisions` | Get decisions |
| `POST /api/projects` | Create project |
| `GET /api/projects` | Get projects |
| `POST /api/avatar/generate` | Generate D-ID video of text |
| `GET /api/avatar/status/{id}` | Check video generation status |

## D-ID Integration

The D-ID integration uses the **Talks API** (not the Agent widget) to generate videos:

1. Boss AI generates text response
2. Frontend requests avatar video: `POST /api/avatar/generate`
3. Backend sends text to D-ID Talks API
4. D-ID generates talking avatar video
5. Frontend plays the video

**The avatar has NO AI of its own. It only speaks Boss's words.**
