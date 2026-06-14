// Unified TTS layer for MVP.
// Primary path: xAI (unified key with chat generation) — recommended per plan and review feedback.
// Fallbacks: ElevenLabs (stub) or browser (already handled in components).

import { synthesizeWithXai } from './xai'

export type TTSProvider = 'xai' | 'elevenlabs' | 'browser'

export interface TTSOptions {
  provider: TTSProvider
  apiKey?: string          // xAI key (reused) or ElevenLabs key
  // future: voiceId etc.
}

export async function generateAudio(
  text: string,
  language: 'en' | 'ru',
  options: TTSOptions
): Promise<Blob | null> {
  const { provider, apiKey } = options

  if (provider === 'browser' || !apiKey) {
    return null // caller falls back to speechSynthesis
  }

  if (provider === 'xai') {
    return await synthesizeWithXai(text, language, apiKey)
  }

  if (provider === 'elevenlabs') {
    // Stub for now — user can add full impl easily if they prefer ElevenLabs voices
    throw new Error('ElevenLabs пока не подключен. Используйте xAI (один ключ) или браузер.')
  }

  return null
}
