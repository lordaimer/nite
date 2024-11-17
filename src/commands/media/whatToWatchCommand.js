import axios from 'axios';
import { rateLimitService } from '../../services/api/rateLimitService.js';

// Cache movie results to reduce API calls
const movieCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Store user selections in memory (moved outside the setup function)
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

// Debug logger with log levels
const debug = (message, data = null) => {
    // Only log important operations and errors
    const important = message.startsWith('Error') || 
                     message.includes('command received') ||
                     message.includes('movie recommendation') ||
                     message.includes('API response');
                     
    if (important) {
        const logMessage = `[DEBUG] ${message}${data ? ': ' + JSON.stringify(data, null, 2) : ''}`;
        console.log(logMessage);
    }
};

// Create initial keyboard with genre and rating buttons
function createInitialKeyboard(chatId) {
    debug('Creating initial keyboard for chat', { chatId });
    const selection = userSelections.get(chatId);
    debug('Raw selection from map', selection);
    
    // Make sure we have a valid selection object
    if (!selection) {
        debug('No selection found for chat', { chatId });
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

    // Format the genre text
    let genreText = selection.genre ? 
        `🎭 Genre: ${selection.genre.charAt(0).toUpperCase() + selection.genre.slice(1)}` : 
        '🎭 Genre: Not Selected';

    // Format the rating text
    let ratingText = selection.rating ? 
        `⭐ Rating: ${selection.rating}+` : 
        '⭐ Rating: Not Selected';
    
    debug('Creating keyboard with texts', { genreText, ratingText });
    
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
    debug('Creating genre keyboard');
    const keyboard = {
        inline_keyboard: []
    };
    
    // Create rows of 2 buttons each
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
    
    // Add back button
    keyboard.inline_keyboard.push([{
        text: '↩️ Back',
        callback_data: 'wtw_back_to_main'
    }]);
    
    debug('Genre keyboard created', keyboard);
    return keyboard;
}

// Create rating selection keyboard
function createRatingKeyboard() {
    debug('Creating rating keyboard');
    const keyboard = {
        inline_keyboard: []
    };

    // Add rating buttons
    Object.entries(RATING_FILTERS).forEach(([label, value]) => {
        keyboard.inline_keyboard.push([{
            text: label,
            callback_data: `wtw_rating_${value}`
        }]);
    });
    
    // Add back button
    keyboard.inline_keyboard.push([{
        text: '↩️ Back',
        callback_data: 'wtw_back_to_main'
    }]);
    
    debug('Rating keyboard created', keyboard);
    return keyboard;
}

// Create movie result keyboard
function createMovieResultKeyboard(imdbID, genre, rating) {
    return {
        inline_keyboard: [
            [
                {
                    text: '🎬 View on IMDb',
                    url: `https://www.imdb.com/title/${imdbID}`
                }
            ],
            [
                {
                    text: '🎲 Try Another',
                    callback_data: `wtw_another_${genre}_${rating}`
                }
            ]
        ]
    };
}

async function discoverMovie(genre, minRating) {
    try {
        debug('Discovering movie', { genre, minRating });
        
        // Handle random genre selection
        let actualGenre = genre;
        if (genre === 'random') {
            const genres = Object.keys(genreMapping).filter(g => g !== 'random');
            actualGenre = genres[Math.floor(Math.random() * genres.length)];
            debug('Selected random genre', actualGenre);
        }

        // Map our genre to TMDB genre
        const tmdbGenre = genreMapping[actualGenre];
        if (!tmdbGenre && genre !== 'random') {
            throw new Error(`Invalid genre: ${actualGenre}`);
        }
        debug('Mapped to TMDB genre', tmdbGenre);

        const genreResponse = await axios.get(`https://api.themoviedb.org/3/genre/movie/list`, {
            params: {
                api_key: process.env.TMDB_API_KEY
            }
        });

        const genreId = genreResponse.data.genres.find(g => g.name === tmdbGenre)?.id;
        if (!genreId) throw new Error(`TMDB genre not found: ${tmdbGenre}`);
        debug('Found genre ID', genreId);

        // Discover movies from TMDB
        const response = await axios.get(`https://api.themoviedb.org/3/discover/movie`, {
            params: {
                api_key: process.env.TMDB_API_KEY,
                with_genres: genreId,
                'vote_average.gte': minRating,
                'vote_count.gte': 1000, // Ensure movie has enough votes
                sort_by: 'vote_average.desc',
                page: Math.floor(Math.random() * 5) + 1 // Random page between 1-5
            }
        });
        debug('TMDB API response received', { totalResults: response.data.total_results });

        if (!response.data.results || response.data.results.length === 0) {
            throw new Error('No movies found matching criteria');
        }

        // Pick a random movie from the results
        const movies = response.data.results;
        const randomMovie = movies[Math.floor(Math.random() * movies.length)];
        debug('Selected random movie', { title: randomMovie.title });

        // Get additional movie details from OMDB
        const omdbResponse = await axios.get(`http://www.omdbapi.com/`, {
            params: {
                apikey: process.env.OMDB_API_KEY,
                t: randomMovie.title
            }
        });
        debug('OMDB API response received');

        return {
            tmdb: randomMovie,
            omdb: omdbResponse.data
        };
    } catch (error) {
        debug('Error in discoverMovie', error.message);
        throw error;
    }
}

function formatMovieInfo(movie) {
    const imdbRating = movie.omdb.imdbRating !== 'N/A' ? `⭐ ${movie.omdb.imdbRating}/10` : 'Rating N/A';
    const runtime = movie.omdb.Runtime !== 'N/A' ? `⏱️ ${movie.omdb.Runtime}` : '';
    const year = movie.omdb.Year !== 'N/A' ? `📅 ${movie.omdb.Year}` : '';
    const genre = movie.omdb.Genre !== 'N/A' ? `🎭 ${movie.omdb.Genre}` : '';
    
    return `🎬 *${movie.tmdb.title}*\n\n` +
           `${[imdbRating, runtime, year].filter(Boolean).join(' | ')}\n` +
           `${genre}\n\n` +
           `${movie.omdb.Plot}\n\n` +
           `🎭 *Cast:* ${movie.omdb.Actors}\n` +
           `🎪 *Director:* ${movie.omdb.Director}`;
}

export async function setupWhatToWatchCommand(bot, rateLimitService) {
    debug('Setting up WhatToWatch command');

    // Command handler for /whattowatch and /wtw
    bot.onText(/^\/(?:whattowatch|wtw)$/, async (msg) => {
        const chatId = msg.chat.id;
        debug('WhatToWatch command received', { chatId });

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
            debug('Initialized selection', userSelections.get(chatId));

            // Create and send initial message with keyboard
            const text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
            const keyboard = createInitialKeyboard(chatId);
            
            const sentMessage = await bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
            debug('Initial message sent', { messageId: sentMessage.message_id });
        } catch (error) {
            debug('Error in command handler', error.message);
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
            debug('Callback data received', data);
            if (!data.startsWith('wtw_')) return;

            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;

            debug('Processing callback for chat', { chatId, messageId });

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

            debug('Parsed callback data', { prefix, action, params });
            
            // Get or initialize user selections
            let selection = userSelections.get(chatId) || { genre: null, rating: null };
            debug('Current user selection', selection);

            try {
                let text, keyboard;
                
                // First handle the action
                debug('Processing action', action);
                switch(action) {
                    case 'select_genre':
                        debug('Creating genre selection view');
                        text = '🎭 *Select a Genre:*\nChoose your preferred movie genre:';
                        keyboard = createGenreKeyboard();
                        break;

                    case 'select_rating':
                        debug('Creating rating selection view');
                        text = '⭐ *Select Minimum IMDb Rating:*\nChoose the minimum rating for recommendations:';
                        keyboard = createRatingKeyboard();
                        break;

                    case 'genre':
                        const selectedGenre = params[0];
                        debug('Genre selected', selectedGenre);
                        
                        // Get existing selection or create new one
                        selection = userSelections.get(chatId) || { genre: null, rating: null };
                        selection.genre = selectedGenre;
                        userSelections.set(chatId, selection);
                        debug('Updated selection', userSelections.get(chatId));
                        
                        text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
                        keyboard = createInitialKeyboard(chatId);
                        debug('Created keyboard with selection', userSelections.get(chatId));
                        break;

                    case 'rating':
                        const selectedRating = parseInt(params[0]);
                        debug('Rating selected', selectedRating);
                        
                        // Get existing selection or create new one
                        selection = userSelections.get(chatId) || { genre: null, rating: null };
                        selection.rating = selectedRating;
                        userSelections.set(chatId, selection);
                        debug('Updated selection', userSelections.get(chatId));
                        
                        text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
                        keyboard = createInitialKeyboard(chatId);
                        debug('Created keyboard with selection', userSelections.get(chatId));
                        break;

                    case 'back_to_main':
                        debug('Returning to main menu');
                        text = '🎬 *What would you like to watch?*\nSelect your preferences to get a movie recommendation!';
                        keyboard = createInitialKeyboard(chatId);
                        break;

                    case 'confirm':
                        if (!selection.genre || !selection.rating) {
                            debug('Attempted confirmation without complete selection', selection);
                            await bot.answerCallbackQuery(callbackQuery.id, {
                                text: '⚠️ Please select both genre and rating first!',
                                show_alert: true
                            });
                            return;
                        }

                        debug('Getting movie recommendation for', selection);
                        const movie = await discoverMovie(selection.genre, selection.rating);
                        if (movie.tmdb.poster_path && movie.tmdb.poster_path !== 'N/A') {
                            await bot.sendPhoto(chatId, `https://image.tmdb.org/t/p/w500${movie.tmdb.poster_path}`, {
                                caption: formatMovieInfo(movie),
                                parse_mode: 'Markdown',
                                reply_markup: createMovieResultKeyboard(movie.tmdb.imdb_id, selection.genre, selection.rating)
                            });
                            await bot.deleteMessage(chatId, messageId);
                            return; // Skip the message edit since we're sending a new message
                        } else {
                            text = formatMovieInfo(movie);
                            keyboard = createMovieResultKeyboard(movie.tmdb.imdb_id, selection.genre, selection.rating);
                        }
                        break;

                    case 'another':
                        debug('Getting another recommendation');
                        const newMovie = await discoverMovie(params[0], params[1]);
                        if (newMovie.tmdb.poster_path && newMovie.tmdb.poster_path !== 'N/A') {
                            await bot.sendPhoto(chatId, `https://image.tmdb.org/t/p/w500${newMovie.tmdb.poster_path}`, {
                                caption: formatMovieInfo(newMovie),
                                parse_mode: 'Markdown',
                                reply_markup: createMovieResultKeyboard(newMovie.tmdb.imdb_id, params[0], params[1])
                            });
                            await bot.deleteMessage(chatId, messageId);
                            return; // Skip the message edit since we're sending a new message
                        } else {
                            text = formatMovieInfo(newMovie);
                            keyboard = createMovieResultKeyboard(newMovie.tmdb.imdb_id, params[0], params[1]);
                        }
                        break;

                    default:
                        debug('Unknown action', action);
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '❌ Invalid action',
                            show_alert: true
                        });
                        return;
                }

                // If we have text and keyboard, update the message
                if (text && keyboard) {
                    debug('Preparing to edit message');
                    debug('Text', text);
                    debug('Keyboard', keyboard);
                    
                    try {
                        const result = await bot.editMessageText(text, {
                            chat_id: chatId,
                            message_id: messageId,
                            parse_mode: 'Markdown',
                            reply_markup: keyboard
                        });
                        debug('Message edit result', result);
                    } catch (editError) {
                        debug('Failed to edit message', editError);
                        if (editError.response && editError.response.body) {
                            debug('Telegram error', editError.response.body);
                        }
                        throw editError;
                    }
                } else {
                    debug('No text or keyboard to update');
                }

                // Answer the callback query to remove the loading state
                await bot.answerCallbackQuery(callbackQuery.id);
            } catch (editError) {
                debug('Error in switch statement', editError);
                throw editError;
            }
        } catch (error) {
            debug('Error in callback query', error);
            try {
                await bot.answerCallbackQuery(callbackQuery.id, {
                    text: '❌ Sorry, something went wrong. Please try again.',
                    show_alert: true
                });
            } catch (callbackError) {
                debug('Error sending callback answer', callbackError);
            }
        }
    });
}
