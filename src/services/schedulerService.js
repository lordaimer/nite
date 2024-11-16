import { config } from '../../config/env.config.js';
import { rateLimitMiddleware } from '../../middleware/rateLimit.js';
import { getFact } from '../../commands/utility/factCommand.js';
import { fetchJoke } from '../../commands/utility/jokeCommand.js';
import { getMemeFromReddit } from '../../commands/media/memeCommand.js';

const scheduledTasks = new Map();

export function setupScheduler(bot) {
    bot.onText(/\/schedule (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        
        if (!rateLimitMiddleware(userId)) {
            return;
        }

        const [command, time] = match[1].split(' ');
        if (!command || !time) {
            await bot.sendMessage(chatId, 'Please provide both command and time. Format: /schedule <command> <time>');
            return;
        }

        try {
            const taskId = `${chatId}_${command}_${Date.now()}`;
            scheduleTask(bot, taskId, chatId, command, time);
            await bot.sendMessage(chatId, `Scheduled ${command} for ${time}`);
        } catch (error) {
            await bot.sendMessage(chatId, `Failed to schedule task: ${error.message}`);
        }
    });

    // List scheduled tasks
    bot.onText(/\/tasks/, async (msg) => {
        const chatId = msg.chat.id;
        const tasks = Array.from(scheduledTasks.entries())
            .filter(([taskId]) => taskId.startsWith(chatId.toString()))
            .map(([taskId, task]) => `${task.command} at ${task.time}`)
            .join('\n');

        await bot.sendMessage(chatId, tasks || 'No scheduled tasks');
    });
}

function scheduleTask(bot, taskId, chatId, command, time) {
    const [hours, minutes] = time.split(':').map(Number);
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        throw new Error('Invalid time format. Use HH:mm (24-hour format)');
    }

    const now = new Date();
    const scheduledTime = new Date(now);
    scheduledTime.setHours(hours, minutes, 0, 0);

    if (scheduledTime <= now) {
        scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const timeout = scheduledTime.getTime() - now.getTime();
    const timer = setTimeout(async () => {
        try {
            await executeScheduledTask(bot, chatId, command);
        } catch (error) {
            console.error(`Failed to execute scheduled task: ${error}`);
        } finally {
            scheduledTasks.delete(taskId);
        }
    }, timeout);

    scheduledTasks.set(taskId, {
        timer,
        command,
        time,
        chatId
    });
}

async function executeScheduledTask(bot, chatId, command) {
    switch (command.toLowerCase()) {
        case 'fact':
            const fact = await getFact();
            await bot.sendMessage(chatId, fact);
            break;
        case 'joke':
            const joke = await fetchJoke();
            await bot.sendMessage(chatId, joke);
            break;
        case 'meme':
            const meme = await getMemeFromReddit();
            if (meme) {
                await bot.sendPhoto(chatId, meme.url, { caption: meme.title });
            }
            break;
        default:
            await bot.sendMessage(chatId, `Unknown command: ${command}`);
    }
}
