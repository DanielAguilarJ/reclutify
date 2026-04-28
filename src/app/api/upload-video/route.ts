import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { filename?: string; contentType?: string };
    const { filename, contentType } = body;

    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Missing filename' },
        { status: 400 }
      );
    }

    const key = filename;
    const resolvedContentType = contentType || 'video/webm';

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: resolvedContentType,
    });

    // Presigned URL valid for 15 minutes — plenty of time for the client PUT
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    return NextResponse.json({ uploadUrl, publicUrl });
  } catch (error) {
    console.error('Presign Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
