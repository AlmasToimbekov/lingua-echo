'use client'

import React, { useEffect, useRef, useState, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js'
import { Play, Pause, RotateCcw, Trash2 } from 'lucide-react'

interface EnglishPlayerProps {
  audioUrl?: string
  fallbackText: string // for browser speechSynthesis when no audioUrl
  onRegenerate?: () => void
}

export function EnglishPlayer({ audioUrl, fallbackText, onRegenerate }: EnglishPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<any>(null)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [hasRegion, setHasRegion] = useState(false)
  const [isLooping, setIsLooping] = useState(false)
  const [usingFallback, setUsingFallback] = useState(false)

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
    if (!audioUrl || !containerRef.current) {
      // cleanup previous
      if (wsRef.current) {
        wsRef.current.destroy()
        wsRef.current = null
        regionsRef.current = null
      }
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
      dragToSeek: true,
      minPxPerSec: 40,
    })

    wsRef.current = ws

    // Register regions plugin. Drag-to-create regions is supported by default in recent versions.
    // We create regions programmatically or via user drag on the waveform.
    const regions = ws.registerPlugin(RegionsPlugin.create())
    regionsRef.current = regions

    ws.load(audioUrl)

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
      // Looping is handled by the region-out listener below
    })

    // Region loop support
    regions.on('region-out', (region: any) => {
      if (isLooping) {
        region.play()
      }
    })

    regions.on('region-created', () => setHasRegion(true))
    regions.on('region-removed', () => setHasRegion(false))

    return () => {
      ws.destroy()
      wsRef.current = null
      regionsRef.current = null
    }
  }, [audioUrl, isLooping])

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
    ws.playPause()
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

  const playRegion = () => {
    const regions = regionsRef.current
    if (regions) {
      // Get the most recently added region (simple & reliable across versions)
      const all = regions.getRegions ? regions.getRegions() : []
      const last = all.length > 0 ? all[all.length - 1] : null
      if (last && last.play) {
        last.play()
        setIsPlaying(true)
      }
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

  const resetPlayback = () => {
    const ws = wsRef.current
    if (ws) {
      ws.pause()
      ws.seekTo(0)
      setCurrentTime(0)
      setIsPlaying(false)
    }
    stopFallback()
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

        {/* Speed controls - very useful for language learning */}
        <div className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-white p-1 text-sm">
          {[0.6, 0.75, 1, 1.25, 1.4].map((r) => (
            <button
              key={r}
              onClick={() => changeRate(r)}
              className={`rounded-md px-2.5 py-1 transition ${playbackRate === r ? 'bg-indigo-600 text-white' : 'hover:bg-indigo-100'}`}
            >
              {r}×
            </button>
          ))}
        </div>

        {/* Region / loop controls for selecting part of phrase */}
        {!usingFallback && (
          <>
            <button
              onClick={playRegion}
              disabled={!hasRegion}
              className="rounded-lg border border-indigo-200 px-4 py-2 text-sm font-medium hover:bg-indigo-50 disabled:opacity-40"
            >
              Играть выделенное
            </button>

            <button
              onClick={toggleLoop}
              disabled={!hasRegion}
              className={`rounded-lg border px-4 py-2 text-sm font-medium ${isLooping ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-indigo-200 hover:bg-indigo-50'} disabled:opacity-40`}
            >
              {isLooping ? 'Зациклено' : 'Зациклить выделенное'}
            </button>

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

        <button
          onClick={resetPlayback}
          className="ml-auto rounded-lg p-2 text-zinc-500 hover:bg-zinc-100"
          title="Сбросить"
        >
          <RotateCcw size={18} />
        </button>

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
          : 'Перетаскивайте по волне или используйте кнопки -1s/-3s/-5s / |<< для точного контроля. Выделяйте регионы для зацикливания.'}
      </p>
    </div>
  )
}
