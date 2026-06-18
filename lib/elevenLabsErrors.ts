const ELEVEN_SUBSCRIPTION_URL = 'https://elevenlabs.io/app/subscription'

export const ELEVEN_PAID_PLAN_RU_MESSAGE = [
  'Ключ ElevenLabs есть, но бесплатный аккаунт не может озвучивать через API — нужен платный план.',
  '',
  'Самый дешёвый: Starter — $6/мес (30 000 кредитов, клонирование голоса и др.).',
  'Привяжите карту и выберите план на сайте ElevenLabs.',
  '',
  'Лайфхак: после активации можно отменить Starter и перейти на «Pay as you go» —',
  'тогда каждый месяц дают 10 000 кредитов бесплатно. Для семейной практики этого обычно хватает.',
  '',
  `Тарифы: ${ELEVEN_SUBSCRIPTION_URL}`,
].join('\n')

export class ElevenLabsUserError extends Error {
  readonly code?: string

  constructor(message: string, code?: string) {
    super(message)
    this.name = 'ElevenLabsUserError'
    this.code = code
  }
}

export function parseElevenLabsError(status: number, body: string): ElevenLabsUserError {
  try {
    const json = JSON.parse(body) as {
      detail?: string | { code?: string; message?: string; type?: string }
    }
    const detail = json.detail

    if (detail && typeof detail === 'object') {
      if (detail.code === 'paid_plan_required' || detail.type === 'payment_required') {
        return new ElevenLabsUserError(ELEVEN_PAID_PLAN_RU_MESSAGE, 'paid_plan_required')
      }
      if (detail.message) {
        return new ElevenLabsUserError(
          `ElevenLabs: ${detail.message}`,
          detail.code
        )
      }
    }

    if (typeof detail === 'string' && detail.trim()) {
      return new ElevenLabsUserError(`ElevenLabs: ${detail}`)
    }
  } catch {
    // fall through
  }

  const trimmed = body.trim()
  if (trimmed) {
    return new ElevenLabsUserError(`ElevenLabs (ошибка ${status}): ${trimmed.slice(0, 240)}`)
  }

  return new ElevenLabsUserError(`ElevenLabs вернул ошибку ${status}. Проверьте ключ и тариф.`)
}

export function isElevenLabsUserError(err: unknown): err is ElevenLabsUserError {
  return err instanceof ElevenLabsUserError
}

export function elevenLabsToastMessage(err: unknown): string {
  if (isElevenLabsUserError(err)) return err.message
  if (err instanceof Error && err.message) return err.message
  return 'Не удалось получить озвучку от ElevenLabs.'
}

export function elevenLabsToastOptions(err: unknown) {
  const paid = isElevenLabsUserError(err) && err.code === 'paid_plan_required'
  return {
    duration: paid ? Infinity : 14000,
    className: 'whitespace-pre-line !max-w-md text-sm leading-snug',
  } as const
}