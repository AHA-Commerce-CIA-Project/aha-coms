import { describe, expect, it } from 'bun:test'
import { InvalidFileTypeError, FileTooLargeError, generateSignedUploadUrl, storeFile, verifyUpload, getFilePath } from './storage'
import { unlink } from 'fs/promises'

describe('storage service (dev mode — no GCS_BUCKET)', () => {
  describe('generateSignedUploadUrl', () => {
    it('returns a local upload URL and fileKey for valid content type', async () => {
      const result = await generateSignedUploadUrl('image/png', 'screenshot.png')
      expect(result.uploadUrl).toStartWith('/api/v1/uploads/')
      expect(result.fileKey).toEndWith('.png')
      expect(result.fileKey).toContain('-')
    })

    it('throws InvalidFileTypeError for disallowed type', async () => {
      expect(generateSignedUploadUrl('application/pdf', 'doc.pdf')).rejects.toBeInstanceOf(InvalidFileTypeError)
    })
  })

  describe('storeFile', () => {
    it('stores a file and returns its URL', async () => {
      const data = Buffer.from('fake image data')
      const url = await storeFile('test-file.png', data, 'image/png')
      expect(url).toBe('/api/v1/uploads/test-file.png')

      // Cleanup
      await unlink(getFilePath('test-file.png'))
    })

    it('throws FileTooLargeError for oversized file', async () => {
      const data = Buffer.alloc(11 * 1024 * 1024) // 11MB
      expect(storeFile('big.png', data, 'image/png')).rejects.toBeInstanceOf(FileTooLargeError)
    })

    it('throws InvalidFileTypeError for disallowed content type', async () => {
      const data = Buffer.from('data')
      expect(storeFile('doc.pdf', data, 'application/pdf')).rejects.toBeInstanceOf(InvalidFileTypeError)
    })
  })

  describe('verifyUpload', () => {
    it('returns false for non-existent file', async () => {
      const exists = await verifyUpload('nonexistent-file.png')
      expect(exists).toBe(false)
    })

    it('returns true for existing file', async () => {
      const data = Buffer.from('test')
      await storeFile('verify-test.png', data, 'image/png')

      const exists = await verifyUpload('verify-test.png')
      expect(exists).toBe(true)

      await unlink(getFilePath('verify-test.png'))
    })
  })
})
