import { getWatchlist, removeFromWatchlist } from '../../data/whattowatch/database.js';
import axios from 'axios';

const ITEMS_PER_PAGE = 5;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

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

        // Format actors with IMDb links
        let formattedActors = 'N/A';
        if (omdbMovie.Actors && omdbMovie.Actors !== 'N/A') {
            const actors = omdbMovie.Actors.split(', ');
            const actorPromises = actors.map(async actor => {
                const imdbId = await searchActorImdbId(actor);
                return imdbId ? 
                    `<a href="https://www.imdb.com/name/${imdbId}">${actor}</a>` : 
                    actor;
            });
            const linkedActors = await Promise.all(actorPromises);
            formattedActors = linkedActors.join(', ');
        }

        const basicInfo = `📀 𝖳𝗂𝗍𝗅𝖾 : <a href="${imdbUrl}">${movie.movie_title}</a>

🌟 𝖱𝖺𝗍𝗂𝗇𝗀 : ${omdbMovie.imdbRating || 'N/A'}/10
📆 𝖱𝖾𝗅𝖾𝖺𝗌𝖾 : ${omdbMovie.Released || 'N/A'}
🎭 𝖦𝖾𝗇𝗋𝖾 : ${omdbMovie.Genre || 'N/A'}
⏱️ 𝖱𝗎𝗇𝗍𝗂𝗆𝖾 : ${runtimeFormatted}
🔊 𝖫𝖺𝗇𝗀𝗎𝖺𝗀𝖾 : ${omdbMovie.Language || 'N/A'}
🎥 𝖣𝗂𝗋𝖾𝖼𝗍𝗈𝗋𝗌 : ${omdbMovie.Director || 'N/A'}
🔆 𝗌𝗍𝖺𝗋𝗌 : ${formattedActors}

🗒 𝖲𝗍𝗈𝗋𝗒𝗅𝗂𝗇𝖾 : <code>${omdbMovie.Plot || 'No plot available'}</code>`;

        return {
            info: basicInfo,
            poster: tmdbMovie.poster_path ? `${TMDB_IMAGE_BASE}${tmdbMovie.poster_path}` : null
        };
    } catch (error) {
        console.error('Error formatting movie info:', error);
        return {
            info: 'Error retrieving movie information. Please try again later.',
            poster: null
        };
    }
}

// Search for actor's IMDb ID using TMDB API
async function searchActorImdbId(actorName) {
    try {
        const response = await axios.get(`${TMDB_BASE_URL}/search/person`, {
            params: {
                api_key: process.env.TMDB_API_KEY,
                query: actorName,
                language: 'en-US'
            }
        });

        if (response.data.results && response.data.results.length > 0) {
            const personId = response.data.results[0].id;
            const personDetails = await axios.get(`${TMDB_BASE_URL}/person/${personId}/external_ids`, {
                params: {
                    api_key: process.env.TMDB_API_KEY
                }
            });
            return personDetails.data.imdb_id;
        }
        return null;
    } catch (error) {
        return null;
    }
}

function createWatchlistKeyboard(movies, currentPage = 0) {
    const keyboard = {
        inline_keyboard: []
    };

    // Add movie buttons with padding for visual left alignment
    movies.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE).forEach(movie => {
        keyboard.inline_keyboard.push([
            {
                text: `  🎬 ${movie.movie_title}`,
                callback_data: `wl_info_${movie.movie_id}`
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

// Create movie details keyboard with current page information
function createMovieDetailsKeyboard(movieId, currentPage = 0) {
    return {
        inline_keyboard: [
            [
                {
                    text: '  ⬅️ Back to Watchlist',
                    callback_data: `wl_back_${currentPage}`
                },
                {
                    text: '  ❌ Remove from Watchlist',
                    callback_data: `wl_remove_${movieId}`
                }
            ]
        ]
    };
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

                case 'info':
                    const movieId = params[0];
                    // Get the current page from the keyboard if it exists
                    const currentKeyboard = callbackQuery.message.reply_markup;
                    let currentPage = 0;
                    if (currentKeyboard && currentKeyboard.inline_keyboard) {
                        // Check if there's a next/previous button and extract the page number
                        const navigationRow = currentKeyboard.inline_keyboard[currentKeyboard.inline_keyboard.length - 1];
                        if (navigationRow) {
                            for (const button of navigationRow) {
                                if (button.callback_data && button.callback_data.startsWith('wl_page_')) {
                                    // If there's a "Previous" button, use its page number + 1
                                    // If there's only a "Next" button, we're on page 0
                                    const match = button.callback_data.match(/wl_page_(\d+)/);
                                    if (match) {
                                        currentPage = button.text.includes('Previous') ? parseInt(match[1]) + 1 : 0;
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    const movie = movies.find(m => m.movie_id === movieId);
                    if (!movie) {
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '❌ Movie not found in watchlist.',
                            show_alert: true
                        });
                        return;
                    }

                    const movieInfo = await formatMovieInfo(movie);
                    if (movieInfo.poster) {
                        await bot.sendPhoto(chatId, movieInfo.poster, {
                            caption: movieInfo.info,
                            parse_mode: 'HTML',
                            reply_markup: createMovieDetailsKeyboard(movieId, currentPage)
                        });
                        await bot.deleteMessage(chatId, messageId);
                    } else {
                        await bot.editMessageText(movieInfo.info, {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'HTML',
                            reply_markup: createMovieDetailsKeyboard(movieId, currentPage)
                        });
                    }
                    await bot.answerCallbackQuery(callbackQuery.id);
                    break;

                case 'remove':
                    const removeId = params[0];
                    const success = await removeFromWatchlist(chatId, removeId);
                    if (success) {
                        const updatedMovies = await getWatchlist(chatId);
                        if (updatedMovies.length === 0) {
                            await bot.editMessageText(
                                '📝 Your watchlist is empty. Use the "Add to Watchlist" button when viewing movie recommendations to add movies!',
                                {
                                    chat_id: chatId,
                                    message_id: messageId,
                                    parse_mode: 'Markdown'
                                }
                            );
                        } else {
                            await bot.editMessageReplyMarkup(
                                createWatchlistKeyboard(updatedMovies),
                                {
                                    chat_id: chatId,
                                    message_id: messageId
                                }
                            );
                        }
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '✅ Movie removed from watchlist.',
                            show_alert: true
                        });
                    } else {
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '❌ Failed to remove movie from watchlist.',
                            show_alert: true
                        });
                    }
                    break;

                case 'back':
                    const pageToReturn = params[0] ? parseInt(params[0]) : 0;
                    const currentMovies = await getWatchlist(chatId);
                    await bot.sendMessage(
                        chatId,
                        '🎬 *Your Watchlist*\nHere are the movies in your watchlist:',
                        {
                            parse_mode: 'Markdown',
                            reply_markup: createWatchlistKeyboard(currentMovies, pageToReturn)
                        }
                    );
                    try {
                        await bot.deleteMessage(chatId, messageId);
                    } catch (error) {
                        console.log('Could not delete previous message:', error.message);
                    }
                    await bot.answerCallbackQuery(callbackQuery.id);
                    break;
            }
        } catch (error) {
            console.error('Error in watchlist callback:', error);
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ An error occurred. Please try again.',
                show_alert: true
            });
        }
    });
}
