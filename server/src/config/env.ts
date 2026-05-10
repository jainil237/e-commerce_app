import path from 'path'
import dotenv from 'dotenv'

// Always load backend env from server/.env regardless of the launch directory.
dotenv.config({ path: path.resolve(__dirname, '../../.env') })
