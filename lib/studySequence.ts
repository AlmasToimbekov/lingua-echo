import { Template } from './types'
import { attachSeedAudio } from './seedAudio'
import { isIOS, speakText } from './speechPlayback'

let activeAudio: HTMLAudioElement | null = null
let sharedAudio: HTMLAudioElement | null = null
let unlockAudio: HTMLAudioElement | null = null
let activeClipLang: 'en' | 'ru' | null = null

// Tiny silent MP3 — unlock only, never used for real playback (avoids iOS volume ramp).
const SILENT_MP3 =
  'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAHAAGf9AAAIAAANIAAAAQAAAaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'

export type StudySequenceOptions = {
  getEnglishRepetitions: () => number
  getEnglishPlaybackRate: () => number
  getRussianPlaybackRate: () => number
}

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = document.createElement('audio')
    sharedAudio.setAttribute('playsinline', 'true')
    sharedAudio.setAttribute('webkit-playsinline', 'true')
    sharedAudio.preload = 'auto'
  }
  return sharedAudio
}

/** Call synchronously inside the user tap that starts folder training (unlocks iOS audio). */
export function primeStudySequenceAudio() {
  if (typeof window === 'undefined') return
  if (!unlockAudio) {
    unlockAudio = document.createElement('audio')
    unlockAudio.setAttribute('playsinline', 'true')
    unlockAudio.setAttribute('webkit-playsinline', 'true')
  }
  unlockAudio.volume = 0.001
  unlockAudio.muted = false
  unlockAudio.src = SILENT_MP3
  unlockAudio.play().catch(() => {})
}

export function setActiveStudySequenceEnglishRate(rate: number) {
  if (activeAudio && activeClipLang === 'en') activeAudio.playbackRate = rate
}

export function setActiveStudySequenceRussianRate(rate: number) {
  if (activeAudio && activeClipLang === 'ru') activeAudio.playbackRate = rate
}

export function stopStudySequenceAudio() {
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.removeAttribute('src')
    activeAudio.load()
    activeAudio = null
  }
  activeClipLang = null
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)
  })
}

function playSpeech(
  text: string,
  lang: string,
  signal: AbortSignal,
  rate: number
): Promise<void> {
  return speakText(text, lang, signal, rate)
}

function playAudioUrl(
  url: string,
  signal: AbortSignal,
  playbackRate: number,
  lang: 'en' | 'ru'
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const audio = getSharedAudio()
    activeAudio = audio
    activeClipLang = lang

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      audio.onended = null
      audio.onerror = null
      audio.oncanplaythrough = null
      if (activeAudio === audio) {
        activeAudio = null
        activeClipLang = null
      }
      resolve()
    }

    const onAbort = () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      if (activeAudio === audio) {
        activeAudio = null
        activeClipLang = null
      }
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)

    const attemptPlay = (attempt = 0) => {
      if (signal.aborted || settled) return
      audio.volume = 1
      audio.muted = false
      audio.playbackRate = playbackRate
      audio
        .play()
        .catch(() => {
          if (attempt < 4) {
            setTimeout(() => attemptPlay(attempt + 1), isIOS() ? 120 : 60)
          } else {
            finish()
          }
        })
    }

    const startWhenReady = () => {
      audio.oncanplaythrough = null
      attemptPlay()
    }

    audio.onended = finish
    audio.onerror = finish

    audio.pause()
    audio.currentTime = 0
    audio.volume = 1
    audio.muted = false
    audio.src = url
    audio.load()

    if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      startWhenReady()
    } else {
      audio.oncanplaythrough = startWhenReady
    }
  })
}

function playEnglish(
  template: Template,
  signal: AbortSignal,
  getPlaybackRate: () => number
): Promise<void> {
  const resolved = attachSeedAudio(template)
  const rate = getPlaybackRate()
  if (resolved.enAudioUrl) {
    return playAudioUrl(resolved.enAudioUrl, signal, rate, 'en')
  }
  return playSpeech(resolved.en, 'en-US', signal, rate)
}

function playRussian(
  template: Template,
  signal: AbortSignal,
  getPlaybackRate: () => number
): Promise<void> {
  const resolved = attachSeedAudio(template)
  const rate = getPlaybackRate()
  if (resolved.ruAudioUrl) {
    return playAudioUrl(resolved.ruAudioUrl, signal, rate, 'ru')
  }
  return playSpeech(resolved.ru, 'ru-RU', signal, rate)
}

async function playTemplateSteps(
  template: Template,
  signal: AbortSignal,
  options: StudySequenceOptions
) {
  await playRussian(template, signal, options.getRussianPlaybackRate)
  await wait(1000, signal)

  let i = 0
  while (true) {
    const repetitions = Math.min(10, Math.max(1, options.getEnglishRepetitions()))
    if (i >= repetitions) break
    await playEnglish(template, signal, options.getEnglishPlaybackRate)
    i++
    if (i < Math.min(10, Math.max(1, options.getEnglishRepetitions()))) {
      await wait(700, signal)
    }
  }

  await wait(1000, signal)
  await playRussian(template, signal, options.getRussianPlaybackRate)
  await wait(1500, signal)
}

export async function runStudySequence(
  templates: Template[],
  startIndex: number,
  onTemplateChange: (id: string) => void,
  signal: AbortSignal,
  options: StudySequenceOptions
): Promise<void> {
  if (templates.length === 0) return

  let index = Math.max(0, Math.min(startIndex, templates.length - 1))

  while (!signal.aborted) {
    const template = attachSeedAudio(templates[index])
    onTemplateChange(template.id)
    await playTemplateSteps(template, signal, options)
    index = (index + 1) % templates.length
  }
}