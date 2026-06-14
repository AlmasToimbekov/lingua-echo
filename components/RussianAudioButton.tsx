'use client'

import React, { useState } from 'react'
import { Volume2, Square } from 'lucide-react'

interface RussianAudioButtonProps {
  audioUrl?: string
  fallbackText: string
  onRegenerate?: () => void
}

export function RussianAudioButton({ audioUrl, fallbackText, onRegenerate }: RussianAudioButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const play = () => {
    if (audioUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio(audioUrl)
        audioRef.current.onended = () => setIsPlaying(false)
      }
      audioRef.current.play()
      setIsPlaying(true)
      audioRef.current.onended = () => setIsPlaying(false)
    } else {
      // Fallback browser synthesis (Russian)
      if (!('speechSynthesis' in window)) return
      window.speechSynthesis.cancel()
      const utter = new SpeechSynthesisUtterance(fallbackText)
      utter.lang = 'ru-RU'
      utter.onend = () => setIsPlaying(false)
      window.speechSynthesis.speak(utter)
      setIsPlaying(true)
    }
  }

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={isPlaying ? stop : play}
        className="flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-sky-200 bg-sky-50 text-sky-700 shadow-sm transition active:scale-[0.985] hover:bg-sky-100"
        aria-label={isPlaying ? 'Остановить русскую озвучку' : 'Озвучить по-русски'}
      >
        {isPlaying ? (
          <Square size={28} />
        ) : (
          <Volume2 size={28} />
        )}
        <span className="text-[10px] font-medium tracking-wider">РУССКАЯ</span>
      </button>

      <div className="text-center text-xs text-sky-700/80">
        {isPlaying ? 'Играет...' : 'Одна кнопка — полная фраза'}
      </div>

      {onRegenerate && (
        <button
          onClick={onRegenerate}
          className="text-[10px] text-sky-600 underline underline-offset-2 hover:text-sky-800"
        >
          Перегенерировать
        </button>
      )}
    </div>
  )
}
