# Boss AI (local-first, low-burn build)

This repo is set up so **Boss uses structured memory** (Mongo) instead of hauling an ever-growing chat transcript into every request.

## What was fixed/added

- **Token burn fix:** the backend no longer uses a persistent LLM chat session ID (which caused context growth and rising costs).
- **Bounded memory context:** only a small, clipped set of memory items is sent to the model.
- **Accidental double-send protection:** server-side de-dupe (20s) to avoid burning credits on retries.
- **Noiz cloned voice support (audio-only):** the mobile app can play your cloned voice via a short-lived playback URL.

## Environment variables

### Backend (`backend/.env`)

Required:
- `MONGO_URL`
- `DB_NAME`
- `EMERGENT_LLM_KEY`

Optional:
- `DID_API_KEY` (only needed for avatar *video*)
- `NOIZ_API_KEY` (needed for cloned voice)

D-ID optional overrides:
- `DID_AGENT_ID`
- `DID_SOURCE_URL`
- `DID_DRIVER_ID`
- `DID_VOICE_ID`

### Frontend (Expo env)

- `EXPO_PUBLIC_BACKEND_URL` (example: `http://localhost:8001`)
- `EXPO_PUBLIC_NOIZ_VOICE_ID` (your Noiz cloned voice ID)

## How voice works now

- **Long-press Send** = *audio-only* (Noiz cloned voice first; falls back to system TTS)
- **Speaker icon on a message** = tries *avatar video* (D-ID). If video fails, it falls back to Noiz audio.

## Notes

- Noiz TTS currently enforces **200 characters max** (matches their API). The app truncates long responses for audio playback.
- If you want *full-length* voice for long responses, the next step is chunking + stitching audio.
