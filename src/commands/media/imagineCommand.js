import { HfInference } from '@huggingface/inference';

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
    
    return await hf.textToImage({
        model: modelId,
        inputs: randomizedPrompt
    });
};

export function setupImageCommand(bot) {
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
                callback_data: 'upscale_pending'
            }
        ]]
    });

    bot.onText(/\/(imagine|im|image) (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const prompt = match[2];
        const promptId = `p${promptCounter++}`;
        
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
        
        userSessions.set(chatId, {
            promptId,
            prompt, // Add prompt directly to session
            originalMessageId: msg.message_id
        });

        console.log(`Received imagine command with prompt: "${prompt}"`);
        
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
            
            console.log(`Starting generation with model ${modelName}`);
            console.log(`Using prompt: "${prompt}"`);
            console.log(`Model ID: ${modelId}`);

            await bot.editMessageText(
                `🎨 Generating image using ${modelName}...`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: { inline_keyboard: [] }
                }
            );

            try {
                console.log(`Starting generation with ${modelName}...`);
                const response = await generateImage(modelId, prompt);
                const buffer = Buffer.from(await response.arrayBuffer());

                // Send image with regenerate and upscale buttons
                await bot.sendPhoto(chatId, buffer, {
                    caption: `*${modelName}*`,
                    parse_mode: 'Markdown',
                    reply_to_message_id: session.originalMessageId,
                    reply_markup: getImageActionButtons(session.promptId)
                });

                // Delete the "Generating..." message instead of updating it
                await bot.deleteMessage(chatId, messageId);

            } catch (error) {
                console.error(`${modelName}: ${error.message}`);
                
                try {
                    await bot.editMessageText(
                        `❌ Failed to generate image using ${modelName}. Please try again.`,
                        {
                            chat_id: chatId,
                            message_id: messageId
                        }
                    );
                } catch (editError) {
                    // If editing fails, send a new message instead
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