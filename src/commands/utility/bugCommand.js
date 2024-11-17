import { storageService } from '../../services/api/storageService.js';
import { rateLimitService } from '../../services/api/rateLimitService.js';

// Track if the command has been set up
let isSetup = false;
let currentHandler = null;
let startupTime = Date.now();

export function setupBugCommand(bot, rateLimit = { requests: 1, window: 60000 }) {
    // Prevent multiple setups
    if (isSetup) {
        return;
    }
    
    isSetup = true;

    // Regular bug report command for users
    const commandHandler = async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const bugDescription = match[1];

        if (!bugDescription) {
            await bot.sendMessage(
                chatId,
                '❌ Please provide a description of the bug.\n' +
                'Usage: `/bug <description>`\n\n' +
                'Example: `/bug The /time command shows wrong timezone`',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Use the global rate limit service
        if (!rateLimitService.check(userId, 'bug_report', rateLimit.requests, rateLimit.window)) {
            await bot.sendMessage(
                chatId,
                '⚠️ Please wait a moment before submitting another bug report.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        try {
            const bugReport = {
                userId: msg.from.id,
                username: msg.from.username,
                userFirstName: msg.from.first_name,
                description: bugDescription
            };

            const result = await storageService.addBugReport(bugReport);

            if (result) {
                await bot.sendMessage(
                    chatId,
                    '✅ Thank you for your bug report! Our team will look into it.',
                    { parse_mode: 'Markdown' }
                );
            } else {
                await bot.sendMessage(
                    chatId,
                    '❌ Unable to save your bug report. Please try again later.',
                    { parse_mode: 'Markdown' }
                );
            }
        } catch (error) {
            console.error('Error in bug report command:', error);
            await bot.sendMessage(
                chatId,
                '❌ An error occurred while submitting your bug report. Please try again later.',
                { parse_mode: 'Markdown' }
            );
        }
    };

    // Remove the previous handler if it exists
    if (currentHandler) {
        bot.removeListener('message', currentHandler);
    }
    
    // Set up the new handler
    const pattern = /^\/bug(?:\s+(.+))?$/;
    currentHandler = (msg) => {
        // Skip messages from before bot startup
        if (msg.date * 1000 < startupTime) {
            return;
        }
        
        const match = msg.text?.match(pattern);
        if (match) {
            commandHandler(msg, match);
        }
    };
    
    // Register the new handler
    bot.on('message', currentHandler);
}