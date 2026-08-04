import * as React from "react"

/**
 * Contrat minimal du player audio.
 * Le vrai AudioContext (lib.dom) n'expose ni play(url) ni pause() : l'intégration
 * T19 branchera l'élément <audio> réel ; ce contrat permet le TDD par stub
 * (MockAudioContext resume/play/pause).
 */
type AudioPlayer = {
  resume(): void | Promise<void>
  play(url: string): void
  pause(): void
}

export interface UseSectionAudioResult {
  playSectionAudio(sectionId: string, audioUrl: string | null): void
  pauseCurrent(): void
  isPlaying: boolean
}

// Singleton module : état audio partagé par toute l'app → garantie "une seule
// piste à la fois" même consommé par plusieurs sections (T19).
let player: AudioPlayer | null = null
let currentSectionId: string | null = null
let playing = false
let unlocked = false
let gesturesAttached = false
const listeners = new Set<() => void>()

function resolveAudioContextCtor(): (new () => AudioContext) | null {
  const g = globalThis as {
    AudioContext?: new () => AudioContext
    webkitAudioContext?: new () => AudioContext
  }
  const Ctor = g.AudioContext ?? g.webkitAudioContext
  return typeof Ctor === "function" ? Ctor : null
}

function getPlayer(): AudioPlayer | null {
  if (player !== null) return player
  const Ctor = resolveAudioContextCtor()
  if (Ctor === null) return null
  try {
    // AudioContext réel sans play/pause : cast borné vers le contrat du player
    player = new Ctor() as unknown as AudioPlayer
  } catch {
    player = null
  }
  return player
}

function emitChange(): void {
  for (const listener of listeners) listener()
}

function handleGesture(): void {
  if (unlocked) return
  const p = getPlayer()
  if (p === null) return
  unlocked = true
  // Autoplay policy → resume() peut être rejeté (NotAllowedError) : échec silencieux
  void Promise.resolve(p.resume()).catch(() => {})
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
  const p = getPlayer()
  if (p === null) return
  if (currentSectionId !== null && currentSectionId !== sectionId) {
    p.pause()
  }
  currentSectionId = sectionId
  playing = true
  p.play(audioUrl)
  emitChange()
}

function pauseCurrent(): void {
  if (player !== null && playing) player.pause()
  currentSectionId = null
  playing = false
  emitChange()
}

export function useSectionAudio(): UseSectionAudioResult {
  const isPlaying = React.useSyncExternalStore(subscribe, getSnapshot, () => false)
  return { playSectionAudio, pauseCurrent, isPlaying }
}
