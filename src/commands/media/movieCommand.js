import axios from 'axios';

// Cache movie results to reduce API calls
const movieCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// Add TMDb API configuration
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Modify the cache structure to be message-specific
const messageActorCache = new Map(); // Store as messageId_actorName -> movieTitle

// At the top with other constants
const movieTitleCache = new Map(); // Cache to store movie titles by message ID

async function fetchMovieInfo(query, isImdbId = false) {
    try {
        const response = await axios.get(`http://www.omdbapi.com/`, {
            params: {
                apikey: process.env.OMDB_API_KEY,
                [isImdbId ? 'i' : 't']: query,
                plot: 'short'
            }
        });

        if (response.data.Response === 'False') {
            throw new Error(response.data.Error || 'Movie not found');
        }

        // If movie has a poster, get high resolution version
        if (response.data.Poster && response.data.Poster !== 'N/A') {
            // The default OMDB poster URLs are in this format:
            // https://m.media-amazon.com/images/M/[image_id].jpg
            // We can modify it to get higher resolution by changing the end part
            response.data.Poster = response.data.Poster
                .replace('_SX300', '_SX1500')  // Increase width to 1500
                .replace('_SY300', '_SY2000'); // Increase height to 2000
        }

        return response.data;
    } catch (error) {
        console.error('Error fetching movie:', error.message);
        throw error;
    }
}

function formatMovieInfo(movie) {
    // Create IMDb URL from movie ID
    const imdbUrl = `https://www.imdb.com/title/${movie.imdbID}`;
    
    // Format actors list (remove the clickable links since we're using inline buttons)
    const actorsFormatted = movie.Actors;
    
    // Create basic info with fancy unicode characters and HTML formatting
    const basicInfo = `📀 𝖳𝗂𝗍𝗅𝖾 : <a href="${imdbUrl}">${movie.Title}</a>

🌟 𝖱𝖺𝗍𝗂𝗇𝗀 : ${movie.imdbRating || 'N/A'}/10
📆 𝖱𝖾𝗅𝖾𝖺𝗌𝖾 : ${movie.Released || 'N/A'}
🎭 𝖦𝖾𝗇𝗋𝖾 : ${movie.Genre || 'N/A'}
🔊 𝖫𝖺𝗇𝗀𝗎𝖺𝗀𝖾 : ${movie.Language || 'N/A'}
🎥 𝖣𝗂𝖾𝖼𝗍𝗈𝗋𝗌 : ${movie.Director || 'N/A'}
🔆 S𝗍𝖺𝗋𝗌 : ${actorsFormatted}

🗒 𝖲𝗍𝗈𝗋𝗒𝗅𝗂𝗇𝖾 : <code>${movie.Plot || 'No plot available'}</code>`;

    return basicInfo;
}

async function sendMovieInfo(bot, chatId, movieInfo) {
    try {
        const formattedInfo = formatMovieInfo(movieInfo);
        
        // Create inline keyboard with actor buttons
        const actorButtons = movieInfo.Actors.split(', ').map(actor => ({
            text: actor,
            callback_data: `actor:${actor}`
        }));
        
        // Arrange buttons in rows of 2
        const keyboard = {
            inline_keyboard: actorButtons.reduce((rows, button, index) => {
                if (index % 2 === 0) {
                    rows.push([button]);
                } else {
                    rows[rows.length - 1].push(button);
                }
                return rows;
            }, [])
        };

        // Clear previous caches before sending new movie info
        movieTitleCache.clear();
        messageActorCache.clear();

        // Send message and store the message ID with movie title
        let sentMessage;
        if (movieInfo.Poster && movieInfo.Poster !== 'N/A') {
            sentMessage = await bot.sendPhoto(chatId, movieInfo.Poster, {
                caption: formattedInfo,
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } else {
            sentMessage = await bot.sendMessage(chatId, formattedInfo, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        }
        
        // Store the new movie title with the message ID
        movieTitleCache.set(sentMessage.message_id, movieInfo.Title);
        
    } catch (error) {
        console.error('Error sending movie info:', error);
        
        // If caption is too long, try sending with shorter plot
        if (error.message.includes('caption is too long')) {
            const shortPlot = movieInfo.Plot.split('.')[0] + '.';
            movieInfo.Plot = shortPlot;
            
            const formattedInfo = formatMovieInfo(movieInfo);
            
            if (movieInfo.Poster && movieInfo.Poster !== 'N/A') {
                await bot.sendPhoto(chatId, movieInfo.Poster, {
                    caption: formattedInfo,
                    parse_mode: 'HTML'
                });
            } else {
                await bot.sendMessage(chatId, formattedInfo, {
                    parse_mode: 'HTML'
                });
            }
        } else {
            await bot.sendMessage(
                chatId,
                '❌ Error displaying movie information. Please try again.'
            );
        }
    }
}

// Function to search actor in TMDb
async function fetchActorInfo(actorName) {
    try {
        // Verify API key exists
        if (!TMDB_API_KEY) {
            throw new Error('TMDb API key is not configured');
        }

        // First search for the actor
        const searchResponse = await axios.get(`${TMDB_BASE_URL}/search/person`, {
            params: {
                api_key: TMDB_API_KEY,
                query: actorName,
                language: 'en-US'
            }
        });

        if (!searchResponse.data.results.length) {
            throw new Error('Actor not found');
        }

        // Get detailed actor info
        const actorId = searchResponse.data.results[0].id;
        const detailsResponse = await axios.get(`${TMDB_BASE_URL}/person/${actorId}`, {
            params: {
                api_key: TMDB_API_KEY
            }
        });

        return {
            name: detailsResponse.data.name,
            biography: detailsResponse.data.biography || 'No biography available',
            birthday: detailsResponse.data.birthday || 'Unknown',
            place_of_birth: detailsResponse.data.place_of_birth || 'Unknown',
            profile_path: detailsResponse.data.profile_path ? 
                `${TMDB_IMAGE_BASE}${detailsResponse.data.profile_path}` : null
        };
    } catch (error) {
        console.error('Error fetching actor info:', error);
        throw error;
    }
}

function formatActorInfo(actor) {
    // Truncate biography to fit within Telegram's caption limit
    const maxBioLength = 700; // Leave room for other fields and formatting
    let biography = actor.biography;
    if (biography.length > maxBioLength) {
        // Find the last complete sentence within the limit
        biography = biography.substring(0, maxBioLength);
        const lastPeriod = biography.lastIndexOf('.');
        if (lastPeriod > 0) {
            biography = biography.substring(0, lastPeriod + 1);
        }
    }

    return `🎭 ${actor.name}

🎂 Birthday: ${actor.birthday}
📍 Place of Birth: ${actor.place_of_birth}

📝 Biography:
${biography}`;
}

export function setupMovieCommand(bot) {
    // Handle /movie or /mv command with either title or IMDb ID
    bot.onText(/\/(movie|mv)(?:\s+(.+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const searchQuery = match[2]?.trim();

        // Clear all caches when a new movie command is executed
        movieTitleCache.clear();
        messageActorCache.clear();

        if (!searchQuery) {
            await bot.sendMessage(
                chatId,
                `🎬 *Movie Information Search*\n\n` +
                `Search by title or IMDb ID:\n` +
                `• \`/movie <title>\`\n` +
                `• \`/mv <imdb_id>\`\n\n` +
                `Examples:\n` +
                `• /movie The Matrix\n` +
                `• /mv tt0133093\n` +
                `• /movie tt16366836`,
                { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true 
                }
            );
            return;
        }

        // Show loading message
        const loadingMsg = await bot.sendMessage(
            chatId, 
            '🔍 Searching for movie...',
            { parse_mode: 'Markdown' }
        );

        try {
            // Check if the input is an IMDb ID (starts with 'tt' followed by numbers)
            const isImdbId = /^tt\d+$/.test(searchQuery);
            
            const movieInfo = await fetchMovieInfo(searchQuery, isImdbId);
            
            // Cache the result
            movieCache.set(searchQuery.toLowerCase(), {
                data: movieInfo,
                timestamp: Date.now()
            });

            // Delete loading message
            await bot.deleteMessage(chatId, loadingMsg.message_id);
            
            // Send movie info
            await sendMovieInfo(bot, chatId, movieInfo);

        } catch (error) {
            await bot.editMessageText(
                `❌ ${error.message || 'Failed to fetch movie information. Please try again.'}`,
                {
                    chat_id: chatId,
                    message_id: loadingMsg.message_id
                }
            );
        }
    });

    // Modify the existing bot.on('callback_query') handler
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        if (query.data.startsWith('actor:')) {
            const actorName = query.data.replace('actor:', '');
            
            try {
                // Get movie title from cache using message ID
                const movieTitle = movieTitleCache.get(messageId);
                if (!movieTitle) {
                    throw new Error('Movie information not found');
                }

                // Store with combined key of messageId and actorName
                const cacheKey = `${messageId}_${actorName}`;
                messageActorCache.set(cacheKey, movieTitle);

                // Show loading message
                await bot.editMessageCaption('🔍 Fetching actor information...', {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'HTML'
                });

                const actorInfo = await fetchActorInfo(actorName);
                let formattedInfo = formatActorInfo(actorInfo);

                // Update message with actor info and include messageId in callback data
                if (actorInfo.profile_path) {
                    await bot.editMessageMedia({
                        type: 'photo',
                        media: actorInfo.profile_path,
                        caption: formattedInfo,
                        parse_mode: 'HTML'
                    }, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: {
                            inline_keyboard: [[
                                { 
                                    text: '« Back to Movie', 
                                    callback_data: `back_to_movie:${messageId}_${actorName}` 
                                }
                            ]]
                        }
                    });
                }
            } catch (error) {
                console.error('Error in callback query:', error);
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Failed to fetch actor information: ' + error.message,
                    show_alert: true
                });
            }
        } else if (query.data.startsWith('back_to_movie:')) {
            try {
                // Extract messageId and actorName from callback data
                const [messageId, actorName] = query.data.replace('back_to_movie:', '').split('_');
                const cacheKey = `${messageId}_${actorName}`;
                
                // Get movie title from the message-specific cache
                const movieTitle = messageActorCache.get(cacheKey);
                
                if (!movieTitle) {
                    throw new Error('Movie information not found');
                }

                // Get the movie info
                const movieInfo = await fetchMovieInfo(movieTitle);
                const formattedInfo = formatMovieInfo(movieInfo);
                
                // Create actor buttons with message-specific callback data
                const actorButtons = movieInfo.Actors.split(', ').map(actor => ({
                    text: actor,
                    callback_data: `actor:${actor}`
                }));
                
                // Arrange buttons in rows of 2
                const keyboard = {
                    inline_keyboard: actorButtons.reduce((rows, button, index) => {
                        if (index % 2 === 0) {
                            rows.push([button]);
                        } else {
                            rows[rows.length - 1].push(button);
                        }
                        return rows;
                    }, [])
                };

                // Update message with movie info
                if (movieInfo.Poster && movieInfo.Poster !== 'N/A') {
                    await bot.editMessageMedia({
                        type: 'photo',
                        media: movieInfo.Poster,
                        caption: formattedInfo,
                        parse_mode: 'HTML'
                    }, {
                        chat_id: chatId,
                        message_id: messageId,
                        reply_markup: keyboard
                    });
                } else {
                    await bot.editMessageCaption(formattedInfo, {
                        chat_id: chatId,
                        message_id: messageId,
                        parse_mode: 'HTML',
                        reply_markup: keyboard
                    });
                }
            } catch (error) {
                console.error('Error returning to movie:', error);
                await bot.answerCallbackQuery(query.id, {
                    text: '❌ Failed to return to movie information: ' + error.message,
                    show_alert: true
                });
            }
        }
    });
} 