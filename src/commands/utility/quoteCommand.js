async function fetchQuote() {
    // List of quote API endpoints in order of preference
    const APIs = [
        {
            url: 'https://zenquotes.io/api/random',
            transform: (data) => ({
                text: data[0].q,
                author: data[0].a
            })
        },
        {
            url: 'https://api.quotable.io/random',
            transform: (data) => ({
                text: data.content,
                author: data.author
            })
        }
    ];

    // Try each API in sequence until one works
    for (const api of APIs) {
        try {
            const response = await fetch(api.url);
            if (!response.ok) continue;
            
            const data = await response.json();
            return api.transform(data);
        } catch (error) {
            console.error(`Error with ${api.url}:`, error);
            continue; // Try next API
        }
    }

    // If all APIs fail, throw an error
    throw new Error('Unable to fetch quotes from any available source');
}

export function setupQuoteCommand(bot) {
    bot.onText(/\/(quote|qt)/, async (msg) => {
        const chatId = msg.chat.id;
        
        try {
            await bot.sendChatAction(chatId, 'typing');
            
            const quote = await fetchQuote();
            const formattedQuote = `*${quote.text}*\n— *${quote.author}*`;
            
            await bot.sendMessage(chatId, formattedQuote, {
                parse_mode: 'Markdown'
            });
        } catch (error) {
            console.error('Error in quote command:', error);
            await bot.sendMessage(chatId, '😔 Having trouble fetching quotes at the moment. Please try again later.');
        }
    });
} 