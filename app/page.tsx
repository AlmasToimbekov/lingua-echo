'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Settings, Plus, RotateCcw, Trash2, X, ChevronLeft, ChevronRight, CheckCircle, Folder, Menu, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Template } from '../lib/types'
import { SEED_TEMPLATES } from '../lib/seed'
import { loadTemplates, saveTemplates, revokeUnusedAudioUrls } from '../lib/storage'
import {
  saveAudioBuffer,
  loadAudioBuffer,
  deleteAudioForTemplate,
  clearAllAudio,
  createObjectUrlFromBuffer,
} from '../lib/audioStorage'
import { generateAudio } from '../lib/tts'
import { listAvailableModels } from '../lib/gemini'
import { EnglishPlayer } from '../components/EnglishPlayer'
import { RussianAudioButton } from '../components/RussianAudioButton'

const SETTINGS_KEY = 'lingua-echo:settings'

type Settings = {
  geminiKey: string   // required for AI template generation (Google Gemini free tier)
  elevenKey: string   // primary for natural TTS voice
}

const TOPICS = [
  'Семья',
  'Школа',
  'Еда и покупки',
  'Просьбы и помощь',
  'Эмоции',
  'Повседневность',
  'Игры и отдых',
]

const COMPLEXITIES = [
  { label: 'Короткие (до 8 слов)', maxWords: 8 },
  { label: 'Средние (8–14 слов)', maxWords: 14 },
  { label: 'Полные (до 20 слов)', maxWords: 20 },
]

export default function LinguaEcho() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [currentId, setCurrentId] = useState<string>('')
  const [settings, setSettings] = useState<Settings>({ geminiKey: '', elevenKey: '' })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)

  // Folders + mobile list visibility (new for responsive + organization)
  const [showList, setShowList] = useState(true)
  const [activeFolder, setActiveFolder] = useState<string>('') // '' = Активные (non-learned), 'learned', or custom folder name
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [customFolders, setCustomFolders] = useState<string[]>([])
  const [isFoldersManageOpen, setIsFoldersManageOpen] = useState(false)

  const FOLDERS_KEY = 'lingua-echo:folders'

  const saveCustomFolders = (list: string[]) => {
    setCustomFolders(list)
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(list)) } catch {}
  }

  const addCustomFolder = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed || customFolders.includes(trimmed)) return
    saveCustomFolders([...customFolders, trimmed])
  }

  const renameFolder = (oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed || oldName === trimmed || customFolders.includes(trimmed)) return
    setTemplates(ts => ts.map(t => t.folder === oldName ? { ...t, folder: trimmed } : t))
    const newList = customFolders.map(f => f === oldName ? trimmed : f)
    saveCustomFolders(newList)
    if (activeFolder === oldName) setActiveFolder(trimmed)
    toast.success(`Папка переименована в «${trimmed}»`)
  }

  const deleteFolder = (name: string, deleteContents = false) => {
    const affected = templates.filter(t => t.folder === name)
    if (deleteContents) {
      // destructive: remove templates + audio
      affected.forEach(tpl => {
        deleteAudioForTemplate(tpl.id).catch(() => {})
      })
      revokeUnusedAudioUrls(affected, templates.filter(t => t.folder !== name))
      const remaining = templates.filter(t => t.folder !== name)
      setTemplates(remaining)
      if (currentId && affected.some(a => a.id === currentId)) {
        setCurrentId(remaining[0]?.id || '')
      }
    } else {
      // safe: move to active
      setTemplates(ts => ts.map(t => t.folder === name ? { ...t, folder: '' } : t))
    }
    saveCustomFolders(customFolders.filter(f => f !== name))
    if (activeFolder === name) setActiveFolder('')
    toast(`Папка «${name}» удалена${deleteContents ? ' (вместе с шаблонами)' : ', шаблоны перемещены в Активные'}`)
  }

  const handleDeleteFolder = (name: string) => {
    if (!confirm(`Удалить папку «${name}»?\n\nВы сможете выбрать, что делать с шаблонами внутри.`)) return
    const deleteTemplates = confirm(
      `Для папки «${name}»:\n\n` +
      `OK — Удалить папку И ВСЕ шаблоны внутри (необратимо, аудио тоже будут удалены)\n\n` +
      `Отмена — Удалить папку и ПЕРЕМЕСТИТЬ все шаблоны в «Активные» (безопасно, шаблоны сохранятся)`
    )
    deleteFolder(name, deleteTemplates)
  }

  // Pure helper so we can compute filtered in handlers before state commits
  const getFilteredFor = (folder: string, list: Template[] = templates) => {
    if (folder === 'learned') return list.filter(t => t.folder === 'learned')
    if (folder === 'active' || folder === '') return list.filter(t => !t.folder || t.folder === '')
    return list.filter(t => t.folder === folder)
  }

  // Generate form state
  const [genTopic, setGenTopic] = useState('Семья')
  const [genCustomTopic, setGenCustomTopic] = useState('')
  const [genComplexity, setGenComplexity] = useState(1)
  const [genCount, setGenCount] = useState(8)
  const [isGenerating, setIsGenerating] = useState(false)

  // Hydrate a list of templates with fresh audio object URLs from IndexedDB (if we have stored buffers).
  // This is the key change that makes generated voices survive page refresh.
  async function hydrateTemplates(base: Template[]): Promise<Template[]> {
    return Promise.all(
      base.map(async (t) => {
        const [enLoaded, ruLoaded] = await Promise.all([
          loadAudioBuffer(t.id, 'en'),
          loadAudioBuffer(t.id, 'ru'),
        ])

        return {
          ...t,
          enAudioUrl: createObjectUrlFromBuffer(enLoaded) ?? t.enAudioUrl,
          ruAudioUrl: createObjectUrlFromBuffer(ruLoaded) ?? t.ruAudioUrl,
        }
      })
    )
  }

  // Load on mount + persist (now with audio hydration)
  useEffect(() => {
    ;(async () => {
      const saved = loadTemplates()
      // Normalize folder for old data (backward compat) + ensure new shape
      const withFolder = saved.map((t) => ({ ...t, folder: t.folder || '' }))
      let initial: Template[]

      if (withFolder.length > 0) {
        // Restore texts from localStorage, then hydrate audio from IndexedDB
        initial = await hydrateTemplates(withFolder)
        setTemplates(initial)
        setCurrentId(initial[0]?.id ?? '')
      } else {
        // По умолчанию показываем только 2 шаблона (пользователь попросил не перегружать 10-ю)
        const seeded = SEED_TEMPLATES.slice(0, 2).map((t) => ({ ...t, folder: '' }))
        // Seeds have no audio yet
        setTemplates(seeded)
        setCurrentId(seeded[0].id)
        saveTemplates(seeded)
      }

      // Load settings (support old shape for migration)
      try {
        const raw = localStorage.getItem(SETTINGS_KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          setSettings({
            geminiKey: parsed.geminiKey || parsed.xaiKey || '',
            elevenKey: parsed.elevenKey || '',
          })
        }
      } catch {}

      // Load explicit custom folders (for + Папка, rename, delete, empty folders)
      try {
        const rawF = localStorage.getItem(FOLDERS_KEY)
        if (rawF) {
          const parsed = JSON.parse(rawF)
          if (Array.isArray(parsed)) setCustomFolders(parsed)
        }
      } catch {}
    })()
  }, [])

  // Auto-save templates
  useEffect(() => {
    if (templates.length > 0) {
      saveTemplates(templates)
    }
  }, [templates])

  // On first client mount, collapse list by default on narrow screens (iPhone portrait etc.)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setShowList(false)
    }
  }, [])

  // Sync custom folders with any folders found on templates (for legacy data)
  useEffect(() => {
    const fromTemplates = templates
      .map((t) => t.folder)
      .filter((f): f is string => !!f && f !== 'learned' && f !== '')
    const merged = Array.from(new Set([...customFolders, ...fromTemplates]))
    if (merged.length !== customFolders.length) {
      saveCustomFolders(merged)
    }
  }, [templates])

  const current = templates.find(t => t.id === currentId) || templates[0]

  const switchTo = (id: string) => setCurrentId(id)

  // Folders derived from explicit custom list (for empty folders support)
  const availableFolders = useMemo(() => {
    return ['active', 'learned', ...customFolders] as const
  }, [customFolders])

  const filteredTemplates = useMemo(() => getFilteredFor(activeFolder), [activeFolder, templates])

  // Prev/next and counter now scoped to the current folder's list (as requested)
  const goPrev = () => {
    const idx = filteredTemplates.findIndex(t => t.id === currentId)
    if (idx > 0) setCurrentId(filteredTemplates[idx - 1].id)
  }
  const goNext = () => {
    const idx = filteredTemplates.findIndex(t => t.id === currentId)
    if (idx >= 0 && idx < filteredTemplates.length - 1) setCurrentId(filteredTemplates[idx + 1].id)
  }

  // Unified folder setter (used by mark, move, dnd)
  const setTemplateFolder = (id: string, folder: string) => {
    setTemplates(ts => ts.map(t => t.id === id ? { ...t, folder } : t))
  }

  const deleteTemplate = (id: string) => {
    const toDelete = templates.find(t => t.id === id)
    if (!toDelete) return

    const remaining = templates.filter(t => t.id !== id)
    revokeUnusedAudioUrls([toDelete], remaining)

    // Also delete the persisted audio bytes from IndexedDB (Phase 2)
    deleteAudioForTemplate(id).catch(() => {})

    setTemplates(remaining)

    if (currentId === id) {
      setCurrentId(remaining[0]?.id || '')
    }
    toast.success('Шаблон удалён')
  }

  // Very simple settings persistence
  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
    setIsSettingsOpen(false)
    toast.success('Настройки сохранены (только в этом браузере)')
  }

  // Generation now requires Gemini key (user explicitly requested: "key should be pasted for this functionality to work").
  // Uses real Google Gemini (not pre-populated values). TTS uses ElevenLabs if key present.
  const handleGenerate = async () => {
    if (!settings.geminiKey) {
      toast.error('Для генерации шаблонов с ИИ вставьте ключ Google Gemini в Настройках (бесплатный tier доступен).')
      return
    }

    setIsGenerating(true)

    const topic = genCustomTopic.trim() || genTopic
    const maxWords = COMPLEXITIES[genComplexity].maxWords
    const count = Math.min(Math.max(1, genCount), 20)

    try {
      // 1. Gemini for the text templates (key required)
      const generated = await (await import('../lib/gemini')).generateTemplates({
        topic,
        maxWords,
        count,
        apiKey: settings.geminiKey,
      })

      // 2. TTS audio (ElevenLabs if key, else browser fallback). Sequential.
      const final: Template[] = []
      for (let i = 0; i < generated.length; i++) {
        const g = generated[i]
        const id = 'gen-' + Date.now() + '-' + i

        toast.loading(`Генерируем аудио ${i + 1} из ${generated.length}...`, { id: 'gen-progress' })

        let enBlob: Blob | null = null
        let ruBlob: Blob | null = null

        if (settings.elevenKey) {
          try {
            enBlob = await generateAudio(g.en, 'en', { provider: 'elevenlabs', apiKey: settings.elevenKey })
          } catch (e) { console.warn('EN ElevenLabs failed', e) }
          try {
            ruBlob = await generateAudio(g.ru, 'ru', { provider: 'elevenlabs', apiKey: settings.elevenKey })
          } catch (e) { console.warn('RU ElevenLabs failed', e) }
        }

        const enAudioUrl = enBlob ? URL.createObjectURL(enBlob) : undefined
        const ruAudioUrl = ruBlob ? URL.createObjectURL(ruBlob) : undefined

        // Persist the actual audio bytes so they survive page refresh (Phase 2)
        if (enBlob) {
          const enBuffer = await enBlob.arrayBuffer()
          await saveAudioBuffer(id, 'en', enBuffer, enBlob.type || 'audio/mpeg')
        }
        if (ruBlob) {
          const ruBuffer = await ruBlob.arrayBuffer()
          await saveAudioBuffer(id, 'ru', ruBuffer, ruBlob.type || 'audio/mpeg')
        }

        // Inherit current custom/active folder for new items (unless viewing learned)
        const newItemFolder = (activeFolder && activeFolder !== 'learned') ? activeFolder : ''
        final.push({ id, en: g.en, ru: g.ru, enAudioUrl, ruAudioUrl, folder: newItemFolder })
      }
      toast.dismiss('gen-progress')

      const updated = [...templates, ...final]
      setTemplates(updated)
      setCurrentId(final[0].id)

      setIsGenerateOpen(false)
      toast.success(`${final.length} новых шаблонов добавлено с помощью Gemini + ElevenLabs.`)
    } catch (err: any) {
      toast.error(err?.message || 'Ошибка генерации. Проверьте ключи Gemini и/или ElevenLabs.')
    } finally {
      setIsGenerating(false)
      toast.dismiss('gen-progress')
    }
  }

  const handleRegenerateAudio = async (id: string) => {
    const tpl = templates.find(t => t.id === id)
    if (!tpl || !settings.elevenKey) {
      toast('Для перегенерации озвучки нужен ключ ElevenLabs в Настройках')
      return
    }
    try {
      toast.loading('Перегенерируем аудио...', { id: 'regen' })
      const enBlob = await generateAudio(tpl.en, 'en', { provider: 'elevenlabs', apiKey: settings.elevenKey })
      const ruBlob = await generateAudio(tpl.ru, 'ru', { provider: 'elevenlabs', apiKey: settings.elevenKey })

      const newEnUrl = enBlob ? URL.createObjectURL(enBlob) : tpl.enAudioUrl
      const newRuUrl = ruBlob ? URL.createObjectURL(ruBlob) : tpl.ruAudioUrl

      // Persist the new audio bytes (replaces previous stored version)
      if (enBlob) {
        const enBuffer = await enBlob.arrayBuffer()
        await saveAudioBuffer(id, 'en', enBuffer, enBlob.type || 'audio/mpeg')
      }
      if (ruBlob) {
        const ruBuffer = await ruBlob.arrayBuffer()
        await saveAudioBuffer(id, 'ru', ruBuffer, ruBlob.type || 'audio/mpeg')
      }

      if (tpl.enAudioUrl && tpl.enAudioUrl !== newEnUrl) { try { URL.revokeObjectURL(tpl.enAudioUrl) } catch {} }
      if (tpl.ruAudioUrl && tpl.ruAudioUrl !== newRuUrl) { try { URL.revokeObjectURL(tpl.ruAudioUrl) } catch {} }

      setTemplates(ts => ts.map(t => t.id === id ? { ...t, enAudioUrl: newEnUrl, ruAudioUrl: newRuUrl } : t))
      toast.success('Аудио обновлено', { id: 'regen' })
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось перегенерировать', { id: 'regen' })
    }
  }

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-xl font-semibold tracking-tighter text-indigo-700 sm:text-2xl">LinguaEcho</div>
            <div className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 sm:px-3 sm:py-0.5 sm:text-xs">для семьи и детей</div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3 sm:text-sm">
            <div className="text-zinc-500">
              Шаблонов: <span className="font-medium text-zinc-700">{templates.length}</span>
            </div>

            <button
              onClick={() => setIsGenerateOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow hover:bg-indigo-700 active:bg-indigo-800 sm:gap-2 sm:px-5 sm:py-2"
            >
              <Plus size={14} className="sm:size-[16px]" />
              <span className="hidden xs:inline">Сгенерировать</span>
              <span className="xs:hidden">Шаблоны</span>
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 hover:bg-zinc-100 sm:h-10 sm:w-10"
              aria-label="Настройки"
            >
              <Settings size={16} className="sm:size-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex gap-6">
          {/* Vertical left sidebar / folders list. On mobile controlled by showList (toggle in navigator strip).
              Hidden when collapsed so main practice area gets full width on narrow portrait screens.
              Desktop (lg) keeps it always visible for power users. */}
          <div className={`w-72 flex-shrink-0 ${showList ? 'block' : 'hidden lg:block'}`}>
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-zinc-600">
              <span>
                {activeFolder === 'learned' ? 'Изученные' : activeFolder && activeFolder !== 'active' ? activeFolder : 'Активные'}
                {' '}({filteredTemplates.length})
              </span>
              <div className="flex items-center gap-2">
                {/* Mobile-only: back to detail view (right panel) when in list mode. Hamburger icon for consistency with the list toggle. */}
                <button
                  onClick={() => setShowList(false)}
                  className="lg:hidden text-xs rounded border border-zinc-200 px-2 py-0.5 hover:bg-zinc-50"
                  title="К фразе"
                >
                  <Menu size={16} />
                </button>
              </div>
            </div>

            {/* Folder chips — quick filter + create. Horizontal scroll for many folders on small screens.
                Also act as drop targets for drag & drop from the list (desktop). */}
            <div className="mb-2 flex gap-1 overflow-x-auto pb-1 -mx-1 px-1">
              {(['active', 'learned'] as const).concat(customFolders as any).map((f) => {
                const label = f === 'active' ? 'Активные' : f === 'learned' ? 'Изученные' : f
                const targetFolder = f === 'active' ? '' : f
                const isCurrent = f === 'active' ? (activeFolder === '' || activeFolder === 'active') : activeFolder === f
                const isCustom = f !== 'active' && f !== 'learned'
                const chip = (
                  <button
                    onClick={() => {
                      const target = f === 'active' ? '' : f
                      setActiveFolder(target)
                      // If the newly chosen folder doesn't contain the current template, auto-switch to first in that folder's list
                      const wouldBe = getFilteredFor(target)
                      if (wouldBe.length > 0 && !wouldBe.some(t => t.id === currentId)) {
                        setCurrentId(wouldBe[0].id)
                      }
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      const draggedId = e.dataTransfer.getData('text/template-id')
                      if (draggedId) {
                        setTemplateFolder(draggedId, targetFolder)
                        // Optionally follow the moved item
                        if (activeFolder !== (targetFolder === '' ? '' : targetFolder)) {
                          setActiveFolder(targetFolder === '' ? '' : targetFolder)
                        }
                      }
                    }}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs whitespace-nowrap transition active:scale-95 ${isCurrent ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-zinc-200 bg-white hover:bg-zinc-50'}`}
                  >
                    {label}
                  </button>
                )
                if (!isCustom) return chip
                return (
                  <div key={f} className="flex items-center">
                    {chip}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteFolder(f)
                      }}
                      className="ml-0.5 text-red-400 hover:text-red-600 text-xs px-1"
                      title={`Удалить папку «${f}»`}
                    >
                      ×
                    </button>
                  </div>
                )
              })}
              <button
                onClick={() => {
                  const name = prompt('Название новой папки?')?.trim()
                  if (name) {
                    addCustomFolder(name)
                    setActiveFolder(name)
                  }
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const draggedId = e.dataTransfer.getData('text/template-id')
                  if (draggedId) {
                    const name = prompt('Название новой папки?')?.trim()
                    if (name) {
                      addCustomFolder(name)
                      setTemplateFolder(draggedId, name)
                      setActiveFolder(name)
                    }
                  }
                }}
                className="shrink-0 rounded-full border border-dashed border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-50 active:scale-95"
                title="Создать новую папку"
              >
                + Папка
              </button>
              <button
                onClick={() => setIsFoldersManageOpen(true)}
                className="shrink-0 rounded-full border border-zinc-300 px-1.5 py-1 text-xs text-zinc-500 hover:bg-zinc-50 active:scale-95"
                title="Управление папками (переименовать / удалить)"
              >
                <MoreHorizontal size={14} />
              </button>
            </div>

            <div className="max-h-[60vh] lg:max-h-[68vh] overflow-y-auto pr-1 space-y-1.5 border-r border-zinc-200">
              {filteredTemplates.map((t) => {
                const isActive = t.id === currentId
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      switchTo(t.id)
                      // On mobile/iPhone: selecting from list should switch to the detail (right) panel exclusively
                      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                        setShowList(false)
                      }
                    }}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/template-id', t.id)}
                    className={`group relative flex cursor-pointer flex-col rounded-xl border px-3 py-2.5 text-left transition active:scale-[0.985] ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50 shadow-sm font-medium'
                        : 'border-zinc-200 bg-white hover:border-zinc-300'
                    }`}
                  >
                    <div className={`line-clamp-2 text-[13px] leading-tight ${isActive ? 'text-indigo-900' : 'text-zinc-800'}`}>
                      {t.en}
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-zinc-500">{t.ru}</div>
                    {t.folder === 'learned' && (
                      <div className="mt-0.5 text-[10px] text-emerald-600">Изучено</div>
                    )}

                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id) }}
                      className="absolute right-1 top-1 hidden rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 group-hover:block"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
              {filteredTemplates.length === 0 && (
                <div className="px-3 py-4 text-xs text-zinc-400">В этой папке пока пусто.</div>
              )}
            </div>
          </div>

          {/* Main viewer area (the container) */}
          {/* On mobile: exclusive with list — when showList=true we hide the detail so only left panel is visible */}
          <div className={`flex-1 min-w-0 ${showList ? 'hidden lg:block' : 'block'}`}>
            {/* THE MAIN CONTAINER — bilingual + dual audio as requested */}
            <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
            {/* Compact navigator: prev/next for sequential practice (big tap targets for kids) + list toggle (makes sidebar collapsible on small screens) */}
            <div className="mb-4 flex items-center justify-between gap-2 border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-1">
                <button
                  onClick={goPrev}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 active:scale-95"
                  aria-label="Предыдущий шаблон"
                  disabled={filteredTemplates.findIndex(t => t.id === currentId) <= 0}
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={goNext}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 active:scale-95"
                  aria-label="Следующий шаблон"
                  disabled={filteredTemplates.findIndex(t => t.id === currentId) >= filteredTemplates.length - 1}
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-zinc-500 tabular-nums">
                {(() => {
                  const idx = filteredTemplates.findIndex(t => t.id === currentId)
                  const total = filteredTemplates.length
                  if (total === 0) return '0 / 0'
                  return idx >= 0 ? `${idx + 1} / ${total}` : `${total} в папке`
                })()}
                {current?.folder && current.folder !== '' && (
                  <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                    {current.folder === 'learned' ? 'Изучено' : current.folder}
                  </span>
                )}
              </div>

              <button
                onClick={() => setShowList(s => !s)}
                className="flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm hover:bg-zinc-50 active:scale-95 lg:hidden"
                title={showList ? 'Скрыть список шаблонов' : 'Показать список и папки'}
              >
                <Menu size={16} />
                <span className="hidden sm:inline">{showList ? 'Скрыть' : 'Шаблоны'}</span>
              </button>
            </div>

          {/* English text — prominent, large, readable for children */}
          {/* If the current folder view is empty after moves, show empty state instead of phrase (list + numbering stay consistent with folder) */}
          {templates.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mb-4 text-2xl">Вы удалили все шаблоны</div>
              <p className="mb-6 max-w-md text-zinc-600">
                Добавьте новые через кнопку «Сгенерировать шаблоны» или верните исходные.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => {
                    const seeded = SEED_TEMPLATES.slice(0, 2).map((t) => ({ ...t, folder: '' }))
                    setTemplates(seeded)
                    setCurrentId(seeded[0].id)
                    saveTemplates(seeded)
                  }}
                  className="rounded-xl bg-indigo-600 px-5 py-2 text-white"
                >
                  Вернуть 2 исходных
                </button>
                <button
                  onClick={() => setIsGenerateOpen(true)}
                  className="rounded-xl border px-5 py-2"
                >
                  Сгенерировать
                </button>
              </div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="py-10 text-center">
              <div className="text-2xl">Папка пуста</div>
              <p className="mt-3 text-sm text-zinc-500">
                В выбранной папке нет шаблонов.<br />
                Откройте список шаблонов (кнопка вверху) и переключитесь на другую папку,<br />
                или переместите/верните шаблоны сюда.
              </p>
            </div>
          ) : (
            <>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-[1.5px] text-indigo-600">АНГЛИЙСКИЙ</div>
              <div className="text-balance text-4xl font-semibold leading-tight tracking-[-0.3px] text-zinc-950">
                {current.en}
              </div>

              {/* Russian text + озвучка рядом — чтобы сразу было понятно, к чему кнопка относится (особенно в вертикальной ориентации) */}
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium uppercase tracking-[1.5px] text-sky-600">РУССКИЙ ПЕРЕВОД</div>
                  <div className="mt-1 text-2xl leading-snug text-zinc-700">
                    {current.ru}
                  </div>
                </div>
                <div className="flex-shrink-0 pt-1">
                  <RussianAudioButton
                    audioUrl={current.ruAudioUrl}
                    fallbackText={current.ru}
                    onRegenerate={() => handleRegenerateAudio(current.id)}
                  />
                </div>
              </div>

              {/* English player (main waveform) — full width below */}
              <div className="mt-6">
                <EnglishPlayer
                  audioUrl={current.enAudioUrl}
                  fallbackText={current.en}
                  onRegenerate={() => handleRegenerateAudio(current.id)}
                />
              </div>

              {/* Bottom actions for current template */}
              <div className="mt-6 flex flex-wrap gap-3 border-t pt-6 text-sm">
                <button
                  onClick={() => deleteTemplate(current.id)}
                  className="flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={16} /> Удалить этот шаблон
                </button>

                <button
                  onClick={() => {
                    const newEn = prompt('Новый английский текст:', current.en) || current.en
                    const newRu = prompt('Новый русский текст:', current.ru) || current.ru
                    if (newEn !== current.en || newRu !== current.ru) {
                      setTemplates(ts => ts.map(t => t.id === current.id ? { ...t, en: newEn.trim(), ru: newRu.trim() } : t))
                      toast('Текст обновлён')
                    }
                  }}
                  className="rounded-xl border border-zinc-200 px-4 py-2 hover:bg-zinc-50"
                >
                  Редактировать тексты
                </button>

                {/* Mark as learned / unmark — moves to default 'learned' folder (or back). Primary way for kids to organize.
                    After move: auto-advance to another item in the *current folder view* (so list + numbering stay consistent with the folder). */}
                {current.folder !== 'learned' ? (
                  <button
                    onClick={() => {
                      const id = current.id
                      setTemplateFolder(id, 'learned')
                      // Stay in current folder view and pick next/remaining from it
                      const remaining = filteredTemplates.filter(t => t.id !== id)
                      if (remaining.length > 0) {
                        setCurrentId(remaining[0].id)
                      }
                      toast.success('Отмечено как изученное', { position: 'bottom-center' })
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-emerald-200 px-3 py-2 text-emerald-700 hover:bg-emerald-50"
                  >
                    <CheckCircle size={16} /> Отметить как изученное
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const id = current.id
                      setTemplateFolder(id, '')
                      const remaining = filteredTemplates.filter(t => t.id !== id)
                      if (remaining.length > 0) {
                        setCurrentId(remaining[0].id)
                      }
                      toast('Вернули в активные', { position: 'bottom-center' })
                    }}
                    className="rounded-xl border border-zinc-200 px-3 py-2 hover:bg-zinc-50"
                  >
                    Вернуть в активные
                  </button>
                )}

                <button
                  onClick={() => setIsMoveOpen(true)}
                  className="rounded-xl border border-zinc-200 px-3 py-2 hover:bg-zinc-50"
                  disabled={!current}
                >
                  Переместить в папку…
                </button>

                <div className="flex-1" />
              </div>
            </>
          )}
        </div> {/* end of main container card */}
          </div> {/* end of viewer flex-1 */}
        </div> {/* end of sidebar + viewer flex */}
      </main>

      {/* Settings Dialog — Gemini (gen) + ElevenLabs (voice). Keys required for their features. High contrast. */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setIsSettingsOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold">Настройки</div>
              <button onClick={() => setIsSettingsOpen(false)}><X /></button>
            </div>

            <div className="mt-6 space-y-6 text-sm">
              {/* Gemini for template generation (key required) */}
              <div>
                <label className="block font-medium text-slate-800">Ключ Google Gemini (для генерации шаблонов)</label>
                <input
                  type="password"
                  value={settings.geminiKey}
                  onChange={e => setSettings(s => ({ ...s, geminiKey: e.target.value }))}
                  placeholder="AIza..."
                  className="mt-1 w-full rounded-xl border px-4 py-2.5 font-mono text-sm"
                />
                <div className="mt-1 flex items-center gap-2">
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-xs text-indigo-600 underline">Получить ключ (бесплатный tier)</a>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!settings.geminiKey) {
                        toast.error('Сначала вставьте ключ');
                        return;
                      }
                      try {
                        const res = await listAvailableModels(settings.geminiKey);
                        console.log('Available Gemini models for your key:', res);
                        toast.success('Список моделей выведен в консоль браузера (F12 → Console). Ищите модели с supportedGenerationMethods включающим "generateContent".');
                      } catch (e: any) {
                        toast.error(e.message || 'Не удалось получить список моделей');
                      }
                    }}
                    className="text-[10px] rounded-md border border-slate-300 px-2 py-0.5 hover:bg-slate-50 active:bg-slate-100"
                  >
                    Показать доступные модели
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-slate-600">Нужен для кнопки «Сгенерировать шаблоны». Без ключа генерация ИИ не работает.</p>
              </div>

              {/* ElevenLabs for voice (primary) */}
              <div>
                <label className="block font-medium text-slate-800">Ключ ElevenLabs (для естественной озвучки)</label>
                <input
                  type="password"
                  value={settings.elevenKey}
                  onChange={e => setSettings(s => ({ ...s, elevenKey: e.target.value }))}
                  placeholder="sk_..."
                  className="mt-1 w-full rounded-xl border px-4 py-2.5 font-mono text-sm"
                />
                <a href="https://elevenlabs.io/app/developers/api-keys" target="_blank" className="text-xs text-indigo-600 underline">Получить ключ ElevenLabs</a>
                <p className="mt-1 text-[11px] text-slate-600">Используется для высококачественной озвучки английского и русского (рекомендуется).</p>
              </div>

              <div className="text-[10px] text-slate-500 border-t pt-3">
                Ключи хранятся только в вашем браузере. Для семьи и личного использования.
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setIsSettingsOpen(false)} className="rounded-2xl px-5 py-2.5 text-sm">Отмена</button>
              <button onClick={() => saveSettings(settings)} className="rounded-2xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white">Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Generate Dialog — compact "series of questions" as per request */}
      {isGenerateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setIsGenerateOpen(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-xl font-semibold tracking-tight">Сгенерировать шаблоны с ИИ</div>
            <p className="mt-1 text-sm text-zinc-600">От 1 до 20 естественных фраз. Высокая частотность, американский английский. Требуется ключ Google Gemini.</p>

            <div className="mt-6 space-y-6">
              {/* Topic */}
              <div>
                <div className="mb-2 text-sm font-medium">Тема / ситуация</div>
                <div className="flex flex-wrap gap-2">
                  {TOPICS.map(t => (
                    <button key={t} onClick={() => { setGenTopic(t); setGenCustomTopic('') }}
                      className={`rounded-full px-4 py-1 text-sm ${genTopic === t && !genCustomTopic ? 'bg-indigo-600 text-white' : 'bg-zinc-100 hover:bg-zinc-200'}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <input
                  value={genCustomTopic}
                  onChange={e => setGenCustomTopic(e.target.value)}
                  placeholder="Или введите свою тему..."
                  className="mt-3 w-full rounded-2xl border px-4 py-2 text-sm"
                />
              </div>

              {/* Complexity */}
              <div>
                <div className="mb-2 text-sm font-medium">Уровень сложности</div>
                {COMPLEXITIES.map((c, idx) => (
                  <label key={idx} className="flex items-center gap-2 py-1 text-sm">
                    <input type="radio" name="complex" checked={genComplexity === idx} onChange={() => setGenComplexity(idx)} />
                    {c.label}
                  </label>
                ))}
              </div>

              {/* Count */}
              <div>
                <div className="mb-2 flex justify-between text-sm font-medium">
                  <span>Количество шаблонов</span>
                  <span>{genCount}</span>
                </div>
                <input type="range" min={1} max={20} step={1} value={genCount} onChange={e => setGenCount(parseInt(e.target.value))} className="w-full accent-indigo-600" />
              </div>
            </div>

            <div className="mt-8 flex gap-3">
              <button onClick={() => setIsGenerateOpen(false)} className="flex-1 rounded-2xl border py-3 text-sm">Отмена</button>
              <button
                onClick={handleGenerate}
                disabled={isGenerating}
                className="flex-1 rounded-2xl bg-indigo-600 py-3 text-sm font-medium text-white disabled:bg-indigo-400"
              >
                {isGenerating ? 'Генерируем...' : 'Сгенерировать и добавить'}
              </button>
            </div>

            <div className="mt-3 text-center text-[11px] text-zinc-500">
              Для настоящей генерации и естественных голосов добавьте ключ xAI в Настройках (будет использован один ключ и для текста, и для TTS).
            </div>
          </div>
        </div>
      )}

      {/* Move to folder modal — reuses the exact same overlay/card pattern as Settings & Generate for consistency */}
      {isMoveOpen && current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setIsMoveOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-lg font-semibold">Переместить «{current.en.slice(0, 40)}{current.en.length > 40 ? '…' : ''}»</div>
            <p className="mt-1 text-sm text-zinc-600">Выберите папку или создайте новую.</p>

            <div className="mt-4 space-y-2">
              {['', 'learned', ...customFolders].map((f) => {
                const label = f === '' ? 'Активные' : f === 'learned' ? 'Изученные' : f
                const isCurrentFolder = (f === '' ? (current.folder || '') === '' : current.folder === f)
                return (
                  <button
                    key={f || 'active'}
                    onClick={() => {
                      setTemplateFolder(current.id, f)
                      setIsMoveOpen(false)
                      // Follow the item into its new view for convenience
                      setActiveFolder(f === '' ? '' : f)
                      toast.success(`Перемещено в «${label}»`, { position: 'bottom-center' })
                    }}
                    disabled={isCurrentFolder}
                    className={`w-full rounded-xl border px-4 py-3 text-left text-sm transition active:scale-[0.985] ${isCurrentFolder ? 'border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default' : 'border-zinc-200 hover:bg-zinc-50'}`}
                  >
                    {label} {isCurrentFolder && '· текущая'}
                  </button>
                )
              })}

              <button
                onClick={() => {
                  const name = prompt('Название новой папки?')?.trim()
                  if (name) {
                    addCustomFolder(name)
                    setTemplateFolder(current.id, name)
                    setIsMoveOpen(false)
                    setActiveFolder(name)
                    toast.success(`Создана папка «${name}» и шаблон перемещён`, { position: 'bottom-center' })
                  }
                }}
                className="w-full rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-left text-sm text-zinc-600 hover:bg-zinc-50 active:scale-[0.985]"
              >
                + Создать новую папку и переместить туда
              </button>
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsMoveOpen(false)} className="rounded-2xl px-5 py-2 text-sm">Отмена</button>
            </div>
          </div>
        </div>
      )}

      {/* Folders manage modal: rename + delete (safe move or destructive) for custom folders */}
      {isFoldersManageOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setIsFoldersManageOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-lg font-semibold">Управление папками</div>
            <p className="mt-1 text-sm text-zinc-600">Переименование и удаление пользовательских папок.</p>

            <div className="mt-4 space-y-3">
              {customFolders.length === 0 && (
                <div className="text-sm text-zinc-500">Пользовательских папок пока нет. Создайте через «+ Папка» или «Переместить в папку…».</div>
              )}
              {customFolders.map((name) => {
                const count = templates.filter(t => t.folder === name).length
                return (
                  <div key={name} className="flex items-center justify-between rounded-xl border border-zinc-200 p-3 text-sm">
                    <div>
                      <div className="font-medium">{name}</div>
                      <div className="text-[11px] text-zinc-500">{count} шаблон{count === 1 ? '' : count < 5 ? 'а' : 'ов'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const nn = prompt('Новое название папки', name)?.trim()
                          if (nn) renameFolder(name, nn)
                        }}
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-zinc-50"
                      >
                        Переименовать
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`Удалить папку «${name}»?\nШаблоны будут перемещены в «Активные».`)) return
                          deleteFolder(name, false)
                        }}
                        className="rounded-lg border px-3 py-1 text-xs hover:bg-zinc-50"
                      >
                        Удалить (переместить)
                      </button>
                      <button
                        onClick={() => {
                          if (!confirm(`ВНИМАНИЕ!\nУдалить папку «${name}» и все ${count} шаблонов внутри?\nАудио будут удалены навсегда.`)) return
                          deleteFolder(name, true)
                        }}
                        className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        Удалить с шаблонами
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button onClick={() => setIsFoldersManageOpen(false)} className="rounded-2xl px-5 py-2 text-sm">Закрыть</button>
            </div>
            <p className="mt-3 text-[10px] text-zinc-400">Удаление папки не затрагивает «Активные» и «Изученные».</p>
          </div>
        </div>
      )}
    </div>
  )
}
