# Boss AI — Canonical Architecture

## Definition
Boss AI is an AI operating layer. It executes work, remembers decisions, and advances autonomously.

## Core Rules
- Memory is structured state, not chat history
- All memory writes are event-sourced
- Memory is scoped (GLOBAL / WORKSPACE / PROJECT / SESSION)
- Autopilot continues by default; pauses only at checkpoints

## Required Backend Structure
/backend/src/core/
- memory/
  - eventLog.ts
  - derivedState.ts
  - contextPack.ts
- orchestrator/
  - autopilot.ts
  - checkpoints.ts
- distiller/
  - distill.ts
- archive/
  - archiveStore.ts

## API Contract
POST /v1/boss/message
Returns:
- assistant reply
- memory receipt
- optional checkpoint

## Acceptance Tests
- State rebuilds from event log
- Memory does not bleed across projects
- No chat history injected into context
