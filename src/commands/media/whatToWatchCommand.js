import axios from 'axios';
import { rateLimitService } from '../../services/api/rateLimitService.js';
import { initializeDatabases, addWatchedMovie, isMovieWatched, addToWatchlist, isInWatchlist, removeFromWatchlist, addToNotInterested, isNotInterested } from '../../data/whattowatch/database.js';

// Cache movie results to reduce API calls
const movieCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Store user selections in memory
const userSelections = new Map();

// Genre list with emojis
const GENRES = {
    'Action': '💥',
    'Comedy': '😂',
    'Drama': '🎭',
    'Horror': '👻',
    'Sci-Fi': '🚀',
    'Romance': '❤️',
    'Thriller': '😱',
    'Fantasy': '🔮',
    'Random': '🎲'
};

// Genre mapping to TMDB genres
const genreMapping = {
    'action': 'Action',
    'comedy': 'Comedy',
    'drama': 'Drama',
    'horror': 'Horror',
    'sci-fi': 'Science Fiction',
    'romance': 'Romance',
    'thriller': 'Thriller',
    'fantasy': 'Fantasy',
    'random': null // Special case - will be handled separately
};

// IMDB rating filters
const RATING_FILTERS = {
    'Any Rating': 0,
    '7+ Rating': 7,
    '8+ Rating': 8,
    '9+ Rating': 9
};

// TMDb API configuration
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/original';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// Create initial keyboard with genre and rating buttons
function createInitialKeyboard(chatId) {
    const selection = userSelections.get(chatId);
    
    if (!selection) {
        return {
            inline_keyboard: [
                [
                    {
                        text: '🎭 Genre: Not Selected',
                        callback_data: 'wtw_select_genre'
                    },
                    {
                        text: '⭐ Rating: Not Selected',
                        callback_data: 'wtw_select_rating'
                    }
                ],
                [
                    {
                        text: '🎬 Get Recommendation',
                        callback_data: 'wtw_confirm'
                    }
                ]
            ]
        };
    }

    const genreText = selection.genre ? 
        `🎭 Genre: ${selection.genre.charAt(0).toUpperCase() + selection.genre.slice(1)}` : 
        '🎭 Genre: Not Selected';

    const ratingText = selection.rating ? 
        `⭐ Rating: ${selection.rating}+` : 
        '⭐ Rating: Not Selected';
    
    return {
        inline_keyboard: [
            [
                {
                    text: genreText,
                    callback_data: 'wtw_select_genre'
                },
                {
                    text: ratingText,
                    callback_data: 'wtw_select_rating'
                }
            ],
            [
                {
                    text: '🎬 Get Recommendation',
                    callback_data: 'wtw_confirm'
                }
            ]
        ]
    };
}

// Create genre selection keyboard
function createGenreKeyboard() {
    const keyboard = {
        inline_keyboard: []
    };
    
    const entries = Object.entries(GENRES);
    for (let i = 0; i < entries.length; i += 2) {
        const row = [];
        for (let j = 0; j < 2 && i + j < entries.length; j++) {
            const [genre, emoji] = entries[i + j];
            row.push({
                text: `${emoji} ${genre}`,
                callback_data: `wtw_genre_${genre.toLowerCase()}`
            });
        }
        keyboard.inline_keyboard.push(row);
    }
    
    keyboard.inline_keyboard.push([{
        text: '↩️ Back',
        callback_data: 'wtw_back_to_main'
    }]);
    
    return keyboard;
}

// Create rating selection keyboard
function createRatingKeyboard() {
    const keyboard = {
        inline_keyboard: []
    };

    Object.entries(RATING_FILTERS).forEach(([label, value]) => {
        keyboard.inline_keyboard.push([{
            text: label,
            callback_data: `wtw_rating_${value}`
        }]);
    });
    
    keyboard.inline_keyboard.push([{
        text: '↩️ Back',
        callback_data: 'wtw_back_to_main'
    }]);
    
    return keyboard;
}

// Create movie result keyboard
async function createMovieResultKeyboard(movieId, genre, rating, userId) {
    const [isWatched, inWatchlist, notWantToWatch] = await Promise.all([
        isMovieWatched(userId, movieId),
        isInWatchlist(userId, movieId),
        isNotInterested(userId, movieId)
    ]);

    const keyboard = {
        inline_keyboard: [
            [
                {
                    text: '🔄 Another Movie',
                    callback_data: `wtw_another_${genre}_${rating}`
                },
                {
                    text: inWatchlist ? '📝 Remove from Watchlist' : '📝 Add to Watchlist',
                    callback_data: inWatchlist ? `wtw_unwatchlist_${movieId}` : `wtw_watchlist_${movieId}`
                }
            ],
            [
                {
                    text: isWatched ? '✅ Already Watched' : '👁️ Already Watched',
                    callback_data: `wtw_watched_${movieId}`
                },
                {
                    text: notWantToWatch ? 'Duly Noted ✏️' : '❌ Not Interested',
                    callback_data: `wtw_notinterested_${movieId}`
                }
            ]
        ]
    };

    return keyboard;
}

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

async function discoverMovie(genre, minRating, userId, maxRetries = 3) {
    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const selectedGenre = genre.toLowerCase() === 'random' ? 
                Object.keys(genreMapping)[Math.floor(Math.random() * (Object.keys(genreMapping).length - 1))] : 
                genre.toLowerCase();

            const genreName = genreMapping[selectedGenre];
            const genreResponse = await axios.get(`${TMDB_BASE_URL}/genre/movie/list`, {
                params: {
                    api_key: process.env.TMDB_API_KEY,
                    language: 'en-US'
                }
            });

            const genreId = genreResponse.data.genres.find(g => g.name === genreName)?.id;
            
            // Get multiple pages of results to have more options
            const page = Math.floor(Math.random() * 5) + 1;
            const response = await axios.get(`${TMDB_BASE_URL}/discover/movie`, {
                params: {
                    api_key: process.env.TMDB_API_KEY,
                    with_genres: genreId,
                    'vote_average.gte': minRating,
                    'vote_count.gte': 100,
                    language: 'en-US',
                    include_adult: false,
                    page: page
                }
            });

            if (!response.data.results || response.data.results.length === 0) {
                throw new Error('No movies found matching the criteria');
            }

            // Filter out movies that are already watched, in watchlist, or not interested
            const availableMovies = [];
            for (const movie of response.data.results) {
                const [watched, inWatchlist, notInterested] = await Promise.all([
                    isMovieWatched(userId, movie.id.toString()),
                    isInWatchlist(userId, movie.id.toString()),
                    isNotInterested(userId, movie.id.toString())
                ]);

                if (!watched && !inWatchlist && !notInterested) {
                    availableMovies.push(movie);
                }
            }

            if (!availableMovies.length) {
                throw new Error('No unwatched movies found');
            }

            // Select a random movie from available ones
            const selectedMovie = availableMovies[Math.floor(Math.random() * availableMovies.length)];

            // Get OMDB details for the unwatched movie
            const omdbResponse = await axios.get(`http://www.omdbapi.com/`, {
                params: {
                    apikey: process.env.OMDB_API_KEY,
                    t: selectedMovie.title,
                    y: new Date(selectedMovie.release_date).getFullYear()
                }
            });

            if (omdbResponse.data.Response === 'False') {
                continue;
            }

            return {
                tmdb: selectedMovie,
                omdb: omdbResponse.data
            };
        } catch (error) {
            lastError = error;
            // If this is not our last attempt, continue to the next try
            if (attempt < maxRetries - 1) {
                continue;
            }
            throw new Error(`Failed to find unwatched movie after ${maxRetries} attempts: ${lastError.message}`);
        }
    }
}

async function formatMovieInfo(movie) {
    const imdbUrl = `https://www.imdb.com/title/${movie.tmdb.imdb_id}`;
    
    // Convert runtime from "X min" to "X hours Y mins"
    let runtimeFormatted = 'N/A';
    if (movie.omdb.Runtime && movie.omdb.Runtime !== 'N/A') {
        const minutes = parseInt(movie.omdb.Runtime);
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
    if (movie.omdb.Actors && movie.omdb.Actors !== 'N/A') {
        const actors = movie.omdb.Actors.split(', ');
        const actorPromises = actors.map(async actor => {
            const imdbId = await searchActorImdbId(actor);
            return imdbId ? 
                `<a href="https://www.imdb.com/name/${imdbId}">${actor}</a>` : 
                actor;
        });
        const linkedActors = await Promise.all(actorPromises);
        formattedActors = linkedActors.join(', ');
    }
    
    const basicInfo = `📀 𝖳𝗂𝗍𝗅𝖾 : <a href="${imdbUrl}">${movie.tmdb.title}</a>

🌟 𝖱𝖺𝗍𝗂𝗇𝗀 : ${movie.omdb.imdbRating || 'N/A'}/10
📆 𝖱𝖾𝗅𝖾𝖺𝗌𝖾 : ${movie.omdb.Released || 'N/A'}
🎭 𝖦𝖾𝗇𝗋𝖾 : ${movie.omdb.Genre || 'N/A'}
⏱️ 𝖱𝗎𝗇𝗍𝗂𝗆𝖾 : ${runtimeFormatted}
🔊 𝖫𝖺𝗇𝗀𝗎𝖺𝗀𝖾 : ${movie.omdb.Language || 'N/A'}
🎥 𝖣𝗂𝗋𝖾𝖼𝗍𝗈𝗋𝗌 : ${movie.omdb.Director || 'N/A'}
🔆 𝗌𝗍𝖺𝗋𝗌 : ${formattedActors}

🗒 𝖲𝗍𝗈𝗋𝗒𝗅𝗂𝗇𝖾 : <code>${movie.omdb.Plot || 'No plot available'}</code>`;

    return basicInfo;
}

export async function setupWhatToWatchCommand(bot, rateLimitService) {
    // Initialize the databases
    await initializeDatabases();

    // Command handler for /whattowatch and /wtw
    bot.onText(/^\/(?:whattowatch|wtw)$/, async (msg) => {
        const chatId = msg.chat.id;

        try {
            // If rateLimitService is provided, check rate limit
            if (rateLimitService && typeof rateLimitService.check === 'function') {
                const isAllowed = rateLimitService.check(chatId, 'whattowatch', 10, 60000);
                if (!isAllowed) {
                    await bot.sendMessage(
                        chatId,
                        '⚠️ You\'re using this command too frequently. Please wait a moment.',
                        { parse_mode: 'Markdown' }
                    );
                    return;
                }
            }

            // Initialize user selection
            userSelections.set(chatId, { genre: null, rating: null });

            // Create and send initial message with keyboard
            const text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
            const keyboard = createInitialKeyboard(chatId);
            
            const sentMessage = await bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            await bot.sendMessage(
                msg.chat.id,
                '❌ Sorry, something went wrong. Please try again later.'
            );
        }
    });

    // Callback query handler
    bot.on('callback_query', async (callbackQuery) => {
        try {
            const data = callbackQuery.data;
            if (!data.startsWith('wtw_')) return;

            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            // If rateLimitService is provided, check rate limit
            if (rateLimitService && typeof rateLimitService.check === 'function') {
                const isAllowed = rateLimitService.check(chatId, 'whattowatch', 10, 60000);
                if (!isAllowed) {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: '⚠️ You\'re making requests too quickly. Please wait a moment.',
                        show_alert: true
                    });
                    return;
                }
            }

            // Parse the callback data more carefully
            const parts = data.split('_');
            const prefix = parts[0]; // 'wtw'
            let action = '', params = [];
            
            // Handle special cases for select_genre and select_rating
            if (parts[1] === 'select' && parts[2]) {
                action = parts[1] + '_' + parts[2];
                params = parts.slice(3);
            } else {
                action = parts[1];
                params = parts.slice(2);
            }

            // Get or initialize user selections
            let selection = userSelections.get(chatId) || { genre: null, rating: null };

            try {
                let text, keyboard;
                
                // First handle the action
                switch(action) {
                    case 'select_genre':
                        text = '🎭 *Select a Genre:*\nChoose your preferred movie genre:';
                        keyboard = createGenreKeyboard();
                        break;

                    case 'select_rating':
                        text = '⭐ *Select Minimum IMDb Rating:*\nChoose the minimum rating for recommendations:';
                        keyboard = createRatingKeyboard();
                        break;

                    case 'genre':
                        const selectedGenre = params[0];
                        selection = userSelections.get(chatId) || { genre: null, rating: null };
                        selection.genre = selectedGenre;
                        userSelections.set(chatId, selection);
                        text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
                        keyboard = createInitialKeyboard(chatId);
                        break;

                    case 'rating':
                        const selectedRating = parseInt(params[0]);
                        selection = userSelections.get(chatId) || { genre: null, rating: null };
                        selection.rating = selectedRating;
                        userSelections.set(chatId, selection);
                        text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
                        keyboard = createInitialKeyboard(chatId);
                        break;

                    case 'back_to_main':
                        text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
                        keyboard = createInitialKeyboard(chatId);
                        break;

                    case 'confirm':
                        if (!selection.genre || !selection.rating) {
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '⚠️ Please select both genre and rating first!',
                                show_alert: true
                            });
                            return;
                        }

                        // Show loading state immediately
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '🎬 Finding a movie for you...',
                            show_alert: false
                        });

                        try {
                            const movie = await discoverMovie(selection.genre, selection.rating, chatId);
                            if (movie.tmdb.poster_path && movie.tmdb.poster_path !== 'N/A') {
                                await bot.sendPhoto(chatId, `${TMDB_IMAGE_BASE}${movie.tmdb.poster_path}`, {
                                    caption: await formatMovieInfo(movie),
                                    parse_mode: 'HTML',
                                    reply_markup: await createMovieResultKeyboard(movie.tmdb.id, selection.genre, selection.rating, chatId)
                                });
                                await bot.deleteMessage(chatId, messageId);
                            } else {
                                text = await formatMovieInfo(movie);
                                keyboard = await createMovieResultKeyboard(movie.tmdb.id, selection.genre, selection.rating, chatId);
                            }
                        } catch (error) {
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: error.message.includes('unwatched movie') ? 
                                    '❌ No unwatched movies found in this category. Try another genre or rating!' :
                                    '❌ Failed to find a movie. Please try again.',
                                show_alert: true
                            });
                        }
                        return;

                    case 'another':
                        // Show loading state immediately
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '🎬 Finding another movie for you...',
                            show_alert: false
                        });

                        try {
                            const currentKeyboard = callbackQuery.message.reply_markup;
                            const genre = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[2];
                            const rating = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[3];

                            const newMovie = await discoverMovie(params[0], params[1], chatId);
                            if (newMovie.tmdb.poster_path && newMovie.tmdb.poster_path !== 'N/A') {
                                await bot.sendPhoto(chatId, `${TMDB_IMAGE_BASE}${newMovie.tmdb.poster_path}`, {
                                    caption: await formatMovieInfo(newMovie),
                                    parse_mode: 'HTML',
                                    reply_markup: await createMovieResultKeyboard(newMovie.tmdb.id, params[0], params[1], chatId)
                                });
                                await bot.deleteMessage(chatId, messageId);
                            } else {
                                const text = await formatMovieInfo(newMovie);
                                const keyboard = await createMovieResultKeyboard(newMovie.tmdb.id, params[0], params[1], chatId);
                                await bot.editMessageText(text, {
                                    chat_id: chatId,
                                    message_id: messageId,
                                    parse_mode: 'HTML',
                                    reply_markup: keyboard
                                });
                            }
                        } catch (error) {
                            // If error occurs, show error message but keep the current movie and button
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '❌ Failed to find another movie. Please try again.',
                                show_alert: true
                            });
                        }
                        return;

                    case 'watched':
                        const movieId = params[0];
                        const success = await addWatchedMovie(chatId, movieId);
                        
                        if (success) {
                            // Update keyboard to show only "Added" button
                            const updatedKeyboard = {
                                inline_keyboard: [[
                                    { text: '✅ Added', callback_data: 'dummy' }
                                ]]
                            };
                            
                            await bot.editMessageReplyMarkup(updatedKeyboard, {
                                chat_id: chatId,
                                message_id: messageId
                            });

                            // Show brief success message
                            await bot.answerCallbackQuery(callbackQuery.id);

                            // Wait for 1.5 seconds
                            await new Promise(resolve => setTimeout(resolve, 1500));

                            // Find and show a new movie
                            try {
                                const currentKeyboard = callbackQuery.message.reply_markup;
                                const genre = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[2];
                                const rating = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[3];

                                const newMovie = await discoverMovie(genre, rating, chatId);
                                if (newMovie.tmdb.poster_path && newMovie.tmdb.poster_path !== 'N/A') {
                                    await bot.sendPhoto(chatId, `${TMDB_IMAGE_BASE}${newMovie.tmdb.poster_path}`, {
                                        caption: await formatMovieInfo(newMovie),
                                        parse_mode: 'HTML',
                                        reply_markup: await createMovieResultKeyboard(newMovie.tmdb.id, genre, rating, chatId)
                                    });
                                    await bot.deleteMessage(chatId, messageId);
                                } else {
                                    const text = await formatMovieInfo(newMovie);
                                    const keyboard = await createMovieResultKeyboard(newMovie.tmdb.id, genre, rating, chatId);
                                    await bot.editMessageText(text, {
                                        chat_id: chatId,
                                        message_id: messageId,
                                        parse_mode: 'HTML',
                                        reply_markup: keyboard
                                    });
                                }
                            } catch (error) {
                                // If no more unwatched movies, inform the user
                                if (error.message.includes('unwatched movie')) {
                                    await bot.sendMessage(chatId, 
                                        '❌ No more unwatched movies found in this category. Try another genre or rating!',
                                        { parse_mode: 'HTML' }
                                    );
                                } else {
                                    await bot.sendMessage(chatId,
                                        '❌ Failed to find another movie. Please try again.',
                                        { parse_mode: 'HTML' }
                                    );
                                }
                            }
                        } else {
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '❌ Failed to add to watched movies. Please try again.',
                                show_alert: true
                            });
                        }
                        return;

                    case 'watchlist':
                        const movieIdToWatch = params[0];
                        const watchlistResult = await addToWatchlist(chatId, movieIdToWatch);
                        
                        if (watchlistResult.success) {
                            // Update the keyboard to show "Remove from Watchlist"
                            const currentKeyboard = callbackQuery.message.reply_markup;
                            const genre = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[2];
                            const rating = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[3];
                            
                            await bot.editMessageReplyMarkup(
                                await createMovieResultKeyboard(movieIdToWatch, genre, rating, chatId),
                                {
                                    chat_id: chatId,
                                    message_id: messageId
                                }
                            );
                            
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '📝 Added to your watchlist!',
                                show_alert: true
                            });
                        } else {
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: watchlistResult.message,
                                show_alert: true
                            });
                        }
                        return;

                    case 'unwatchlist':
                        const movieIdToRemove = params[0];
                        const removeResult = await removeFromWatchlist(chatId, movieIdToRemove);
                        
                        if (removeResult) {
                            // Update the keyboard to show "Add to Watchlist"
                            const currentKeyboard = callbackQuery.message.reply_markup;
                            const genre = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[2];
                            const rating = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[3];
                            
                            await bot.editMessageReplyMarkup(
                                await createMovieResultKeyboard(movieIdToRemove, genre, rating, chatId),
                                {
                                    chat_id: chatId,
                                    message_id: messageId
                                }
                            );
                            
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '✅ Removed from your watchlist!',
                                show_alert: true
                            });
                        } else {
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '❌ Failed to remove from watchlist. Please try again.',
                                show_alert: true
                            });
                        }
                        return;

                    case 'notinterested':
                        const movieIdNotInterested = params[0];
                        const notInterestedResult = await addToNotInterested(chatId, movieIdNotInterested);
                        
                        if (notInterestedResult.success) {
                            // Update keyboard to show only "Duly Noted" button
                            const updatedKeyboard = {
                                inline_keyboard: [[
                                    { text: 'Duly Noted ✏️', callback_data: 'dummy' }
                                ]]
                            };
                            
                            await bot.editMessageReplyMarkup(updatedKeyboard, {
                                chat_id: chatId,
                                message_id: messageId
                            });

                            // Show brief success message
                            await bot.answerCallbackQuery(callbackQuery.id);

                            // Wait for 1.5 seconds
                            await new Promise(resolve => setTimeout(resolve, 1500));

                            // Find and show a new movie
                            try {
                                const currentKeyboard = callbackQuery.message.reply_markup;
                                const genre = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[2];
                                const rating = currentKeyboard.inline_keyboard[0][0].callback_data.split('_')[3];

                                const newMovie = await discoverMovie(genre, rating, chatId);
                                if (newMovie.tmdb.poster_path && newMovie.tmdb.poster_path !== 'N/A') {
                                    await bot.sendPhoto(chatId, `${TMDB_IMAGE_BASE}${newMovie.tmdb.poster_path}`, {
                                        caption: await formatMovieInfo(newMovie),
                                        parse_mode: 'HTML',
                                        reply_markup: await createMovieResultKeyboard(newMovie.tmdb.id, genre, rating, chatId)
                                    });
                                    await bot.deleteMessage(chatId, messageId);
                                } else {
                                    const text = await formatMovieInfo(newMovie);
                                    const keyboard = await createMovieResultKeyboard(newMovie.tmdb.id, genre, rating, chatId);
                                    await bot.editMessageText(text, {
                                        chat_id: chatId,
                                        message_id: messageId,
                                        parse_mode: 'HTML',
                                        reply_markup: keyboard
                                    });
                                }
                            } catch (error) {
                                // If no more unwatched movies, inform the user
                                if (error.message.includes('unwatched movie')) {
                                    await bot.sendMessage(chatId, 
                                        '❌ No more unwatched movies found in this category. Try another genre or rating!',
                                        { parse_mode: 'HTML' }
                                    );
                                } else {
                                    await bot.sendMessage(chatId,
                                        '❌ Failed to find another movie. Please try again.',
                                        { parse_mode: 'HTML' }
                                    );
                                }
                            }
                        } else {
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '❌ Failed to mark as not interested. Please try again.',
                                show_alert: true
                            });
                        }
                        return;

                    default:
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '❌ Invalid action',
                            show_alert: true
                        });
                        return;
                }

                // If we have text and keyboard, update the message
                if (text && keyboard) {
                    const result = await bot.editMessageText(text, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                } else {
                    // No text or keyboard to update
                }

                // Answer the callback query to remove the loading state
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (editError) {
                try {
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: '❌ Sorry, something went wrong. Please try again.',
                        show_alert: true
                    });
                } catch (callbackError) {
                    // Error sending callback answer
                }
            }
        } catch (error) {
            try {
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Sorry, something went wrong. Please try again.',
                    show_alert: true
                });
            } catch (callbackError) {
                // Error sending callback answer
            }
        }
    });
}
