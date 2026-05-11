export const POINT_CATEGORY_CODES = ['BINTANG', 'PENALTI', 'POIN_AHA'] as const
export type PointCategoryCode = (typeof POINT_CATEGORY_CODES)[number]

export const POINT_CATEGORY_LABELS: Record<PointCategoryCode, string> = {
  BINTANG: 'Poin Bintang sAHAbat',
  PENALTI: 'Poin Penalti Staff AHA',
  POIN_AHA: 'Poin AHA',
}

export const POINT_CATEGORY_ICONS: Record<PointCategoryCode, string> = {
  BINTANG: 'star',
  PENALTI: 'alert-triangle',
  POIN_AHA: 'award',
}
