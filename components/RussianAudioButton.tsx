'use client'

import React, { useState } from 'react'
import { Volume2, Square } from 'lucide-react'
import { speakText } from '../lib/speechPlayback'

interface RussianAudioButtonProps {
  fallbackText: string
  compact?: boolean
  onManualPlayPause?: () => void
  suspendAutoStopOnTextChange?: boolean
  playbackRate?: number
}

export function RussianAudioButton({
  fallbackText,
  compact = false,
  onManualPlayPause,
  suspendAutoStopOnTextChange = false,
  playbackRate = 1,
}: RussianAudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false)

  // When the template changes, stop any previous playback (unless study sequence is driving audio).
  React.useEffect(() => {
    if (suspendAutoStopOnTextChange) return
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
  }, [fallbackText, suspendAutoStopOnTextChange])

  const play = () => {
    onManualPlayPause?.()
    if (!('speechSynthesis' in window)) return
    setIsPlaying(true)
    speakText(fallbackText, 'ru-RU', undefined, playbackRate)
      .catch(() => {})
      .finally(() => setIsPlaying(false))
  }

  const stop = () => {
    onManualPlayPause?.()
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
  }

  const buttonClass = compact
    ? "flex h-9 w-9 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition active:scale-[0.985] hover:bg-sky-100"
    : "flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition active:scale-[0.985] hover:bg-sky-100"
  const iconSize = compact ? 16 : 28

  return (
    <div className={compact ? "flex items-center" : "flex flex-col items-center gap-2"}>
      <button
        onClick={isPlaying ? stop : play}
        className={buttonClass}
        aria-label={isPlaying ? 'Остановить русскую озвучку' : 'Озвучить по-русски'}
      >
        {isPlaying ? (
          <Square size={iconSize} />
        ) : (
          <Volume2 size={iconSize} />
        )}
        {!compact && <span className="text-[10px] font-medium tracking-wider">РУССКАЯ</span>}
      </button>

      {!compact && (
        <div className="text-center text-xs text-sky-700/80">
          {isPlaying ? 'Играет...' : 'Play'}
        </div>
      )}
    </div>
  )
}
