export type CardImageParts = {
  code: string
  suffix: string
}

export function cardImagePartsFromImage(src: string | null | undefined): CardImageParts | null {
  if (!src) return null
  const match = src.match(/(?:^|\/)cards\/(\d+[ab]?)(_[^/.?]+)?\.avif(?:\?.*)?$/)
  return match ? { code: match[1], suffix: match[2] ?? '' } : null
}

export function cardDefinitionCodeFromImage(src: string | null | undefined): string | null {
  if (!src) return null
  const match = src.match(/(?:^|\/)cards\/c?(\d+[ab]?)\.(?:avif|jpg|jpeg|png|webp)(?:\?.*)?$/i)
  return match?.[1].replace(/b$/, '') ?? null
}
