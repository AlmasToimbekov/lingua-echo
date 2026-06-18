import { Template } from './types'

const SEED_ID_RE = /^seed-(\d+)$/

export function getSeedIndex(templateId: string): number | null {
  const match = templateId.match(SEED_ID_RE)
  if (!match) return null
  const index = Number(match[1])
  return index >= 1 && index <= 99 ? index : null
}

export function isSeedTemplate(templateId: string): boolean {
  return getSeedIndex(templateId) !== null
}

export function isBundledSeedAudioUrl(url?: string): boolean {
  return !!url && url.startsWith('/seed-audio/')
}

/** User-regenerated or generated audio — must not be replaced by bundled seed files. */
export function isCustomAudioUrl(url?: string): boolean {
  return !!url && !isBundledSeedAudioUrl(url)
}

function resolveSeedAudioUrls(template: Template): { en?: string; ru?: string } {
  const paths = getSeedAudioPaths(template.id)
  return {
    en: isCustomAudioUrl(template.enAudioUrl) ? template.enAudioUrl : paths?.en,
    ru: isCustomAudioUrl(template.ruAudioUrl) ? template.ruAudioUrl : paths?.ru,
  }
}

/** Static public paths — browser loads the file only when the player needs it. */
export function getSeedAudioPaths(templateId: string): { en: string; ru: string } | null {
  const index = getSeedIndex(templateId)
  if (index === null) return null
  const file = String(index).padStart(2, '0') + '.mp3'
  return {
    en: `/seed-audio/en/${file}`,
    ru: `/seed-audio/ru/${file}`,
  }
}

export function attachSeedAudio(template: Template): Template {
  const paths = getSeedAudioPaths(template.id)
  if (!paths) return template
  return {
    ...template,
    enAudioUrl: paths.en,
    ruAudioUrl: paths.ru,
  }
}

export function detachBundledSeedAudio(template: Template): Template {
  if (!isSeedTemplate(template.id)) return template
  if (!isBundledSeedAudioUrl(template.enAudioUrl) && !isBundledSeedAudioUrl(template.ruAudioUrl)) {
    return template
  }
  return {
    ...template,
    enAudioUrl: isBundledSeedAudioUrl(template.enAudioUrl) ? undefined : template.enAudioUrl,
    ruAudioUrl: isBundledSeedAudioUrl(template.ruAudioUrl) ? undefined : template.ruAudioUrl,
  }
}

/** Keep audio attached only for the current template and immediate neighbors. */
export function applyLazySeedAudio(
  templates: Template[],
  orderedIds: string[],
  activeId: string
): Template[] {
  if (!activeId) return templates

  const centerIdx = orderedIds.indexOf(activeId)
  const loadIds = new Set<string>()
  if (centerIdx >= 0) {
    loadIds.add(orderedIds[centerIdx])
    if (centerIdx > 0) loadIds.add(orderedIds[centerIdx - 1])
    if (centerIdx < orderedIds.length - 1) loadIds.add(orderedIds[centerIdx + 1])
  } else {
    loadIds.add(activeId)
  }

  let changed = false
  const next = templates.map((t) => {
    if (!isSeedTemplate(t.id)) return t

    if (loadIds.has(t.id)) {
      const { en, ru } = resolveSeedAudioUrls(t)
      if (t.enAudioUrl === en && t.ruAudioUrl === ru) return t
      changed = true
      return { ...t, enAudioUrl: en, ruAudioUrl: ru }
    }

    const nextEn = isBundledSeedAudioUrl(t.enAudioUrl) ? undefined : t.enAudioUrl
    const nextRu = isBundledSeedAudioUrl(t.ruAudioUrl) ? undefined : t.ruAudioUrl
    if (t.enAudioUrl === nextEn && t.ruAudioUrl === nextRu) return t
    changed = true
    return { ...t, enAudioUrl: nextEn, ruAudioUrl: nextRu }
  })

  return changed ? next : templates
}