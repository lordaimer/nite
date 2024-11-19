import axios from 'axios';
import { llmService } from '../../services/index.js';

// Cache game results to reduce API calls
const gameCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// RAWG API configuration
const RAWG_API_KEY = process.env.RAWG_API_KEY;
const RAWG_BASE_URL = 'https://api.rawg.io/api';

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
        // First, search for the game
        const searchResponse = await axios.get(`${RAWG_BASE_URL}/games`, {
            params: {
                key: RAWG_API_KEY,
                search: query,
                page_size: 1
            }
        });

        if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
            throw new Error('Game not found');
        }

        const gameId = searchResponse.data.results[0].id;
        const gameResponse = await axios.get(`${RAWG_BASE_URL}/games/${gameId}`, {
            params: { key: RAWG_API_KEY }
        });

        return gameResponse.data;
    } catch (error) {
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

async function sendGameInfo(bot, chatId, gameInfo) {
    try {
        const formattedInfo = await formatGameInfo(gameInfo);
        
        if (gameInfo.background_image) {
            await bot.sendPhoto(chatId, gameInfo.background_image, {
                caption: formattedInfo,
                parse_mode: 'HTML'
            });
        } else {
            await bot.sendMessage(chatId, formattedInfo, {
                parse_mode: 'HTML'
            });
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

            await bot.deleteMessage(chatId, searchingMsg.message_id);
            await sendGameInfo(bot, chatId, gameInfo);
        } catch (error) {
            await bot.sendMessage(
                chatId,
                `❌ ${error.message}`,
                { parse_mode: 'HTML' }
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
