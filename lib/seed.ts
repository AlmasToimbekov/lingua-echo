import { Template } from './types'

/** Curated starter deck: easy → medium → easy … for families trying the app without API keys. */
export const SEED_TEMPLATES: Template[] = [
  {
    id: 'seed-1',
    en: 'Hello!',
    ru: 'Привет!',
  },
  {
    id: 'seed-2',
    en: 'Can you help me, please?',
    ru: 'Ты можешь мне помочь, пожалуйста?',
  },
  {
    id: 'seed-3',
    en: 'Thank you so much!',
    ru: 'Большое спасибо!',
  },
  {
    id: 'seed-4',
    en: 'I want some water.',
    ru: 'Я хочу воды.',
  },
  {
    id: 'seed-5',
    en: "Let's go outside and play!",
    ru: 'Пойдём на улицу играть!',
  },
  {
    id: 'seed-6',
    en: "I don't understand. Can you say that again?",
    ru: 'Я не понимаю. Повтори, пожалуйста.',
  },
  {
    id: 'seed-7',
    en: 'Good night!',
    ru: 'Спокойной ночи!',
  },
  {
    id: 'seed-8',
    en: 'What time is it now?',
    ru: 'Сколько сейчас времени?',
  },
  {
    id: 'seed-9',
    en: 'See you later!',
    ru: 'До встречи!',
  },
  {
    id: 'seed-10',
    en: 'Can we watch a movie together tonight?',
    ru: 'Мы можем вечером посмотреть фильм вместе?',
  },
]

export function createSeedDeck(): Template[] {
  return SEED_TEMPLATES.map((t) => ({ ...t, folder: '' }))
}