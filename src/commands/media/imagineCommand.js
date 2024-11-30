import { HfInference } from '@huggingface/inference';
import dotenv from 'dotenv';
import { addToUpscaleQueue } from './upscaleCommand.js';

// Ensure environment variables are loaded
dotenv.config();

const hf = new HfInference(process.env.HUGGING_FACE_TOKEN);

const MODELS = {
    'FLUX Dev': 'black-forest-labs/FLUX.1-dev',
    'FLUX Schnell': 'black-forest-labs/FLUX.1-schnell',
    'FLUX Realism': 'XLabs-AI/flux-RealismLora',
    'FLUX Logo': 'Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design',
    'FLUX Koda': 'alvdansen/flux-koda',
    'Anime Style': 'alvdansen/softserve_anime'
};

const generateImage = async (modelId, prompt) => {
    // Add timestamp and random seed to prompt to force unique generation
    const timestamp = Date.now();
    const randomSeed = Math.floor(Math.random() * 2147483647);
    const randomizedPrompt = `${prompt} [t:${timestamp}] [s:${randomSeed}]`;
    
    try {
        return await hf.textToImage({
            model: modelId,
            inputs: randomizedPrompt
        });
    } catch (error) {
        console.error(`Error generating image: ${error.message}`);
        throw error;
    }
};

export function setupImageCommand(bot, rateLimit) {
    const userSessions = new Map();
    const promptCache = new Map();
    let promptCounter = 0;

    // Helper function to create model selection keyboard
    const getModelKeyboard = () => ({
        inline_keyboard: Object.keys(MODELS).map(name => ([{
            text: name,
            callback_data: `generate_${name}`
        }]))
    });

    // Modified helper function for image action buttons
    const getImageActionButtons = (promptId) => ({
        inline_keyboard: [[
            {
                text: '🎲 Regenerate',
                callback_data: `reg_${promptId}`
            },
            {
                text: '✨ Upscale',
                callback_data: `upscale_${promptId}`
            }
        ]]
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
        
        // Clear previous prompts for this chat
        for (const [key, value] of promptCache.entries()) {
            if (userSessions.get(value.chatId)?.promptId === key) {
                promptCache.delete(key);
                userSessions.delete(value.chatId);
            }
        }
        
        // Store new prompt with chat ID
        promptCache.set(promptId, {
            prompt: prompt,
            chatId: chatId
        });
        
        await bot.sendMessage(
            chatId,
            '🎨 Choose a model for image generation:',
            { 
                reply_markup: getModelKeyboard(),
                reply_to_message_id: msg.message_id
            }
        );
    });

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

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

            const prompt = session.prompt;

            await bot.editMessageText(
                `🎨 Generating image using ${modelName}...`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [] }
                }
            );

            try {
                const response = await generateImage(modelId, prompt);
                const buffer = Buffer.from(await response.arrayBuffer());

                // Send image with regenerate and upscale buttons
                await bot.sendPhoto(chatId, buffer, {
                    caption: `*${modelName}*`,
                    parse_mode: 'Markdown',
                    reply_to_message_id: session.originalMessageId,
                    reply_markup: getImageActionButtons(session.promptId)
                });

                // Delete the "Generating..." message
                await bot.deleteMessage(chatId, messageId);

            } catch (error) {
                try {
                    await bot.editMessageText(
                        `❌ Failed to generate image using ${modelName}. Please try again.`,
                        {
                            chat_id: chatId,
                            message_id: messageId
                        }
                    );
                } catch (editError) {
                    await bot.sendMessage(
                        chatId,
                        `❌ Failed to generate image using ${modelName}. Please try again.`,
                        {
                            reply_to_message_id: session.originalMessageId
                        }
                    );
                }
            }

            userSessions.delete(chatId);
            try {
                await bot.answerCallbackQuery(query.id);
            } catch (error) {
                console.error(`Failed to answer callback query: ${error.message}`);
            }
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
                '🎨 Choose a model for regeneration:',
                { 
                    reply_markup: getModelKeyboard(),
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