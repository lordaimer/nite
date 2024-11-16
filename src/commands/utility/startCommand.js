export function setupStartCommand(bot) {
    bot.onText(/\/start/, (msg) => {
        const chatId = msg.chat.id;
        const firstName = msg.from.first_name;
        
        const hour = new Date().getHours();
        
        let greeting;
        if (hour >= 5 && hour < 12) {
            greeting = `Good Morning ${firstName}! 🌅`;
        } else if (hour >= 12 && hour < 17) {
            greeting = `Good Afternoon ${firstName}! ☀️`;
        } else if (hour >= 17 && hour < 22) {
            greeting = `Good Evening ${firstName}! 🌆`;
        } else {
            greeting = `Good Night ${firstName}! 🌙`;
        }

        bot.sendMessage(chatId, greeting);
    });
}