import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * jsdom 26 n'expose PAS AudioContext (learnings T13/T6) : stub global exigé.
 * Les méthodes resume/play/pause sont des spies (prototype) pour vérifier le
 * séquencement : resume() au premier geste (jamais avant), une piste à la fois,
 * no-op si pas d'url.
 */
class MockAudioContext {
  static instances: MockAudioContext[] = []

  constructor() {
    MockAudioContext.instances.push(this)
  }

  resume(): Promise<void> {
    return Promise.resolve()
  }

  play(_url: string): void {}

  pause(): void {}
}

type UseSectionAudio = typeof import("../useSectionAudio").useSectionAudio

async function loadHook(): Promise<UseSectionAudio> {
  const mod = await import("../useSectionAudio")
  return mod.useSectionAudio
}

describe("useSectionAudio — déverrouillage geste + une piste à la fois", () => {
  beforeEach(() => {
    // Module singleton réinitialisé à chaque test (état partagé frais).
    vi.resetModules()
    vi.stubGlobal("AudioContext", MockAudioContext)
    MockAudioContext.instances = []
    vi.spyOn(MockAudioContext.prototype, "resume").mockResolvedValue(undefined)
    vi.spyOn(MockAudioContext.prototype, "play").mockImplementation(() => {})
    vi.spyOn(MockAudioContext.prototype, "pause").mockImplementation(() => {})
  })

  afterEach(() => {
    // window jsdom partagé entre tests : consomme les listeners "once" laissés
    // par les modules singleton précédents (sinon fuite vers le test suivant)
    for (const gesture of ["pointerdown", "touchstart", "scroll", "keydown"]) {
      window.dispatchEvent(new Event(gesture))
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test.each(["pointerdown", "touchstart", "scroll", "keydown"])(
    "le premier geste %s appelle resume() sur le contexte, jamais avant",
    async (gesture) => {
      const useSectionAudio = await loadHook()
      const { result } = renderHook(() => useSectionAudio())

      expect(MockAudioContext.instances).toHaveLength(0)

      act(() => {
        window.dispatchEvent(new Event(gesture))
      })

      expect(MockAudioContext.instances).toHaveLength(1)
      expect(vi.mocked(MockAudioContext.prototype.resume)).toHaveBeenCalledTimes(1)
      expect(result.current.isPlaying).toBe(false)
    },
  )

  test("jouer une 2ème section met en pause la 1ère (une seule piste à la fois)", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })
    expect(vi.mocked(MockAudioContext.prototype.play)).toHaveBeenCalledWith("/audio/a.mp3")
    expect(vi.mocked(MockAudioContext.prototype.pause)).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.playSectionAudio("B", "/audio/b.mp3")
    })
    expect(vi.mocked(MockAudioContext.prototype.pause)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(MockAudioContext.prototype.play)).toHaveBeenCalledWith("/audio/b.mp3")
    expect(vi.mocked(MockAudioContext.prototype.play)).toHaveBeenCalledTimes(2)
    expect(result.current.isPlaying).toBe(true)
  })

  test("url null → no-op : ni play ni pause", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    act(() => {
      result.current.playSectionAudio("A", null)
    })
    expect(vi.mocked(MockAudioContext.prototype.play)).not.toHaveBeenCalled()
    expect(vi.mocked(MockAudioContext.prototype.pause)).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })
    expect(vi.mocked(MockAudioContext.prototype.play)).toHaveBeenCalledTimes(1)
  })

  test("pauseCurrent() stoppe la piste en cours et passe isPlaying à false", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.pauseCurrent()
    })
    expect(vi.mocked(MockAudioContext.prototype.pause)).toHaveBeenCalledTimes(1)
    expect(result.current.isPlaying).toBe(false)
  })

  test("ne joue pas avant le premier geste (autoplay policy navigateur)", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })

    expect(MockAudioContext.instances).toHaveLength(0)
    expect(vi.mocked(MockAudioContext.prototype.play)).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)
  })

  test("échec silencieux propre si resume() est rejeté (audio bloqué avant geste)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    vi.mocked(MockAudioContext.prototype.resume).mockRejectedValueOnce(
      new Error("NotAllowedError: audio context blocked"),
    )

    const useSectionAudio = await loadHook()
    renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    expect(vi.mocked(MockAudioContext.prototype.resume)).toHaveBeenCalledTimes(1)
    expect(errorSpy).not.toHaveBeenCalled()
    errorSpy.mockRestore()
  })
})
