import { randomUUID } from 'crypto'
import { mkdir, writeFile, access, stat } from 'fs/promises'
import { dirname, join } from 'path'
import { Storage } from '@google-cloud/storage'

const UPLOAD_DIR = join(process.cwd(), 'uploads')
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const SIGNED_URL_EXPIRY = 15 * 60 * 1000 // 15 minutes

const GCS_BUCKET = process.env.GCS_BUCKET
const isGCS = !!GCS_BUCKET

if (process.env.NODE_ENV === 'production' && !GCS_BUCKET) {
  throw new Error('GCS_BUCKET is required in production; refusing to fall back to local disk storage')
}

const gcs = isGCS ? new Storage() : null
const bucket = isGCS ? gcs!.bucket(GCS_BUCKET!) : null

type SignedUploadResult = {
  readonly uploadUrl: string
  readonly fileKey: string
}

function validateContentType(contentType: string): void {
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new InvalidFileTypeError(contentType)
  }
}

export function generateFileKey(originalName: string): string {
  const ext = originalName.split('.').pop() ?? 'jpg'
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `points/${year}/${month}/${Date.now()}-${randomUUID()}.${ext}`
}

/**
 * Generates a V4 signed PUT URL for direct browser-to-GCS upload.
 * In dev mode (no GCS_BUCKET), returns a local upload path.
 */
export async function generateSignedUploadUrl(
  contentType: string,
  originalName: string,
): Promise<SignedUploadResult> {
  validateContentType(contentType)

  const fileKey = generateFileKey(originalName)

  if (!bucket) {
    await ensureUploadDir()
    return {
      uploadUrl: `/api/v1/uploads/${fileKey}`,
      fileKey,
    }
  }

  const file = bucket.file(fileKey)
  const [uploadUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'write',
    expires: Date.now() + SIGNED_URL_EXPIRY,
    contentType,
  })

  return { uploadUrl, fileKey }
}

/**
 * Generates a V4 signed GET URL for reading a file from GCS.
 * In dev mode, returns the local serve path.
 */
export async function generateSignedReadUrl(fileKey: string): Promise<string> {
  if (!bucket) {
    return `/api/v1/uploads/${fileKey}`
  }

  const file = bucket.file(fileKey)
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + SIGNED_URL_EXPIRY,
  })

  return url
}

/**
 * Verifies that an uploaded file exists in GCS (or local fs in dev).
 */
export async function verifyUpload(fileKey: string): Promise<boolean> {
  if (!bucket) {
    try {
      const filePath = join(UPLOAD_DIR, fileKey)
      const stats = await stat(filePath)
      return stats.isFile()
    } catch {
      return false
    }
  }

  const file = bucket.file(fileKey)
  const [exists] = await file.exists()
  return exists
}

/**
 * Stores uploaded file data to GCS (production) or local filesystem (dev).
 */
export async function storeFile(
  fileKey: string,
  data: Buffer,
  contentType: string,
): Promise<string> {
  validateContentType(contentType)

  if (data.length > MAX_FILE_SIZE) {
    throw new FileTooLargeError(data.length)
  }

  if (bucket) {
    const file = bucket.file(fileKey)
    await file.save(data, { contentType, resumable: false })
    return `/api/v1/uploads/${fileKey}`
  }

  const filePath = join(UPLOAD_DIR, fileKey)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, data)

  return `/api/v1/uploads/${fileKey}`
}

export function getFilePath(fileKey: string): string {
  return join(UPLOAD_DIR, fileKey)
}

async function ensureUploadDir(): Promise<void> {
  try {
    await access(UPLOAD_DIR)
  } catch {
    await mkdir(UPLOAD_DIR, { recursive: true })
  }
}

// Domain errors
export class InvalidFileTypeError extends Error {
  constructor(type: string) {
    super(`Invalid file type: ${type}. Allowed: ${ALLOWED_TYPES.join(', ')}`)
    this.name = 'InvalidFileTypeError'
  }
}

export class FileTooLargeError extends Error {
  constructor(size: number) {
    super(`File too large: ${(size / 1024 / 1024).toFixed(1)}MB. Max: ${MAX_FILE_SIZE / 1024 / 1024}MB`)
    this.name = 'FileTooLargeError'
  }
}
