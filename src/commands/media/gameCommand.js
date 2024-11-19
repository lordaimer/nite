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
        // Parse the response as JSON array
        const suggestions = JSON.parse(response.trim());
        return suggestions.slice(0, 4); // Limit to 4 suggestions
    } catch (error) {
        console.error('Error getting suggestions:', error);
        return null;
    }
}

async function formatDescription(description) {
    if (!description) return 'No description available';
    
    const prompt = `Summarize this game description in 1-2 concise sentences, keeping the most important information:
    "${description}"`;
    
    try {
        const summary = await llmService.generateResponse(prompt);
        return summary.trim();
    } catch (error) {
        // Fallback to basic formatting if LLM fails
        const sentences = description.match(/[^.!?]+[.!?]+/g) || [description];
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
                page_size: 5  // Get a few results to check for exact matches
            }
        });

        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            // Get suggestions when no games found
            const suggestions = await getSuggestions(query);
            if (suggestions && suggestions.length > 0) {
                throw new Error('SUGGEST_GAMES:' + JSON.stringify(suggestions));
            }
            throw new Error('Game not found');
        }

        // Check for exact match (case insensitive)
        const exactMatch = searchResponse.data.results.find(game => 
            game.name.toLowerCase() === query.toLowerCase() ||
            game.name.toLowerCase().replace(/[^a-z0-9\s]/g, '') === query.toLowerCase().replace(/[^a-z0-9\s]/g, '')
        );

        if (!exactMatch) {
            // No exact match found, get suggestions including the top results
            const topResults = searchResponse.data.results.slice(0, 3).map(game => game.name);
            const suggestions = await getSuggestions(query);
            const combinedSuggestions = [...new Set([...topResults, ...(suggestions || [])])].slice(0, 4);
            
            if (combinedSuggestions.length > 0) {
                throw new Error('SUGGEST_GAMES:' + JSON.stringify(combinedSuggestions));
            }
            throw new Error('Game not found');
        }

        const gameResponse = await axios.get(`${RAWG_BASE_URL}/games/${exactMatch.id}`, {
            params: { key: RAWG_API_KEY }
        });

        return gameResponse.data;
    } catch (error) {
        if (error.message.startsWith('SUGGEST_GAMES:')) {
            throw error;
        }
        if (error.response?.status === 404) {
            throw new Error('Game not found');
        }
        throw new Error('Failed to fetch game information');
    }
}

async function formatGameInfo(game) {
    const rawgUrl = `https://rawg.io/games/${game.slug}`;
    const platforms = game.platforms?.map(p => p.platform.name).join(', ') || 'N/A';
    const developers = game.developers?.map(d => d.name).join(', ') || 'N/A';
    const publishers = game.publishers?.map(p => p.name).join(', ') || 'N/A';
    
    // Get AI-generated concise description
    const description = await formatDescription(game.description_raw);

    const basicInfo = `🎮 𝖳𝗂𝗍𝗅𝖾 : <a href="${rawgUrl}">${game.name}</a>

⭐ 𝖱𝖺𝗍𝗂𝗇𝗀 : ${game.rating ? game.rating.toFixed(1) : 'N/A'}/5
📆 𝖱𝖾𝗅𝖾𝖺𝗌𝖾𝖽 : ${game.released || 'N/A'}
🎯 𝖦𝖾𝗇𝗋𝖾𝗌 : ${game.genres?.map(g => g.name).join(', ') || 'N/A'}
💻 𝖯𝗅𝖺𝗍𝖿𝗈𝗋𝗆𝗌 : ${platforms}
👨‍💻 𝖣𝖾𝗏𝖾𝗅𝗈𝗉𝖾𝗋𝗌 : ${developers}
🏢 𝖯𝗎𝖻𝗅𝗂𝗌𝗁𝖾𝗋𝗌 : ${publishers}

📝 𝖣𝖾𝗌𝖼𝗋𝗂𝗉𝗍𝗂𝗈𝗇 : <code>${description}</code>`;

    return basicInfo;
}

async function sendGameInfo(bot, chatId, gameInfo, messageId = null) {
    try {
        const formattedInfo = await formatGameInfo(gameInfo);
        const options = {
            parse_mode: 'HTML',
            ...(messageId && { message_id: messageId })
        };
        
        if (gameInfo.background_image) {
            if (messageId) {
                // Edit existing message with photo
                await bot.editMessageMedia({
                    type: 'photo',
                    media: gameInfo.background_image,
                    caption: formattedInfo,
                    parse_mode: 'HTML'
                }, {
                    chat_id: chatId,
                    message_id: messageId
                });
            } else {
                // Send new message with photo
                await bot.sendPhoto(chatId, gameInfo.background_image, {
                    caption: formattedInfo,
                    parse_mode: 'HTML'
                });
            }
        } else {
            if (messageId) {
                // Edit existing message text
                await bot.editMessageText(formattedInfo, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                });
            } else {
                // Send new message text
                await bot.sendMessage(chatId, formattedInfo, {
                    parse_mode: 'HTML'
                });
            }
        }
    } catch (error) {
        throw new Error('Failed to send game information');
    }
}

export function setupGameCommand(bot) {
    // Handler for /gameinfo and /gs commands
    bot.onText(/^\/(?:gameinfo|gs)(?:@\w+)? (.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const query = match[1];

        try {
            const cacheKey = query.toLowerCase();
            const cachedResult = gameCache.get(cacheKey);
            
            if (cachedResult && (Date.now() - cachedResult.timestamp) < CACHE_DURATION) {
                await sendGameInfo(bot, chatId, cachedResult.data);
                return;
            }

            const searchingMsg = await bot.sendMessage(
                chatId,
                `🔍 Searching for game: "${query}"...`
            );

            const gameInfo = await fetchGameInfo(query);
            gameCache.set(cacheKey, {
                data: gameInfo,
                timestamp: Date.now()
            });

            await sendGameInfo(bot, chatId, gameInfo, searchingMsg.message_id);
        } catch (error) {
            if (error.message.startsWith('SUGGEST_GAMES:')) {
                const suggestions = JSON.parse(error.message.replace('SUGGEST_GAMES:', ''));
                const buttons = suggestions.map(game => [{
                    text: game,
                    callback_data: `game_suggest:${game}`
                }]);
                
                await bot.editMessageText(
                    `❌ Game not found: "${query}"\n\n💡 Did you mean:`,
                    {
                        chat_id: chatId,
                        message_id: searchingMsg.message_id,
                        reply_markup: {
                            inline_keyboard: buttons
                        }
                    }
                );
            } else {
                await bot.editMessageText(
                    `❌ ${error.message}`,
                    {
                        chat_id: chatId,
                        message_id: searchingMsg.message_id,
                        parse_mode: 'HTML'
                    }
                );
            }
        }
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
