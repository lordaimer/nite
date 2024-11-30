import fetch from 'node-fetch';
import sharp from 'sharp';
import { upscaleImage } from '../../services/ai/realEsrgan.js';
import { upscaleQueue } from '../../services/queue/upscaleQueue.js';

const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Track active upscale sessions
const activeUpscaleSessions = new Map(); // chatId -> timestamp
const pendingUpscaleRequests = new Map(); // chatId -> boolean

// Session timeout (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;

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

async function compressForTelegram(buffer) {
    // Telegram's image size limit is around 10MB, let's aim for 8MB to be safe
    const MAX_TELEGRAM_SIZE = 8 * 1024 * 1024;
    let quality = 100;
    let outputBuffer = buffer;

    // Get initial size
    const initialSize = buffer.length;
    
    if (initialSize > MAX_TELEGRAM_SIZE) {
        // Start with JPEG conversion at high quality
        outputBuffer = await sharp(buffer)
            .jpeg({ quality: quality })
            .toBuffer();

        // Gradually reduce quality until we're under the size limit
        while (outputBuffer.length > MAX_TELEGRAM_SIZE && quality > 60) {
            quality -= 5;
            outputBuffer = await sharp(buffer)
                .jpeg({ quality: quality })
                .toBuffer();
        }

        // If still too large, resize the image
        if (outputBuffer.length > MAX_TELEGRAM_SIZE) {
            const metadata = await sharp(buffer).metadata();
            const scale = Math.sqrt(MAX_TELEGRAM_SIZE / outputBuffer.length);
            const newWidth = Math.floor(metadata.width * scale);
            const newHeight = Math.floor(metadata.height * scale);

            outputBuffer = await sharp(buffer)
                .resize(newWidth, newHeight)
                .jpeg({ quality: quality })
                .toBuffer();
        }
    }

    return outputBuffer;
}

async function processUpscaleJob(bot, chatId, photo) {
    try {
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

        // Preprocess the image
        const processedBuffer = await preprocessImage(Buffer.from(buffer));

        // Get original dimensions
        const metadata = await sharp(processedBuffer).metadata();
        
        // Upscale the image
        const upscaledBuffer = await upscaleImage(processedBuffer, 4, true);

        // Get new dimensions
        const newMetadata = await sharp(upscaledBuffer).metadata();

        // Compress the upscaled image for Telegram if needed
        const compressedBuffer = await compressForTelegram(upscaledBuffer);

        // Send the upscaled image
        await bot.sendPhoto(chatId, compressedBuffer, {
            caption: `✨ Enhanced ${metadata.width}x${metadata.height} ➡️ ${newMetadata.width}x${newMetadata.height}\nUsing Real-ESRGAN with face enhancement`
        });

    } catch (error) {
        console.error('Error in upscale job:', error);
        await bot.sendMessage(
            chatId,
            `❌ ${error.message || 'Sorry, there was an error processing your image. Please try again with a different image.'}`,
            { parse_mode: 'Markdown' }
        );
    }
}

function isSessionActive(chatId) {
    const timestamp = activeUpscaleSessions.get(chatId);
    if (!timestamp) return false;
    
    // Check if session has expired
    if (Date.now() - timestamp > SESSION_TIMEOUT) {
        activeUpscaleSessions.delete(chatId);
        return false;
    }
    return true;
}

function startSession(chatId) {
    activeUpscaleSessions.set(chatId, Date.now());
}

async function addToUpscaleQueue(bot, chatId, userId, photo) {
    try {
        // Update session timestamp
        if (isSessionActive(chatId)) {
            startSession(chatId); // Refresh the session
        }

        // Add to queue
        const queuePosition = upscaleQueue.getQueueLength(chatId) + 1;
        const statusMessage = queuePosition > 1 
            ? `🔄 Added to queue. Position: ${queuePosition}`
            : '🔄 Starting image enhancement...';

        const processingMsg = await bot.sendMessage(chatId, statusMessage);

        upscaleQueue.addJob(chatId, async () => {
            await processUpscaleJob(bot, chatId, photo);
            await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
        });

    } catch (error) {
        console.error('Error adding to upscale queue:', error);
        await bot.sendMessage(
            chatId,
            `❌ ${error.message || 'Sorry, there was an error processing your request. Please try again.'}`,
            { parse_mode: 'Markdown' }
        );
    }
}

export function setupUpscaleCommand(bot) {
    // Handle /upscale command with image or reply
    bot.onText(/\/upscale/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // If it's just /upscale without reply, show help message and mark as pending
        if (msg.text === '/upscale' && !msg.reply_to_message) {
            pendingUpscaleRequests.set(chatId, true);
            await bot.sendMessage(
                chatId,
                '📸 Send me an image to upscale, or you can:\n\n1. Reply to an image with /upscale\n2. Send an image with /upscale as caption\n3. Send multiple images with /upscale as caption to batch process them',
                { parse_mode: 'Markdown' }
            );
            return;
        }
        
        // Check if message has a photo or is replying to a photo
        const photo = msg.photo || (msg.reply_to_message && msg.reply_to_message.photo);
        
        if (photo) {
            pendingUpscaleRequests.delete(chatId); // Clear any pending request
            await addToUpscaleQueue(bot, chatId, userId, photo);
            if (!isSessionActive(chatId)) {
                startSession(chatId);
            }
        }
    });

    // Handle any photos sent during active session or pending request
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        // Skip if photo has /upscale command (handled by command handler)
        if (msg.caption && msg.caption.includes('/upscale')) return;

        // Check if there's a pending upscale request
        if (pendingUpscaleRequests.has(chatId)) {
            pendingUpscaleRequests.delete(chatId);
            await addToUpscaleQueue(bot, chatId, userId, msg.photo);
            if (!isSessionActive(chatId)) {
                startSession(chatId);
            }
            return;
        }

        // Process photo if there's an active session
        if (isSessionActive(chatId)) {
            await addToUpscaleQueue(bot, chatId, userId, msg.photo);
        }
    });

    // Clear pending requests when user sends other commands
    bot.on('text', (msg) => {
        const chatId = msg.chat.id;
        if (msg.text.startsWith('/') && msg.text !== '/upscale') {
            pendingUpscaleRequests.delete(chatId);
        }
    });
}
