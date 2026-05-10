export declare const isCloudinaryEnabled: boolean;
export declare const uploadBufferToCloudinary: (buffer: Buffer, filename: string, mimetype: string, folder?: "products" | "invoices") => Promise<string>;
export declare function getOptimisedUrl(publicUrl: string, options?: {
    width?: number;
    height?: number;
    crop?: 'fill' | 'fit' | 'thumb' | 'scale';
    quality?: 'auto' | number;
    format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
}): string;
export declare function deleteFromCloudinary(publicUrl: string): Promise<void>;
//# sourceMappingURL=cloudinary.service.d.ts.map