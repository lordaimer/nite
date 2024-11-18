import axios from 'axios';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Get the current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read subreddits from JSON files
let MEME_SUBREDDITS;
let VIDEO_SUBREDDITS;
try {
    const jsonData = readFileSync(join(__dirname, '../data/memeSubreddits.json'), 'utf8');
    const videoJsonData = readFileSync(join(__dirname, '../data/memeVideoSubreddits.json'), 'utf8');
    MEME_SUBREDDITS = JSON.parse(jsonData).subreddits;
    VIDEO_SUBREDDITS = JSON.parse(videoJsonData).subreddits;
} catch (error) {
    console.error('Error loading subreddits:', error);
    // Fallback arrays in case the files can't be read
    MEME_SUBREDDITS = ['memes', 'dankmemes', 'wholesomememes'];
    VIDEO_SUBREDDITS = ['dankvideos', 'funnyvideos'];
}

// Add this after other constants
export const userPreferences = new Map(); // chatId -> { subreddit, mediaType, defaultMediaType }

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

const getMemeFromReddit = async (subreddit = null, mediaType = 'pics') => {
    try {
        let targetSubreddit;
        if (!subreddit) {
            // If no subreddit specified, use appropriate default list based on mediaType
            const subredditList = mediaType === 'vids' ? VIDEO_SUBREDDITS : MEME_SUBREDDITS;
            targetSubreddit = subredditList[Math.floor(Math.random() * subredditList.length)];
        } else {
            targetSubreddit = subreddit;
        }
        
        const sortMethods = ['hot', 'top', 'new'];
        const timeFilters = ['all', 'year', 'month', 'week'];
        const randomSort = sortMethods[Math.floor(Math.random() * sortMethods.length)];
        const randomTime = timeFilters[Math.floor(Math.random() * timeFilters.length)];

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
            if (mediaType === 'vids') {
                // Filter for video content
                return (post.data.is_video || 
                       post.data.url?.match(/\.(mp4|gifv)$/i) ||
                       (post.data.media && 
                        (post.data.media.reddit_video || 
                         post.data.media.type === 'gfycat.com' ||
                         post.data.media.type === 'redgifs.com'))) &&
                       !post.data.stickied;
            } else {
                // Original image filtering logic
                const isValidImage = post.data.url?.match(/\.(jpg|jpeg|png|gif)$/i);
                return isValidImage && !post.data.is_video && !post.data.stickied;
            }
        });

        if (posts.length === 0) {
            throw new Error(`No valid ${mediaType} found in r/${targetSubreddit}`);
        }

        const randomPost = posts[Math.floor(Math.random() * posts.length)].data;
        
        let mediaUrl = randomPost.url;
        if (randomPost.is_video && randomPost.media?.reddit_video) {
            // Get the highest quality video URL that's not too large
            const qualities = [720, 480, 360, 240];
            for (const quality of qualities) {
                const qualityUrl = randomPost.media.reddit_video.fallback_url.replace(/DASH_\d+/, `DASH_${quality}`);
                try {
                    const response = await axios.head(qualityUrl);
                    if (response.status === 200) {
                        mediaUrl = qualityUrl;
                        break;
                    }
                } catch (error) {
                    continue;
                }
            }
        } else if (randomPost.url.endsWith('.gifv')) {
            // Convert Imgur .gifv to .mp4
            mediaUrl = randomPost.url.replace('.gifv', '.mp4');
        }
        
        return {
            title: randomPost.title,
            url: mediaUrl,
            author: randomPost.author,
            subreddit: randomPost.subreddit,
            upvotes: randomPost.ups,
            link: `https://reddit.com${randomPost.permalink}`,
            sortMethod: randomSort,
            timeFilter: randomSort === 'top' ? randomTime : null,
            description: randomPost.selftext || '',
            isVideo: mediaType === 'vids'
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

async function sendMemeWithKeyboard(bot, chatId, meme, preferredSubreddit, mediaType = 'pics') {
    try {
        // Escape special characters in the title and author for Markdown
        const escapedTitle = meme.title.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
        const escapedAuthor = meme.author.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
        const escapedSubreddit = meme.subreddit.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');

        const caption = `${escapedTitle}\n\n` +
                       `👤 Posted by u/${escapedAuthor}\n` +
                       `📊 ${meme.upvotes.toLocaleString()} upvotes\n` +
                       `🔗 [Original Post](${meme.link})\n` +
                       `📍 From r/${escapedSubreddit}`;

        const keyboard = getCustomInlineKeyboard(chatId, preferredSubreddit);

        // Send the meme
        let sentMessage;
        if (meme.isVideo) {
            sentMessage = await bot.sendVideo(chatId, meme.url, {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            sentMessage = await bot.sendPhoto(chatId, meme.url, {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
        
        // Store meme data for reaction tracking
        sharedMemes.set(sentMessage.message_id, {
            fromId: null,
            toId: chatId,
            memeData: meme
        });

        return sentMessage;
    } catch (error) {
        console.error('Error in sendMemeWithKeyboard:', error);
        throw error;
    }
}

function setupMemeCommand(bot) {
    bot.onText(/^\/(meme|mm)(?:\s+(.+))?$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const args = match[2] ? match[2].toLowerCase().split(' ') : [];
        
        try {
            let mediaType = 'pics';  // default to pics if no preference set
            let specificSubreddit = null;
            let userPref = userPreferences.get(chatId) || {};

            // Get user's default mediaType if set and no specific type requested
            if (userPref.defaultMediaType && args.length === 0) {
                if (userPref.defaultMediaType === 'random') {
                    mediaType = Math.random() < 0.5 ? 'pics' : 'vids';
                } else {
                    mediaType = userPref.defaultMediaType;
                }
            }

            // Parse arguments
            if (args.length > 0) {
                if (args[0] === 'vids' || args[0] === 'pics') {
                    mediaType = args[0];
                    // Set this as the default media type
                    userPref.defaultMediaType = args[0];
                    // Send confirmation message
                    await bot.sendMessage(
                        chatId,
                        `✅ Default meme mode set to: ${args[0] === 'vids' ? 'Videos' : 'Pictures'}\nFuture /mm commands will fetch ${args[0] === 'vids' ? 'video' : 'picture'} memes by default.`,
                        { parse_mode: 'Markdown' }
                    );
                    if (args[1]) {
                        specificSubreddit = args[1];
                    }
                } else if (args[0] === 'random') {
                    mediaType = Math.random() < 0.5 ? 'pics' : 'vids';
                    userPref.defaultMediaType = 'random';
                    // Send confirmation message
                    await bot.sendMessage(
                        chatId,
                        '✅ Default meme mode set to: Random\nFuture /mm commands will randomly fetch either picture or video memes.',
                        { parse_mode: 'Markdown' }
                    );
                    specificSubreddit = args[1] || null;
                } else {
                    specificSubreddit = args[0];
                }
            }

            // Send feedback to user
            const feedbackMessage = await bot.sendMessage(
                chatId,
                `🔍 Searching for ${mediaType === 'vids' ? 'video' : 'picture'} memes` + 
                (specificSubreddit ? ` from r/${specificSubreddit}` : '') + 
                '...',
                { parse_mode: 'Markdown' }
            );

            // Update user preferences
            if (specificSubreddit && specificSubreddit !== 'random') {
                userPref.subreddit = specificSubreddit;
            }
            userPreferences.set(chatId, userPref);

            // Get and send meme
            const meme = await getMemeFromReddit(
                specificSubreddit === 'random' ? null : specificSubreddit,
                mediaType
            );
            
            await sendMemeWithKeyboard(bot, chatId, meme, userPref.subreddit, mediaType);

            // Delete feedback message
            try {
                await bot.deleteMessage(chatId, feedbackMessage.message_id);
            } catch (error) {
                console.error('Error deleting feedback message:', error);
            }

        } catch (error) {
            console.error('Error in meme command:', error);
            bot.sendMessage(
                chatId, 
                `❌ Sorry, couldn't fetch a ${mediaType === 'vids' ? 'video' : 'picture'} meme. ${error.message}\n\n` +
                'Try:\n' +
                '- Different subreddit\n' +
                '- Different media type (pics/vids)\n' +
                '- Wait a few moments and try again'
            );
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

                const senderInfo = query.data === 'send_to_yvaine' 
                    ? '*Meme shared by Arane 💝*'
                    : '*Meme shared by Yvaine 💝*';
                const newCaption = `${title}\n\n${senderInfo}`;

                let sentMessage;
                // Check if it's a photo or video
                if (query.message.photo && query.message.photo.length > 0) {
                    const photo = query.message.photo[query.message.photo.length - 1].file_id;
                    // Send the photo meme
                    sentMessage = await bot.sendPhoto(
                        targetChatId,
                        photo,
                        {
                            caption: newCaption,
                            parse_mode: 'Markdown',
                            reply_markup: getReactionKeyboard()
                        }
                    );
                } else if (query.message.video) {
                    // Send the video meme
                    sentMessage = await bot.sendVideo(
                        targetChatId,
                        query.message.video.file_id,
                        {
                            caption: newCaption,
                            parse_mode: 'Markdown',
                            reply_markup: getReactionKeyboard()
                        }
                    );
                }

                // Store meme data for reaction tracking
                if (sentMessage) {
                    sharedMemes.set(sentMessage.message_id, {
                        fromId: query.from.id,
                        toId: targetChatId,
                        memeData: null // We don't have the original meme data here
                    });

                    // Send confirmation message
                    const confirmMessage = await bot.sendMessage(
                        query.message.chat.id,
                        '✅ Meme shared successfully! 💝'
                    );

                    // Delete confirmation after 5 seconds
                    setTimeout(async () => {
                        try {
                            await bot.deleteMessage(query.message.chat.id, confirmMessage.message_id);
                        } catch (error) {
                            console.error('Error deleting confirmation message:', error);
                        }
                    }, 5000);
                }

            } catch (error) {
                console.error('Share error:', error);
                const errorMessage = await bot.sendMessage(
                    query.message.chat.id,
                    '❌ Sorry, there was an error sharing the meme. Please try again.'
                );

                // Delete error message after 5 seconds
                setTimeout(async () => {
                    try {
                        await bot.deleteMessage(query.message.chat.id, errorMessage.message_id);
                    } catch (error) {
                        console.error('Error deleting error message:', error);
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

async function getMemeResponse(bot, chatId, specificSubreddit = null) {
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

// Export all functions at the end
export { setupMemeCommand, getMemeFromReddit, getMemeResponse };