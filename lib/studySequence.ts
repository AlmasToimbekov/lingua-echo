import { Template } from './types'
import { isIOS, speakText } from './speechPlayback'

let activeAudio: HTMLAudioElement | null = null
let sharedAudio: HTMLAudioElement | null = null

// Tiny silent MP3 — played during the user tap to unlock iOS chained audio playback.
const SILENT_MP3 =
  'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAHAAGf9AAAIAAANIAAAAQAAAaQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQxAADwAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV'

export type StudySequenceOptions = {
  getEnglishRepetitions: () => number
  getPlaybackRate: () => number
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
  const audio = getSharedAudio()
  audio.src = SILENT_MP3
  audio.play().catch(() => {})
  audio.pause()
  audio.currentTime = 0
}

export function setActiveStudySequencePlaybackRate(rate: number) {
  if (activeAudio) activeAudio.playbackRate = rate
}

export function stopStudySequenceAudio() {
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.removeAttribute('src')
    activeAudio.load()
    activeAudio = null
  }
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

function playAudioUrl(url: string, signal: AbortSignal, playbackRate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const audio = getSharedAudio()
    activeAudio = audio

    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      audio.onended = null
      audio.onerror = null
      audio.oncanplaythrough = null
      if (activeAudio === audio) activeAudio = null
      resolve()
    }

    const onAbort = () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      if (activeAudio === audio) activeAudio = null
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)

    const attemptPlay = (attempt = 0) => {
      if (signal.aborted || settled) return
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
  const rate = getPlaybackRate()
  if (template.enAudioUrl) {
    return playAudioUrl(template.enAudioUrl, signal, rate)
  }
  return playSpeech(template.en, 'en-US', signal, rate)
}

async function playTemplateSteps(
  template: Template,
  signal: AbortSignal,
  options: StudySequenceOptions
) {
  const getRate = options.getPlaybackRate

  await playSpeech(template.ru, 'ru-RU', signal, getRate())
  await wait(1000, signal)

  let i = 0
  while (true) {
    const repetitions = Math.min(10, Math.max(1, options.getEnglishRepetitions()))
    if (i >= repetitions) break
    await playEnglish(template, signal, getRate)
    i++
    if (i < Math.min(10, Math.max(1, options.getEnglishRepetitions()))) {
      await wait(700, signal)
    }
  }

  await wait(1000, signal)
  await playSpeech(template.ru, 'ru-RU', signal, getRate())
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
    const template = templates[index]
    onTemplateChange(template.id)
    await playTemplateSteps(template, signal, options)
    index = (index + 1) % templates.length
  }
}