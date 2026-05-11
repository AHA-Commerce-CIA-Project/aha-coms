import { Elysia, t } from 'elysia'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import * as storage from '../services/storage'

export const uploadsRoute = new Elysia({ prefix: '/uploads' })

  // GET /uploads/signed-url — generate a signed URL for direct GCS upload
  .get('/signed-url', async ({ query, set }) => {
    try {
      const result = await storage.generateSignedUploadUrl(query.contentType, query.filename)
      return { success: true, data: result, error: null }
    } catch (err) {
      if (err instanceof storage.InvalidFileTypeError) {
        set.status = 422
        return { success: false, data: null, error: { code: 'INVALID_FILE_TYPE', message: err.message } }
      }
      set.status = 503
      return { success: false, data: null, error: { code: 'STORAGE_ERROR', message: 'Failed to generate upload URL' } }
    }
  }, {
    query: t.Object({
      filename: t.String({ minLength: 1 }),
      contentType: t.String({ minLength: 1 }),
    }),
  })

  // POST /uploads/confirm — verify upload completed and get read URL
  .post('/confirm', async ({ body, set }) => {
    try {
      const exists = await storage.verifyUpload(body.fileKey)
      if (!exists) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: 'Upload not found in storage' } }
      }

      const readUrl = await storage.generateSignedReadUrl(body.fileKey)
      return { success: true, data: { fileKey: body.fileKey, url: readUrl }, error: null }
    } catch {
      set.status = 503
      return { success: false, data: null, error: { code: 'STORAGE_ERROR', message: 'Failed to verify upload' } }
    }
  }, {
    body: t.Object({
      fileKey: t.String({ minLength: 1 }),
    }),
  })

  // POST /uploads — direct file upload (dev mode fallback)
  .post('/', async ({ body, set }) => {
    const file = body.file

    if (!file) {
      set.status = 400
      return { success: false, data: null, error: { code: 'BAD_REQUEST', message: 'No file provided' } }
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer())
      const fileKey = storage.generateFileKey(file.name)
      const url = await storage.storeFile(fileKey, buffer, file.type)

      set.status = 201
      return { success: true, data: { url, fileKey }, error: null }
    } catch (err) {
      if (err instanceof storage.InvalidFileTypeError) {
        set.status = 422
        return { success: false, data: null, error: { code: 'INVALID_FILE_TYPE', message: err.message } }
      }
      if (err instanceof storage.FileTooLargeError) {
        set.status = 413
        return { success: false, data: null, error: { code: 'FILE_TOO_LARGE', message: err.message } }
      }
      throw err
    }
  }, {
    body: t.Object({
      file: t.File(),
    }),
  })

  // GET /uploads/* — serve file (dev) or redirect to signed URL (prod)
  .get('/*', async ({ params, set }) => {
    const fileKey = (params as Record<string, string>)['*']
    if (!fileKey) {
      set.status = 400
      return { success: false, data: null, error: { code: 'BAD_REQUEST', message: 'Missing file key' } }
    }

    // In GCS mode, generate a signed read URL
    if (process.env.GCS_BUCKET) {
      try {
        const url = await storage.generateSignedReadUrl(fileKey)
        set.redirect = url
        return
      } catch {
        set.status = 503
        return { success: false, data: null, error: { code: 'STORAGE_ERROR', message: 'Failed to generate read URL' } }
      }
    }

    // Dev mode — serve from local filesystem
    const filePath = storage.getFilePath(fileKey)

    try {
      const stats = await stat(filePath)
      if (!stats.isFile()) {
        set.status = 404
        return { success: false, data: null, error: { code: 'NOT_FOUND', message: 'File not found' } }
      }

      const ext = fileKey.split('.').pop()?.toLowerCase()
      const contentTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
        gif: 'image/gif',
      }
      const contentType = contentTypes[ext ?? ''] ?? 'application/octet-stream'

      const stream = createReadStream(filePath)
      const webStream = Readable.toWeb(stream) as ReadableStream

      return new Response(webStream, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': stats.size.toString(),
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    } catch {
      set.status = 404
      return { success: false, data: null, error: { code: 'NOT_FOUND', message: 'File not found' } }
    }
  })
