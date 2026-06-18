export const GEMINI_UNAVAILABLE_RU = [
  'Серверы Google Gemini сейчас перегружены — это временно (ошибка 503).',
  'Подождите 30–60 секунд и попробуйте снова.',
  'Совет: генерируйте меньше шаблонов за раз (например 4–6) — так надёжнее.',
].join('\n')

export const GEMINI_RATE_LIMIT_RU = [
  'Слишком много запросов к Gemini (лимит).',
  'Подождите минуту и попробуйте снова, или уменьшите количество шаблонов.',
].join('\n')

export class GeminiUserError extends Error {
  readonly code?: string
  readonly retryable: boolean

  constructor(message: string, code?: string, retryable = false) {
    super(message)
    this.name = 'GeminiUserError'
    this.code = code
    this.retryable = retryable
  }
}

export function parseGeminiError(status: number, body: string): GeminiUserError {
  try {
    const json = JSON.parse(body) as {
      error?: { code?: number; message?: string; status?: string }
    }
    const err = json.error
    const statusStr = err?.status || ''
    const message = err?.message || ''

    if (status === 503 || statusStr === 'UNAVAILABLE') {
      return new GeminiUserError(GEMINI_UNAVAILABLE_RU, 'unavailable', true)
    }
    if (status === 429 || statusStr === 'RESOURCE_EXHAUSTED') {
      return new GeminiUserError(GEMINI_RATE_LIMIT_RU, 'rate_limit', true)
    }
    if (message) {
      return new GeminiUserError(`Gemini: ${message}`, statusStr || String(status))
    }
  } catch {
    // fall through
  }

  if (status === 503) {
    return new GeminiUserError(GEMINI_UNAVAILABLE_RU, 'unavailable', true)
  }
  if (status === 429) {
    return new GeminiUserError(GEMINI_RATE_LIMIT_RU, 'rate_limit', true)
  }

  const trimmed = body.trim().slice(0, 200)
  return new GeminiUserError(
    trimmed
      ? `Gemini вернул ошибку ${status}: ${trimmed}`
      : `Gemini вернул ошибку ${status}. Проверьте ключ или попробуйте позже.`
  )
}

export function isGeminiUserError(err: unknown): err is GeminiUserError {
  return err instanceof GeminiUserError
}

export function geminiToastMessage(err: unknown): string {
  if (isGeminiUserError(err)) return err.message
  if (err instanceof Error && err.message && !err.message.includes('generativelanguage.googleapis.com')) {
    return err.message
  }
  return 'Не удалось сгенерировать шаблоны через Gemini. Попробуйте ещё раз чуть позже.'
}

export function geminiToastOptions(err: unknown) {
  const retryable = isGeminiUserError(err) && err.retryable
  return {
    duration: retryable ? 12000 : Infinity,
    className: 'whitespace-pre-line !max-w-md text-sm leading-snug',
  } as const
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function withGeminiRetries<T>(
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const retryable = isGeminiUserError(err) && err.retryable
      if (!retryable || attempt >= maxAttempts - 1) break
      await sleep(1200 * (attempt + 1))
    }
  }
  throw lastErr
}