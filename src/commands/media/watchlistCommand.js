import { getWatchlist, removeFromWatchlist } from '../../data/whattowatch/database.js';
import axios from 'axios';

const ITEMS_PER_PAGE = 5;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Format movie information for display
async function formatMovieInfo(movie) {
    try {
        // Get TMDB movie details
        const tmdbResponse = await axios.get(`${TMDB_BASE_URL}/movie/${movie.movie_id}`, {
            params: {
                api_key: process.env.TMDB_API_KEY,
                language: 'en-US'
            }
        });

        // Get OMDB details
        const omdbResponse = await axios.get(`http://www.omdbapi.com/`, {
            params: {
                apikey: process.env.OMDB_API_KEY,
                t: movie.movie_title,
                y: new Date(tmdbResponse.data.release_date).getFullYear()
            }
        });

        const tmdbMovie = tmdbResponse.data;
        const omdbMovie = omdbResponse.data;

        const imdbUrl = `https://www.imdb.com/title/${tmdbMovie.imdb_id}`;
        
        // Convert runtime to hours and minutes
        let runtimeFormatted = 'N/A';
        if (omdbMovie.Runtime && omdbMovie.Runtime !== 'N/A') {
            const minutes = parseInt(omdbMovie.Runtime);
            if (!isNaN(minutes)) {
                const hours = Math.floor(minutes / 60);
                const remainingMins = minutes % 60;
                runtimeFormatted = hours > 0 
                    ? `${hours}h ${remainingMins}m`
                    : `${remainingMins}m`;
            }
        }

        const basicInfo = `📀 𝖳𝗂𝗍𝗅𝖾 : <a href="${imdbUrl}">${movie.movie_title}</a>\n\n` +
            `🌟 𝖱𝖺𝗍𝗂𝗇𝗀 : ${omdbMovie.imdbRating || 'N/A'}/10\n` +
            `📆 𝖱𝖾𝗅𝖾𝖺𝗌𝖾 : ${omdbMovie.Released || 'N/A'}\n` +
            `🎭 𝖦𝖾𝗇𝗋𝖾 : ${omdbMovie.Genre || 'N/A'}\n` +
            `⏱️ 𝖱𝗎𝗇𝗍𝗂𝗆𝖾 : ${runtimeFormatted}\n` +
            `🔊 𝖫𝖺𝗇𝗀𝗎𝖺𝗀𝖾 : ${omdbMovie.Language || 'N/A'}\n` +
            `🎥 𝖣𝗂𝗋𝖾𝖼𝗍𝗈𝗋𝗌 : ${omdbMovie.Director || 'N/A'}\n` +
            `🔆 𝗌𝗍𝖺𝗋𝗌 : ${omdbMovie.Actors || 'N/A'}\n\n` +
            `🗒 𝖲𝗍𝗈𝗋𝗒𝗅𝗂𝗇𝖾 : <code>${omdbMovie.Plot || 'No plot available'}</code>`;

        return basicInfo;
    } catch (error) {
        console.error('Error formatting movie info:', error);
        return 'Error retrieving movie information. Please try again later.';
    }
}

function createWatchlistKeyboard(movies, currentPage = 0) {
    const keyboard = {
        inline_keyboard: []
    };

    // Add movie buttons
    movies.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE).forEach(movie => {
        keyboard.inline_keyboard.push([
            {
                text: `🎬 ${movie.movie_title}`,
                callback_data: `wl_info_${movie.movie_id}`
            },
            {
                text: '❌ Remove',
                callback_data: `wl_remove_${movie.movie_id}`
            }
        ]);
    });

    // Add navigation buttons if needed
    const navigationRow = [];
    if (currentPage > 0) {
        navigationRow.push({
            text: '⬅️ Previous',
            callback_data: `wl_page_${currentPage - 1}`
        });
    }
    if ((currentPage + 1) * ITEMS_PER_PAGE < movies.length) {
        navigationRow.push({
            text: '➡️ Next',
            callback_data: `wl_page_${currentPage + 1}`
        });
    }
    if (navigationRow.length > 0) {
        keyboard.inline_keyboard.push(navigationRow);
    }

    return keyboard;
}

// Create back to watchlist keyboard
function createBackKeyboard() {
    return {
        inline_keyboard: [
            [
                {
                    text: '⬅️ Back to Watchlist',
                    callback_data: 'wl_back'
                }
            ]
        ]
    };
}

export async function setupWatchlistCommand(bot, rateLimitService) {
    // Command handler for /watchlist
    bot.onText(/^\/watchlist$/, async (msg) => {
        const chatId = msg.chat.id;

        try {
            // Check rate limit
            if (rateLimitService && typeof rateLimitService.check === 'function') {
                const isAllowed = rateLimitService.check(chatId, 'watchlist', 10, 60000);
                if (!isAllowed) {
                    await bot.sendMessage(
                        chatId,
                        '⚠️ You\'re using this command too frequently. Please wait a moment.',
                        { parse_mode: 'Markdown' }
                    );
                    return;
                }
            }

            const movies = await getWatchlist(chatId);

            if (movies.length === 0) {
                await bot.sendMessage(
                    chatId,
                    '📝 Your watchlist is empty. Use the "Add to Watchlist" button when viewing movie recommendations to add movies!',
                    { parse_mode: 'Markdown' }
                );
                return;
            }

            const text = '🎬 *Your Watchlist*\nHere are the movies in your watchlist:';
            await bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: createWatchlistKeyboard(movies)
            });

        } catch (error) {
            console.error('Error in watchlist command:', error);
            await bot.sendMessage(
                chatId,
                '❌ Sorry, something went wrong. Please try again later.'
            );
        }
    });

    // Callback query handler for watchlist actions
    bot.on('callback_query', async (callbackQuery) => {
        try {
            const data = callbackQuery.data;
            if (!data.startsWith('wl_')) return;

            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            // Check rate limit
            if (rateLimitService && typeof rateLimitService.check === 'function') {
                const isAllowed = rateLimitService.check(chatId, 'watchlist', 10, 60000);
                if (!isAllowed) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: '⚠️ You\'re making requests too quickly. Please wait a moment.',
                        show_alert: true
                    });
                    return;
                }
            }

            const [prefix, action, ...params] = data.split('_');
            const movies = await getWatchlist(chatId);

            switch (action) {
                case 'page':
                    const newPage = parseInt(params[0]);
                    await bot.editMessageReplyMarkup(
                        createWatchlistKeyboard(movies, newPage),
                        {
                            chat_id: chatId,
                            message_id: messageId
                        }
                    );
                    await bot.answerCallbackQuery(callbackQuery.id);
                    break;

                case 'remove':
                    const movieId = params[0];
                    const success = await removeFromWatchlist(chatId, movieId);

                    if (success) {
                        // Get updated list
                        const updatedMovies = await getWatchlist(chatId);

                        if (updatedMovies.length === 0) {
                            // If watchlist is empty, update the entire message
                            await bot.editMessageText(
                                '📝 Your watchlist is empty. Use the "Add to Watchlist" button when viewing movie recommendations to add movies!',
                                {
                                    chat_id: chatId,
                                    message_id: messageId,
                                    parse_mode: 'Markdown'
                                }
                            );
                        } else {
                            // Update the keyboard with remaining movies
                            await bot.editMessageReplyMarkup(
                                createWatchlistKeyboard(updatedMovies),
                                {
                                    chat_id: chatId,
                                    message_id: messageId
                                }
                            );
                        }

                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '✅ Movie removed from your watchlist!',
                            show_alert: true
                        });
                    } else {
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '❌ Failed to remove movie. Please try again.',
                            show_alert: true
                        });
                    }
                    break;

                case 'info':
                    const movie = movies.find(m => m.movie_id === params[0]);
                    if (movie) {
                        const movieInfo = await formatMovieInfo(movie);
                        await bot.editMessageText(movieInfo, {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'HTML',
                            disable_web_page_preview: false,
                            reply_markup: createBackKeyboard()
                        });
                    }
                    await bot.answerCallbackQuery(callbackQuery.id);
                    break;

                case 'back':
                    const text = '🎬 *Your Watchlist*\nHere are the movies in your watchlist:';
                    await bot.editMessageText(text, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'Markdown',
                        reply_markup: createWatchlistKeyboard(movies)
                    });
                    await bot.answerCallbackQuery(callbackQuery.id);
                    break;

                default:
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: '❌ Invalid action',
                        show_alert: true
                    });
            }
        } catch (error) {
            console.error('Error in watchlist callback query:', error);
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ An error occurred. Please try again.',
                show_alert: true
            });
        }
    });
}
