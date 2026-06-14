// Unified TTS layer for MVP.
// Primary: ElevenLabs (natural voices for EN Am + RU).
// Fallback: browser speechSynthesis.

export type TTSProvider = 'elevenlabs' | 'browser'

export interface TTSOptions {
  provider: TTSProvider
  apiKey?: string
  voiceId?: string // optional override
}

const DEFAULT_ELEVEN_VOICE = '21m00Tcm4TlvDq8ikWAM' // Rachel — excellent natural American English, works well multilingual

export async function generateAudio(
  text: string,
  language: 'en' | 'ru',
  options: TTSOptions
): Promise<Blob | null> {
  const { provider, apiKey, voiceId } = options

  if (provider === 'browser' || !apiKey) {
    return null // caller falls back to speechSynthesis
  }

  if (provider === 'elevenlabs') {
    const vid = voiceId || DEFAULT_ELEVEN_VOICE
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2', // good quality + supports Russian
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0
        }
      })
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`ElevenLabs TTS error: ${res.status} ${errText}`)
    }

    return await res.blob()
  }

  return null
}
