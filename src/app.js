// Load environment variables first
import dotenv from 'dotenv';
dotenv.config();

import TelegramBot from 'node-telegram-bot-api';
import URLParse from 'url-parse';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setupTunnel } from './tunnel.js';
import { initGameServer } from './server.js';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static files from the games directory
app.use('/games', express.static(join(__dirname, 'games')));

// Start the server and setup tunnel
app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Express server is running on port ${PORT}`);
    
    // Try to set up tunnel but continue even if it fails
    const tunnelUrl = await setupTunnel();
    if (!tunnelUrl) {
        console.log('Tunnel setup failed or timed out. Bot will operate in local mode.');
        process.env.BASE_URL = `http://localhost:${PORT}`;
    }
    
    // Initialize game server regardless of tunnel status
    initGameServer();
});

import {
    setupAdminCommands,
    setupMemeCommand,
    setupImageCommand,
    setupMovieCommand,
    setupGameCommand,
    setupGameAppCommand,
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
    setupQuoteCommand,
    setupWhatToWatchCommand,
    setupWatchlistCommand,
    setupTruthOrDareCommand,
    setupExtractCommand,
    setupUpscaleCommand
} from './commands/index.js';

// Import services
import { llmService, voiceService, setupScheduler, rateLimitService, storageService } from './services/index.js';

// Import middleware
import { setupAccessControl } from './middleware/accessControl.js';

// Import config
import { validateEnvironment } from './config/env.config.js';

// Validate environment before bot initialization
validateEnvironment();

// Initialize the bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { 
    polling: true,
    filepath: false  // Disable file path deprecation warning
});

// Setup bot connection and error handling first
function setupBotConnection() {
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 10;

    bot.on('polling_error', (error) => {
        if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            setTimeout(() => {
                bot.stopPolling().then(() => bot.startPolling());
            }, 5000 * Math.pow(2, reconnectAttempts));
        } else {
            process.exit(1); // Let process manager restart the bot
        }
    });

    bot.on('webhook_error', (error) => {
    });
}

setupBotConnection();

// Setup admin commands first (these don't need rate limiting)
setupAdminCommands(bot);

// Setup access control middleware
setupAccessControl(bot);

// Setup all commands with rate limiting
async function setupCommandsWithRateLimits() {
    // Media commands
    setupMemeCommand(bot, rateLimitService);
    setupImageCommand(bot, rateLimitService);
    setupMovieCommand(bot, rateLimitService);
    setupGameCommand(bot, rateLimitService);
    setupGameAppCommand(bot, rateLimitService);
    setupDownloadCommand(bot, rateLimitService);
    setupTranscribeCommand(bot, rateLimitService, voiceService);
    setupWhatToWatchCommand(bot, rateLimitService);
    setupWatchlistCommand(bot, rateLimitService);
    setupUpscaleCommand(bot);

    const commands = [
        { setup: setupTimeCommand, name: 'time' },
        { setup: setupHelpCommand, name: 'help' },
        { setup: setupStartCommand, name: 'start' },
        { setup: setupCurrencyCommand, name: 'currency' },
        { setup: setupJokeCommand, name: 'joke' },
        { setup: setupFactCommand, name: 'fact' },
        { setup: setupSubscribeCommand, name: 'subscribe' },
        { setup: setupTranslateCommand, name: 'translate' },
        { setup: setupQuoteCommand, name: 'quote' },
        { setup: setupBugCommand, name: 'bug' },
        { setup: setupTruthOrDareCommand, name: 'truthordare' },
        { setup: setupExtractCommand, name: 'extract' }
    ];

    const commandLimits = {
        meme: { requests: 8, window: 60000 },
        imagine: { requests: 3, window: 60000 },
        translate: { requests: 10, window: 60000 },
        movie: { requests: 10, window: 60000 },
        voice: { requests: 3, window: 60000 },
        whattowatch: { requests: 10, window: 60000 },
        extract: { requests: 5, window: 60000 },
        default: { requests: 15, window: 60000 }
    };

    commands.forEach(({ setup, name }) => {
        const limit = commandLimits[name] || commandLimits.default;
        if (name === 'whattowatch') {
            setup(bot, rateLimitService);
        } else {
            setup(bot, limit);
        }
    });
}

setupCommandsWithRateLimits();

// Setup clear command (doesn't need rate limiting)
setupClearCommand(bot);

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

process.on('uncaughtException', (error) => {
    process.exit(1);
});

process.on('unhandledRejection', (error) => {
    process.exit(1);
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

setupScheduler(bot);

function setupGracefulShutdown(bot) {
    const shutdown = async (signal) => {
        // Cleanup all active sessions
        cleanupResources();
        
        // Clear all intervals
        clearInterval(cleanupInterval);
        
        // Stop bot polling
        await bot.stopPolling();
        
        process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

setupGracefulShutdown(bot);
