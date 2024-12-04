import huggingFaceService from '../../services/api/huggingFaceService.js';
import { addToUpscaleQueue } from './upscaleCommand.js';

const MODELS = {
    'FLUX Dev': 'black-forest-labs/FLUX.1-dev',
    'FLUX Schnell': 'black-forest-labs/FLUX.1-schnell',
    'FLUX Realism': 'XLabs-AI/flux-RealismLora',
    'FLUX Logo': 'Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design',
    'FLUX Koda': 'alvdansen/flux-koda',
    'Anime Style': 'alvdansen/softserve_anime'
};

const generateImage = async (modelId, prompt) => {
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 2147483647);
    const randomizedPrompt = `${prompt} [t:${timestamp}] [s:${randomSeed}]`;
    
    try {
        const result = await huggingFaceService.generateImage(randomizedPrompt, modelId);
        return result;
    } catch (error) {
        console.error(`Error generating image: ${error.message}`);
        throw error;
    }
};

const generateVariety = async (prompt) => {
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 2147483647);
    const randomizedPrompt = `${prompt} [t:${timestamp}] [s:${randomSeed}]`;

    try {
        const modelEntries = Object.entries(MODELS);
        const results = [];
        
        for (const [modelName, modelId] of modelEntries) {
            try {
                const result = await huggingFaceService.generateImage(randomizedPrompt, modelId);
                results.push({ modelName, image: result });
            } catch (error) {
                console.error(`Error generating image for ${modelName}: ${error.message}`);
                // Continue with other models even if one fails
            }
        }
        
        return results;
    } catch (error) {
        console.error(`Error in variety generation: ${error.message}`);
        throw error;
    }
};

export function setupImageCommand(bot, rateLimit) {
    const userSessions = new Map();
    const promptCache = new Map();
    let promptCounter = 0;

    // Helper function to create initial mode selection keyboard
    const getModeKeyboard = () => ({
        inline_keyboard: [[
            { text: '🎨 Select Model', callback_data: 'mode_select' },
            { text: '🎯 Variety', callback_data: 'mode_variety' }
        ]]
    });

    // Helper function to create model selection keyboard
    const getModelKeyboard = () => ({
        inline_keyboard: Object.keys(MODELS).map(name => ([{
            text: name,
            callback_data: `generate_${name}`
        }]))
    });

    // Handle bare command without prompt
    bot.onText(/\/(imagine|im|image)$/, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(
            chatId,
            '⚠️ Please provide a prompt for the image generation.\n' +
            'Usage: `/imagine your prompt here`\n\n' +
            'Example: `/imagine a beautiful sunset over mountains`',
            { parse_mode: 'Markdown' }
        );
    });
    
    bot.onText(/\/(imagine|im|image)\s+(.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const prompt = match[2];
        const promptId = `p${promptCounter++}`;

        // Check rate limit
        const userRequests = userSessions.get(userId)?.requests || 0;
        const lastRequestTime = userSessions.get(userId)?.lastRequest || 0;
        const currentTime = Date.now();

        // Reset requests if window has passed
        if (currentTime - lastRequestTime > rateLimit.window) {
            userSessions.set(userId, { requests: 0, lastRequest: currentTime });
        }

        // Check if user has exceeded rate limit
        if (userRequests >= rateLimit.requests) {
            const timeLeft = Math.ceil((rateLimit.window - (currentTime - lastRequestTime)) / 1000);
            await bot.sendMessage(
                chatId,
                `⚠️ Rate limit exceeded. Please wait ${timeLeft} seconds before trying again.`
            );
            return;
        }

        // Update rate limit tracking
        userSessions.set(userId, {
            requests: userRequests + 1,
            lastRequest: currentTime,
            promptId,
            prompt,
            originalMessageId: msg.message_id
        });
        
        // Store new prompt with chat ID
        promptCache.set(promptId, {
            prompt: prompt,
            chatId: chatId
        });
        
        await bot.sendMessage(
            chatId,
            '🎨 Choose generation mode:',
            { 
                reply_markup: getModeKeyboard(),
                reply_to_message_id: msg.message_id
            }
        );
    });

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        // Handle mode selection
        if (query.data === 'mode_select') {
            await bot.editMessageText(
                '🎨 Choose a model for image generation:',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: getModelKeyboard()
                }
            );
            await bot.answerCallbackQuery(query.id);
            return;
        }

        // Handle variety mode
        if (query.data === 'mode_variety') {
            const session = userSessions.get(chatId);
            if (!session) {
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Session expired. Please start over with /imagine command.',
                    show_alert: true
                });
                return;
            }

            await bot.editMessageText(
                '🎨 Generating variety of images...',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [] }
                }
            );

            try {
                const results = await generateVariety(session.prompt);
                
                // Send all generated images as a media group
                const mediaGroup = results.map(({ modelName, image }) => ({
                    type: 'photo',
                    media: image, // Image is now already a Buffer
                    caption: `*${modelName}*`,
                    parse_mode: 'Markdown'
                }));

                await bot.sendMediaGroup(chatId, mediaGroup, {
                    reply_to_message_id: session.originalMessageId
                });

                await bot.deleteMessage(chatId, messageId);
            } catch (error) {
                console.error('Error in variety generation:', error);
                await bot.editMessageText(
                    '❌ An error occurred while generating images. Please try again.',
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );
            }
            await bot.answerCallbackQuery(query.id);
            return;
        }

        // Handle model selection
        if (query.data.startsWith('generate_')) {
            const modelName = query.data.replace('generate_', '');
            const modelId = MODELS[modelName];
            const session = userSessions.get(chatId);
            
            if (!session) {
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Session expired. Please start over with /imagine command.',
                    show_alert: true
                });
                return;
            }

            // Answer callback query immediately
            await bot.answerCallbackQuery(query.id);

            await bot.editMessageText(
                `🎨 Generating images using ${modelName}...`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [] }
                }
            );

            try {
                // Generate multiple images from the same model
                const numImages = 6; // Changed from 5 to 6 to utilize all API tokens
                const responses = await huggingFaceService.generateMultipleImages(session.prompt, modelId, numImages);
                
                // Send all generated images as a media group
                const mediaGroup = responses.map(image => ({
                    type: 'photo',
                    media: image,
                    caption: `*${modelName}*`,
                    parse_mode: 'Markdown'
                }));

                await bot.sendMediaGroup(chatId, mediaGroup, {
                    reply_to_message_id: session.originalMessageId
                });

                await bot.deleteMessage(chatId, messageId);
            } catch (error) {
                console.error('Error in image generation:', error);
                await bot.editMessageText(
                    '❌ An error occurred while generating the images. Please try again.',
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );
            }
            return;
        }

        // Handle upscale button
        if (query.data.startsWith('upscale_')) {
            const photo = query.message.photo;
            if (!photo) {
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Cannot find the image to upscale.',
                    show_alert: true
                });
                return;
            }

            try {
                await addToUpscaleQueue(bot, chatId, query.from.id, photo);
                await bot.answerCallbackQuery(query.id, {
                    text: '✨ Image added to upscale queue!'
                });
            } catch (error) {
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Failed to upscale image. Please try again.',
                    show_alert: true
                });
            }
            return;
        }

        // Handle regenerate button
        if (query.data.startsWith('reg_')) {
            const promptId = query.data.replace('reg_', '');
            const promptData = promptCache.get(promptId);
            
            if (!promptData) {
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Session expired. Please start over with /imagine command.',
                    show_alert: true
                });
                return;
            }

            // Store new session with original prompt
            userSessions.set(chatId, {
                promptId,
                prompt: promptData.prompt,
                originalMessageId: query.message.reply_to_message?.message_id
            });

            await bot.sendMessage(
                chatId,
                '🎨 Choose generation mode:',
                { 
                    reply_markup: getModeKeyboard(),
                    reply_to_message_id: query.message.reply_to_message?.message_id
                }
            );
            
            try {
                await bot.answerCallbackQuery(query.id);
            } catch (error) {
                console.error(`Failed to answer callback query: ${error.message}`);
            }
        }
    });
}