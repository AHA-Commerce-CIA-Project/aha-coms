import { api } from '$lib/api/client'

type UploadData = {
  uploadUrl: string
  fileKey: string
}

type ConfirmData = {
  url: string
}

export async function uploadScreenshot(file: File): Promise<string> {
  const signedRes = await api.api.v1.uploads['signed-url'].get({
    query: { filename: file.name, contentType: file.type },
  })
  if (signedRes.error) throw new Error('Failed to get upload URL')

  const { uploadUrl, fileKey } = signedRes.data!.data as UploadData

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  })
  if (!putRes.ok) throw new Error('Upload failed')

  const confirmRes = await api.api.v1.uploads.confirm.post({ fileKey })
  if (confirmRes.error) throw new Error('Upload confirmation failed')

  return (confirmRes.data!.data as ConfirmData).url
}
