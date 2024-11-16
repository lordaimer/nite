import { storageService } from '../../services/api/storageService.js';

export function setupBugCommand(bot) {
    // Regular bug report command for users
    bot.onText(/\/bug(?:\s+(.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
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

        const report = {
            userId: msg.from.id,
            username: msg.from.username || 'Unknown',
            userFirstName: msg.from.first_name,
            description: bugDescription,
        };

        if (storageService.addBugReport(report)) {
            await bot.sendMessage(
                chatId,
                '✅ Bug report submitted successfully!\n' +
                'Thank you for helping improve the bot.',
                { parse_mode: 'Markdown' }
            );
        } else {
            await bot.sendMessage(
                chatId,
                '❌ Failed to submit bug report. Please try again later.',
                { parse_mode: 'Markdown' }
            );
        }
    });
}