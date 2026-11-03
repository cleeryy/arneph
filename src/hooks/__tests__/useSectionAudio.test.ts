import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"

/**
 * jsdom 26 : `Audio` (HTMLAudioElement) n'est pas un vrai lecteur.
 * On stubbe le constructeur global pour vérifier le contrat public du hook :
 * un seul élément média partagé, src positionnée avant play(), pause() à la
 * bascule de piste, et rejet de play() avalé sans unhandled rejection.
 */
class MockAudio {
  static instances: MockAudio[] = []

  src = ""

  constructor() {
    MockAudio.instances.push(this)
  }

  play(): Promise<void> {
    return Promise.resolve()
  }

  pause(): void {}

  load(): void {}
}

type UseSectionAudio = typeof import("../useSectionAudio").useSectionAudio

async function loadHook(): Promise<UseSectionAudio> {
  const mod = await import("../useSectionAudio")
  return mod.useSectionAudio
}

describe("useSectionAudio — élément Audio partagé + une piste à la fois", () => {
  beforeEach(() => {
    // Module singleton réinitialisé à chaque test (état partagé frais).
    vi.resetModules()
    vi.stubGlobal("Audio", MockAudio)
    MockAudio.instances = []
    vi.spyOn(MockAudio.prototype, "play").mockResolvedValue(undefined)
    vi.spyOn(MockAudio.prototype, "pause").mockImplementation(() => {})
    vi.spyOn(MockAudio.prototype, "load").mockImplementation(() => {})
  })

  afterEach(() => {
    // window jsdom partagé entre tests : consomme les listeners "once" laissés
    // par les modules singleton précédents (sinon fuite vers le test suivant).
    for (const gesture of ["pointerdown", "touchstart", "scroll", "keydown"]) {
      window.dispatchEvent(new Event(gesture))
    }
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  test.each(["pointerdown", "touchstart", "scroll", "keydown"])(
    "le premier geste %s crée l'élément Audio partagé, jamais avant",
    async (gesture) => {
      const useSectionAudio = await loadHook()
      const { result } = renderHook(() => useSectionAudio())

      expect(MockAudio.instances).toHaveLength(0)

      act(() => {
        window.dispatchEvent(new Event(gesture))
      })

      expect(MockAudio.instances).toHaveLength(1)
      expect(result.current.isPlaying).toBe(false)
    },
  )

  test("playSectionAudio positionne src puis appelle play() sur l'élément partagé", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })

    expect(MockAudio.instances).toHaveLength(1)
    const el = MockAudio.instances[0]
    expect(el.src).toBe("/audio/a.mp3")
    expect(vi.mocked(MockAudio.prototype.play)).toHaveBeenCalledTimes(1)
    expect(result.current.isPlaying).toBe(true)
  })

  test("jouer une 2ème section met en pause la 1ère (une seule piste à la fois)", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })
    expect(MockAudio.instances).toHaveLength(1)
    expect(vi.mocked(MockAudio.prototype.pause)).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(true)

    act(() => {
      result.current.playSectionAudio("B", "/audio/b.mp3")
    })

    // Un seul élément média partagé : pas de 2ème instance.
    expect(MockAudio.instances).toHaveLength(1)
    expect(vi.mocked(MockAudio.prototype.pause)).toHaveBeenCalledTimes(1)
    expect(MockAudio.instances[0].src).toBe("/audio/b.mp3")
    expect(vi.mocked(MockAudio.prototype.play)).toHaveBeenCalledTimes(2)
    expect(result.current.isPlaying).toBe(true)
  })

  test("rejouer la même section ne coupe pas la piste en cours", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })

    expect(vi.mocked(MockAudio.prototype.pause)).not.toHaveBeenCalled()
    expect(MockAudio.instances).toHaveLength(1)
    expect(result.current.isPlaying).toBe(true)
  })

  test("url null → no-op : ni src ni play ni pause", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    act(() => {
      result.current.playSectionAudio("A", null)
    })
    expect(vi.mocked(MockAudio.prototype.play)).not.toHaveBeenCalled()
    expect(vi.mocked(MockAudio.prototype.pause)).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })
    expect(vi.mocked(MockAudio.prototype.play)).toHaveBeenCalledTimes(1)
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
    expect(vi.mocked(MockAudio.prototype.pause)).toHaveBeenCalledTimes(1)
    expect(result.current.isPlaying).toBe(false)
  })

  test("ne joue pas avant le premier geste (autoplay policy navigateur)", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })

    expect(MockAudio.instances).toHaveLength(0)
    expect(vi.mocked(MockAudio.prototype.play)).not.toHaveBeenCalled()
    expect(result.current.isPlaying).toBe(false)
  })

  test("play() rejeté → rejet avalé sans unhandled rejection, isPlaying repasse à false", async () => {
    const useSectionAudio = await loadHook()
    const { result } = renderHook(() => useSectionAudio())

    act(() => {
      window.dispatchEvent(new Event("pointerdown"))
    })

    const rejections: unknown[] = []
    const onUnhandled = (event: PromiseRejectionEvent): void => {
      rejections.push(event.reason)
      event.preventDefault()
    }
    window.addEventListener("unhandledrejection", onUnhandled)

    vi.mocked(MockAudio.prototype.play).mockRejectedValueOnce(
      new DOMException("play() failed", "NotAllowedError"),
    )

    await act(async () => {
      result.current.playSectionAudio("A", "/audio/a.mp3")
    })
    // Laisse le catch() du hook basculer l'état après le rejet.
    await act(async () => {})

    expect(vi.mocked(MockAudio.prototype.play)).toHaveBeenCalledTimes(1)
    expect(result.current.isPlaying).toBe(false)
    expect(rejections).toHaveLength(0)

    window.removeEventListener("unhandledrejection", onUnhandled)
  })
})
