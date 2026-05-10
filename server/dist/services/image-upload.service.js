"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadProductImages = void 0;
const storage_service_1 = require("./storage.service");
const uploadProductImages = async (files) => {
    if (!files || files.length === 0) {
        return [];
    }
    const urls = await Promise.all(files.map(async (file) => {
        const url = await (0, storage_service_1.uploadBuffer)(file.buffer, file.originalname, file.mimetype, 'products');
        return url;
    }));
    return urls.map(url => ({ url }));
};
exports.uploadProductImages = uploadProductImages;
//# sourceMappingURL=image-upload.service.js.map