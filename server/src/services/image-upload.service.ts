import { uploadBuffer } from './storage.service'

export interface UploadedImage {
  url: string
}

export const uploadProductImages = async (files: Express.Multer.File[]): Promise<UploadedImage[]> => {
  if (!files || files.length === 0) {
    return []
  }

  const urls = await Promise.all(
    files.map(async (file) => {
      const url = await uploadBuffer(file.buffer, file.originalname, file.mimetype, 'products')
      return url
    })
  )

  return urls.map(url => ({ url }))
}
