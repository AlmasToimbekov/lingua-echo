// xAI (Grok) client — content generation + TTS
// Uses user's own API key (never stored on server in MVP)

const XAI_BASE = 'https://api.x.ai/v1'

export interface GeneratedTemplate {
  en: string
  ru: string
}

export async function generateTemplates(params: {
  topic: string
  maxWords: number
  count: number
  apiKey: string
}): Promise<GeneratedTemplate[]> {
  const { topic, maxWords, count, apiKey } = params
  if (!apiKey) throw new Error('Нужен ключ xAI')

  const system = `You are an expert designer of spoken American English learning materials for Russian-speaking children and families.

Generate ONLY natural, high-frequency, idiomatic English sentences that real native speakers (kids + parents) actually use in everyday life.

Prioritize:
- contractions and natural rhythm
- common collocations and request patterns
- short-to-medium length sentences (respect the max word count)
- warm, friendly tone suitable for children

For each item also provide a natural, accurate, warm Russian translation that a child would easily understand.

Return STRICTLY a JSON array with exactly ${count} objects and nothing else:
[{"en": "...", "ru": "..."}, ...]
No explanations, no markdown, no extra keys.`

  const user = `Topic / situation: ${topic}
Maximum words per English sentence: ${maxWords}
Number of templates: ${count}
Focus on frequent spoken patterns for daily family and child life.`

  const res = await fetch(`${XAI_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-4.3',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.7,
      max_tokens: 1200,
    }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`xAI chat error: ${res.status} ${text}`)
  }

  const data = await res.json()
  const content: string = data.choices?.[0]?.message?.content || ''

  // Robust parse — the model sometimes adds ```json or extra text
  let jsonText = content.trim()
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/```json|```/g, '').trim()
  }

  let parsed: GeneratedTemplate[]
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    // fallback: try to extract array
    const match = jsonText.match(/\[[\s\S]*\]/)
    if (match) parsed = JSON.parse(match[0])
    else throw new Error('Не удалось распарсить ответ Grok. Попробуйте ещё раз.')
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Grok вернул пустой список. Измените тему или количество.')
  }

  // Light validation + trim
  return parsed.slice(0, count).map((p: any) => ({
    en: String(p.en || '').trim(),
    ru: String(p.ru || '').trim(),
  })).filter(p => p.en && p.ru)
}

export async function synthesizeWithXai(text: string, language: 'en' | 'ru', apiKey: string): Promise<Blob> {
  if (!apiKey) throw new Error('Нужен ключ xAI для озвучки')

  // Good default voices from xAI examples/docs (eve is friendly). User can later choose others.
  const voiceId = language === 'en' ? 'eve' : 'eve' // same or different voice; xAI will handle language

  const res = await fetch(`${XAI_BASE}/tts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      language,
      // output_format defaults to mp3 in most cases
    }),
  })

  if (!res.ok) {
    const textErr = await res.text().catch(() => '')
    throw new Error(`xAI TTS error: ${res.status} ${textErr}`)
  }

  return await res.blob()
}
