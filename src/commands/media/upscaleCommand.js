import fetch from 'node-fetch';
import sharp from 'sharp';
import { rateLimitService } from '../../services/api/rateLimitService.js';
import { upscaleImage } from '../../services/ai/realEsrgan.js';

const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async function preprocessImage(inputBuffer) {
    // Convert to PNG and ensure reasonable size for processing
    return await sharp(inputBuffer)
        .resize(1024, 1024, { // Limit initial size for faster processing
            fit: 'inside',
            withoutEnlargement: true
        })
        .png()
        .toBuffer();
}

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
        const processingMsg = await bot.sendMessage(chatId, '🔄 Enhancing your image using AI...\nThis might take a few moments.');

        try {
            // Preprocess the image
            const processedBuffer = await preprocessImage(Buffer.from(buffer));

            // Get original dimensions
            const metadata = await sharp(processedBuffer).metadata();
            
            // Upscale the image
            const upscaledBuffer = await upscaleImage(processedBuffer, 4, true);

            // Get new dimensions
            const newMetadata = await sharp(upscaledBuffer).metadata();

            // Send the upscaled image
            await bot.sendPhoto(chatId, upscaledBuffer, {
                caption: `✨ Enhanced ${metadata.width}x${metadata.height} ➡️ ${newMetadata.width}x${newMetadata.height}\nUsing Real-ESRGAN with face enhancement`
            });

        } catch (upscaleError) {
            console.error('Error during upscaling:', upscaleError);
            throw new Error('Failed to enhance the image. The image might be too large or complex.');
        }

        // Delete processing message
        await bot.deleteMessage(chatId, processingMsg.message_id);

    } catch (error) {
        console.error('Error in upscale command:', error);
        await bot.sendMessage(
            chatId,
            `❌ ${error.message || 'Sorry, there was an error processing your image. Please try again with a different image.'}`,
            { parse_mode: 'Markdown' }
        );
    }
}

export function setupUpscaleCommand(bot) {
    bot.onText(/\/upscale/, async (msg) => {
        const userId = msg.from.id;
        const chatId = msg.chat.id;

        // Rate limit check: 3 upscales per minute
        if (!rateLimitService.check(userId, 'upscale', 3, 60000)) {
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
