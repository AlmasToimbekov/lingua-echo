'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import { Minus, Plus } from 'lucide-react'

const MIN = 1
const MAX = 10
const VALUES = Array.from({ length: MAX - MIN + 1 }, (_, i) => MIN + i)
const ITEM_HEIGHT = 40
const WHEEL_HEIGHT = ITEM_HEIGHT * 3

interface StudyRepetitionsPickerProps {
  value: number
  onChange: (value: number) => void
}

function clamp(value: number) {
  return Math.min(MAX, Math.max(MIN, value))
}

export function StudyRepetitionsPicker({ value, onChange }: StudyRepetitionsPickerProps) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isProgrammaticScrollRef = useRef(false)

  const scrollToValue = useCallback((next: number, smooth = true) => {
    const wheel = wheelRef.current
    const item = itemRefs.current.get(next)
    if (!wheel || !item) return

    const top = item.offsetTop - (wheel.clientHeight - ITEM_HEIGHT) / 2
    isProgrammaticScrollRef.current = true
    wheel.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' })
    window.setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, smooth ? 300 : 0)
  }, [])

  const readValueFromScroll = useCallback(() => {
    const wheel = wheelRef.current
    if (!wheel) return value

    const centerY = wheel.scrollTop + wheel.clientHeight / 2
    let closest = value
    let closestDist = Infinity

    itemRefs.current.forEach((el, n) => {
      const elCenter = el.offsetTop + el.offsetHeight / 2
      const dist = Math.abs(centerY - elCenter)
      if (dist < closestDist) {
        closestDist = dist
        closest = n
      }
    })

    return closest
  }, [value])

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return
    if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    scrollEndTimerRef.current = setTimeout(() => {
      const next = readValueFromScroll()
      if (next !== value) onChange(next)
    }, 120)
  }

  useEffect(() => {
    scrollToValue(value, false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- initial snap only

  useEffect(() => {
    scrollToValue(value, true)
  }, [value, scrollToValue])

  useEffect(
    () => () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    },
    []
  )

  const step = (delta: number) => onChange(clamp(value + delta))

  const wheelPadding = (WHEEL_HEIGHT - ITEM_HEIGHT) / 2

  return (
    <div
      className="flex items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-2 py-1.5 sm:gap-2 sm:px-3 sm:py-2"
      aria-label="Сколько раз повторять английскую фразу в тренировке"
    >
      <span className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-500 sm:text-xs">
        EN×
      </span>

      <button
        type="button"
        onClick={() => step(-1)}
        disabled={value <= MIN}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 transition hover:bg-zinc-50 active:scale-95 disabled:opacity-35"
        aria-label="Меньше повторений"
      >
        <Minus size={18} />
      </button>

      <div
        className="relative flex-shrink-0 overflow-hidden rounded-xl border border-violet-100 bg-violet-50/70"
        style={{ width: 52, height: WHEEL_HEIGHT }}
      >
        <div className="pointer-events-none absolute inset-x-1 top-1/2 z-10 h-10 -translate-y-1/2 rounded-lg border border-violet-200/90 bg-white/35" />
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-violet-50 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-violet-50 to-transparent" />

        <div
          ref={wheelRef}
          onScroll={handleScroll}
          className="study-rep-wheel h-full overflow-y-auto"
          style={{
            scrollSnapType: 'y mandatory',
            WebkitOverflowScrolling: 'touch',
            paddingTop: wheelPadding,
            paddingBottom: wheelPadding,
          }}
        >
          {VALUES.map((n) => (
            <div
              key={n}
              ref={(el) => {
                if (el) itemRefs.current.set(n, el)
                else itemRefs.current.delete(n)
              }}
              className={`flex items-center justify-center text-lg font-semibold tabular-nums transition-colors ${
                n === value ? 'text-violet-900' : 'text-violet-300'
              }`}
              style={{ height: ITEM_HEIGHT, scrollSnapAlign: 'center' }}
            >
              {n}
            </div>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => step(1)}
        disabled={value >= MAX}
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-700 transition hover:bg-zinc-50 active:scale-95 disabled:opacity-35"
        aria-label="Больше повторений"
      >
        <Plus size={18} />
      </button>
    </div>
  )
}