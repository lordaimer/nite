import { config } from '../../config/env.config.js';
import { rateLimitMiddleware } from '../../middleware/rateLimit.js';
import { getFact } from '../../commands/utility/factCommand.js';
import { fetchJoke } from '../../commands/utility/jokeCommand.js';
import { getMemeFromReddit } from '../../commands/media/memeCommand.js';
import { sendQuote } from '../../commands/utility/quoteCommand.js';
import { storageService } from '../api/storageService.js';

// Track both one-time and recurring tasks
const scheduledTasks = new Map();
const recurringTasks = new Map();

// Initialize scheduler and load existing subscriptions
export function setupScheduler(bot) {
    // Load and schedule existing subscriptions
    loadSubscriptions(bot);

    // Listen for subscription changes
    storageService.onSubscriptionChange((chatId, subscriptionData) => {
        if (subscriptionData) {
            scheduleSubscriptions(bot, chatId, subscriptionData);
        } else {
            // Remove all scheduled tasks for this chat
            removeScheduledTasks(chatId);
        }
    });

    // Handle one-time schedule command
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

// Load and schedule all existing subscriptions
function loadSubscriptions(bot) {
    const subscriptions = storageService.getSubscriptions();
    
    for (const [chatId, userData] of subscriptions.entries()) {
        scheduleSubscriptions(bot, chatId, userData);
    }
}

// Schedule all subscriptions for a user
function scheduleSubscriptions(bot, chatId, subscriptionData) {
    // First, remove any existing scheduled tasks for this chat
    removeScheduledTasks(chatId);

    // Schedule new tasks for each subscription type and time
    for (const [type, data] of Object.entries(subscriptionData)) {
        if (!data.times || !Array.isArray(data.times)) continue;

        for (const time of data.times) {
            const taskId = `${chatId}_${type}_${time}`;
            scheduleRecurringTask(bot, taskId, chatId, type, time);
        }
    }
}

// Remove all scheduled tasks for a chat
function removeScheduledTasks(chatId) {
    // Remove one-time tasks
    for (const [taskId, task] of scheduledTasks.entries()) {
        if (taskId.startsWith(chatId.toString())) {
            clearTimeout(task);
            scheduledTasks.delete(taskId);
        }
    }

    // Remove recurring tasks
    for (const [taskId, task] of recurringTasks.entries()) {
        if (taskId.startsWith(chatId.toString())) {
            clearTimeout(task);
            recurringTasks.delete(taskId);
        }
    }
}

// Schedule a one-time task
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

// Schedule a recurring task
function scheduleRecurringTask(bot, taskId, chatId, command, time) {
    try {
        // Calculate initial delay
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

        // Schedule the recurring task
        const timeoutId = setTimeout(async () => {
            try {
                // Execute the task
                await executeScheduledTask(bot, chatId, command);
                
                // Reschedule for the next day
                scheduleRecurringTask(bot, taskId, chatId, command, time);
            } catch (error) {
                console.error('Error in recurring task:', error);
                // Still try to reschedule even if there was an error
                scheduleRecurringTask(bot, taskId, chatId, command, time);
            }
        }, delay);

        recurringTasks.set(taskId, timeoutId);
    } catch (error) {
        console.error('Error scheduling recurring task:', error);
    }
}

// Execute a scheduled task
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
            case 'quote':
                await sendQuote(bot, chatId);
                break;
            default:
                await bot.sendMessage(chatId, 'Unknown command');
        }
    } catch (error) {
        console.error('Error executing scheduled task:', error);
        await bot.sendMessage(chatId, 'Error executing scheduled task');
    }
}