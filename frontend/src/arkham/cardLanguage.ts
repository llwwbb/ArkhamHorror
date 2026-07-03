export type CardImageParts = {
  code: string
  suffix: string
}

export function cardImagePartsFromImage(src: string | null | undefined): CardImageParts | null {
  if (!src) return null
  const match = src.match(/(?:^|\/)cards\/(\d+b?)(_[^/.?]+)?\.avif(?:\?.*)?$/)
  return match ? { code: match[1], suffix: match[2] ?? '' } : null
}
