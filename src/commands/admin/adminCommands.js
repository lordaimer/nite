import { config } from '../../config/env.config.js';

const adminUsers = new Set([
    // Add your admin user IDs here
]);

export function setupAdminCommands(bot) {
    bot.onText(/\/admin/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!isAdmin(userId)) {
            await bot.sendMessage(chatId, 'You do not have permission to use admin commands.');
            return;
        }

        const adminMenu = `
Admin Commands:
/stats - View bot statistics
/broadcast - Send message to all users
/maintenance - Toggle maintenance mode
/ban - Ban a user
/unban - Unban a user
        `;

        await bot.sendMessage(chatId, adminMenu);
    });

    setupStatsCommand(bot);
    setupBroadcastCommand(bot);
    setupMaintenanceCommand(bot);
    setupBanCommand(bot);
    setupUnbanCommand(bot);
}

function isAdmin(userId) {
    return adminUsers.has(userId);
}

function setupStatsCommand(bot) {
    bot.onText(/\/stats/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!isAdmin(userId)) return;

        // Implement stats collection and display
        const stats = {
            users: 0,  // Implement user counting
            commands: 0,  // Implement command counting
            uptime: process.uptime()
        };

        const statsMessage = `
Bot Statistics:
Users: ${stats.users}
Commands Used: ${stats.commands}
Uptime: ${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m
        `;

        await bot.sendMessage(chatId, statsMessage);
    });
}

function setupBroadcastCommand(bot) {
    bot.onText(/\/broadcast (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!isAdmin(userId)) return;

        const broadcastMessage = match[1];
        // Implement broadcast to all users
        await bot.sendMessage(chatId, `Broadcast message sent: ${broadcastMessage}`);
    });
}

function setupMaintenanceCommand(bot) {
    let maintenanceMode = false;

    bot.onText(/\/maintenance/, async (msg) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;

        if (!isAdmin(userId)) return;

        maintenanceMode = !maintenanceMode;
        await bot.sendMessage(chatId, `Maintenance mode: ${maintenanceMode ? 'ON' : 'OFF'}`);
    });
}

function setupBanCommand(bot) {
    const bannedUsers = new Set();

    bot.onText(/\/ban (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const targetUserId = parseInt(match[1]);

        if (!isAdmin(userId)) return;

        bannedUsers.add(targetUserId);
        await bot.sendMessage(chatId, `User ${targetUserId} has been banned.`);
    });
}

function setupUnbanCommand(bot) {
    bot.onText(/\/unban (\d+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const targetUserId = parseInt(match[1]);

        if (!isAdmin(userId)) return;

        if (bannedUsers.delete(targetUserId)) {
            await bot.sendMessage(chatId, `User ${targetUserId} has been unbanned.`);
        } else {
            await bot.sendMessage(chatId, `User ${targetUserId} was not banned.`);
        }
    });
}
