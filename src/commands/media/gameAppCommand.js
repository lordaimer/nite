// We'll store the dynamic URL here
let currentMiniAppUrl = process.env.MINI_APP_URL || 'https://your-mini-app-url.com';

// Function to update the Mini App URL
export function updateMiniAppUrl(newUrl) {
    currentMiniAppUrl = newUrl;
    console.log('🔄 Updated Mini App URL:', currentMiniAppUrl);
}

async function handleCommand(bot, msg, rateLimitService) {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    try {
        // Check rate limit if service is provided
        if (rateLimitService && !rateLimitService.check(userId, 'game_app', 10, 60000)) {
            await bot.sendMessage(
                chatId,
                '⚠️ You\'re using this command too frequently. Please wait a moment.',
                { parse_mode: 'Markdown' }
            );
            return;
        }

        const inlineKeyboard = {
            inline_keyboard: [[{
                text: '🎮 Play Games',
                web_app: { url: currentMiniAppUrl }
            }]]
        };

        await bot.sendMessage(
            chatId,
            '🎮 Welcome to Nite Games! Click below to enter the game hub:',
            { reply_markup: inlineKeyboard }
        );
    } catch (error) {
        console.error('Error in game command:', error);
        await bot.sendMessage(
            chatId,
            '❌ Sorry, there was an error launching the game hub. Please try again later.'
        );
    }
}

export function setupGameAppCommand(bot, rateLimitService) {
    bot.onText(/^\/(game|gm)$/, (msg) => handleCommand(bot, msg, rateLimitService));
    console.log('✅ Game app command is loaded!');
}
