import { Template } from './types'

let activeAudio: HTMLAudioElement | null = null

export type StudySequenceOptions = {
  getEnglishRepetitions: () => number
  getPlaybackRate: () => number
}

export function setActiveStudySequencePlaybackRate(rate: number) {
  if (activeAudio) activeAudio.playbackRate = rate
}

export function stopStudySequenceAudio() {
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.src = ''
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
  rate?: number
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }

    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    if (rate !== undefined) utter.rate = rate

    const onAbort = () => {
      window.speechSynthesis.cancel()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)

    const finish = () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }

    utter.onend = finish
    utter.onerror = finish
    window.speechSynthesis.speak(utter)
  })
}

function playAudioUrl(url: string, signal: AbortSignal, playbackRate: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    if (activeAudio) {
      activeAudio.pause()
      activeAudio.src = ''
    }

    const audio = new Audio(url)
    audio.playbackRate = playbackRate
    activeAudio = audio

    const onAbort = () => {
      audio.pause()
      if (activeAudio === audio) activeAudio = null
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort)

    const finish = () => {
      signal.removeEventListener('abort', onAbort)
      if (activeAudio === audio) activeAudio = null
      resolve()
    }

    audio.onended = finish
    audio.onerror = finish
    audio.play().catch(finish)
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
  await playSpeech(template.ru, 'ru-RU', signal)
  await wait(1000, signal)

  let i = 0
  while (true) {
    const repetitions = Math.min(10, Math.max(1, options.getEnglishRepetitions()))
    if (i >= repetitions) break
    await playEnglish(template, signal, options.getPlaybackRate)
    i++
    if (i < Math.min(10, Math.max(1, options.getEnglishRepetitions()))) {
      await wait(700, signal)
    }
  }

  await wait(1000, signal)
  await playSpeech(template.ru, 'ru-RU', signal)
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