import fetch from 'node-fetch';
import sharp from 'sharp';
import { upscaleImage } from '../../services/ai/realEsrgan.js';
import { upscaleQueue } from '../../services/queue/upscaleQueue.js';

const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Track active upscale sessions
const activeUpscaleSessions = new Map(); // chatId -> timestamp
const pendingUpscaleRequests = new Map(); // chatId -> boolean
const mediaGroupsInProgress = new Set();

// Session timeout (5 minutes)
const SESSION_TIMEOUT = 5 * 60 * 1000;

// Track command execution status
const commandStatus = new Map(); // chatId -> { lastCommand: timestamp, errors: number }

// Reset error count every hour
setInterval(() => {
    for (const [chatId, status] of commandStatus.entries()) {
        if (Date.now() - status.lastCommand > 60 * 60 * 1000) {
            commandStatus.delete(chatId);
        }
    }
}, 60 * 60 * 1000);

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
            caption: `*✨ Enhanced ${metadata.width}x${metadata.height} >> ${newMetadata.width}x${newMetadata.height}*`,
            parse_mode: 'Markdown'
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

export async function addToUpscaleQueue(bot, chatId, userId, photo) {
    try {
        // Update session timestamp if active
        if (isSessionActive(chatId)) {
            startSession(chatId); // Refresh the session
        }

        // Only send status message if no processing message exists
        if (!pendingUpscaleRequests.get(chatId)) {
            pendingUpscaleRequests.set(chatId, true);
            
            const processingMsg = await bot.sendMessage(
                chatId, 
                "*Processing your images* ◡", 
                { parse_mode: 'Markdown' }
            );

            // Animation frames
            const frames = ['◜', '◝', '◞', '◟'];
            let frameIndex = 0;
            const animationInterval = setInterval(() => {
                bot.editMessageText(
                    `*Processing your images* ${frames[frameIndex]}`,
                    {
                        chat_id: chatId,
                        message_id: processingMsg.message_id,
                        parse_mode: 'Markdown'
                    }
                ).catch(() => {}); // Ignore errors if message was deleted
                frameIndex = (frameIndex + 1) % frames.length;
            }, 500);

            // Add job to queue
            upscaleQueue.addJob(chatId, async () => {
                try {
                    // Process the image
                    await processUpscaleJob(bot, chatId, photo);

                    // Check remaining jobs
                    const remainingJobs = upscaleQueue.getQueueLength(chatId);
                    if (remainingJobs === 0) {
                        // Clear the animation interval
                        clearInterval(animationInterval);
                        // Delete the status message
                        await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {});
                        pendingUpscaleRequests.delete(chatId);
                    }
                } catch (error) {
                    // Clear the animation interval
                    clearInterval(animationInterval);
                    console.error('Error processing upscale job:', error);
                    await bot.editMessageText(
                        `❌ Error processing image: ${error.message || 'Unknown error'}`,
                        {
                            chat_id: chatId,
                            message_id: processingMsg.message_id,
                            parse_mode: 'Markdown'
                        }
                    ).catch(() => {});
                    pendingUpscaleRequests.delete(chatId);
                }
            });
        } else {
            // Just add to queue without sending a new message
            upscaleQueue.addJob(chatId, async () => {
                try {
                    await processUpscaleJob(bot, chatId, photo);
                    
                    // If this was the last job, clean up
                    const remainingJobs = upscaleQueue.getQueueLength(chatId);
                    if (remainingJobs === 0) {
                        pendingUpscaleRequests.delete(chatId);
                    }
                } catch (error) {
                    console.error('Error processing upscale job:', error);
                }
            });
        }

    } catch (error) {
        console.error('Error adding to upscale queue:', error);
        await bot.sendMessage(
            chatId,
            `❌ ${error.message || 'Sorry, there was an error processing your request. Please try again.'}`,
            { parse_mode: 'Markdown' }
        );
        pendingUpscaleRequests.delete(chatId);
    }
}

export function setupUpscaleCommand(bot) {
    // Handle /upscale and /upsc commands with image or reply
    bot.onText(/\/(upscale|upsc)/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const command = msg.text.split(' ')[0]; // Get the actual command used

        try {
            // Track command execution
            const status = commandStatus.get(chatId) || { lastCommand: Date.now(), errors: 0 };
            status.lastCommand = Date.now();
            commandStatus.set(chatId, status);

            // If too many errors, suggest waiting
            if (status.errors >= 3) {
                const waitTime = Math.min(5 * Math.pow(2, status.errors - 3), 30);
                await bot.sendMessage(
                    chatId,
                    `⚠️ Several errors detected. Please wait ${waitTime} minutes before trying again.`,
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            // If it's just the command without reply, show help message and mark as pending
            if ((msg.text === '/upscale' || msg.text === '/upsc') && !msg.reply_to_message) {
                pendingUpscaleRequests.set(chatId, true);
                await bot.sendMessage(
                    chatId,
                    '📸 Send me an image to upscale, or you can:\n\n1. Reply to an image with /upscale or /upsc\n2. Send an image with /upscale or /upsc as caption\n3. Send multiple images with /upscale or /upsc as caption to batch process them',
                    { parse_mode: 'Markdown' }
                );
                return;
            }
            
            // Handle single photo in message or reply
            if (msg.photo || (msg.reply_to_message && msg.reply_to_message.photo)) {
                const photo = msg.photo || msg.reply_to_message.photo;
                pendingUpscaleRequests.delete(chatId);
                
                if (!isSessionActive(chatId)) {
                    startSession(chatId);
                }
                
                await addToUpscaleQueue(bot, chatId, userId, photo);
            }
        } catch (error) {
            console.error('Error in upscale command:', error);
            
            // Update error count
            const status = commandStatus.get(chatId);
            if (status) {
                status.errors++;
                commandStatus.set(chatId, status);
            }

            // Clean up session state
            pendingUpscaleRequests.delete(chatId);
            mediaGroupsInProgress.delete(msg.media_group_id);
            
            await bot.sendMessage(
                chatId,
                '❌ An error occurred while processing your request. Please try again in a few minutes.',
                { parse_mode: 'Markdown' }
            );
        }
    });

    // Handle photos with enhanced error handling
    bot.on('photo', async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const mediaGroupId = msg.media_group_id;

        try {
            // If part of a media group and has /upscale caption
            if (mediaGroupId && msg.caption && msg.caption.includes('/upscale')) {
                // Skip if we're already processing this media group
                if (mediaGroupsInProgress.has(mediaGroupId)) {
                    return;
                }

                // Mark this media group as being processed
                mediaGroupsInProgress.add(mediaGroupId);
                
                // Start session
                if (!isSessionActive(chatId)) {
                    startSession(chatId);
                }

                // Queue this photo
                await addToUpscaleQueue(bot, chatId, userId, msg.photo);

                // Send confirmation for first photo
                await bot.sendMessage(
                    chatId,
                    '✅ Processing media group... Send all your images!',
                    { parse_mode: 'Markdown' }
                );

                // Clean up after 5 seconds
                setTimeout(() => {
                    mediaGroupsInProgress.delete(mediaGroupId);
                }, 5000);
                
                return;
            }

            // If part of a media group during active session
            if (mediaGroupId && isSessionActive(chatId)) {
                // Queue this photo
                await addToUpscaleQueue(bot, chatId, userId, msg.photo);
                return;
            }

            // Handle single photo with pending request
            if (pendingUpscaleRequests.has(chatId)) {
                pendingUpscaleRequests.delete(chatId);
                if (!isSessionActive(chatId)) {
                    startSession(chatId);
                }
                await addToUpscaleQueue(bot, chatId, userId, msg.photo);
                return;
            }

            // Handle single photo during active session
            if (isSessionActive(chatId)) {
                await addToUpscaleQueue(bot, chatId, userId, msg.photo);
            }
        } catch (error) {
            console.error('Error handling photo:', error);
            
            // Update error count
            const status = commandStatus.get(chatId) || { lastCommand: Date.now(), errors: 0 };
            status.errors++;
            commandStatus.set(chatId, status);

            // Clean up session state
            pendingUpscaleRequests.delete(chatId);
            if (mediaGroupId) {
                mediaGroupsInProgress.delete(mediaGroupId);
            }
            
            await bot.sendMessage(
                chatId,
                '❌ An error occurred while processing your photo. Please try again in a few minutes.',
                { parse_mode: 'Markdown' }
            ).catch(err => console.error('Error sending error message:', err));
        }
    });

    // Clear pending requests when user sends other commands
    bot.on('text', (msg) => {
        const chatId = msg.chat.id;
        if (msg.text.startsWith('/') && msg.text !== '/upscale' && msg.text !== '/upsc') {
            pendingUpscaleRequests.delete(chatId);
        }
    });
}
