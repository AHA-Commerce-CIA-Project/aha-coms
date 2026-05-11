export const KITTA_CODES = ['K', 'I', 'T1', 'T2', 'A'] as const
export type KittaCode = (typeof KITTA_CODES)[number]

export const KITTA_LABELS: Record<KittaCode, string> = {
  K: 'Kualitas Hasil',
  I: 'Inisiatif',
  T1: 'Taat Aturan',
  T2: 'Teamwork',
  A: 'Kualitas Absensi',
}

export const KITTA_DESCRIPTIONS: Record<KittaCode, string> = {
  K: 'Quality of work output',
  I: 'Initiative and proactiveness',
  T1: 'Rule compliance / SOP adherence',
  T2: 'Collaboration and team contribution',
  A: 'Attendance quality',
}
