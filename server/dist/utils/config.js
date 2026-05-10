"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoreConfig = getStoreConfig;
exports.getTrackingUrl = getTrackingUrl;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
let cachedConfig = null;
function getStoreConfig() {
    if (cachedConfig) {
        return cachedConfig;
    }
    const configPath = path_1.default.join(process.cwd(), '..', 'config', 'store.config.json');
    try {
        const configFile = fs_1.default.readFileSync(configPath, 'utf-8');
        cachedConfig = JSON.parse(configFile);
        return cachedConfig;
    }
    catch (error) {
        console.error('Failed to load store config:', error);
        throw new Error('Store configuration file not found or invalid');
    }
}
function getTrackingUrl(courier, awb) {
    const config = getStoreConfig();
    const template = config.courier.trackingUrls[courier];
    if (!template) {
        return '#';
    }
    return template.replace('{awb}', awb);
}
//# sourceMappingURL=config.js.map