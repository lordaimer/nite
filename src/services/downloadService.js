import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Downloads a file from Telegram using the bot's getFile method
 * @param {TelegramBot} bot - The Telegram bot instance
 * @param {string} fileId - The file ID to download
 * @returns {Promise<string>} The path to the downloaded file
 */
export async function downloadFile(bot, fileId) {
    let uniqueDir = null;
    try {
        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, '..', '..', 'temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Create a unique subdirectory for this download
        uniqueDir = path.join(tempDir, crypto.randomBytes(8).toString('hex'));
        fs.mkdirSync(uniqueDir);

        // Get file info from Telegram
        const file = await bot.getFile(fileId);

        // Create unique filename
        const uniqueFilename = `${Date.now()}.zip`;
        const localFilePath = path.join(uniqueDir, uniqueFilename);

        // Download file using bot's built-in method
        try {
            await bot.downloadFile(fileId, uniqueDir);

            // The downloaded file will be in uniqueDir with the original name
            const downloadedFiles = fs.readdirSync(uniqueDir);
            if (downloadedFiles.length === 0) {
                throw new Error('No files were downloaded');
            }

            // Rename the downloaded file to our unique name
            const downloadedFile = path.join(uniqueDir, downloadedFiles[0]);
            fs.renameSync(downloadedFile, localFilePath);

            // Verify file exists and has content
            const stats = fs.statSync(localFilePath);
            if (stats.size === 0) {
                throw new Error('Downloaded file is empty');
            }

            return localFilePath;
        } catch (downloadError) {
            console.error('Error during file download:', downloadError);
            throw downloadError;
        }
    } catch (error) {
        console.error('Error in downloadFile:', error);
        // Clean up the directory if it was created
        if (uniqueDir && fs.existsSync(uniqueDir)) {
            try {
                fs.rmSync(uniqueDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error('Error during cleanup:', cleanupError);
            }
        }
        throw error;
    }
}
