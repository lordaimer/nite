import { config } from '../../config/env.config.js';

// Initialize admin users with the admin ID from config
const ADMIN_ID = config.telegram.adminId?.toString();
const ARANE_ID = config.telegram.araneId?.toString();
const YVAINE_ID = config.telegram.yvaineId?.toString();

let isPublicMode = false;

export function isAdmin(userId) {
    return userId?.toString() === ADMIN_ID;
}

export function isAuthorized(userId) {
    const userIdStr = userId?.toString();
    return isPublicMode || 
           userIdStr === ADMIN_ID || 
           userIdStr === ARANE_ID || 
           userIdStr === YVAINE_ID;
}

export function setupAdminCommands(bot) {
    // Admin menu command
    bot.onText(/^\/admin$/, async (msg) => {
        const userId = msg.from.id;
        if (!isAdmin(userId)) {
            await bot.sendMessage(msg.chat.id, '⛔ Sorry, this command is only available to administrators.');
            return;
        }

        const currentMode = isPublicMode ? '🌐 Public' : '🔒 Private';
        const adminMenu = `
🛠 *Admin Commands*

*Access Control*
/access public - Switch to public mode
/access private - Switch to private mode
Current mode: ${currentMode}

*Moderation*
/ban [user_id] - Ban a user
/unban [user_id] - Unban a user

*System*
/stats - View bot statistics
/broadcast [message] - Send message to all users
/maintenance - Toggle maintenance mode

_Use these commands responsibly!_`;

        try {
            await bot.sendMessage(msg.chat.id, adminMenu, { 
                parse_mode: 'Markdown',
                disable_web_page_preview: true 
            });
        } catch (error) {
            console.error('Error sending admin menu:', error);
            await bot.sendMessage(msg.chat.id, '⚠️ Error displaying admin menu. Please try again.');
        }
    });

    // Access mode command
    bot.onText(/^\/access(?:\s+(public|private))?$/, async (msg, match) => {
        const userId = msg.from.id;

        if (!isAdmin(userId)) {
            await bot.sendMessage(msg.chat.id, '⛔ Sorry, this command is only available to administrators.');
            return;
        }

        const requestedMode = match?.[1];

        // If no mode specified, show current status
        if (!requestedMode) {
            const currentMode = isPublicMode ? '🌐 Public' : '🔒 Private';
            await bot.sendMessage(msg.chat.id, `Current access mode: ${currentMode}\n\nUse /access [public|private] to change the mode.`);
            return;
        }

        // Change mode if specified
        isPublicMode = requestedMode === 'public';
        const modeEmoji = isPublicMode ? '🌐' : '🔒';
        const modeText = isPublicMode ? 'public' : 'private';
        
        await bot.sendMessage(msg.chat.id, `${modeEmoji} Bot access mode changed to ${modeText}.`);
    });

    // Setup other commands
    setupStatsCommand(bot);
    setupBroadcastCommand(bot);
    setupMaintenanceCommand(bot);
    setupBanCommand(bot);
    setupUnbanCommand(bot);
}

function setupStatsCommand(bot) {
    bot.onText(/^\/stats/, async (msg) => {
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

        await bot.sendMessage(msg.chat.id, statsMessage);
    });
}

function setupBroadcastCommand(bot) {
    bot.onText(/^\/broadcast (.+)/, async (msg, match) => {
        const userId = msg.from.id;
        if (!isAdmin(userId)) return;

        const broadcastMessage = match[1];
        // Implement broadcast to all users
        await bot.sendMessage(msg.chat.id, `Broadcast message sent: ${broadcastMessage}`);
    });
}

function setupMaintenanceCommand(bot) {
    let maintenanceMode = false;

    bot.onText(/^\/maintenance/, async (msg) => {
        const userId = msg.from.id;
        if (!isAdmin(userId)) return;

        maintenanceMode = !maintenanceMode;
        await bot.sendMessage(msg.chat.id, `Maintenance mode: ${maintenanceMode ? 'ON' : 'OFF'}`);
    });
}

function setupBanCommand(bot) {
    const bannedUsers = new Set();

    bot.onText(/^\/ban (\d+)/, async (msg, match) => {
        const userId = msg.from.id;
        const targetUserId = parseInt(match[1]);
        if (!isAdmin(userId)) return;

        bannedUsers.add(targetUserId);
        await bot.sendMessage(msg.chat.id, `User ${targetUserId} has been banned.`);
    });
}

function setupUnbanCommand(bot) {
    bot.onText(/^\/unban (\d+)/, async (msg, match) => {
        const userId = msg.from.id;
        const targetUserId = parseInt(match[1]);
        if (!isAdmin(userId)) return;

        if (bannedUsers.delete(targetUserId)) {
            await bot.sendMessage(msg.chat.id, `User ${targetUserId} has been unbanned.`);
        } else {
            await bot.sendMessage(msg.chat.id, `User ${targetUserId} was not banned.`);
        }
    });
}

export function getAccessMode() {
    return isPublicMode ? 'public' : 'private';
}
