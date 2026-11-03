import * as React from "react"

export interface UseSectionAudioResult {
  playSectionAudio(sectionId: string, audioUrl: string | null): void
  pauseCurrent(): void
  isPlaying: boolean
}

// Singleton module : un seul élément média partagé par toute l'app → garantie
// "une seule piste à la fois" même consommé par plusieurs sections.
let audio: HTMLAudioElement | null = null
let currentSectionId: string | null = null
let currentUrl: string | null = null
let playing = false
let unlocked = false
let gesturesAttached = false
const listeners = new Set<() => void>()

function resolveAudioCtor(): (new () => HTMLAudioElement) | null {
  const g = globalThis as { Audio?: new () => HTMLAudioElement }
  return typeof g.Audio === "function" ? g.Audio : null
}

function getAudio(): HTMLAudioElement | null {
  if (audio !== null) return audio
  const Ctor = resolveAudioCtor()
  if (Ctor === null) return null
  try {
    audio = new Ctor()
  } catch {
    audio = null
  }
  return audio
}

function emitChange(): void {
  for (const listener of listeners) listener()
}

function handleGesture(): void {
  if (unlocked) return
  const el = getAudio()
  if (el === null) return
  unlocked = true
}

function attachGestures(): void {
  if (gesturesAttached || typeof window === "undefined") return
  gesturesAttached = true
  const options: AddEventListenerOptions = { once: true, passive: true }
  window.addEventListener("pointerdown", handleGesture, options)
  window.addEventListener("touchstart", handleGesture, options)
  window.addEventListener("scroll", handleGesture, options)
  window.addEventListener("keydown", handleGesture, options)
}

function subscribe(listener: () => void): () => void {
  attachGestures()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): boolean {
  return playing
}

function playSectionAudio(sectionId: string, audioUrl: string | null): void {
  if (audioUrl === null || !unlocked) return
  const el = getAudio()
  if (el === null) return
  if (currentSectionId !== null && currentSectionId !== sectionId) {
    el.pause()
  }
  if (currentUrl !== audioUrl) {
    el.src = audioUrl
    currentUrl = audioUrl
  }
  currentSectionId = sectionId
  playing = true
  emitChange()
  // play() peut être rejeté (autoplay policy, source illisible) : échec
  // silencieux sans unhandled rejection, isPlaying repasse à false.
  void Promise.resolve(el.play()).catch(() => {
    if (currentSectionId === sectionId) {
      currentSectionId = null
      currentUrl = null
      playing = false
      emitChange()
    }
  })
}

function pauseCurrent(): void {
  if (audio !== null && playing) audio.pause()
  currentSectionId = null
  currentUrl = null
  playing = false
  emitChange()
}

export function useSectionAudio(): UseSectionAudioResult {
  const isPlaying = React.useSyncExternalStore(subscribe, getSnapshot, () => false)
  return { playSectionAudio, pauseCurrent, isPlaying }
}
