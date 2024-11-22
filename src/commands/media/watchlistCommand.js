import { getWatchlist, removeFromWatchlist } from '../../data/whattowatch/database.js';

const ITEMS_PER_PAGE = 5;

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
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: `🎬 ${movie.movie_title}\n📅 Added: ${new Date(movie.added_at).toLocaleDateString()}`,
                            show_alert: true
                        });
                    } else {
                        await bot.answerCallbackQuery(callbackQuery.id, {
                            text: '❌ Movie not found in watchlist',
                            show_alert: true
                        });
                    }
                    break;

                default:
                    await bot.answerCallbackQuery(callbackQuery.id, {
                        text: '❌ Invalid action',
                        show_alert: true
                    });
            }
        } catch (error) {
            console.error('Error in watchlist callback:', error);
            await bot.answerCallbackQuery(callbackQuery.id, {
                text: '❌ Something went wrong. Please try again.',
                show_alert: true
            });
        }
    });
}
