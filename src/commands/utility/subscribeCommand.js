import moment from 'moment-timezone';
import { storageService } from '../../services/api/storageService.js';

// Valid command types for subscription
const VALID_COMMANDS = {
    fact: ['fact', 'facts', '/fact', '/facts', '/ft'],
    joke: ['joke', 'jokes', '/joke', '/jokes', '/jk'],
    meme: ['meme', 'memes', '/meme', '/memes', '/mm'],
    quote: ['quote', 'quotes', '/quote', '/quotes', '/qt']
};

// Track recently processed commands to prevent duplicates on restart
const recentCommands = new Map();
const COMMAND_EXPIRY = 5000; // 5 seconds

export function setupSubscribeCommand(bot) {
    // Set bot instance in storage service
    storageService.setBotInstance(bot);

    // Helper function to parse time strings
    function parseTime(timeStr) {
        const time24 = moment(timeStr, 'HH:mm', true);
        if (time24.isValid()) {
            return time24.format('HH:mm');
        }

        const time12 = moment(timeStr, ['h:mm a', 'ha', 'h a'], true);
        if (time12.isValid()) {
            return time12.format('HH:mm');
        }

        return null;
    }

    // Helper function to check if time already exists in subscription
    function hasExistingTime(subscription, newTime) {
        if (!subscription || !subscription.times) {
            return false;
        }
        return subscription.times.includes(newTime);
    }

    bot.onText(/^\/(?:subscribe|sub)(?:\s+(.+))?$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const messageId = msg.message_id;
        const commandKey = `${chatId}_${messageId}`;

        // Check if this command was recently processed
        const now = Date.now();
        const lastProcessed = recentCommands.get(commandKey);
        if (lastProcessed && (now - lastProcessed) < COMMAND_EXPIRY) {
            return;
        }
        recentCommands.set(commandKey, now);

        // Clean up old commands
        for (const [key, timestamp] of recentCommands.entries()) {
            if (now - timestamp > COMMAND_EXPIRY) {
                recentCommands.delete(key);
            }
        }

        const args = match[1] ? match[1].toLowerCase().split(/[\s,]+/) : [];

        if (!match[1]) {
            await bot.sendMessage(
                chatId,
                'Please specify what you want to subscribe to and at what time(s).\n' +
                'Example: `/subscribe facts 08:00, 13:00`\n' +
                'Or: `/sub memes 8pm`\n\n' +
                'Available content types:\n' +
                '• facts, fact, /facts, /ft\n' +
                '• jokes, joke, /jokes, /jk\n' +
                '• memes, meme, /memes, /mm\n' +
                '• quotes, quote, /quotes, /qt',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        if (args.length < 2) {
            await bot.sendMessage(
                chatId,
                'Please provide both content type and time(s).\n' +
                'Example: `/subscribe facts 08:00`',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        // Get command type
        const commandType = args[0].toLowerCase();
        let subscriptionType = null;

        // Validate command type
        for (const [type, aliases] of Object.entries(VALID_COMMANDS)) {
            if (aliases.includes(commandType)) {
                subscriptionType = type;
                break;
            }
        }

        if (!subscriptionType) {
            await bot.sendMessage(
                chatId,
                'Invalid subscription type. Please use fact, joke, meme, or quote.'
            );
            return;
        }

        // Parse times
        const timeArgs = args.slice(1);
        const validTimes = [];
        const invalidTimes = [];
        const existingTimes = [];

        // Get current subscriptions
        const userSubs = storageService.getSubscriptions().get(chatId.toString()) || {};

        for (const timeArg of timeArgs) {
            const parsedTime = parseTime(timeArg);
            if (!parsedTime) {
                invalidTimes.push(timeArg);
                continue;
            }
            
            if (hasExistingTime(userSubs[subscriptionType], parsedTime)) {
                existingTimes.push(parsedTime);
            } else {
                validTimes.push(parsedTime);
            }
        }

        // Handle invalid times
        if (invalidTimes.length > 0) {
            await bot.sendMessage(
                chatId,
                'Please provide valid times in 24h format (HH:mm) or 12h format (e.g., 8pm).'
            );
            return;
        }

        // Handle case where all times exist
        if (validTimes.length === 0) {
            if (existingTimes.length > 0) {
                const timesStr = existingTimes.map(time => 
                    moment(time, 'HH:mm').format('h:mm A')
                ).join(', ');
                
                await bot.sendMessage(
                    chatId,
                    `You already have ${subscriptionType} subscriptions at: ${timesStr}`
                );
            }
            return;
        }

        // Get user's timezone
        const timezone = msg.from.language_code ? 
            moment.tz.guess(msg.from.language_code) : 
            'UTC';

        // Update subscription with only new times
        if (!userSubs[subscriptionType]) {
            userSubs[subscriptionType] = {
                times: validTimes,
                timezone: timezone
            };
        } else {
            const uniqueTimes = new Set([...userSubs[subscriptionType].times]);
            validTimes.forEach(time => uniqueTimes.add(time));
            userSubs[subscriptionType].times = Array.from(uniqueTimes).sort();
        }

        // Save to storage - success message will be sent by the change listener
        storageService.updateSubscription(chatId, userSubs);
    });

    // Handle unsubscribe command
    bot.onText(/^\/(?:unsubscribe|unsub)(?:\s+(.+))?$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const type = match[1]?.toLowerCase();

        const userSubs = storageService.getSubscriptions().get(chatId.toString());
        if (!userSubs) {
            await bot.sendMessage(chatId, 'You have no active subscriptions.');
            return;
        }

        if (type) {
            let subscriptionType = null;
            for (const [sType, aliases] of Object.entries(VALID_COMMANDS)) {
                if (aliases.includes(type)) {
                    subscriptionType = sType;
                    break;
                }
            }

            if (!subscriptionType || !userSubs[subscriptionType]) {
                await bot.sendMessage(chatId, 'You are not subscribed to this content type.');
                return;
            }

            delete userSubs[subscriptionType];
            if (Object.keys(userSubs).length === 0) {
                storageService.removeSubscription(chatId);
            } else {
                storageService.updateSubscription(chatId, userSubs);
            }

            await bot.sendMessage(chatId, `✅ Unsubscribed from daily ${subscriptionType}s.`);
        } else {
            storageService.removeSubscription(chatId);
            await bot.sendMessage(chatId, '✅ Unsubscribed from all daily content.');
        }
    });

    // Add this to setupSubscribeCommand
    bot.onText(/^\/(?:list|mysubs)$/, async (msg) => {
        const chatId = msg.chat.id;
        const userSubs = storageService.getSubscriptions().get(chatId.toString());

        if (!userSubs || Object.keys(userSubs).length === 0) {
            await bot.sendMessage(chatId, 'You have no active subscriptions.');
            return;
        }

        let message = '*Your Active Subscriptions:*\n\n';
        for (const [type, data] of Object.entries(userSubs)) {
            const times = data.times.map(time => 
                moment(time, 'HH:mm').format('h:mm A')
            ).join(', ');
            message += `*${type.charAt(0).toUpperCase() + type.slice(1)}s*\n`;
            message += `├ Times: ${times}\n`;
            message += `└ Timezone: ${data.timezone}\n\n`;
        }

        message += '_Use /unsubscribe to cancel any subscription_';

        await bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[
                    { text: '➕ Add New', callback_data: 'sub_new' },
                    { text: '❌ Remove All', callback_data: 'unsub_all' }
                ]]
            }
        });
    });

    // Add to setupSubscribeCommand
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        
        switch (query.data) {
            case 'sub_new':
                await bot.sendMessage(
                    chatId,
                    'To add a new subscription, use:\n' +
                    '`/sub [type] [time]`\n\n' +
                    'Examples:\n' +
                    '• `/sub meme 9:00`\n' +
                    '• `/sub fact 14:30`\n' +
                    '• `/sub joke 8pm`',
                    { parse_mode: 'Markdown' }
                );
                break;

            case 'unsub_all':
                storageService.removeSubscription(chatId);
                await bot.editMessageText(
                    '✅ All subscriptions have been cancelled.',
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id,
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '➕ Subscribe Again', callback_data: 'sub_new' }
                            ]]
                        }
                    }
                );
                break;
        }

        await bot.answerCallbackQuery(query.id);
    });
}

// Export the getter for scheduler
export const getSubscriptions = () => storageService.getSubscriptions(); 