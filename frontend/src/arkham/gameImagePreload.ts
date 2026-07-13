import { cardImg } from '@/arkham/helpers'
import { toCardContents } from '@/arkham/types/Card'
import type { Game } from '@/arkham/types/Game'

const preloaded = new Set<string>()
const preloading = new Set<string>()

export async function loadAllGameImages(game: Game): Promise<void> {
  const pending: string[] = []
  for (const card of Object.values(game.cards)) {
    const { cardCode, isFlipped } = toCardContents(card)
    const url = cardImg(`${cardCode.replace(/^c/, '')}${isFlipped ? 'b' : ''}`)
    if (!preloaded.has(url) && !preloading.has(url)) pending.push(url)
  }
  if (pending.length === 0) return
  pending.forEach((url) => preloading.add(url))

  await Promise.all(
    pending.map(
      (url) =>
        new Promise<void>((resolve) => {
          const img = new Image()
          img.onload = () => {
            preloaded.add(url)
            preloading.delete(url)
            resolve()
          }
          img.onerror = () => {
            preloaded.add(url)
            preloading.delete(url)
            console.warn(`Could not preload ${url}`)
            resolve()
          }
          img.src = url
        }),
    ),
  )
}

export function preloadGameImages(game: Game): void {
  void loadAllGameImages(game).catch((e: unknown) => {
    console.error(e)
  })
}

export function _resetForTests(): void {
  preloaded.clear()
  preloading.clear()
}
