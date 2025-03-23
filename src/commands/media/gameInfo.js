import axios from 'axios';
import { llmService } from '../../services/index.js';

// Cache game results to reduce API calls
const gameCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// RAWG API configuration
const RAWG_API_KEY = process.env.RAWG_API_KEY;
const RAWG_BASE_URL = 'https://api.rawg.io/api';

async function getSuggestions(query) {
    const prompt = `Given the game title "${query}" that wasn't found, suggest 3-4 similar or commonly confused game titles. Format them as a JSON array of strings. Only return the JSON array, nothing else. Example: ["God of War (2018)", "God of War: Ragnarök", "God of War III"]`;
    
    try {
        const response = await llmService.generateResponse(prompt);
        return JSON.parse(response);
    } catch (error) {
        console.error('Error generating suggestions:', error);
        return null;
    }
}

async function formatDescription(description) {
    if (!description) {
        return 'No description available.';
    }

    try {
        const prompt = `Summarize this game description in one short sentence, preserving the most important gameplay and story elements: "${description}"`;
        const response = await llmService.generateResponse(prompt);
        return response.trim();
    } catch (error) {
        // Fallback to first sentence if AI summarization fails
        const sentences = description.split(/[.!?]+/);
        let result = sentences[0] || description;
        return result.trim();
    }
}

async function fetchGameInfo(query) {
    try {
        const searchResponse = await axios.get(`${RAWG_BASE_URL}/games`, {
            params: {
                key: RAWG_API_KEY,
                search: query,
                page_size: 5
            }
        });

        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            const suggestions = await getSuggestions(query);
            if (suggestions && suggestions.length > 0) {
                throw new Error('SUGGEST_GAMES:' + JSON.stringify(suggestions));
            }
            throw new Error('Game not found');
        }

        const exactMatch = searchResponse.data.results.find(game => 
            game.name.toLowerCase() === query.toLowerCase() ||
            game.name.toLowerCase().replace(/[^a-z0-9\s]/g, '') === query.toLowerCase().replace(/[^a-z0-9\s]/g, '')
        );

        if (!exactMatch) {
            const topResults = searchResponse.data.results.slice(0, 3).map(game => game.name);
            const suggestions = await getSuggestions(query);
            const combinedSuggestions = [...new Set([...topResults, ...(suggestions || [])])].slice(0, 4);
            
            if (combinedSuggestions.length > 0) {
                throw new Error('SUGGEST_GAMES:' + JSON.stringify(combinedSuggestions));
            }
            throw new Error('Game not found');
        }

        // Fetch game details
        const gameResponse = await axios.get(`${RAWG_BASE_URL}/games/${exactMatch.id}`, {
            params: { key: RAWG_API_KEY }
        });

        // Fetch game screenshots
        try {
            const mediaResponse = await axios.get(`${RAWG_BASE_URL}/games/${exactMatch.id}/screenshots`, {
                params: { key: RAWG_API_KEY }
            });
            
            if (mediaResponse.data.results && mediaResponse.data.results.length > 0) {
                // Get up to 4 screenshots
                gameResponse.data.screenshots = mediaResponse.data.results
                    .filter(item => !item.is_deleted)
                    .slice(0, 4)
                    .map(item => item.image);
            }
        } catch (error) {
            console.log('No screenshots found for the game:', error.message);
        }

        return gameResponse.data;
    } catch (error) {
        if (error.message.startsWith('SUGGEST_GAMES:')) {
            throw error;
        }
        if (error.response?.status === 404) {
            throw new Error('Game not found');
        }
        console.error('API Error:', error.response?.data || error.message);
        throw new Error('Failed to fetch game information');
    }
}

async function formatGameInfo(game) {
    const rawgUrl = `https://rawg.io/games/${game.slug}`;
    const platforms = game.platforms?.map(p => p.platform.name).join(', ') || 'N/A';
    const developers = game.developers?.map(d => d.name).join(', ') || 'N/A';
    const publishers = game.publishers?.map(p => p.name).join(', ') || 'N/A';
    
    const description = await formatDescription(game.description_raw);

    const basicInfo = `🎮 𝖳𝗂𝗍𝗅𝖾 : <a href="${rawgUrl}">${game.name}</a>

⭐ 𝖱𝖺𝗍𝗂𝗇𝗀 : ${game.rating ? game.rating.toFixed(1) : 'N/A'}/5
📆 𝖱𝖾𝗅𝖾𝖺𝗌𝖾𝖽 : ${game.released || 'N/A'}
🎯 𝖦𝖾𝗇𝗋𝖾𝗌 : ${game.genres?.map(g => g.name).join(', ') || 'N/A'}
💻 𝖯𝗅𝖺𝗍𝖿𝗈𝗋𝗆𝗌 : ${platforms}
👨‍💻 𝖣𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋𝗌 : ${developers}
🏢 𝖯𝗎𝖻𝗅𝗂𝗌𝗁𝖾𝗋𝗌 : ${publishers}

📝 𝖣𝖾𝗌𝖼𝗋𝗂𝗉𝗍𝗂𝗈𝗇 : <code>${description}</code>`;

    return {
        text: basicInfo,
        media: {
            screenshots: game.screenshots || [],
            mainBanner: game.background_image
        }
    };
}

async function sendGameInfo(bot, chatId, gameInfo, messageId = null) {
    try {
        const { text, media } = await formatGameInfo(gameInfo);
        
        // Prepare media group
        const mediaGroup = [];
        
        // Add main banner with caption
        if (media.mainBanner) {
            mediaGroup.push({
                type: 'photo',
                media: media.mainBanner,
                caption: text,
                parse_mode: 'HTML'
            });
        }

        // Add additional screenshots
        if (media.screenshots && media.screenshots.length > 0) {
            media.screenshots.forEach(screenshot => {
                mediaGroup.push({
                    type: 'photo',
                    media: screenshot
                });
            });
        }

        if (messageId) {
            // Delete the searching message
            await bot.deleteMessage(chatId, messageId);
        }

        if (mediaGroup.length > 0) {
            // Send media group with all content
            await bot.sendMediaGroup(chatId, mediaGroup);
        } else {
            // Fallback to text-only message if no media available
            await bot.sendMessage(chatId, text, {
                parse_mode: 'HTML'
            });
        }

    } catch (error) {
        console.error('Error sending game info:', error);
        if (error.message.startsWith('SUGGEST_GAMES:')) {
            const suggestions = JSON.parse(error.message.replace('SUGGEST_GAMES:', ''));
            const suggestionText = 'Game not found. Did you mean:\n' + 
                suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
            
            if (messageId) {
                await bot.editMessageText(suggestionText, {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: {
                        inline_keyboard: suggestions.map(game => [{
                            text: game,
                            callback_data: `game_suggest:${game}`
                        }])
                    }
                });
            } else {
                await bot.sendMessage(chatId, suggestionText);
            }
        } else {
            const errorMessage = '❌ Error fetching game information. Please try again later.';
            if (messageId) {
                await bot.editMessageText(errorMessage, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else {
                await bot.sendMessage(chatId, errorMessage);
            }
        }
    }
}

async function handleCommand(bot, msg, args) {
    if (!args || args.length === 0) {
        await bot.sendMessage(msg.chat.id, 'Please provide a game name to search for.');
        return;
    }

    const query = args.join(' ');
    const searchingMsg = await bot.sendMessage(msg.chat.id, '🔍 Searching for game...');

    try {
        const cacheKey = query.toLowerCase();
        const cachedResult = gameCache.get(cacheKey);
        
        if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_DURATION) {
            await sendGameInfo(bot, msg.chat.id, cachedResult.data, searchingMsg.message_id);
            return;
        }

        const gameInfo = await fetchGameInfo(query);
        gameCache.set(cacheKey, {
            data: gameInfo,
            timestamp: Date.now()
        });

        await sendGameInfo(bot, msg.chat.id, gameInfo, searchingMsg.message_id);
    } catch (error) {
        if (error.message.startsWith('SUGGEST_GAMES:')) {
            const suggestions = JSON.parse(error.message.replace('SUGGEST_GAMES:', ''));
            const suggestionText = '🎮 Game not found. Did you mean:\n\n' + 
                suggestions.map((game, index) => `${index + 1}. ${game}`).join('\n');
            
            // Delete searching message and send suggestions
            await bot.deleteMessage(msg.chat.id, searchingMsg.message_id);
            await bot.sendMessage(msg.chat.id, suggestionText);
            return;
        }

        // Delete searching message and send error
        await bot.deleteMessage(msg.chat.id, searchingMsg.message_id);
        await bot.sendMessage(msg.chat.id, '❌ ' + (error.message || 'An error occurred while fetching game information.'));
    }
}

export function setupGameCommand(bot) {
    // Handler for /gameinfo and /gs commands
    bot.onText(/^\/(?:gameinfo|gs)(?:@\w+)? (.+)/, async (msg, match) => {
        await handleCommand(bot, msg, match[1].split(' '));
    });

    // Handler for game suggestions callback
    bot.on('callback_query', async (callbackQuery) => {
        const data = callbackQuery.data;
        if (!data.startsWith('game_suggest:')) return;

        const chatId = callbackQuery.message.chat.id;
        const messageId = callbackQuery.message.message_id;
        const gameTitle = data.replace('game_suggest:', '');

        try {
            await bot.editMessageText(
                `🔍 Searching for game: "${gameTitle}"...`,
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );

            const gameInfo = await fetchGameInfo(gameTitle);
            gameCache.set(gameTitle.toLowerCase(), {
                data: gameInfo,
                timestamp: Date.now()
            });

            await sendGameInfo(bot, chatId, gameInfo, messageId);
        } catch (error) {
            await bot.editMessageText(
                `❌ ${error.message}`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                }
            );
        }
    });

    // Handler for command without query
    bot.onText(/^\/(?:gameinfo|gs)(?:@\w+)?$/, (msg) => {
        bot.sendMessage(
            msg.chat.id,
            '❗ Please provide a game name.\nUsage: /gameinfo <game name> or /gs <game name>'
        );
    });
}
