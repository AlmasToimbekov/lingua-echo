'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Template } from '../lib/types'
import {
  primeStudySequenceAudio,
  runStudySequence,
  stopStudySequenceAudio,
  StudySequenceOptions,
} from '../lib/studySequence'

type UseStudySequenceOptions = {
  filteredTemplates: Template[]
  currentId: string
  setCurrentId: (id: string) => void
  activeFolder: string
  sequenceOptions: StudySequenceOptions
}

export function useStudySequence({
  filteredTemplates,
  currentId,
  setCurrentId,
  activeFolder,
  sequenceOptions,
}: UseStudySequenceOptions) {
  const [isActive, setIsActive] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const folderAtStartRef = useRef(activeFolder)
  const sequenceOptionsRef = useRef(sequenceOptions)

  useEffect(() => {
    sequenceOptionsRef.current = sequenceOptions
  }, [sequenceOptions])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    stopStudySequenceAudio()
    setIsActive(false)
  }, [])

  const toggle = useCallback(() => {
    if (isActive) {
      stop()
      return
    }

    if (filteredTemplates.length === 0) return

    // Must run in the same user gesture — unlocks chained HTMLAudio playback on iOS.
    primeStudySequenceAudio()

    const startIdx = filteredTemplates.findIndex((t) => t.id === currentId)
    const index = startIdx >= 0 ? startIdx : 0

    const controller = new AbortController()
    abortRef.current = controller
    folderAtStartRef.current = activeFolder
    setIsActive(true)

    runStudySequence(
      filteredTemplates,
      index,
      (id) => setCurrentId(id),
      controller.signal,
      {
        getEnglishRepetitions: () => sequenceOptionsRef.current.getEnglishRepetitions(),
        getPlaybackRate: () => sequenceOptionsRef.current.getPlaybackRate(),
      }
    )
      .catch(() => {})
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null
          setIsActive(false)
        }
      })
  }, [isActive, filteredTemplates, currentId, activeFolder, setCurrentId, stop])

  useEffect(() => {
    if (isActive && folderAtStartRef.current !== activeFolder) {
      stop()
    }
  }, [activeFolder, isActive, stop])

  useEffect(() => () => stop(), [stop])

  const onManualAudioInteraction = useCallback(() => {
    if (isActive) stop()
  }, [isActive, stop])

  return {
    isStudySequenceActive: isActive,
    toggleStudySequence: toggle,
    stopStudySequence: stop,
    onManualAudioInteraction,
  }
}