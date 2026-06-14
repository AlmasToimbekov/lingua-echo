'use client'

import React, { useEffect, useState } from 'react'
import { Settings, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Template } from '../lib/types'
import { SEED_TEMPLATES } from '../lib/seed'
import { loadTemplates, saveTemplates, revokeUnusedAudioUrls } from '../lib/storage'
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

    // Load settings (support old shape for migration)
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        setSettings({
          geminiKey: parsed.geminiKey || parsed.xaiKey || '',
          elevenKey: parsed.elevenKey || ''
        })
      }
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
    const count = Math.min(Math.max(5, genCount), 20)

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

        final.push({ id, en: g.en, ru: g.ru, enAudioUrl, ruAudioUrl })
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
              <Plus size={16} /> Сгенерировать шаблоны
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

      <main className="mx-auto max-w-6xl px-6 pt-8">
        <div className="flex gap-6">
          {/* Vertical left sidebar for templates (easier to scroll down than horizontal list).
              Selected is strongly highlighted. */}
          <div className="w-72 flex-shrink-0">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-zinc-600">
              <span>Мои шаблоны ({templates.length})</span>
              <button onClick={resetToSeeds} className="text-xs text-zinc-500 hover:text-zinc-700">Сбросить</button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto pr-1 space-y-1.5 border-r border-zinc-200">
              {templates.map((t) => {
                const isActive = t.id === currentId
                return (
                  <div
                    key={t.id}
                    onClick={() => switchTo(t.id)}
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

                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTemplate(t.id) }}
                      className="absolute right-1 top-1 hidden rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-500 group-hover:block"
                    >
                      <X size={13} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Main viewer area (the container) */}
          <div className="flex-1 min-w-0">
            {/* THE MAIN CONTAINER — bilingual + dual audio as requested */}
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
            <p className="mt-1 text-sm text-zinc-600">15–20 естественных фраз. Высокая частотность, американский английский. Требуется ключ Google Gemini.</p>

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
