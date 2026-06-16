export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  )
}

export function speakText(
  text: string,
  lang: string,
  signal?: AbortSignal,
  rate = 1
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    if (!('speechSynthesis' in window)) {
      resolve()
      return
    }

    const synth = window.speechSynthesis
    synth.cancel()
    synth.resume()

    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang
    utter.rate = rate

    let settled = false
    let pollId: ReturnType<typeof setInterval> | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      if (pollId !== undefined) clearInterval(pollId)
      if (timeoutId !== undefined) clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
    }

    const finish = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve()
    }

    const fail = () => {
      if (settled) return
      settled = true
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }

    const onAbort = () => {
      synth.cancel()
      fail()
    }
    signal?.addEventListener('abort', onAbort)

    utter.onend = finish
    utter.onerror = finish

    // iOS/WebKit often never fires onend — poll speaking state as a backup.
    let sawSpeaking = false
    pollId = setInterval(() => {
      const speaking = synth.speaking || synth.pending
      if (speaking) sawSpeaking = true
      if (sawSpeaking && !speaking) {
        setTimeout(finish, isIOS() ? 180 : 60)
      }
    }, isIOS() ? 220 : 120)

    timeoutId = setTimeout(finish, Math.max(20000, text.length * 350))

    synth.speak(utter)
  })
}