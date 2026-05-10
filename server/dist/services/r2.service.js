"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadBufferToR2 = exports.isR2Enabled = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const getR2Client = () => {
    if (!process.env.R2_ACCOUNT_ID) {
        throw new Error('R2_ACCOUNT_ID is not configured');
    }
    return new client_s3_1.S3Client({
        region: 'auto',
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });
};
exports.isR2Enabled = Boolean(process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME);
const uploadBufferToR2 = async (buffer, filename, mimetype, folder = 'products') => {
    const client = getR2Client();
    const bucket = process.env.R2_BUCKET_NAME;
    // Create a unique key inside the subfolder
    const uniqueKey = `${folder}/${Date.now()}-${filename.replace(/\s+/g, '-')}`;
    await client.send(new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: uniqueKey,
        Body: buffer,
        ContentType: mimetype,
    }));
    // Requires R2_PUBLIC_URL to be set to your bucket's custom domain (e.g. https://pub-xxxxxx.r2.dev)
    return `${process.env.R2_PUBLIC_URL}/${uniqueKey}`;
};
exports.uploadBufferToR2 = uploadBufferToR2;
//# sourceMappingURL=r2.service.js.map