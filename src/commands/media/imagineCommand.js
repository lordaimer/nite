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

            // Send initial status message
            const statusMessageId = (await bot.sendMessage(
                chatId,
                '*Generating variety of images* ◡',
                { parse_mode: 'Markdown' }
            )).message_id;

            // Delete the model selection message
            await bot.deleteMessage(chatId, messageId);

            // Setup animation frames with longer interval to avoid rate limits
            const frames = ['◜', '◝', '◞', '◟'];
            let frameIndex = 0;
            let lastUpdateTime = Date.now();
            const MIN_UPDATE_INTERVAL = 500; // Minimum 2 seconds between updates
            
            const animationInterval = setInterval(async () => {
                const now = Date.now();
                // Only update if enough time has passed
                if (now - lastUpdateTime >= MIN_UPDATE_INTERVAL) {
                    try {
                        await bot.editMessageText(
                            `*Generating variety of images* ${frames[frameIndex]}`,
                            {
                                chat_id: chatId,
                                message_id: statusMessageId,
                                parse_mode: 'Markdown'
                            }
                        );
                        lastUpdateTime = now;
                        frameIndex = (frameIndex + 1) % frames.length;
                    } catch (error) {
                        if (error.code === 'ETELEGRAM' && error.response.statusCode === 429) {
                            const retryAfter = error.response.body.parameters.retry_after || 30;
                            console.log(`Rate limited, waiting ${retryAfter} seconds before next update`);
                            // Skip this update and wait for the next interval
                        } else {
                            console.error('Error updating status message:', error);
                        }
                    }
                }
            }, 2000); // Check every 2 seconds

            try {
                // List of all models with their display names
                const modelMap = {
                    'black-forest-labs/FLUX.1-dev': 'FLUX Dev',
                    'black-forest-labs/FLUX.1-schnell': 'FLUX Schnell',
                    'XLabs-AI/flux-RealismLora': 'FLUX Realism',
                    'Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design': 'FLUX Logo',
                    'alvdansen/flux-koda': 'FLUX Koda',
                    'alvdansen/softserve_anime': 'Anime Style'
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

                    // Clear animation before sending images
                    clearInterval(animationInterval);

                    try {
                        await bot.sendMediaGroup(chatId, mediaGroup, {
                            reply_to_message_id: session.originalMessageId
                        });
                    } catch (sendError) {
                        if (sendError.code === 'ETELEGRAM' && sendError.response.statusCode === 429) {
                            const retryAfter = sendError.response.body.parameters.retry_after || 30;
                            console.log(`Rate limited when sending images, waiting ${retryAfter} seconds`);
                            await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                            // Try sending again after waiting
                            await bot.sendMediaGroup(chatId, mediaGroup, {
                                reply_to_message_id: session.originalMessageId
                            });
                        } else {
                            console.error('Error sending media group:', sendError);
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
                    }

                    // Try to delete status message after sending images
                    try {
                        await bot.deleteMessage(chatId, statusMessageId);
                    } catch (deleteError) {
                        console.error('Error deleting status message:', deleteError);
                    }
                } else {
                    throw new Error('No images were generated successfully');
                }

            } catch (error) {
                // Clear animation on error
                clearInterval(animationInterval);
                console.error('Error in image generation:', error);
                try {
                    await bot.editMessageText(
                        '❌ An error occurred while generating the images. Please try again.',
                        {
                            chat_id: chatId,
                            message_id: statusMessageId,
                            parse_mode: 'Markdown'
                        }
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
                `*Generating images using ${modelName}* ◡`,
                { parse_mode: 'Markdown' }
            )).message_id;

            // Delete the model selection message
            await bot.deleteMessage(chatId, messageId);

            // Setup animation frames
            const frames = ['◜', '◝', '◞', '◟'];
            let frameIndex = 0;
            const animationInterval = setInterval(() => {
                bot.editMessageText(
                    `*Generating images using ${modelName}* ${frames[frameIndex]}`,
                    {
                        chat_id: chatId,
                        message_id: statusMessageId,
                        parse_mode: 'Markdown'
                    }
                ).catch(() => {});
                frameIndex = (frameIndex + 1) % frames.length;
            }, 150);

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

                // Clear animation and delete the status message
                clearInterval(animationInterval);
                try {
                    await bot.deleteMessage(chatId, statusMessageId);
                } catch (deleteError) {
                    console.error('Error deleting status message:', deleteError);
                }

            } catch (error) {
                // Clear animation on error
                clearInterval(animationInterval);
                console.error('Error in image generation:', error);
                try {
                    await bot.editMessageText(
                        '❌ An error occurred while generating the images. Please try again.',
                        {
                            chat_id: chatId,
                            message_id: statusMessageId,
                            parse_mode: 'Markdown'
                        }
                    );
                } catch (editError) {
                    console.error('Could not edit error message:', editError);
                }
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