"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
// Always load backend env from server/.env regardless of the launch directory.
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
//# sourceMappingURL=env.js.map