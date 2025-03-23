import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Creates a temporary directory with a random name
 * @returns {Promise<string>} Path to the created temporary directory
 */
export async function createTempDir() {
    const tempBaseDir = path.join(__dirname, '..', '..', 'temp');
    if (!fs.existsSync(tempBaseDir)) {
        fs.mkdirSync(tempBaseDir, { recursive: true });
    }

    const randomDirName = crypto.randomBytes(16).toString('hex');
    const tempDir = path.join(tempBaseDir, randomDirName);
    fs.mkdirSync(tempDir);

    return tempDir;
}

/**
 * Recursively removes a directory and its contents
 * @param {string} dirPath - Path to the directory to remove
 */
export async function cleanupTempDir(dirPath) {
    if (!dirPath || !fs.existsSync(dirPath)) return;

    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            const curPath = path.join(dirPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                await cleanupTempDir(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        }
        fs.rmdirSync(dirPath);
    } catch (error) {
        console.error('Error cleaning up temp directory:', error);
        throw error;
    }
}

/**
 * Cleans up old temporary directories
 * @param {number} maxAge - Maximum age in milliseconds before cleanup
 */
export async function cleanupOldTempDirs(maxAge = 24 * 60 * 60 * 1000) { // Default 24 hours
    const tempBaseDir = path.join(__dirname, '..', '..', 'temp');
    if (!fs.existsSync(tempBaseDir)) return;

    try {
        const now = Date.now();
        const dirs = fs.readdirSync(tempBaseDir);
        
        for (const dir of dirs) {
            const dirPath = path.join(tempBaseDir, dir);
            const stats = fs.statSync(dirPath);
            
            if (now - stats.mtimeMs > maxAge) {
                await cleanupTempDir(dirPath);
            }
        }
    } catch (error) {
        console.error('Error cleaning up old temp directories:', error);
    }
}
