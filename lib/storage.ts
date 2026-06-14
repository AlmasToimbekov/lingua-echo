import { Template } from './types'

const TEMPLATES_KEY = 'lingua-echo:templates'

export function loadTemplates(): Template[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Template[]
    // Only keep valid shape
    return parsed.filter((t) => t && typeof t.id === 'string' && t.en && t.ru)
  } catch {
    return []
  }
}

export function saveTemplates(templates: Template[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates))
  } catch {
    // ignore quota / private mode errors
  }
}

// Revoke any object URLs that are no longer used (call when replacing deck)
export function revokeUnusedAudioUrls(
  oldTemplates: Template[],
  newTemplates: Template[]
) {
  const newUrls = new Set<string>()
  newTemplates.forEach((t) => {
    if (t.enAudioUrl) newUrls.add(t.enAudioUrl)
    if (t.ruAudioUrl) newUrls.add(t.ruAudioUrl)
  })

  oldTemplates.forEach((t) => {
    if (t.enAudioUrl && !newUrls.has(t.enAudioUrl)) {
      try { URL.revokeObjectURL(t.enAudioUrl) } catch {}
    }
    if (t.ruAudioUrl && !newUrls.has(t.ruAudioUrl)) {
      try { URL.revokeObjectURL(t.ruAudioUrl) } catch {}
    }
  })
}
