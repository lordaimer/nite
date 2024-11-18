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

const SORT_TYPE = 'hot'; // default sort type

async function getMemeFromReddit(subreddit = null, mediaType = 'pics') {
    try {
        let targetSubreddits;
        if (subreddit) {
            targetSubreddits = [subreddit];
        } else {
            targetSubreddits = mediaType === 'vids' ? VIDEO_SUBREDDITS : MEME_SUBREDDITS;
        }

        const randomSubreddit = targetSubreddits[Math.floor(Math.random() * targetSubreddits.length)];
        const response = await axios.get(`https://www.reddit.com/r/${randomSubreddit}/${SORT_TYPE}.json?limit=100`);
        
        if (!response.data || !response.data.data || !response.data.data.children) {
            throw new Error('Invalid response from Reddit');
        }

        const posts = response.data.data.children
            .filter(post => {
                // Filter based on mediaType
                if (mediaType === 'vids') {
                    return (post.data.is_video || 
                           (post.data.url && (
                               post.data.url.includes('redgifs.com/watch/') ||
                               post.data.url.includes('imgur.com') && post.data.url.endsWith('.gifv')
                           )));
                } else {
                    return (!post.data.is_video && 
                            post.data.url && 
                            (post.data.url.endsWith('.jpg') || 
                             post.data.url.endsWith('.png') || 
                             post.data.url.endsWith('.gif')));
                }
            })
            .filter(post => !post.data.over_18); // Filter out NSFW content

        if (posts.length === 0) {
            throw new Error(`No suitable ${mediaType} found in r/${randomSubreddit}`);
        }

        const randomPost = posts[Math.floor(Math.random() * posts.length)].data;
        
        // Handle different video URL formats
        let mediaUrl = randomPost.url;
        if (mediaType === 'vids') {
            if (randomPost.is_video) {
                mediaUrl = randomPost.media.reddit_video.fallback_url;
            } else if (randomPost.url.includes('redgifs.com/watch/')) {
                // For redgifs, we need to get the direct video URL
                const videoId = randomPost.url.split('/').pop();
                throw new Error('Redgifs videos are not supported yet');
            } else if (randomPost.url.includes('imgur.com') && randomPost.url.endsWith('.gifv')) {
                // Convert imgur .gifv to .mp4
                mediaUrl = randomPost.url.replace('.gifv', '.mp4');
            }
        }

        return {
            title: randomPost.title,
            url: mediaUrl,
            author: randomPost.author,
            upvotes: randomPost.ups,
            link: `https://reddit.com${randomPost.permalink}`,
            subreddit: randomPost.subreddit,
            description: randomPost.selftext || '',
            isVideo: mediaType === 'vids'
        };
    } catch (error) {
        throw error;
    }
}

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
        
        // After successfully sending the new message, update the previous message's keyboard
        const lastMessage = lastMemeMessages.get(chatId);
        if (lastMessage) {
            try {
                // Keep only the appropriate share button based on chat ID
                let shareButton;
                if (chatId === Number(process.env.ARANE_CHAT_ID)) {
                    shareButton = {
                        text: 'Send to Yvaine ❤️',
                        callback_data: 'send_to_yvaine'
                    };
                } else if (chatId === Number(process.env.YVAINE_CHAT_ID)) {
                    shareButton = {
                        text: 'Send to Arane ❤️',
                        callback_data: 'send_to_arane'
                    };
                }

                if (shareButton) {
                    await bot.editMessageReplyMarkup({
                        inline_keyboard: [[shareButton]]
                    }, {
                        chat_id: chatId,
                        message_id: lastMessage
                    });
                }
            } catch (error) {
                // Ignore errors (message might be too old or already deleted)
                console.log('Could not update previous keyboard:', error.message);
            }
        }

        // Store meme data for reaction tracking
        sharedMemes.set(sentMessage.message_id, {
            fromId: null,
            toId: chatId,
            memeData: meme
        });

        // Store the ID of the sent message
        if (sentMessage) {
            lastMemeMessages.set(chatId, sentMessage.message_id);
        }

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

            // Get user's default subreddit if set and no specific subreddit requested
            if (userPref.defaultSubreddit && args.length === 0) {
                specificSubreddit = userPref.defaultSubreddit;
            }

            // Parse arguments
            if (args.length > 0) {
                if (args[0] === 'vids' || args[0] === 'pics') {
                    mediaType = args[0];
                    // Set this as the default media type
                    userPref.defaultMediaType = args[0];
                    
                    // If there's a subreddit specified, set it as default
                    if (args[1]) {
                        specificSubreddit = args[1];
                        userPref.defaultSubreddit = args[1];
                        await bot.sendMessage(
                            chatId,
                            `✅ Default settings updated:\n• Mode: ${args[0] === 'vids' ? 'Videos' : 'Pictures'}\n• Subreddit: r/${args[1]}\n\nFuture /mm commands will use these settings by default.`,
                            { parse_mode: 'Markdown' }
                        );
                    } else {
                        await bot.sendMessage(
                            chatId,
                            `✅ Default meme mode set to: ${args[0] === 'vids' ? 'Videos' : 'Pictures'}\nFuture /mm commands will fetch ${args[0] === 'vids' ? 'video' : 'picture'} memes by default.`,
                            { parse_mode: 'Markdown' }
                        );
                    }
                } else if (args[0] === 'random') {
                    mediaType = Math.random() < 0.5 ? 'pics' : 'vids';
                    userPref.defaultMediaType = 'random';
                    
                    // If there's a subreddit specified with random mode
                    if (args[1]) {
                        specificSubreddit = args[1];
                        userPref.defaultSubreddit = args[1];
                        await bot.sendMessage(
                            chatId,
                            `✅ Default settings updated:\n• Mode: Random (both pics & videos)\n• Subreddit: r/${args[1]}\n\nFuture /mm commands will use these settings by default.`,
                            { parse_mode: 'Markdown' }
                        );
                    } else {
                        await bot.sendMessage(
                            chatId,
                            '✅ Default meme mode set to: Random\nFuture /mm commands will randomly fetch either picture or video memes.',
                            { parse_mode: 'Markdown' }
                        );
                    }
                } else {
                    specificSubreddit = args[0];
                    userPref.defaultSubreddit = args[0];
                    await bot.sendMessage(
                        chatId,
                        `✅ Default subreddit set to: r/${args[0]}\nFuture /mm commands will fetch memes from this subreddit by default.`,
                        { parse_mode: 'Markdown' }
                    );
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
            userPreferences.set(chatId, userPref);

            // Get and send meme
            const meme = await getMemeFromReddit(specificSubreddit, mediaType);
            
            await sendMemeWithKeyboard(bot, chatId, meme, userPref.defaultSubreddit, mediaType);

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
                    // Get user preferences
                    const userPref = userPreferences.get(chatId) || {};
                    let targetSubreddit = null;
                    let mediaType = 'pics';  // default

                    if (subreddit === 'random') {
                        // Use stored preferences for subreddit if available
                        targetSubreddit = userPref.defaultSubreddit || null;
                    } else {
                        targetSubreddit = subreddit;
                    }

                    // Use stored media type preference if available
                    if (userPref.defaultMediaType) {
                        if (userPref.defaultMediaType === 'random') {
                            mediaType = Math.random() < 0.5 ? 'pics' : 'vids';
                        } else {
                            mediaType = userPref.defaultMediaType;
                        }
                    }

                    const meme = await getMemeFromReddit(targetSubreddit, mediaType);
                    await sendMemeWithKeyboard(bot, chatId, meme, targetSubreddit, mediaType);
                    
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
            // Immediately acknowledge the callback to stop the loading state
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

                    // Update button to show success
                    await bot.editMessageReplyMarkup({
                        inline_keyboard: [[{
                            text: 'Meme shared! 💝',
                            callback_data: 'dummy_callback'
                        }]]
                    }, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id
                    });

                    // Remove the button after 1.5 seconds
                    setTimeout(async () => {
                        try {
                            await bot.editMessageReplyMarkup({
                                inline_keyboard: []
                            }, {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id
                            });
                        } catch (error) {
                            console.error('Error removing share button:', error);
                        }
                    }, 1500);
                }

            } catch (error) {
                console.error('Error in sharing meme:', error);
                
                // Update button to show error
                try {
                    await bot.editMessageReplyMarkup({
                        inline_keyboard: [[{
                            text: 'Failed to share 😔',
                            callback_data: 'dummy_callback'
                        }]]
                    }, {
                        chat_id: query.message.chat.id,
                        message_id: query.message.message_id
                    });

                    // Remove the button after 1.5 seconds
                    setTimeout(async () => {
                        try {
                            await bot.editMessageReplyMarkup({
                                inline_keyboard: []
                            }, {
                                chat_id: query.message.chat.id,
                                message_id: query.message.message_id
                            });
                        } catch (error) {
                            console.error('Error removing share button:', error);
                        }
                    }, 1500);
                } catch (error) {
                    console.error('Error updating error button:', error);
                }
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