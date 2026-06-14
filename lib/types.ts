export interface Template {
  id: string
  en: string
  ru: string
  enAudioUrl?: string
  ruAudioUrl?: string
  folder?: string // 'learned' for studied items; '' or absent = active/uncategorized; custom strings for user folders
}
