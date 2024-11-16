import axios from 'axios';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read subreddits from JSON file
let MEME_SUBREDDITS;
try {
    const jsonData = readFileSync(join(__dirname, '../data/memeSubreddits.json'), 'utf8');
    MEME_SUBREDDITS = JSON.parse(jsonData).subreddits;
    // console.log('Loaded subreddits:', MEME_SUBREDDITS.length);
} catch (error) {
    console.error('Error loading memeSubreddits.json:', error);
    // Fallback array in case the file can't be read
    MEME_SUBREDDITS = ['memes', 'dankmemes', 'wholesomememes'];
}

// Add this after other constants
export const userPreferences = new Map();

const lastMemeMessages = new Map(); // Stores the last meme message ID for each chat

// Track shared memes with all necessary details
const sharedMemes = new Map(); // messageId -> { fromId, toId, memeData }

// Add this constant for reaction buttons
const REACTIONS = {
    HILARIOUS: { emoji: '🤣' },
    LOVE: { emoji: '❤' },
    FIRE: { emoji: '' },
    DEAD: { emoji: '💀' },
    MEH: { emoji: '😐' }
};

// Add function to create reaction keyboard
const getReactionKeyboard = () => {
    return {
        inline_keyboard: [
            Object.entries(REACTIONS).map(([key, value]) => ({
                text: value.emoji,
                callback_data: `reaction_${key}`
            }))
        ]
    };
};

const getMemeFromReddit = async (subreddit = null) => {
    try {
        const targetSubreddit = subreddit || MEME_SUBREDDITS[Math.floor(Math.random() * MEME_SUBREDDITS.length)];
        
        // Randomly choose a sorting method and time filter
        const sortMethods = ['hot', 'top', 'new'];
        const timeFilters = ['all', 'year', 'month', 'week'];
        const randomSort = sortMethods[Math.floor(Math.random() * sortMethods.length)];
        const randomTime = timeFilters[Math.floor(Math.random() * timeFilters.length)];

        // Construct the URL with proper sorting and time parameters
        let url = `https://www.reddit.com/r/${targetSubreddit}/${randomSort}.json`;
        if (randomSort === 'top') {
            url += `?t=${randomTime}`;
        }

        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/93.0.4577.63 Safari/537.36'
            },
            params: {
                limit: 100
            }
        });

        if (!response.data.data.children.length) {
            throw new Error('Subreddit not found or has no posts');
        }

        const posts = response.data.data.children.filter(post => {
            const isValidImage = post.data.url?.match(/\.(jpg|jpeg|png|gif)$/i);
            return isValidImage && !post.data.is_video && !post.data.stickied;
        });

        if (posts.length === 0) {
            throw new Error('No valid memes found');
        }

        const randomPost = posts[Math.floor(Math.random() * posts.length)].data;
        
        return {
            title: randomPost.title,
            url: randomPost.url,
            author: randomPost.author,
            subreddit: randomPost.subreddit,
            upvotes: randomPost.ups,
            link: `https://reddit.com${randomPost.permalink}`,
            sortMethod: randomSort,
            timeFilter: randomSort === 'top' ? randomTime : null,
            description: randomPost.selftext || ''
        };
    } catch (error) {
        throw error;
    }
};

const getCustomInlineKeyboard = (chatId, preferredSubreddit) => {
    const buttons = [
        // First row: Another meme button
        [{
            text: preferredSubreddit 
                ? `🎲 Another meme from r/${preferredSubreddit}`
                : '🎲 Another random meme',
            callback_data: `meme_${preferredSubreddit || 'random'}`
        }]
    ];

    // Second row: Send button (if applicable)
    if (chatId === Number(process.env.ARANE_CHAT_ID)) {
        buttons.push([{
            text: 'Send to Yvaine ❤️',
            callback_data: 'send_to_yvaine'
        }]);
    } else if (chatId === Number(process.env.YVAINE_CHAT_ID)) {
        buttons.push([{
            text: 'Send to Arane ❤️',
            callback_data: 'send_to_arane'
        }]);
    }

    return {
        inline_keyboard: buttons // Each array element becomes a new row
    };
};

const sendMemeWithKeyboard = async (bot, chatId, meme, preferredSubreddit) => {
    try {
        const caption = meme.description 
            ? `${meme.title}\n` +
              `📝 ${meme.description}\n\n` +
              `💻 u/${meme.author}\n` +
              `⌨️ r/${meme.subreddit}\n\n`
            : `${meme.title}\n\n` +
              `💻 u/${meme.author}\n` +
              `⌨️ r/${meme.subreddit}\n\n`;

        // Send new meme with keyboard first
        const sentMessage = await bot.sendPhoto(chatId, meme.url, {
            caption: caption,
            reply_markup: getCustomInlineKeyboard(chatId, preferredSubreddit)
        });

        // After new meme is sent, remove buttons from previous message
        const lastMessageId = lastMemeMessages.get(chatId);
        if (lastMessageId) {
            try {
                await bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                    chat_id: chatId,
                    message_id: lastMessageId
                });
            } catch (error) {
                console.log('Error removing previous keyboard:', error.message);
            }
        }

        // Store the new message ID
        lastMemeMessages.set(chatId, sentMessage.message_id);
        
        return sentMessage;
    } catch (error) {
        throw error;
    }
};

// Modify your setupMemeCommand function
function setupMemeCommand(bot) {
    bot.onText(/\/(meme|mm)(?:\s+(\w+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const requestedSubreddit = match[2]?.toLowerCase();
        
        try {
            // Validate and update subreddit preference if specified
            if (requestedSubreddit) {
                if (requestedSubreddit === 'random') {
                    userPreferences.delete(chatId);
                    await bot.sendMessage(chatId, '🎲 Set to random subreddits mode!');
                } else {
                    userPreferences.set(chatId, requestedSubreddit);
                    await bot.sendMessage(chatId, `✅ Set default subreddit to r/${requestedSubreddit}`);
                }
            }

            await bot.sendChatAction(chatId, 'upload_photo');
            
            const actionInterval = setInterval(() => {
                bot.sendChatAction(chatId, 'upload_photo').catch(() => {});
            }, 3000);
            
            try {
                const preferredSubreddit = userPreferences.get(chatId);
                const meme = await getMemeFromReddit(preferredSubreddit);
                await sendMemeWithKeyboard(bot, chatId, meme, preferredSubreddit);
            } finally {
                clearInterval(actionInterval);
            }
            
        } catch (error) {
            let errorMessage = '😕 Sorry, I couldn\'t fetch a meme right now. Please try again later.';
            
            if (error.message === 'Subreddit not found or has no posts') {
                errorMessage = '❌ This subreddit doesn\'t exist or has no posts. Please try another one.';
            } else if (error.response?.status === 403) {
                errorMessage = '❌ This subreddit is private or quarantined.';
            } else if (error.response?.status === 404) {
                errorMessage = '❌ Subreddit not found.';
            }
            
            await bot.sendMessage(chatId, errorMessage);
        }
    });

    // Add callback query handler for the inline button
    bot.on('callback_query', async (query) => {
        if (query.data.startsWith('meme_')) {
            const chatId = query.message.chat.id;
            const subreddit = query.data.replace('meme_', '');
            
            try {
                await bot.answerCallbackQuery(query.id);
                await bot.sendChatAction(chatId, 'upload_photo');
                
                const actionInterval = setInterval(() => {
                    bot.sendChatAction(chatId, 'upload_photo').catch(() => {});
                }, 3000);
                
                try {
                    const meme = await getMemeFromReddit(subreddit === 'random' ? null : subreddit);
                    await sendMemeWithKeyboard(bot, chatId, meme, subreddit === 'random' ? null : subreddit);
                } finally {
                    clearInterval(actionInterval);
                }
            } catch (error) {
                let errorMessage = '😕 Sorry, I couldn\'t fetch a meme right now. Please try again later.';
                
                if (error.message === 'Subreddit not found or has no posts') {
                    errorMessage = '❌ This subreddit doesn\'t exist or has no posts. Please try another one.';
                } else if (error.response?.status === 403) {
                    errorMessage = '❌ This subreddit is private or quarantined.';
                } else if (error.response?.status === 404) {
                    errorMessage = '❌ Subreddit not found.';
                }
                
                await bot.answerCallbackQuery(query.id, {
                    text: errorMessage,
                    show_alert: true
                });
            }
        } else if (query.data === 'send_to_yvaine' || query.data === 'send_to_arane') {
            // First acknowledge the callback without alert
            await bot.answerCallbackQuery(query.id);

            try {
                const targetChatId = query.data === 'send_to_yvaine' 
                    ? process.env.YVAINE_CHAT_ID 
                    : process.env.ARANE_CHAT_ID;

                const originalCaption = query.message.caption;
                const title = originalCaption.split('\n\n')[0]
                    .replace(/([*_`\[\]])/g, '\\$1');

                const photo = query.message.photo[query.message.photo.length - 1].file_id;

                const senderInfo = query.data === 'send_to_yvaine' 
                    ? '*Meme shared by Arane 💝*'
                    : '*Meme shared by Yvaine 💝*';
                const newCaption = `${title}\n\n${senderInfo}`;

                // Send the meme
                const sentMessage = await bot.sendPhoto(
                    targetChatId,
                    photo,
                    {
                        caption: newCaption,
                        parse_mode: 'Markdown',
                        reply_markup: getReactionKeyboard()
                    }
                );

                // Track the shared meme
                sharedMemes.set(sentMessage.message_id, {
                    fromId: query.message.chat.id,
                    toId: targetChatId,
                    memeData: {
                        title: title,
                        photo: photo
                    }
                });

                // Send confirmation message and delete after 5 seconds
                const confirmMessage = await bot.sendMessage(
                    query.message.chat.id,
                    'Meme has been shared successfully! 💝'
                );
                
                setTimeout(async () => {
                    try {
                        await bot.deleteMessage(query.message.chat.id, confirmMessage.message_id);
                    } catch (deleteError) {
                        console.log('Error deleting confirmation message:', deleteError.message);
                    }
                }, 5000);

            } catch (error) {
                console.error('Share error:', error);
                // Send error message and delete after 5 seconds
                const errorMessage = await bot.sendMessage(
                    query.message.chat.id,
                    '❌ Failed to share meme. Please try again.'
                );

                setTimeout(async () => {
                    try {
                        await bot.deleteMessage(query.message.chat.id, errorMessage.message_id);
                    } catch (deleteError) {
                        console.log('Error deleting error message:', deleteError.message);
                    }
                }, 5000);
            }
        } else if (query.data.startsWith('reaction_')) {
            try {
                const reactionKey = query.data.replace('reaction_', '');
                const reaction = REACTIONS[reactionKey];
                const sharedMeme = sharedMemes.get(query.message.message_id);

                if (sharedMeme && query.from.id.toString() === sharedMeme.toId.toString()) {
                    // Send notification to original sender
                    const notification = `*${reaction.emoji} Reaction to your meme:*\n\n`;
                    
                    // Send the original meme back with the reaction
                    await bot.sendPhoto(
                        sharedMeme.fromId,
                        sharedMeme.memeData.photo,
                        {
                            caption: `${notification}${sharedMeme.memeData.title}\n\n` +
                                    `*${query.from.first_name} reacted with ${reaction.emoji}*`,
                            parse_mode: 'Markdown'
                        }
                    );

                    // Remove reaction buttons after reaction is sent
                    await bot.editMessageReplyMarkup(
                        { inline_keyboard: [] },
                        {
                            chat_id: query.message.chat.id,
                            message_id: query.message.message_id
                        }
                    );

                    // Remove from tracking
                    sharedMemes.delete(query.message.message_id);

                    // Confirm reaction to user
                    await bot.answerCallbackQuery(query.id, {
                        text: `${reaction.emoji} Reaction sent!`,
                        show_alert: false
                    });
                }
            } catch (error) {
                console.error('Error handling reaction:', error);
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Failed to send reaction. Please try again.',
                    show_alert: true
                });
            }
        }
    });

    // Monitor replies to shared memes
    bot.on('message', async (msg) => {
        if (!msg.reply_to_message) return;

        const repliedToId = msg.reply_to_message.message_id;
        const sharedMeme = sharedMemes.get(repliedToId);

        if (sharedMeme && msg.from.id.toString() === sharedMeme.toId.toString()) {
            try {
                // Send notification to original sender
                const notification = `🗨️ *Reply to your shared meme:*\n\n` +
                                   `Original: ${sharedMeme.originalTitle}\n` +
                                   `Reply: ${msg.text || '(media content)'}`;

                await bot.sendMessage(sharedMeme.fromId, notification, {
                    parse_mode: 'Markdown'
                });

                // Remove from tracking after notification is sent
                sharedMemes.delete(repliedToId);
            } catch (error) {
                console.error('Error sending reply notification:', error);
            }
        }
    });
};

export { setupMemeCommand, getMemeFromReddit };

export async function getMemeResponse(bot, chatId, specificSubreddit = null) {
    try {
        await bot.sendChatAction(chatId, 'upload_photo');
        
        const actionInterval = setInterval(() => {
            bot.sendChatAction(chatId, 'upload_photo').catch(() => {});
        }, 3000);
        
        try {
            if (specificSubreddit === 'random') {
                userPreferences.delete(chatId);
                specificSubreddit = null;
            } else if (specificSubreddit) {
                userPreferences.set(chatId, specificSubreddit);
            }

            const targetSubreddit = specificSubreddit || userPreferences.get(chatId);
            const meme = await getMemeFromReddit(targetSubreddit);
            await sendMemeWithKeyboard(bot, chatId, meme, targetSubreddit);
            
        } finally {
            clearInterval(actionInterval);
        }
    } catch (error) {
        console.error('Error in getMemeResponse:', error);
        await bot.sendMessage(chatId, '❌ Sorry, I couldn\'t fetch a meme right now.');
    }
}