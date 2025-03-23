import { isAdmin, isAuthorized } from '../commands/admin/adminCommands.js';

export function setupAccessControl(bot) {
    bot.on('message', async (msg) => {
        const userId = msg.from.id;
        const text = msg.text || '';

        // Admin commands bypass access control
        if (text.startsWith('/') && isAdmin(userId)) {
            return;
        }

        // Check if user is authorized
        if (!isAuthorized(userId)) {
            await bot.sendMessage(msg.chat.id, '⛔ Sorry, you are not authorized to use this bot.');
            return;
        }
    });
}
