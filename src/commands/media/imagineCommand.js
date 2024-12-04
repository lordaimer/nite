import huggingFaceService from '../../services/api/huggingFaceService.js';
import { addToUpscaleQueue } from './upscaleCommand.js';

const MODELS = {
    'FLUX Dev': 'black-forest-labs/FLUX.1-dev',
    'FLUX Schnell': 'black-forest-labs/FLUX.1-schnell',
    'FLUX Realism': 'XLabs-AI/flux-RealismLora',
    'FLUX Logo': 'Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design',
    'FLUX Koda': 'alvdansen/flux-koda',
    'Anime Style': 'alvdansen/softserve_anime',
    'Midjourney Style': 'Jovie/Midjourney',
    'Super Realism': 'strangerzonehf/Flux-Super-Realism-LoRA',
    'Midjourney Mix': 'strangerzonehf/Flux-Midjourney-Mix2-LoRA',
    'Isometric 3D': 'strangerzonehf/Flux-Isometric-3D-LoRA',
    '3D Garment': 'strangerzonehf/Flux-3D-Garment-Mannequin',
    'Cute 3D': 'strangerzonehf/Flux-Cute-3D-Kawaii-LoRA',
    '3D Portrait': 'prithivMLmods/Castor-3D-Portrait-Flux-LoRA',
    '3D Render': 'prithivMLmods/3D-Render-Flux-LoRA',
    'Live 3D': 'Shakker-Labs/FLUX.1-dev-LoRA-live-3D',
    'Red Light': 'Shakker-Labs/SD3.5-LoRA-Linear-Red-Light',
    'Goofy 3D': 'goofyai/3D_Render_for_Flux',
    'Vector Art': 'renderartist/simplevectorflux'
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
    const getModelKeyboard = (page = 0) => {
        const modelsPerPage = 5;
        const modelNames = Object.keys(MODELS);
        const totalPages = Math.ceil(modelNames.length / modelsPerPage);
        const startIdx = page * modelsPerPage;
        const endIdx = Math.min(startIdx + modelsPerPage, modelNames.length);
        const currentPageModels = modelNames.slice(startIdx, endIdx);

        const keyboard = currentPageModels.map(name => ([{
            text: name,
            callback_data: `generate_${name}`
        }]));

        // Add navigation buttons
        const navRow = [];
        if (page > 0) {
            navRow.push({
                text: '⬅️ Previous',
                callback_data: `page_${page - 1}`
            });
        }
        if (page < totalPages - 1) {
            navRow.push({
                text: 'Next ➡️',
                callback_data: `page_${page + 1}`
            });
        }

        if (navRow.length > 0) {
            keyboard.push(navRow);
        }

        return {
            inline_keyboard: keyboard
        };
    };

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
            'Choose generation mode:',
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
                'Choose a model for image generation:',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: getModelKeyboard(0)
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

            // Send initial status message
            const statusMessageId = (await bot.sendMessage(
                chatId,
                '*Generating variety of images*',
                { parse_mode: 'Markdown' }
            )).message_id;

            // Delete the model selection message
            await bot.deleteMessage(chatId, messageId);

            try {
                // List of all models with their display names
                const modelMap = {
                    'black-forest-labs/FLUX.1-dev': 'FLUX Dev',
                    'black-forest-labs/FLUX.1-schnell': 'FLUX Schnell',
                    'XLabs-AI/flux-RealismLora': 'FLUX Realism',
                    'Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design': 'FLUX Logo',
                    'alvdansen/flux-koda': 'FLUX Koda',
                    'alvdansen/softserve_anime': 'Anime Style',
                    'Jovie/Midjourney': 'Midjourney Style',
                    'strangerzonehf/Flux-Super-Realism-LoRA': 'Super Realism',
                    'strangerzonehf/Flux-Midjourney-Mix2-LoRA': 'Midjourney Mix',
                    'strangerzonehf/Flux-Isometric-3D-LoRA': 'Isometric 3D',
                    'strangerzonehf/Flux-3D-Garment-Mannequin': '3D Garment',
                    'strangerzonehf/Flux-Cute-3D-Kawaii-LoRA': 'Cute 3D',
                    'prithivMLmods/Castor-3D-Portrait-Flux-LoRA': '3D Portrait',
                    'prithivMLmods/3D-Render-Flux-LoRA': '3D Render',
                    'Shakker-Labs/FLUX.1-dev-LoRA-live-3D': 'Live 3D',
                    'Shakker-Labs/SD3.5-LoRA-Linear-Red-Light': 'Red Light',
                    'goofyai/3D_Render_for_Flux': 'Goofy 3D',
                    'renderartist/simplevectorflux': 'Vector Art'
                };

                // Add a unique timestamp to prevent server-side caching
                const uniquePrompt = `${session.prompt} [t:${Date.now()}]`;
                
                // Generate images using all models
                const { results, errors } = await huggingFaceService.batchGenerateImages(
                    uniquePrompt,
                    Object.keys(modelMap)
                );

                if (results.length > 0) {
                    // Create media group from successful generations
                    const mediaGroup = results.map(({ model, image }) => ({
                        type: 'photo',
                        media: image,
                        caption: `*${modelMap[model]}*`,
                        parse_mode: 'Markdown'
                    }));

                    try {
                        await bot.sendMediaGroup(chatId, mediaGroup, {
                            reply_to_message_id: session.originalMessageId
                        });
                    } catch (sendError) {
                        console.error('Error sending media group:', sendError);
                        // Try to send a user-friendly error message
                        try {
                            await bot.editMessageText(
                                '❌ Network error while sending images. Please try again.',
                                {
                                    chat_id: chatId,
                                    message_id: statusMessageId,
                                    parse_mode: 'Markdown'
                                }
                            );
                        } catch (finalError) {
                            console.error('Could not send error message:', finalError);
                        }
                        return;
                    }

                    // Delete the status message
                    try {
                        await bot.deleteMessage(chatId, statusMessageId);
                    } catch (deleteError) {
                        console.error('Error deleting status message:', deleteError);
                    }

                } else {
                    throw new Error('No images were generated successfully');
                }

            } catch (error) {
                // Delete the status message
                try {
                    await bot.deleteMessage(chatId, statusMessageId);
                } catch (deleteError) {
                    console.error('Error deleting status message:', deleteError);
                }
                console.error('Error in image generation:', error);
                try {
                    await bot.sendMessage(
                        chatId,
                        '❌ An error occurred while generating the images. Please try again.',
                        { parse_mode: 'Markdown' }
                    );
                } catch (editError) {
                    console.error('Could not edit error message:', editError);
                }
            }
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

            // Send initial status message
            const statusMessageId = (await bot.sendMessage(
                chatId,
                `🎨 Generating images using ${modelName}...`,
                { parse_mode: 'Markdown' }
            )).message_id;

            // Delete the model selection message
            await bot.deleteMessage(chatId, messageId);

            try {
                // Generate multiple images from the same model
                const numImages = 6; 
                const responses = await huggingFaceService.generateMultipleImages(session.prompt, modelId, numImages);
                
                // Send all generated images as a media group
                const mediaGroup = responses.map(image => ({
                    type: 'photo',
                    media: image,
                    caption: `*${modelName}*`,
                    parse_mode: 'Markdown'
                }));

                try {
                    await bot.sendMediaGroup(chatId, mediaGroup, {
                        reply_to_message_id: session.originalMessageId
                    });
                } catch (sendError) {
                    console.error('Error sending media group:', sendError);
                    // Try to send a user-friendly error message
                    try {
                        await bot.editMessageText(
                            '❌ Network error while sending images. Please try again.',
                            {
                                chat_id: chatId,
                                message_id: statusMessageId,
                                parse_mode: 'Markdown'
                            }
                        );
                    } catch (finalError) {
                        console.error('Could not send error message:', finalError);
                    }
                    return;
                }

                // Delete the status message
                try {
                    await bot.deleteMessage(chatId, statusMessageId);
                } catch (deleteError) {
                    console.error('Error deleting status message:', deleteError);
                }

            } catch (error) {
                // Delete the status message
                try {
                    await bot.deleteMessage(chatId, statusMessageId);
                } catch (deleteError) {
                    console.error('Error deleting status message:', deleteError);
                }
                console.error('Error in image generation:', error);
                try {
                    await bot.sendMessage(
                        chatId,
                        '❌ An error occurred while generating the images. Please try again.',
                        { parse_mode: 'Markdown' }
                    );
                } catch (editError) {
                    console.error('Could not edit error message:', editError);
                }
            }
            return;
        }

        // Handle page navigation
        if (query.data.startsWith('page_')) {
            const page = parseInt(query.data.replace('page_', ''));
            await bot.editMessageText(
                'Choose a model for image generation:',
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: getModelKeyboard(page)
                }
            );
            await bot.answerCallbackQuery(query.id);
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