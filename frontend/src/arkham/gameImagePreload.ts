import { imgsrc } from '@/arkham/helpers'
import { toCardContents } from '@/arkham/types/Card'
import type { Game } from '@/arkham/types/Game'

const preloaded = new Set<string>()

export async function loadAllGameImages(game: Game): Promise<void> {
  const pending: string[] = []
  for (const card of Object.values(game.cards)) {
    const { cardCode, isFlipped } = toCardContents(card)
    const url = imgsrc(`cards/${cardCode.replace(/^c/, '')}${isFlipped ? 'b' : ''}.avif`)
    if (!preloaded.has(url)) pending.push(url)
  }
  if (pending.length === 0) return

  await Promise.all(
    pending.map(
      (url) =>
        new Promise<void>((resolve, reject) => {
          const img = new Image()
          img.onload = () => {
            preloaded.add(url)
            resolve()
          }
          img.onerror = () => {
            preloaded.add(url)
            reject(`Could not load ${url}`)
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
}
