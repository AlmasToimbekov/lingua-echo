// Google Gemini client for template generation (free tier friendly)
// Requires user API key from https://aistudio.google.com/app/apikey

import { parseGeminiError, withGeminiRetries } from './geminiErrors'

const GEMINI_API_VERSION = 'v1beta'
const GEMINI_MODEL = 'gemini-2.5-flash'
const CHUNK_SIZE = 4

export interface GeneratedTemplate {
  en: string
  ru: string
}

export type GenerateTemplatesResult = {
  items: GeneratedTemplate[]
  requested: number
  partial: boolean
}

/**
 * Helper you can call from the browser console or temporarily from code
 * to see exactly which models your Gemini key can use.
 */
export async function listAvailableModels(apiKey: string) {
  const url = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url)
  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw parseGeminiError(res.status, err)
  }
  const data = await res.json()
  const models = (data.models || []).map((m: any) => ({
    name: m.name?.replace('models/', ''),
    displayName: m.displayName,
    supportsGenerateContent: (m.supportedGenerationMethods || m.supportedMethods || []).includes('generateContent'),
  }))

  console.log(`Available Gemini models (using ${GEMINI_API_VERSION}):`)
  console.table(models)

  const usable = models.filter((m: any) => m.supportsGenerateContent)
  if (usable.length > 0) {
    console.log('%cRecommended models for generateTemplates (copy the "name"):', 'color:#166534', usable.map((u: any) => u.name))
  }

  return data
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).listGeminiModels = listAvailableModels
  console.info('[LinguaEcho] For debugging Gemini keys, use the "Показать доступные модели" button in Settings, or in the console: listGeminiModels("YOUR_GEMINI_KEY")')
}

async function callGeminiOnce(params: {
  topic: string
  maxWords: number
  count: number
  apiKey: string
  isAdult?: boolean
  avoidEn?: string[]
}): Promise<GeneratedTemplate[]> {
  const { topic, maxWords, count, apiKey, isAdult = false, avoidEn = [] } = params
  if (!apiKey) throw new Error('Нужен ключ Google Gemini для генерации шаблонов')

  const system = isAdult
    ? `You are an expert designer of spoken American English learning materials for Russian-speaking adults.

Your ONLY job is to output a valid JSON array. Think as little as possible.

Generate ONLY natural, high-frequency, idiomatic English sentences that real native speakers actually use in everyday adult life (social interactions, work, travel, relationships, daily routines, requests, small talk, etc.).

Rules:
- Use contractions, natural rhythm, common collocations and adult vocabulary where appropriate.
- Keep sentences max ${maxWords} words each.
- Natural, conversational but slightly more sophisticated tone suitable for adults.
- For each, provide a natural, accurate Russian translation an adult understands.
- Output EXACTLY ${count} items.
- All items must be different from each other and from any "avoid" list.

Output format — NOTHING ELSE:
[{"en":"...","ru":"..."}, ...]

Return a complete, valid JSON array and stop. Do not add commentary, markdown, or trailing text.`
    : `You are an expert designer of spoken American English learning materials for Russian-speaking children and families.

Your ONLY job is to output a valid JSON array. Think as little as possible.

Generate ONLY natural, high-frequency, idiomatic English sentences that real native speakers actually use in everyday life.

Rules:
- Use contractions, natural rhythm, common collocations.
- Keep sentences max ${maxWords} words each.
- Warm, friendly tone for children.
- For each, provide a natural, accurate Russian translation a child understands.
- Output EXACTLY ${count} items.
- All items must be different from each other and from any "avoid" list.

Output format — NOTHING ELSE:
[{"en":"...","ru":"..."}, ...]

Return a complete, valid JSON array and stop. Do not add commentary, markdown, or trailing text.`

  const avoidBlock =
    avoidEn.length > 0
      ? `\nDo NOT repeat or closely paraphrase these English sentences:\n${avoidEn.map((s) => `- ${s}`).join('\n')}`
      : ''

  const user = isAdult
    ? `Topic / situation: ${topic}
Maximum words per English sentence: ${maxWords}
Number of templates: ${count}
Focus on frequent spoken patterns for daily adult life in American English.${avoidBlock}`
    : `Topic / situation: ${topic}
Maximum words per English sentence: ${maxWords}
Number of templates: ${count}
Focus on frequent spoken patterns for daily family and child life in American English.${avoidBlock}`

  const url = `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [{ text: system + '\n\n' + user }]
      }],
      generationConfig: {
        temperature: 0.5,
        maxOutputTokens: 2048,
        thinkingConfig: {
          thinkingBudget: 512
        }
      }
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw parseGeminiError(res.status, text)
  }

  const data = await res.json()
  const candidate = data?.candidates?.[0]
  const text: string = candidate?.content?.parts?.[0]?.text || ''
  const finishReason = candidate?.finishReason

  if (finishReason === 'MAX_TOKENS') {
    throw new Error(
      'Gemini обрезал ответ (MAX_TOKENS). Попробуйте уменьшить количество шаблонов за раз или упростить тему.'
    )
  }

  if (!text) throw new Error('Gemini не вернул текст ответа')

  let jsonText = text.trim()
  jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```$/, '').trim()

  let parsed: GeneratedTemplate[]
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    const match = jsonText.match(/\[[\s\S]*\]/)
    if (match) {
      try {
        parsed = JSON.parse(match[0])
      } catch {
        throw new Error('Не удалось распарсить обрезанный JSON от Gemini. Уменьшите количество за раз.')
      }
    } else {
      throw new Error('Gemini вернул не-JSON. Попробуйте другую тему или меньшее количество.')
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error('Gemini вернул пустой или неверный список. Попробуйте другие параметры генерации.')
  }

  return parsed.slice(0, count).map((p: any) => ({
    en: String(p.en || '').trim(),
    ru: String(p.ru || '').trim()
  })).filter((p) => p.en && p.ru)
}

/**
 * Generates templates in small batches with retries — partial results are kept if a later batch fails.
 */
export async function generateTemplates(params: {
  topic: string
  maxWords: number
  count: number
  apiKey: string
  isAdult?: boolean
  /** Existing English sentences to avoid duplicating (e.g. templates already in the deck). */
  avoidEn?: string[]
}): Promise<GenerateTemplatesResult> {
  const { count, avoidEn: existingAvoidEn = [] } = params
  const all: GeneratedTemplate[] = []
  let remaining = count
  let partial = false

  while (remaining > 0) {
    const chunkCount = Math.min(CHUNK_SIZE, remaining)
    const avoidEn = Array.from(new Set([...existingAvoidEn, ...all.map((t) => t.en)]))

    try {
      const chunk = await withGeminiRetries(() =>
        callGeminiOnce({ ...params, count: chunkCount, avoidEn })
      )
      all.push(...chunk)
      remaining -= chunkCount

      if (chunk.length < chunkCount) {
        partial = true
        break
      }
    } catch (err) {
      if (all.length > 0) {
        partial = true
        break
      }
      throw err
    }
  }

  if (all.length < count) partial = true

  return {
    items: all.slice(0, count),
    requested: count,
    partial,
  }
}