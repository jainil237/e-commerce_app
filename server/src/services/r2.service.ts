import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import path from 'path'

const getR2Client = () => {
  if (!process.env.R2_ACCOUNT_ID) {
    throw new Error('R2_ACCOUNT_ID is not configured')
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

export const isR2Enabled = Boolean(
  process.env.R2_ACCOUNT_ID &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  process.env.R2_BUCKET_NAME
)

export const uploadBufferToR2 = async (
  buffer: Buffer,
  filename: string,
  mimetype: string,
  folder: 'products' | 'invoices' = 'products'
): Promise<string> => {
  const client = getR2Client()
  const bucket = process.env.R2_BUCKET_NAME!
  
  // Create a unique key inside the subfolder
  const uniqueKey = `${folder}/${Date.now()}-${filename.replace(/\s+/g, '-')}`

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: uniqueKey,
      Body: buffer,
      ContentType: mimetype,
    })
  )

  // Requires R2_PUBLIC_URL to be set to your bucket's custom domain (e.g. https://pub-xxxxxx.r2.dev)
  return `${process.env.R2_PUBLIC_URL!}/${uniqueKey}`
}
