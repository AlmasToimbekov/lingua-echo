Bundled starter audio for new users (no API keys required).

Folder layout:
  en/01.mp3 … en/10.mp3  — American English, matches seed-1 … seed-10 in lib/seed.ts
  ru/01.mp3 … ru/10.mp3  — Russian, same order

To replace with your own recordings: keep the same filenames and order.
Regenerate from macOS voices: npm run seed-audio

Audio is lazy-loaded in the app (only the current phrase + neighbors).