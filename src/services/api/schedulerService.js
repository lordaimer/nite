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

        const taskId = `${chatId}_${command}_${time}`;
        await scheduleTask(bot, taskId, chatId, command, time);
    });
}

async function scheduleTask(bot, taskId, chatId, command, time) {
    try {
        // Clear any existing task with the same ID
        if (scheduledTasks.has(taskId)) {
            clearTimeout(scheduledTasks.get(taskId));
            scheduledTasks.delete(taskId);
        }

        // Calculate delay in milliseconds
        const now = new Date();
        const scheduledTime = new Date();
        const [hours, minutes] = time.split(':');
        scheduledTime.setHours(parseInt(hours));
        scheduledTime.setMinutes(parseInt(minutes));
        scheduledTime.setSeconds(0);

        if (scheduledTime <= now) {
            scheduledTime.setDate(scheduledTime.getDate() + 1);
        }

        const delay = scheduledTime.getTime() - now.getTime();

        // Schedule the task
        const timeoutId = setTimeout(() => executeScheduledTask(bot, chatId, command), delay);
        scheduledTasks.set(taskId, timeoutId);

        await bot.sendMessage(chatId, `Task scheduled: ${command} will run at ${time}`);
    } catch (error) {
        console.error('Error scheduling task:', error);
        await bot.sendMessage(chatId, 'Error scheduling task. Please try again.');
    }
}

async function executeScheduledTask(bot, chatId, command) {
    try {
        switch (command.toLowerCase()) {
            case 'fact':
                await getFact(bot, { chat: { id: chatId } });
                break;
            case 'joke':
                await fetchJoke(bot, { chat: { id: chatId } });
                break;
            case 'meme':
                await getMemeFromReddit(bot, { chat: { id: chatId } });
                break;
            default:
                await bot.sendMessage(chatId, 'Unknown command');
        }
    } catch (error) {
        console.error('Error executing scheduled task:', error);
        await bot.sendMessage(chatId, 'Error executing scheduled task');
    }
}