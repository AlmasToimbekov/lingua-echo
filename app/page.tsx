'use client'

import React, { useEffect, useState } from 'react'
import { Settings, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Template } from '../lib/types'
import { SEED_TEMPLATES } from '../lib/seed'
import { loadTemplates, saveTemplates, revokeUnusedAudioUrls } from '../lib/storage'
import { generateTemplates } from '../lib/xai'
import { generateAudio, TTSProvider } from '../lib/tts'
import { EnglishPlayer } from '../components/EnglishPlayer'
import { RussianAudioButton } from '../components/RussianAudioButton'

const SETTINGS_KEY = 'lingua-echo:settings'

type Settings = {
  xaiKey: string
  ttsProvider: 'xai' | 'elevenlabs' | 'browser'
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
  const [settings, setSettings] = useState<Settings>({ xaiKey: '', ttsProvider: 'xai' })
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isGenerateOpen, setIsGenerateOpen] = useState(false)

  // Generate form state
  const [genTopic, setGenTopic] = useState('Семья')
  const [genCustomTopic, setGenCustomTopic] = useState('')
  const [genComplexity, setGenComplexity] = useState(1)
  const [genCount, setGenCount] = useState(12)
  const [isGenerating, setIsGenerating] = useState(false)

  // Load on mount + persist
  useEffect(() => {
    const saved = loadTemplates()
    if (saved.length > 0) {
      setTemplates(saved)
      setCurrentId(saved[0].id)
    } else {
      const seeded = SEED_TEMPLATES.map(t => ({ ...t }))
      setTemplates(seeded)
      setCurrentId(seeded[0].id)
      saveTemplates(seeded)
    }

    // Load settings
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) setSettings(JSON.parse(raw))
    } catch {}
  }, [])

  // Auto-save templates
  useEffect(() => {
    if (templates.length > 0) {
      saveTemplates(templates)
    }
  }, [templates])

  const current = templates.find(t => t.id === currentId) || templates[0]

  const switchTo = (id: string) => setCurrentId(id)

  const deleteTemplate = (id: string) => {
    const toDelete = templates.find(t => t.id === id)
    if (!toDelete) return

    const remaining = templates.filter(t => t.id !== id)
    revokeUnusedAudioUrls([toDelete], remaining)

    setTemplates(remaining)

    if (currentId === id) {
      setCurrentId(remaining[0]?.id || '')
    }
    toast.success('Шаблон удалён')
  }

  const resetToSeeds = () => {
    revokeUnusedAudioUrls(templates, [])
    const seeded = SEED_TEMPLATES.map(t => ({ ...t }))
    setTemplates(seeded)
    setCurrentId(seeded[0].id)
    saveTemplates(seeded)
    toast('Шаблоны сброшены к исходным')
  }

  // Very simple settings persistence
  const saveSettings = (newSettings: Settings) => {
    setSettings(newSettings)
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(newSettings))
    setIsSettingsOpen(false)
    toast.success('Настройки сохранены (только в этом браузере)')
  }

  // Real generation using user's xAI key (primary path per plan + review comment "a")
  const handleGenerate = async () => {
    setIsGenerating(true)

    const topic = genCustomTopic.trim() || genTopic
    const maxWords = COMPLEXITIES[genComplexity].maxWords
    const count = Math.min(Math.max(5, genCount), 20)

    const provider: TTSProvider = settings.ttsProvider
    const keyToUse = settings.xaiKey

    try {
      let newOnes: Template[]

      if (keyToUse && provider === 'xai') {
        // 1. Ask Grok for the sentences
        const generated = await generateTemplates({
          topic,
          maxWords,
          count,
          apiKey: keyToUse,
        })

        // 2. Generate audios (EN + RU) — sequential to be kind to limits
        const final: Template[] = []
        for (let i = 0; i < generated.length; i++) {
          const g = generated[i]
          const id = 'gen-' + Date.now() + '-' + i

          // Show progress
          toast.loading(`Генерируем аудио ${i + 1} из ${generated.length}...`, { id: 'gen-progress' })

          let enBlob: Blob | null = null
          let ruBlob: Blob | null = null

          try {
            enBlob = await generateAudio(g.en, 'en', { provider, apiKey: keyToUse })
          } catch (e) {
            console.warn('EN TTS failed, will use fallback', e)
          }
          try {
            ruBlob = await generateAudio(g.ru, 'ru', { provider, apiKey: keyToUse })
          } catch (e) {
            console.warn('RU TTS failed, will use fallback', e)
          }

          const enAudioUrl = enBlob ? URL.createObjectURL(enBlob) : undefined
          const ruAudioUrl = ruBlob ? URL.createObjectURL(ruBlob) : undefined

          final.push({
            id,
            en: g.en,
            ru: g.ru,
            enAudioUrl,
            ruAudioUrl,
          })
        }
        toast.dismiss('gen-progress')
        newOnes = final
      } else {
        // No key or not xAI → graceful demo (still useful)
        await new Promise(r => setTimeout(r, 420))
        newOnes = Array.from({ length: Math.min(4, count) }).map((_, i) => ({
          id: 'demo-' + Date.now() + '-' + i,
          en: `Can you tell me more about ${topic.toLowerCase()}?`,
          ru: `Расскажи мне больше про ${topic.toLowerCase().replace('семья','семью')}.`,
        }))
      }

      const updated = [...templates, ...newOnes]
      setTemplates(updated)
      setCurrentId(newOnes[0].id)

      setIsGenerateOpen(false)
      toast.success(`${newOnes.length} новых шаблонов добавлено.`)
    } catch (err: any) {
      toast.error(err?.message || 'Ошибка генерации. Проверьте ключ xAI в Настройках.')
    } finally {
      setIsGenerating(false)
      toast.dismiss('gen-progress')
    }
  }

  const handleRegenerateAudio = async (id: string) => {
    const tpl = templates.find(t => t.id === id)
    if (!tpl || !settings.xaiKey) {
      toast('Для перегенерации нужен ключ xAI в Настройках')
      return
    }
    try {
      toast.loading('Перегенерируем аудио...', { id: 'regen' })
      const enBlob = await generateAudio(tpl.en, 'en', { provider: settings.ttsProvider, apiKey: settings.xaiKey })
      const ruBlob = await generateAudio(tpl.ru, 'ru', { provider: settings.ttsProvider, apiKey: settings.xaiKey })

      const newEnUrl = enBlob ? URL.createObjectURL(enBlob) : tpl.enAudioUrl
      const newRuUrl = ruBlob ? URL.createObjectURL(ruBlob) : tpl.ruAudioUrl

      // Revoke old if they were blobs
      if (tpl.enAudioUrl && tpl.enAudioUrl !== newEnUrl) { try { URL.revokeObjectURL(tpl.enAudioUrl) } catch {} }
      if (tpl.ruAudioUrl && tpl.ruAudioUrl !== newRuUrl) { try { URL.revokeObjectURL(tpl.ruAudioUrl) } catch {} }

      setTemplates(ts => ts.map(t => t.id === id ? { ...t, enAudioUrl: newEnUrl, ruAudioUrl: newRuUrl } : t))
      toast.success('Аудио обновлено', { id: 'regen' })
    } catch (e: any) {
      toast.error(e?.message || 'Не удалось перегенерировать', { id: 'regen' })
    }
  }

  if (!current) {
    return <div className="p-8">Загрузка...</div>
  }

  return (
    <div className="min-h-screen pb-12">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="text-2xl font-semibold tracking-tighter text-indigo-700">LinguaEcho</div>
            <div className="rounded-full bg-indigo-100 px-3 py-0.5 text-xs font-medium text-indigo-700">для семьи и детей</div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="text-zinc-500">
              Шаблонов: <span className="font-medium text-zinc-700">{templates.length}</span>
            </div>

            <button
              onClick={() => setIsGenerateOpen(true)}
              className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2 font-medium text-white shadow hover:bg-indigo-700 active:bg-indigo-800"
            >
              <Plus size={16} /> Сгенерировать с Grok
            </button>

            <button
              onClick={() => setIsSettingsOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 hover:bg-zinc-100"
              aria-label="Настройки"
            >
              <Settings size={18} />
            </button>

            <button
              onClick={resetToSeeds}
              className="flex items-center gap-1.5 rounded-full border border-zinc-200 px-3 py-2 text-xs hover:bg-zinc-100"
              title="Сбросить к 10 исходным шаблонам"
            >
              <RotateCcw size={14} /> Сбросить
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-8">
        {/* Deck strip — templates available on open */}
        <div className="mb-4 flex items-center justify-between">
          <div className="text-sm font-medium text-zinc-600">Мои шаблоны</div>
          <button onClick={resetToSeeds} className="text-xs text-zinc-500 hover:text-zinc-700">Восстановить исходные 10</button>
        </div>

        <div className="mb-8 flex gap-2 overflow-x-auto pb-3 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {templates.map((t, idx) => {
            const isActive = t.id === currentId
            return (
              <div
                key={t.id}
                onClick={() => switchTo(t.id)}
                className={`group relative flex min-w-[168px] cursor-pointer flex-col rounded-2xl border px-4 py-3 text-left transition active:scale-[0.985] ${
                  isActive ? 'border-indigo-400 bg-white shadow' : 'border-zinc-200 bg-white hover:border-zinc-300'
                }`}
              >
                <div className="line-clamp-2 text-[13px] font-medium leading-tight text-zinc-800">
                  {t.en}
                </div>
                <div className="mt-1 line-clamp-1 text-[11px] text-zinc-500">{t.ru}</div>

                <button
                  onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id) }}
                  className="absolute right-1.5 top-1.5 hidden rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 group-hover:block"
                >
                  <X size={14} />
                </button>
              </div>
            )
          })}
        </div>

        {/* THE MAIN CONTAINER — exactly as requested */}
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          {/* English text — prominent, large, readable for children */}
          <div className="mb-1 text-[11px] font-medium uppercase tracking-[1.5px] text-indigo-600">АНГЛИЙСКИЙ</div>
          <div className="text-balance text-4xl font-semibold leading-tight tracking-[-0.3px] text-zinc-950">
            {current.en}
          </div>

          {/* Russian text */}
          <div className="mt-5 text-[11px] font-medium uppercase tracking-[1.5px] text-sky-600">РУССКИЙ ПЕРЕВОД</div>
          <div className="mt-1 text-2xl leading-snug text-zinc-700">
            {current.ru}
          </div>

          {/* Audio section: elongated English player + simple Russian button on the right */}
          <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-12">
            {/* English — big elongated player (left, wide) */}
            <div className="lg:col-span-8">
              <EnglishPlayer
                audioUrl={current.enAudioUrl}
                fallbackText={current.en}
                onRegenerate={() => handleRegenerateAudio(current.id)}
              />
            </div>

            {/* Russian — one simple button on the right, no need to scroll/scrub */}
            <div className="flex justify-center pt-1 lg:col-span-4 lg:justify-end lg:pt-0">
              <RussianAudioButton
                audioUrl={current.ruAudioUrl}
                fallbackText={current.ru}
                onRegenerate={() => handleRegenerateAudio(current.id)}
              />
            </div>
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

            <div className="flex-1" />

            <div className="text-xs text-zinc-400 self-center">
              Полезно для ребёнка: можно выделить часть фразы и зациклить на медленной скорости
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-zinc-500">
          Добавьте ключ xAI в Настройках, чтобы генерировать 15–20 естественных шаблонов с живой озвучкой американского английского.
        </div>
      </main>

      {/* Settings Dialog (addressing review note: xAI as primary "a") */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setIsSettingsOpen(false)}>
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold">Настройки</div>
              <button onClick={() => setIsSettingsOpen(false)}><X /></button>
            </div>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium">Ключ xAI (Grok API)</label>
                <input
                  type="password"
                  value={settings.xaiKey}
                  onChange={e => setSettings(s => ({ ...s, xaiKey: e.target.value }))}
                  placeholder="xai-..."
                  className="mt-1 w-full rounded-xl border px-4 py-3 font-mono text-sm"
                />
                <a href="https://console.x.ai/" target="_blank" className="text-xs text-indigo-600 underline">Получить ключ на console.x.ai</a>
                <p className="mt-1 text-[11px] text-zinc-500">Используется и для генерации шаблонов, и для озвучки (TTS).</p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Провайдер озвучки (TTS)</label>
                <div className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="tts" checked={settings.ttsProvider === 'xai'} onChange={() => setSettings(s => ({...s, ttsProvider: 'xai'}))} />
                    a) xAI (рекомендуется — один ключ, естественная речь + теги)
                  </label>
                  <label className="flex items-center gap-2 opacity-70">
                    <input type="radio" name="tts" checked={settings.ttsProvider === 'elevenlabs'} onChange={() => setSettings(s => ({...s, ttsProvider: 'elevenlabs'}))} />
                    b) ElevenLabs (отдельный ключ)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="tts" checked={settings.ttsProvider === 'browser'} onChange={() => setSettings(s => ({...s, ttsProvider: 'browser'}))} />
                    c) Браузер (без ключа, для демо)
                  </label>
                </div>
              </div>

              {settings.ttsProvider === 'elevenlabs' && (
                <div className="text-xs text-amber-600">Для ElevenLabs позже добавим отдельное поле ключа.</div>
              )}
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button onClick={() => setIsSettingsOpen(false)} className="rounded-2xl px-5 py-2.5 text-sm">Отмена</button>
              <button onClick={() => saveSettings(settings)} className="rounded-2xl bg-zinc-900 px-6 py-2.5 text-sm font-medium text-white">Сохранить</button>
            </div>

            <div className="mt-4 text-[10px] text-zinc-400">Ключи хранятся только в браузере. Для семьи и личного использования.</div>
          </div>
        </div>
      )}

      {/* Generate Dialog — compact "series of questions" as per request */}
      {isGenerateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={() => setIsGenerateOpen(false)}>
          <div className="w-full max-w-lg rounded-3xl bg-white p-7 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="text-xl font-semibold tracking-tight">Сгенерировать новые шаблоны с Grok</div>
            <p className="mt-1 text-sm text-zinc-600">15–20 естественных фраз. Высокая частотность, американский английский.</p>

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
                <input type="range" min={8} max={20} step={1} value={genCount} onChange={e => setGenCount(parseInt(e.target.value))} className="w-full accent-indigo-600" />
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
    </div>
  )
}
