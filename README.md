# NEURALLINK_v2.0

Cyberpunk multi-provider chat app built with Next.js, React, and Tailwind.

## Stack

- Next.js App Router
- React 19
- Tailwind CSS
- Server routes for chat and ElevenLabs TTS

## Features

- Multi-session chat with local persistence
- Provider connectors for Anthropic, OpenAI, Gemini, and Ollama
- ElevenLabs TTS with local fallback
- File upload, drag and drop, search, session export, and voice input

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
npm run start
```

## Important Paths

- `src/app/page.tsx` page entry
- `src/components/CyberchatApp.tsx` main client app
- `src/app/api/chat/route.ts` chat API route
- `src/app/api/tts/route.ts` ElevenLabs TTS route
- `src/lib/server/connectors.ts` provider connector logic

## Notes

- Ollama works through the server route. Set the connector to `OLLAMA` and use the exact installed model name.
- The previous Vite version is archived at `/home/giyu/Dev/cyberchat-vite-archive`.
