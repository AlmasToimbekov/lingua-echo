import { openDB, DBSchema, IDBPDatabase } from 'idb'

interface AudioRecord {
  buffer: ArrayBuffer
  contentType: string
  updatedAt: number
}

interface LinguaEchoDB extends DBSchema {
  audio: {
    key: string // `${templateId}:${lang}`
    value: AudioRecord
  }
}

let dbPromise: Promise<IDBPDatabase<LinguaEchoDB>> | null = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB<LinguaEchoDB>('lingua-echo-audio', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('audio')) {
          db.createObjectStore('audio')
        }
      },
    })
  }
  return dbPromise
}

const makeKey = (templateId: string, lang: 'en' | 'ru') => `${templateId}:${lang}`

export async function saveAudioBuffer(
  templateId: string,
  lang: 'en' | 'ru',
  buffer: ArrayBuffer,
  contentType = 'audio/mpeg'
) {
  const db = await getDB()
  const key = makeKey(templateId, lang)
  await db.put('audio', { buffer, contentType, updatedAt: Date.now() }, key)
}

export async function loadAudioBuffer(
  templateId: string,
  lang: 'en' | 'ru'
): Promise<{ buffer: ArrayBuffer; contentType: string } | null> {
  const db = await getDB()
  const key = makeKey(templateId, lang)
  const record = await db.get('audio', key)
  return record ? { buffer: record.buffer, contentType: record.contentType } : null
}

export async function deleteAudioForTemplate(templateId: string) {
  const db = await getDB()
  const tx = db.transaction('audio', 'readwrite')
  await tx.store.delete(makeKey(templateId, 'en'))
  await tx.store.delete(makeKey(templateId, 'ru'))
  await tx.done
}

export async function clearAllAudio() {
  const db = await getDB()
  await db.clear('audio')
}

/**
 * Helper: given a stored buffer (or null), return a fresh object URL (or undefined).
 * The caller is responsible for revoking the URL when no longer needed.
 */
export function createObjectUrlFromBuffer(
  loaded: { buffer: ArrayBuffer; contentType: string } | null
): string | undefined {
  if (!loaded) return undefined
  const blob = new Blob([loaded.buffer], { type: loaded.contentType })
  return URL.createObjectURL(blob)
}