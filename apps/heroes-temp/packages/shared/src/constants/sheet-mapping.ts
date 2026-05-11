export const KITTA_SHEET_MAP: Record<string, string> = {
  'Kualitas Hasil': 'K',
  'Inisiatif': 'I',
  'Taat Aturan': 'T1',
  'Teamwork': 'T2',
  'Kualitas Absensi': 'A',
}

export const EMPLOYEE_HEADERS = {
  NAME: 'Nama Lengkap',
  ATTENDANCE_NAME: 'Nama Absen',
  EMAIL: 'Email',
  PHONE: 'HP',
  TEAM: 'Tim',
  POSITION: 'Jabatan',
  STATUS: 'Status',
  LEADER: 'Penilai/Leader',
  TALENTA_ID: 'ID',
} as const

export const BINTANG_HEADERS = {
  TIMESTAMP: 'Timestamp',
  NAME: 'Nama Staff',
  REASON: 'Perbuatan',
  SCREENSHOT: 'Upload screenshot / file yang bersangkutan',
} as const

export const PENALTI_HEADERS = {
  TIMESTAMP: 'Timestamp',
  NAME: 'Nama Staff',
  KITTA: 'Komponen KITTA yang terpengaruh',
  REASON: 'Tuliskan kejadian secara lengkap dan sesingkat mungkin',
  POINTS: 'Tingkat pelanggaran',
  SCREENSHOT: 'Upload screenshot / file yang bersangkutan',
} as const

export const POIN_AHA_HEADERS = {
  TIMESTAMP: 'Timestamp',
  NAME: 'Nama Staff',
  REASON: 'Kegiatan',
  POINTS: 'Level',
  SCREENSHOT: 'Upload screenshot / file yang bersangkutan',
} as const

export const REDEEM_HEADERS = {
  TIMESTAMP: 'Timestamp',
  NAME: 'Nama Lengkap Staff',
  TOTAL_POINTS: 'Total perolehan Poin AHA tahun ini',
  REWARD: 'Hadiah yang ingin ditukarkan',
  EMAIL: 'Email Address',
  NOTES: 'Keterangan tambahan',
} as const
