'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Volume2, Square } from 'lucide-react'
import { speakText } from '../lib/speechPlayback'

const SPEED_RATES = [0.6, 0.75, 1, 1.25, 1.4] as const

interface RussianAudioButtonProps {
  fallbackText: string
  audioUrl?: string
  compact?: boolean
  onManualPlayPause?: () => void
  suspendAutoStopOnTextChange?: boolean
  playbackRate?: number
  onPlaybackRateChange?: (rate: number) => void
  showSpeedControls?: boolean
}

function applyAudioPlaybackRate(audio: HTMLAudioElement, rate: number) {
  try {
    audio.preservesPitch = true
    audio.defaultPlaybackRate = rate
    audio.playbackRate = rate
  } catch {
    // Some browsers reject extreme rates until playback starts.
  }
}

export function RussianAudioButton({
  fallbackText,
  audioUrl,
  compact = false,
  onManualPlayPause,
  suspendAutoStopOnTextChange = false,
  playbackRate = 1,
  onPlaybackRateChange,
  showSpeedControls = false,
}: RussianAudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playbackRateRef = useRef(playbackRate)

  useEffect(() => {
    playbackRateRef.current = playbackRate
    if (audioRef.current) {
      applyAudioPlaybackRate(audioRef.current, playbackRate)
    }
  }, [playbackRate])

  const stopFilePlayback = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.pause()
    audio.currentTime = 0
    setIsPlaying(false)
  }, [])

  // When the template changes, stop any previous playback (unless study sequence is driving audio).
  useEffect(() => {
    if (suspendAutoStopOnTextChange) return
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    stopFilePlayback()
  }, [fallbackText, audioUrl, suspendAutoStopOnTextChange, stopFilePlayback])

  const playFile = useCallback(() => {
    if (!audioUrl) return

    let audio = audioRef.current
    if (!audio) {
      audio = new Audio()
      audio.setAttribute('playsinline', 'true')
      audio.setAttribute('webkit-playsinline', 'true')
      audioRef.current = audio
    }

    const rate = playbackRateRef.current

    audio.onended = () => setIsPlaying(false)
    audio.onerror = () => setIsPlaying(false)
    audio.onplaying = () => applyAudioPlaybackRate(audio!, rate)

    audio.pause()
    audio.currentTime = 0
    audio.volume = 1
    audio.muted = false
    applyAudioPlaybackRate(audio, rate)
    audio.src = audioUrl
    audio.load()

    setIsPlaying(true)
    audio
      .play()
      .then(() => applyAudioPlaybackRate(audio!, playbackRateRef.current))
      .catch(() => setIsPlaying(false))
  }, [audioUrl])

  const play = () => {
    onManualPlayPause?.()
    if (audioUrl) {
      playFile()
      return
    }
    if (!('speechSynthesis' in window)) return
    setIsPlaying(true)
    speakText(fallbackText, 'ru-RU', undefined, playbackRateRef.current)
      .catch(() => {})
      .finally(() => setIsPlaying(false))
  }

  const stop = () => {
    onManualPlayPause?.()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    stopFilePlayback()
  }

  const handleSpeedChange = (rate: number) => {
    playbackRateRef.current = rate
    onPlaybackRateChange?.(rate)
    if (audioRef.current) {
      applyAudioPlaybackRate(audioRef.current, rate)
    }
  }

  const buttonClass = compact
    ? 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition active:scale-[0.985] hover:bg-sky-100'
    : 'flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition active:scale-[0.985] hover:bg-sky-100'
  const iconSize = compact ? 16 : 28

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-1.5' : 'flex flex-col items-center gap-2'}>
      <button
        onClick={isPlaying ? stop : play}
        className={buttonClass}
        aria-label={isPlaying ? 'Остановить русскую озвучку' : 'Озвучить по-русски'}
      >
        {isPlaying ? <Square size={iconSize} /> : <Volume2 size={iconSize} />}
        {!compact && <span className="text-[10px] font-medium tracking-wider">РУССКАЯ</span>}
      </button>

      {showSpeedControls && onPlaybackRateChange && (
        <div className="flex flex-wrap items-center gap-0.5 rounded-xl border border-sky-200 bg-white p-0.5 text-[10px] sm:gap-1 sm:p-1 sm:text-xs">
          {SPEED_RATES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => handleSpeedChange(r)}
              className={`rounded-lg px-1.5 py-1 min-w-[34px] transition active:scale-95 sm:px-2 sm:min-w-[40px] ${
                playbackRate === r
                  ? 'bg-sky-600 text-white shadow'
                  : 'text-sky-800 hover:bg-sky-50'
              }`}
            >
              {r}×
            </button>
          ))}
        </div>
      )}

      {!compact && !showSpeedControls && (
        <div className="text-center text-xs text-sky-700/80">
          {isPlaying ? 'Играет...' : 'Play'}
        </div>
      )}
    </div>
  )
}
