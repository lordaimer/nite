import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import moment from 'moment-timezone';

// Get current file's directory
const __dirname = dirname(fileURLToPath(import.meta.url));

// Read and parse JSON file
const timezoneMappings = JSON.parse(
    readFileSync(join(__dirname, '../data/timezones.json'), 'utf8')
);

// Store active time updates
const activeUpdates = new Map(); // {chatId: {messageId, interval, timezone}}

export function setupTimeCommand(bot) {
    // Add cleanup function
    function cleanupAllUpdates() {
        for (const [chatId, update] of activeUpdates.entries()) {
            clearInterval(update.interval);
            activeUpdates.delete(chatId);
        }
    }

    // Add to existing bot event handlers
    bot.on('stop', cleanupAllUpdates);
    process.on('SIGINT', cleanupAllUpdates);
    process.on('SIGTERM', cleanupAllUpdates);

    // Clear any existing update when starting a new one
    function clearExistingUpdate(chatId) {
        const existing = activeUpdates.get(chatId);
        if (existing) {
            clearInterval(existing.interval);
            activeUpdates.delete(chatId);
        }
    }

    function formatTimeMessage(timezone) {
        const time = moment().tz(timezone);
        const city = timezone.split('/').pop().replace('_', ' ');
        return `*${city}: ${time.format('h:mm A')}\n${time.format('dddd, MMMM D YYYY')}*`;
    }

    function startTimeUpdate(chatId, timezone) {
        clearExistingUpdate(chatId);

        bot.sendMessage(chatId, formatTimeMessage(timezone), { parse_mode: 'Markdown' })
            .then(msg => {
                const interval = setInterval(async () => {
                    try {
                        await bot.editMessageText(formatTimeMessage(timezone), {
                            chat_id: chatId,
                            message_id: msg.message_id,
                            parse_mode: 'Markdown'
                        });
                    } catch (error) {
                        console.error('Error updating time:', error);
                        clearExistingUpdate(chatId);
                    }
                }, 60000);

                activeUpdates.set(chatId, {
                    messageId: msg.message_id,
                    interval: interval,
                    timezone: timezone
                });

                // Set timeout to quietly stop updates after 6 hours
                setTimeout(() => {
                    clearExistingUpdate(chatId);
                }, 6 * 60 * 60 * 1000);
            });
    }

    // Handle time command
    bot.onText(/\/(time|tm)(?:\s+(.+))?/, (msg, match) => {
        const chatId = msg.chat.id;
        let timezone = match[2]?.toLowerCase();

        // Show instructions if no timezone specified
        if (!timezone) {
            bot.sendMessage(chatId, 
                "Please provide a city or country name.\nExample: */time Paris*, */tm Paris*", 
                { parse_mode: 'Markdown' }
            );
            return;
        }

        timezone = timezoneMappings[timezone] || timezone;

        // Validate timezone
        if (!moment.tz.zone(timezone)) {
            bot.sendMessage(chatId, `Invalid timezone. Please try again with a valid timezone.`);
            return;
        }

        startTimeUpdate(chatId, timezone);
    });
}