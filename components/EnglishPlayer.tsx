'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Play, Pause, Trash2 } from 'lucide-react'

interface EnglishPlayerProps {
  audioUrl?: string
  fallbackText: string // for browser speechSynthesis when no audioUrl
  onRegenerate?: () => void
}

export function EnglishPlayer({ audioUrl, fallbackText, onRegenerate }: EnglishPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<any>(null)

  // Remember the position at the moment we started playback (or the region start).
  // On pause we seek back there. This gives "restart the clip from where we began this play session".
  const lastPlayPositionRef = useRef<number | null>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [hasRegion, setHasRegion] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)

  // Use a ref so the region-out listener always sees the latest loop state
  // without causing the entire wavesurfer instance to be re-created on every toggle.
  const isLoopingRef = useRef(isLooping)
  useEffect(() => {
    isLoopingRef.current = isLooping
  }, [isLooping])

  // Fallback using Web Speech API (for seeds before keys / audio generated)
  const speakFallback = useCallback((rate = 1) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(fallbackText)
    utter.lang = 'en-US'
    utter.rate = rate
    utter.onend = () => setIsPlaying(false)
    window.speechSynthesis.speak(utter)
    setIsPlaying(true)
  }, [fallbackText])

  const stopFallback = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
  }, [])

  // Main wavesurfer setup (only when we have real audioUrl)
  useEffect(() => {
    // Always destroy any previous instance first (prevents double-destroy / stale ws errors in dev + strict mode).
    if (wsRef.current) {
      try { wsRef.current.destroy() } catch {}
      wsRef.current = null
      regionsRef.current = null
    }

    if (!audioUrl || !containerRef.current) {
      setUsingFallback(true)
      return
    }

    setUsingFallback(false)

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: '#6366f1',
      progressColor: '#4338ca',
      height: 72,
      barWidth: 2.5,
      barGap: 1.5,
      cursorColor: '#312e81',
      dragToSeek: false,
      minPxPerSec: 40,
    })

    wsRef.current = ws

    const regions = ws.registerPlugin(
      (RegionsPlugin as any).create({
        dragSelection: true,
        color: 'rgba(99, 102, 241, 0.4)',
      })
    )
    regionsRef.current = regions

    ws.load(audioUrl).catch((err: any) => {
      if (err && (err.name === 'AbortError' || /aborted|signal/i.test(String(err)))) return
      console.warn('WaveSurfer load:', err)
    })

    ws.on('ready', () => {
      setDuration(ws.getDuration())
    })

    ws.on('timeupdate', (time: number) => {
      setCurrentTime(time)
    })

    ws.on('play', () => setIsPlaying(true))
    ws.on('pause', () => setIsPlaying(false))
    ws.on('finish', () => {
      setIsPlaying(false)
      lastPlayPositionRef.current = null
    })

    // Region loop support — use ref so toggling loop doesn't recreate the whole wavesurfer.
    regions.on('region-out', (region: any) => {
      if (isLoopingRef.current) {
        region.play()
      }
    })

    regions.on('region-created', (region: any) => {
      setHasRegion(true)
      if (region) { try { region.drag = true; region.resize = true } catch {} }
    })
    regions.on('region-removed', () => setHasRegion(false))

    return () => {
      // Safe cleanup: only destroy if this instance is still the current one.
      if (wsRef.current === ws) {
        try { ws.destroy() } catch {}
        wsRef.current = null
        regionsRef.current = null
      }
    }
  }, [audioUrl])

  const togglePlay = () => {
    if (usingFallback) {
      if (isPlaying) {
        stopFallback()
      } else {
        speakFallback(playbackRate)
      }
      return
    }

    const ws = wsRef.current
    if (!ws) return

    if (isPlaying) {
      ws.pause()
      // On user-initiated pause: return the cursor to where this playback session started.
      // For a region this means the region start (great for repeating a clip cleanly).
      // For full audio it means the position you were at when you hit play.
      const startPos = lastPlayPositionRef.current ?? 0
      ws.seekTo(startPos / (duration || 1))
      setCurrentTime(startPos)
      lastPlayPositionRef.current = null
      return
    }

    // Remember where we are right now — this becomes the "previous position" for the pause-to-rewind behavior.
    lastPlayPositionRef.current = ws.getCurrentTime()

    // If a region is selected, the main play button plays the selected region
    // (instead of the whole audio). User can clear the region with trash if they
    // want to play the full phrase.
    const regions = regionsRef.current
    if (regions && hasRegion) {
      const all = regions.getRegions ? regions.getRegions() : []
      const last = all.length > 0 ? all[all.length - 1] : null
      if (last && last.play) {
        // For region playback, the "start of this session" is the region start.
        lastPlayPositionRef.current = last.start
        last.play()
        setIsPlaying(true)
        return
      }
    }

    ws.play()
  }

  const seekTo = (time: number) => {
    const ws = wsRef.current
    if (ws) ws.seekTo(time / (duration || 1))
  }

  const changeRate = (rate: number) => {
    setPlaybackRate(rate)
    const ws = wsRef.current
    if (ws) ws.setPlaybackRate(rate)
    // For fallback we apply on next speak
  }

  // NEW: discrete skip controls requested by user (waveform clicks alone felt insufficient for control)
  const skip = (seconds: number) => {
    if (usingFallback) {
      // SpeechSynthesis is one-shot; we can't easily seek mid-utterance.
      // Restarting would lose context for the child, so we simply do nothing or could re-speak from start.
      // For now, keep silent (buttons will only be useful with real audioUrl).
      return
    }
    const ws = wsRef.current
    if (!ws || !duration) return
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds))
    ws.seekTo(newTime / duration)
  }

  const goToStart = () => {
    if (usingFallback) {
      stopFallback()
      return
    }
    const ws = wsRef.current
    if (ws) {
      ws.pause()
      ws.seekTo(0)
      setCurrentTime(0)
      setIsPlaying(false)
    }
  }

  const toggleLoop = () => {
    const newLoop = !isLooping
    setIsLooping(newLoop)
    // If turning off while playing a region, just continue
  }

  const clearRegion = () => {
    const regions = regionsRef.current
    if (regions) {
      const list = regions.getRegions ? regions.getRegions() : []
      list.forEach((r: any) => r.remove && r.remove())
      setHasRegion(false)
      setIsLooping(false)
    }
  }

  const addRegionFirstSeconds = (secs: number) => {
    const ws = wsRef.current
    const regs = regionsRef.current
    if (!ws || !regs || !duration) return

    const start = 0
    const end = Math.min(secs, duration)

    const existing = regs.getRegions ? regs.getRegions() : []
    existing.forEach((r: any) => r.remove && r.remove())

    regs.addRegion({
      start,
      end,
      color: 'rgba(99, 102, 241, 0.45)',
      resize: true,
      drag: true,
    })
    setHasRegion(true)
  }

  const formatTime = (t: number) => {
    const m = Math.floor(t / 60)
    const s = Math.floor(t % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-widest text-indigo-600/70">
        <div>АНГЛИЙСКАЯ ОЗВУЧКА — американский английский</div>
        {usingFallback && (
          <div className="rounded bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
            ДЕМО (браузерный голос)
          </div>
        )}
      </div>

      {/* Elongated visual player area */}
      <div
        ref={containerRef}
        className="w-full overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-inner"
        style={{ minHeight: usingFallback ? 72 : 88 }}
      />

      {!usingFallback && !audioUrl && (
        <div className="mt-2 text-center text-sm text-zinc-500">Аудио появится после генерации</div>
      )}

      {/* Controls bar - long and prominent */}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white shadow hover:bg-indigo-700 active:bg-indigo-800"
          aria-label={isPlaying ? 'Пауза' : 'Воспроизвести'}
        >
          {isPlaying ? <Pause size={22} /> : <Play size={22} className="ml-0.5" />}
        </button>

        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 text-sm tabular-nums text-zinc-600">
            <span>{formatTime(currentTime)}</span>
            <span className="text-zinc-400">/</span>
            <span>{formatTime(duration || 0)}</span>
          </div>
        </div>

        {/* NEW skip controls: user requested because clicking the waveform alone didn't provide reliable control */}
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-1 text-xs">
          <button
            onClick={goToStart}
            className="rounded px-2 py-1 hover:bg-zinc-100 active:bg-zinc-200"
            title="В самое начало"
          >
            |&lt;&lt;
          </button>
          {[-1, -3, -5].map((d) => (
            <button
              key={d}
              onClick={() => skip(d)}
              className="rounded px-2 py-1 hover:bg-zinc-100 active:bg-zinc-200"
              title={`Назад на ${Math.abs(d)} секунд`}
            >
              -{Math.abs(d)}s
            </button>
          ))}
        </div>

        {/* Speed controls - enlarged for children (bigger tap targets). Tighter on mobile to avoid overflow. */}
        <div className="flex items-center gap-1 rounded-xl border border-indigo-200 bg-white p-1 text-xs sm:gap-2 sm:p-1.5 sm:text-sm">
          {[0.6, 0.75, 1, 1.25, 1.4].map((r) => (
            <button
              key={r}
              onClick={() => changeRate(r)}
              className={`rounded-lg px-2 py-1 min-w-[38px] transition active:scale-95 sm:px-3 sm:py-1.5 sm:min-w-[48px] ${playbackRate === r ? 'bg-indigo-600 text-white shadow' : 'hover:bg-indigo-100'}`}
            >
              {r}×
            </button>
          ))}
        </div>

        {/* Region / loop controls for selecting part of phrase */}
        {!usingFallback && (
          <>
            <div className="flex items-center gap-2">
              <button
                onClick={() => addRegionFirstSeconds(0.5)}
                className="rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-medium hover:bg-indigo-50"
              >
                Выделить первые 0,5с
              </button>
            </div>

            <button
              onClick={toggleLoop}
              disabled={!hasRegion}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${isLooping ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-indigo-200 hover:bg-indigo-50'} disabled:opacity-40`}
            >
              {isLooping ? 'Зациклено' : 'Зациклить выделенное'}
            </button>

            {/* The drag on waveform should also create regions (dragSelection: true), but these buttons are reliable one-tap options for children. */}

            <button
              onClick={clearRegion}
              disabled={!hasRegion}
              className="rounded-lg p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
              title="Сбросить выделение"
            >
              <Trash2 size={18} />
            </button>
          </>
        )}

        {onRegenerate && (
          <button
            onClick={onRegenerate}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50"
          >
            Перегенерировать аудио
          </button>
        )}
      </div>

      <p className="mt-1 text-[11px] text-zinc-500">
        {usingFallback
          ? 'Демо-озвучка браузером. Добавьте ключ ElevenLabs для естественной речи (и Gemini — для генерации шаблонов).'
          : 'Клик по волне — переместить позицию. Кнопки -1s/-3s/|<< — точный контроль. Для детей: «Выделить первые 0,5с» создаёт видимый регион в начале, потом тяните края/весь регион мышкой и зацикливайте на 0.75×.'}
      </p>
    </div>
  )
}
