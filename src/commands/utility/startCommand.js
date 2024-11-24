export function setupStartCommand(bot, limit) {
    // Collection of casual greetings
    const casualGreetings = [
        "Hey",
        "Hi",
        "Hello"
    ];

    // Get random casual greeting
    const getRandomGreeting = (name) => `${casualGreetings[Math.floor(Math.random() * casualGreetings.length)]}, ${name}!`;

    // Get time-appropriate greeting
    const getTimeGreeting = (name, hour) => {
        if (hour >= 4 && hour < 12) {
            return `Good morning, ${name}!`;
        } else if (hour >= 12 && hour < 17) {
            return `Good afternoon, ${name}!`;
        } else if (hour >= 17 && hour < 20) {
            return `Good evening, ${name}!`;
        } else {
            return `Good night, ${name}!`;
        }
    };

    // Create the command handler
    const commandHandler = async (msg, gameId = null) => {
        const chatId = msg.chat.id;
        const firstName = msg.from.first_name;
        
        // If this is a game invite
        if (gameId) {
            try {
                // Escape special characters in the URL
                const escapedUrl = `https://t.me/niitebot?start=game_${gameId}`.replace(/_/g, '\\_');
                
                const gameInviteMessage = `🎮 Tic Tac Toe Game Invite\n\n${firstName} wants to play Tic Tac Toe with you!\n\n🔗 Join the game: ${escapedUrl}`;
                
                await bot.sendMessage(chatId, gameInviteMessage, { 
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
                
                // Send a message to the game host
                if (msg.text?.startsWith('/start game_')) {
                    console.log('Processing game invite join. Game ID:', gameId);
                    // This is the joining player
                    const [hostChatId] = gameId.split('-'); // First part of gameId is timestamp which we'll use as host's chat ID
                    
                    if (!hostChatId) {
                        console.error('Invalid game ID format:', gameId);
                        return;
                    }

                    console.log('Attempting to notify host. Host Chat ID:', hostChatId);
                    
                    try {
                        await bot.sendMessage(hostChatId, `🎮 ${firstName} is waiting to play Tic Tac Toe!\n\nClick the button below to join the game:`, {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[{
                                    text: '🎮 Join Game',
                                    web_app: { url: `${process.env.BASE_URL}/games/tictactoe/tictactoe.html?mode=online&gameId=${gameId}&role=host` }
                                }]]
                            }
                        });
                        console.log('Successfully notified host');
                    } catch (hostNotifyError) {
                        console.error('Failed to notify host:', hostNotifyError);
                        // Send a message to the joining player if we couldn't notify the host
                        await bot.sendMessage(chatId, '⚠️ Unable to notify the game host. You can try joining the game directly:', {
                            parse_mode: 'Markdown',
                            reply_markup: {
                                inline_keyboard: [[{
                                    text: '🎮 Join Game',
                                    web_app: { url: `${process.env.BASE_URL}/games/tictactoe/tictactoe.html?mode=online&gameId=${gameId}&role=guest` }
                                }]]
                            }
                        });
                    }
                }
            } catch (error) {
                console.error('Error processing game invite:', error);
                await bot.sendMessage(chatId, '❌ Sorry, there was an error processing the game invite. Please try again.');
            }
            return;
        }
        
        // Regular start command handling
        const now = new Date();
        const hour = now.getHours();
        
        // Format the date
        const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        const dateStr = now.toLocaleDateString('en-US', options);
        
        // Randomly choose between casual and time-based greeting
        const greeting = Math.random() < 0.5 ? getRandomGreeting(firstName) : getTimeGreeting(firstName, hour);
        
        let timeEmoji;
        if (hour >= 4 && hour < 12) {
            timeEmoji = '🌅';
        } else if (hour >= 12 && hour < 17) {
            timeEmoji = '☀️';
        } else if (hour >= 17 && hour < 20) {
            timeEmoji = '🌆';
        } else {
            timeEmoji = '🌙';
        }

        const message = `${greeting} ${timeEmoji}\n${dateStr}`;
        await bot.sendMessage(chatId, message);
    };

    // Set up the command with rate limiting
    bot.onText(/^\/start(?:(?:\s+game_([a-zA-Z0-9-]+))|$)/, (msg, match) => {
        const userId = msg.from.id;
        const now = Date.now();
        const gameId = match ? match[1] : null;
        
        // Initialize user's rate limit data if not exists
        if (!limit.lastRequest) limit.lastRequest = {};
        if (!limit.requestCount) limit.requestCount = {};
        
        // Reset count if window has passed
        if (!limit.lastRequest[userId] || (now - limit.lastRequest[userId]) >= limit.window) {
            limit.requestCount[userId] = 0;
        }
        
        // Check if within rate limits
        if (limit.requestCount[userId] >= limit.requests) {
            return;
        }
        
        // Update rate limit tracking
        limit.lastRequest[userId] = now;
        limit.requestCount[userId] = (limit.requestCount[userId] || 0) + 1;
        
        commandHandler(msg, gameId);
    });
}