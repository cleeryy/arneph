import * as React from "react"

export interface UseSectionAudioResult {
  playSectionAudio(sectionId: string, audioUrl: string | null): void
  pauseCurrent(): void
  isPlaying: boolean
  /**
   * `true` dès qu'un geste utilisateur réel (pointerdown, touchstart, scroll,
   * keydown) a déverrouillé la lecture. Avant ça, `playSectionAudio()` est un
   * no-op : aucune lecture automatique imposée par le navigateur.
   */
  unlocked: boolean
  /**
   * Souscription aux déverrouillages. Permet aux consommateurs de rejouer la
   * section qu'ils avaient mémorisée quand l'autoplay était encore bloqué.
   * Retourne la fonction de désabonnement.
   */
  onUnlocked(listener: () => void): () => void
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
// Set séparé du store : notifier un déverrouillage peut déclencher une lecture
// (qui émet elle-même sur `listeners`). Mélanger les deux provoquerait une
// itération réentrante du même Set.
const unlockListeners = new Set<() => void>()

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
  emitChange()
  // Copie : un listener peut se désabonner (ou en ajouter) pendant l'itération.
  for (const listener of [...unlockListeners]) listener()
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

function onUnlocked(listener: () => void): () => void {
  attachGestures()
  unlockListeners.add(listener)
  return () => {
    unlockListeners.delete(listener)
  }
}

function getPlayingSnapshot(): boolean {
  return playing
}

function getUnlockedSnapshot(): boolean {
  return unlocked
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
  const isPlaying = React.useSyncExternalStore(subscribe, getPlayingSnapshot, () => false)
  const isUnlocked = React.useSyncExternalStore(subscribe, getUnlockedSnapshot, () => false)
  return { playSectionAudio, pauseCurrent, isPlaying, unlocked: isUnlocked, onUnlocked }
}
