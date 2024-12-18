import TelegramBot from 'node-telegram-bot-api';
import dotenv from 'dotenv';
import URLParse from 'url-parse';

// Import commands
import {
    setupAdminCommands,
    setupMemeCommand,
    setupImageCommand,
    setupMovieCommand,
    setupDownloadCommand,
    setupTranscribeCommand,
    setupTimeCommand,
    setupHelpCommand,
    setupStartCommand,
    setupCurrencyCommand,
    setupJokeCommand,
    setupFactCommand,
    setupClearCommand,
    setupSubscribeCommand,
    setupTranslateCommand,
    setupBugCommand,
    setupQuoteCommand
} from './commands/index.js';

// Import services
import { llmService, voiceService, setupScheduler, rateLimitService, storageService } from './services/index.js';

// Import config
import { validateEnvironment } from './config/env.config.js';

// Load environment variables
dotenv.config();

// Validate environment before bot initialization
validateEnvironment();

// Initialize bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Add message handler before command setup
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const messageText = msg.text;
    const userId = msg.from.id;

    // Rate limit check for general messages
    if (!rateLimitService.check(userId, 'message', 10, 60000)) { // 10 messages per minute
        await bot.sendMessage(
            chatId,
            '⚠️ You\'re sending messages too quickly. Please wait a moment.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Global rate limit check
    if (!rateLimitService.checkGlobal('message', 60, 60000)) { // 60 messages per minute globally
        await bot.sendMessage(
            chatId,
            '⚠️ Bot is experiencing high traffic. Please try again in a moment.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Ignore messages that:
    // - Start with '/' (commands)
    // - Are empty or undefined
    // - Are from a bot
    // - Are forwarded messages
    if (!messageText || 
        messageText.startsWith('/') || 
        msg.from.is_bot || 
        msg.forward_date) {
        return;
    }

    try {
        // Check for meme intent with potential subreddit
        const intent = await llmService.detectIntent(messageText);
        
        if (intent.type === 'meme') {
            // Array of fun loading messages
            const loadingMessages = [
                "🚀 Launching meme delivery system...",
                "📦 Packaging your meme with extra laughs...",
                "🔍 Searching the memeverse...",
                "⚡ Summoning the perfect meme...",
                "🎯 Target acquired! Deploying meme...",
                "🌟 Channeling meme energy...",
                "🎭 Preparing your dose of humor...",
                "🎨 Crafting your meme experience...",
                "🎁 Wrapping up something special..."
            ];
            
            const loadingMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];
            const statusMessage = await bot.sendMessage(chatId, loadingMessage);
            
            try {
                // Create a fake message object
                const fakeMsg = {
                    ...msg,
                    text: intent.isRandom ? '/meme random' : 
                          intent.subreddit ? `/meme ${intent.subreddit}` : '/meme'
                };

                const match = fakeMsg.text.match(/\/(meme|mm)(?:\s+(\w+))?/);

                if (match) {
                    if (intent.isRandom) {
                        await bot.sendMessage(chatId, '🎲 Setting meme mode to random');
                        userPreferences.delete(chatId);
                    } else if (intent.subreddit) {
                        await bot.sendMessage(chatId, `🎯 Setting default subreddit to r/${intent.subreddit}`);
                    }
                    
                    await getMemeResponse(bot, chatId, intent.isRandom ? 'random' : intent.subreddit);
                } else {
                    throw new Error('Invalid command format');
                }
                
                await bot.deleteMessage(chatId, statusMessage.message_id);
            } catch (error) {
                console.error('Error in meme command:', error);
                await bot.editMessageText('😅 Oops! The meme escaped. Let\'s try again!', {
                    chat_id: chatId,
                    message_id: statusMessage.message_id
                });
            }
            return;
        }

        // If no meme intent, proceed with regular LLM conversation
        await bot.sendChatAction(chatId, 'typing');
        const response = await llmService.generateResponse(messageText, chatId);
        await llmService.sendResponse(bot, chatId, response);
    } catch (error) {
        console.error('Error processing message:', error);
    }
});

// Add voice message handler
bot.on('voice', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    // Rate limit check for voice messages
    if (!rateLimitService.check(userId, 'voice', 3, 60000)) { // 3 voice messages per minute
        await bot.sendMessage(
            chatId,
            '⚠️ Please wait before sending more voice messages.',
            { parse_mode: 'Markdown' }
        );
        return;
    }

    // Skip if user is in transcribe mode
    if (transcribeModeUsers.has(chatId)) return;
    
    try {
        // Show transcription animation first
        const statusMessage = await bot.sendMessage(
            chatId, 
            '*Transcription in progress* ◡', 
            { parse_mode: 'MarkdownV2' }
        );

        const frames = ['◜', '◝', '◞', '◟'];
        let frameIndex = 0;
        const animationInterval = setInterval(() => {
            bot.editMessageText(
                `*Transcription in progress* ${frames[frameIndex]}`,
                {
                    chat_id: chatId,
                    message_id: statusMessage.message_id,
                    parse_mode: 'MarkdownV2'
                }
            ).catch(() => {});
            frameIndex = (frameIndex + 1) % frames.length;
        }, 150);

        // Get the transcription while animation is showing
        const file = await bot.getFile(msg.voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        const tempFilePath = await voiceService.downloadVoice(fileUrl);
        const transcription = await voiceService.transcribeAudio(tempFilePath);

        // Clear animation and show transcription
        clearInterval(animationInterval);
        const escapedTranscription = transcription.trim().replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
        
        await bot.editMessageText(
            `*Transcription:*\n${escapedTranscription}`,
            {
                chat_id: chatId,
                message_id: statusMessage.message_id,
                parse_mode: 'MarkdownV2'
            }
        );

        // Generate AI response
        await bot.sendChatAction(chatId, 'typing');
        const response = await llmService.generateResponse(transcription, chatId);
        await llmService.sendResponse(bot, chatId, response);

    } catch (error) {
        console.error('Error processing voice message:', error);
        await bot.sendMessage(
            chatId,
            '❌ Sorry, I had trouble processing your voice message\\. Please try again\\.', 
            { parse_mode: 'MarkdownV2' }
        );
    }
});

// Global callback query handler to route to appropriate handlers
bot.on('callback_query', async (query) => {
    // Route based on callback data prefix
    if (query.data.startsWith('help_')) {
        // Help command callbacks will be handled in setupHelpCommand
        return;
    } else if (query.data.startsWith('meme_') || query.data.startsWith('send_to_')) {
        // Meme command callbacks will be handled in setupMemeCommand
        return;
    } else if (query.data.startsWith('admin_') || query.data.startsWith('notify_')) {
        // Check admin status only for admin-related actions
        const ADMIN_USER_ID = process.env.ADMIN_USER_ID;
        if (query.from.id.toString() !== ADMIN_USER_ID) {
            return bot.answerCallbackQuery(query.id, "⛔ This action is only available for administrators.");
        }
    }
});

// Command rate limits configuration
const commandLimits = {
    meme: { requests: 8, window: 60000 },
    imagine: { requests: 3, window: 60000 },
    translate: { requests: 10, window: 60000 },
    movie: { requests: 10, window: 60000 },
    voice: { requests: 3, window: 60000 },
    default: { requests: 15, window: 60000 }
};

// Setup all commands with rate limiting
function setupCommandsWithRateLimits() {
    const commands = [
        { setup: setupTimeCommand, name: 'time' },
        { setup: setupHelpCommand, name: 'help' },
        { setup: setupStartCommand, name: 'start' },
        { setup: setupCurrencyCommand, name: 'currency' },
        { setup: setupMemeCommand, name: 'meme' },
        { setup: setupJokeCommand, name: 'joke' },
        { setup: setupFactCommand, name: 'fact' },
        { setup: setupImageCommand, name: 'imagine' },
        { setup: setupTranscribeCommand, name: 'voice' },
        { setup: setupSubscribeCommand, name: 'subscribe' },
        { setup: setupMovieCommand, name: 'movie' },
        { setup: setupTranslateCommand, name: 'translate' },
        { setup: setupQuoteCommand, name: 'quote' },
    ];

    commands.forEach(({ setup, name }) => {
        const limit = commandLimits[name] || commandLimits.default;
        setup(bot, limit);
    });
}

setupCommandsWithRateLimits();

// Setup admin commands
setupAdminCommands(bot);

// Setup clear command
setupClearCommand(bot);

// Add this function to detect meme intents
function detectMemeIntent(text) {
    const memeKeywords = [
        'send me a meme',
        'show me a meme',
        'i want a meme',
        'give me a meme',
        'share a meme',
        'need a meme',
        'meme please',
        'another meme'
    ];
    
    const normalizedText = text.toLowerCase().trim();
    return memeKeywords.some(keyword => normalizedText.includes(keyword));
}

process.on('uncaughtException', (error) => {
    console.error('Error:', error.message);
});

process.on('unhandledRejection', (error) => {
    console.error('Error:', error.message);
});

// Add to bot.js
function cleanupResources() {
    const hour = 60 * 60 * 1000;
    
    // Cleanup sessions with different timeouts
    const cleanupMap = new Map([
        [userSessions, 24 * hour],
        [translateModeUsers, 30 * 60 * 1000],
        [imageGenerationSessions, 30 * 60 * 1000]
    ]);

    const now = Date.now();
    cleanupMap.forEach((timeout, sessions) => {
        sessions.forEach((session, chatId) => {
            if (now - session.timestamp > timeout) {
                sessions.delete(chatId);
            }
        });
    });
    
    // Cleanup preferences
    userPreferences.forEach((pref, chatId) => {
        if (!activeChatIds.has(chatId)) {
            userPreferences.delete(chatId);
        }
    });

    // Run rate limit service cleanup
    rateLimitService.cleanup();
}

// Run cleanup every 6 hours
setInterval(cleanupResources, 6 * 60 * 60 * 1000);

function setupBotConnection() {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;

    bot.on('polling_error', (error) => {
        console.error('Polling error:', error);
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(() => {
                console.log(`Attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`);
                bot.stopPolling().then(() => bot.startPolling());
            }, 5000 * Math.pow(2, reconnectAttempts));
        } else {
            console.error('Max reconnection attempts reached');
            process.exit(1); // Let process manager restart the bot
        }
    });

    bot.on('webhook_error', (error) => {
        console.error('Webhook error:', error);
    });
}

setupScheduler(bot);

function setupGracefulShutdown(bot) {
    const shutdown = async (signal) => {
        console.log(`Received ${signal}. Cleaning up...`);
        
        // Cleanup all active sessions
        cleanupResources();
        
        // Clear all intervals
        clearInterval(cleanupInterval);
        
        // Stop bot polling
        await bot.stopPolling();
        
        console.log('Cleanup complete. Shutting down...');
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

setupGracefulShutdown(bot);
setupDownloadCommand(bot);
setupBugCommand(bot);
