import { createReadStream } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { statSync } from 'fs';
import crypto from 'crypto';

const execAsync = promisify(exec);

// Supported quality options for video downloads
const QUALITY_OPTIONS = {
    'best': 'Best Quality (1080p)',
    'medium': 'Medium Quality (480p)',
    'low': 'Low Quality (360p)'
};

// Size limit for Telegram uploads (50MB in bytes)
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Helper function to create a progress bar
function createProgressBar(progress) {
    const barLength = 20;
    const filledLength = Math.round((progress * barLength) / 100);
    const filled = '■'.repeat(filledLength);
    const empty = '□'.repeat(barLength - filledLength);
    return `[${filled}${empty}] ${progress.toFixed(1)}%`;
}

// Helper function to format file size
function formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < sizes.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(1)} ${sizes[i]}`;
}

export function setupDownloadCommand(bot) {
    const downloadingUsers = new Set();
    const urlCache = new Map();

    // Combined help message
    const helpText = `
🎥 *Nite Video Downloader*
Download videos from various platforms!

*Usage:*
• \`/dl <video URL>\`
• \`/download <video URL>\`

*Supported Platforms:*
YouTube, Instagram, TikTok, Twitter/X, Facebook, Pinterest, Reddit and many more

_Note: Please wait for each download to complete before starting another._`;

    // Single command handler for both /dl and /download
    bot.onText(/\/(?:dl|download)(?:\s+(.+))?$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const url = match[1]?.trim();

        if (!url) {
            await bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
            return;
        }

        if (downloadingUsers.has(userId)) {
            await bot.sendMessage(chatId, '⚠️ Please wait for your current download to complete.');
            return;
        }

        try {
            // Basic URL validation
            const urlObj = new URL(url);
            
            // Get video info first
            const { stdout: info } = await execAsync(`yt-dlp --dump-json "${url}"`);
            const videoInfo = JSON.parse(info);
            const videoTitle = videoInfo.title;

            // Generate a short hash for the URL
            const urlHash = crypto.createHash('md5').update(url).digest('hex').slice(0, 8);
            urlCache.set(urlHash, url);

            // Create quality selection buttons
            const keyboard = {
                inline_keyboard: [
                    ...Object.entries(QUALITY_OPTIONS).map(([quality, label]) => [{
                        text: label,
                        callback_data: `dl:${quality}:${urlHash}`
                    }]),
                    [{
                        text: 'Cancel',
                        callback_data: `dl:cancel:${urlHash}`
                    }]
                ]
            };

            // Send quality selection message
            await bot.sendMessage(
                chatId,
                `🎥 *${videoTitle}*\n\nPlease select download quality:`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                }
            );

        } catch (error) {
            if (error instanceof TypeError && error.message.includes('Invalid URL')) {
                await bot.sendMessage(chatId, '❌ Please provide a valid URL.');
            } else {
                console.error('Error fetching video info:', error.message);
                await bot.sendMessage(chatId, '❌ Failed to fetch video information. Please check if the URL is supported and try again.');
            }
        }
    });

    // Handle quality selection callback
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userId = query.from.id;
        const [action, quality, urlHash] = query.data.split(':');

        if (action === 'dl' && quality === 'cancel') {
            await bot.deleteMessage(chatId, query.message.message_id);
            await bot.answerCallbackQuery(query.id, {
                text: 'Download cancelled',
                show_alert: false
            });
            urlCache.delete(urlHash);
            return;
        }

        if (action !== 'dl') return;

        if (downloadingUsers.has(userId)) {
            await bot.answerCallbackQuery(query.id, {
                text: 'Please wait for your current download to complete.',
                show_alert: true
            });
            return;
        }

        try {
            downloadingUsers.add(userId);
            const url = urlCache.get(urlHash);
            
            if (!url) {
                throw new Error('Download link expired. Please try again.');
            }

            // Get video info first
            const { stdout: info } = await execAsync(`yt-dlp --dump-json "${url}"`);
            const videoInfo = JSON.parse(info);
            const videoTitle = videoInfo.title || 'Untitled Video';

            // Acknowledge the button press
            await bot.answerCallbackQuery(query.id);
            
            // Update original message to show progress
            const statusMessage = await bot.editMessageText(
                'Fetching video information...',
                {
                    chat_id: chatId,
                    message_id: query.message.message_id
                }
            );

            const tempPath = join(tmpdir(), `${Date.now()}-${userId}.mp4`);

            // Prepare download command based on quality
            const formatString = quality === 'best' 
                ? 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best'
                : quality === 'medium'
                    ? 'bestvideo[height<=480][ext=mp4]+bestaudio[ext=m4a]/best[height<=480][ext=mp4]/best'
                    : 'bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best';

            const downloadCmd = [
                'yt-dlp',
                `-f "${formatString}"`,
                '--merge-output-format mp4',
                `--output "${tempPath}"`,
                '--no-warnings',
                '--no-playlist',
                '--progress',
                `"${url}"`
            ].join(' ');

            // Execute download with progress tracking
            await new Promise((resolve, reject) => {
                const downloadProcess = exec(downloadCmd);
                let lastProgress = 0;
                
                downloadProcess.stdout.on('data', async (data) => {
                    const progressMatch = data.match(/(\d+\.?\d*)%/);
                    if (progressMatch) {
                        const progress = parseFloat(progressMatch[1]);
                        if (progress - lastProgress >= 5) {
                            lastProgress = progress;
                            try {
                                await bot.editMessageText(
                                    `Downloading: ${createProgressBar(progress)}`,
                                    {
                                        chat_id: chatId,
                                        message_id: statusMessage.message_id
                                    }
                                );
                            } catch (error) {
                                // Ignore progress update errors
                            }
                        }
                    }
                });

                downloadProcess.stderr.on('data', (data) => {
                    if (data.includes('ERROR:')) {
                        console.error('Download Error:', data.trim());
                    }
                });

                downloadProcess.on('error', reject);
                downloadProcess.on('exit', code => {
                    if (code === 0) resolve();
                    else reject(new Error(`Download failed with code ${code}`));
                });
            });

            const fileSize = statSync(tempPath).size;
            const fileStream = createReadStream(tempPath);

            if (fileSize > MAX_FILE_SIZE) {
                await bot.editMessageText(
                    '⚠️ File too large for Telegram (>50MB). Try a lower quality.',
                    {
                        chat_id: chatId,
                        message_id: statusMessage.message_id
                    }
                );
            } else {
                await bot.editMessageText(
                    `Uploading video (${formatFileSize(fileSize)})`,
                    {
                        chat_id: chatId,
                        message_id: statusMessage.message_id
                    }
                );

                await bot.sendVideo(chatId, fileStream, {
                    caption: `🎥 *${QUALITY_OPTIONS[quality].match(/\(([^)]+)\)/)[1]}*: ${videoTitle}`,
                    parse_mode: 'Markdown',
                    reply_to_message_id: query.message.message_id
                });

                await bot.deleteMessage(chatId, statusMessage.message_id);
            }

            // Cleanup
            fileStream.destroy();
            await unlink(tempPath);

        } catch (error) {
            const errorMessage = error.code === 'ETELEGRAM' && error.response.statusCode === 429
                ? '⚠️ Too many requests. Please try again in a few seconds.'
                : '❌ Download failed. Please try again or try a different quality.';
            await bot.sendMessage(chatId, errorMessage);
        } finally {
            downloadingUsers.delete(userId);
            // Clean up the URL cache
            urlCache.delete(urlHash);
        }
    });
} 