import sharp from 'sharp';
import fetch from 'node-fetch';
import { rateLimitService } from '../../services/api/rateLimitService.js';

const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SCALE_FACTOR = 2; // 2x upscaling

async function handleUpscale(bot, msg) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        // Check if message has a photo or is replying to a photo
        const photo = msg.photo || (msg.reply_to_message && msg.reply_to_message.photo);
        
        if (!photo) {
            await bot.sendMessage(
                chatId,
                '📸 Please send an image with /upscale command or reply to an image with /upscale',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Get the largest photo size
        const photoSize = photo[photo.length - 1];
        
        // Download the file
        const file = await bot.getFile(photoSize.file_id);
        const filePath = file.file_path;
        
        // Get the file as a buffer using node-fetch
        const response = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();

        // Send processing message
        const processingMsg = await bot.sendMessage(chatId, '🔄 Processing your image...');

        // Process the image with sharp
        const image = sharp(Buffer.from(buffer));
        const metadata = await image.metadata();

        // Calculate new dimensions
        const newWidth = metadata.width * SCALE_FACTOR;
        const newHeight = metadata.height * SCALE_FACTOR;

        // Upscale the image
        const upscaledBuffer = await image
            .resize(newWidth, newHeight, {
                kernel: sharp.kernel.lanczos3,
                fit: 'fill'
            })
            .toBuffer();

        // Send the upscaled image
        await bot.sendPhoto(chatId, upscaledBuffer, {
            caption: `✨ Upscaled ${metadata.width}x${metadata.height} ➡️ ${newWidth}x${newHeight}`
        });

        // Delete processing message
        await bot.deleteMessage(chatId, processingMsg.message_id);

    } catch (error) {
        console.error('Error in upscale command:', error);
        await bot.sendMessage(
            chatId,
            '❌ Sorry, there was an error processing your image. Please try again with a different image.',
            { parse_mode: 'Markdown' }
        );
    }
}

export function setupUpscaleCommand(bot) {
    bot.onText(/\/upscale/, async (msg) => {
        const userId = msg.from.id;
        const chatId = msg.chat.id;

        // Rate limit check: 5 upscales per minute
        if (!rateLimitService.check(userId, 'upscale', 5, 60000)) {
            await bot.sendMessage(
                chatId,
                '⚠️ You\'re upscaling too frequently. Please wait a moment.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        await handleUpscale(bot, msg);
    });
}
