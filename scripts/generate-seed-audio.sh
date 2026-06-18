#!/usr/bin/env bash
# Generates bundled starter audio into public/seed-audio/{en,ru}/NN.mp3
# Re-run after editing lib/seed.ts phrases. Requires macOS `say` + ffmpeg.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EN_DIR="$ROOT/public/seed-audio/en"
RU_DIR="$ROOT/public/seed-audio/ru"
TMP="$ROOT/.tmp-seed-audio"
EN_VOICE="${EN_VOICE:-Samantha}"
RU_VOICE="${RU_VOICE:-Milena}"

mkdir -p "$EN_DIR" "$RU_DIR" "$TMP"

render() {
  local index="$1"
  local lang="$2"
  local text="$3"
  local voice="$4"
  local outdir="$5"
  local file
  file="$(printf '%02d.mp3' "$index")"
  local aiff="$TMP/${lang}-${file%.mp3}.aiff"
  local mp3="$outdir/$file"

  say -v "$voice" -o "$aiff" "$text"
  ffmpeg -y -loglevel error -i "$aiff" -codec:a libmp3lame -qscale:a 3 "$mp3"
  rm -f "$aiff"
  echo "  ✓ $mp3"
}

echo "Generating English (voice: $EN_VOICE)…"
render 1 en "Hello!" "$EN_VOICE" "$EN_DIR"
render 2 en "Can you help me, please?" "$EN_VOICE" "$EN_DIR"
render 3 en "Thank you so much!" "$EN_VOICE" "$EN_DIR"
render 4 en "I want some water." "$EN_VOICE" "$EN_DIR"
render 5 en "Let's go outside and play!" "$EN_VOICE" "$EN_DIR"
render 6 en "I don't understand. Can you say that again?" "$EN_VOICE" "$EN_DIR"
render 7 en "Good night!" "$EN_VOICE" "$EN_DIR"
render 8 en "What time is it now?" "$EN_VOICE" "$EN_DIR"
render 9 en "See you later!" "$EN_VOICE" "$EN_DIR"
render 10 en "Can we watch a movie together tonight?" "$EN_VOICE" "$EN_DIR"

echo "Generating Russian (voice: $RU_VOICE)…"
render 1 ru "Привет!" "$RU_VOICE" "$RU_DIR"
render 2 ru "Ты можешь мне помочь, пожалуйста?" "$RU_VOICE" "$RU_DIR"
render 3 ru "Большое спасибо!" "$RU_VOICE" "$RU_DIR"
render 4 ru "Я хочу воды." "$RU_VOICE" "$RU_DIR"
render 5 ru "Пойдём на улицу играть!" "$RU_VOICE" "$RU_DIR"
render 6 ru "Я не понимаю. Повтори, пожалуйста." "$RU_VOICE" "$RU_DIR"
render 7 ru "Спокойной ночи!" "$RU_VOICE" "$RU_DIR"
render 8 ru "Сколько сейчас времени?" "$RU_VOICE" "$RU_DIR"
render 9 ru "До встречи!" "$RU_VOICE" "$RU_DIR"
render 10 ru "Мы можем вечером посмотреть фильм вместе?" "$RU_VOICE" "$RU_DIR"

rmdir "$TMP" 2>/dev/null || true
echo "Done — 20 files in public/seed-audio/"