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
    const commandHandler = async (msg) => {
        const chatId = msg.chat.id;
        const firstName = msg.from.first_name;
        
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
    bot.onText(/^\/start$/, (msg) => {
        const userId = msg.from.id;
        const now = Date.now();
        
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
        
        commandHandler(msg);
    });
}