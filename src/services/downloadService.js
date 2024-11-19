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
        console.log('[DEBUG] Starting file download process');
        console.log(`[DEBUG] File ID: ${fileId}`);

        // Create temp directory if it doesn't exist
        const tempDir = path.join(__dirname, '..', '..', 'temp');
        console.log(`[DEBUG] Temp directory path: ${tempDir}`);
        
        if (!fs.existsSync(tempDir)) {
            console.log('[DEBUG] Creating temp directory');
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Create a unique subdirectory for this download
        uniqueDir = path.join(tempDir, crypto.randomBytes(8).toString('hex'));
        console.log(`[DEBUG] Created unique directory: ${uniqueDir}`);
        fs.mkdirSync(uniqueDir);

        // Get file info from Telegram
        console.log('[DEBUG] Getting file info from Telegram');
        const file = await bot.getFile(fileId);
        console.log(`[DEBUG] File info received:`, file);

        // Create unique filename
        const uniqueFilename = `${Date.now()}.zip`;
        const localFilePath = path.join(uniqueDir, uniqueFilename);
        console.log(`[DEBUG] Local file path: ${localFilePath}`);

        // Download file using bot's built-in method
        console.log('[DEBUG] Starting file download');
        try {
            await bot.downloadFile(fileId, uniqueDir);
            console.log('[DEBUG] File downloaded successfully');

            // The downloaded file will be in uniqueDir with the original name
            const downloadedFiles = fs.readdirSync(uniqueDir);
            if (downloadedFiles.length === 0) {
                throw new Error('No files were downloaded');
            }

            // Rename the downloaded file to our unique name
            const downloadedFile = path.join(uniqueDir, downloadedFiles[0]);
            fs.renameSync(downloadedFile, localFilePath);
            console.log(`[DEBUG] Renamed file to: ${localFilePath}`);

            // Verify file exists and has content
            const stats = fs.statSync(localFilePath);
            console.log(`[DEBUG] Downloaded file size: ${stats.size} bytes`);

            if (stats.size === 0) {
                throw new Error('Downloaded file is empty');
            }

            return localFilePath;
        } catch (downloadError) {
            console.error('[DEBUG] Error during file download:', downloadError);
            throw downloadError;
        }
    } catch (error) {
        console.error('[DEBUG] Error in downloadFile:', error);
        // Clean up the directory if it was created
        if (uniqueDir && fs.existsSync(uniqueDir)) {
            try {
                fs.rmSync(uniqueDir, { recursive: true, force: true });
                console.log('[DEBUG] Cleaned up directory after error');
            } catch (cleanupError) {
                console.error('[DEBUG] Error during cleanup:', cleanupError);
            }
        }
        throw error;
    }
}
