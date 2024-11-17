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

async function fetchAuthorImage(authorName) {
    // Skip image fetch for undefined, unknown or empty authors
    if (!authorName || authorName.toLowerCase().includes('unknown') || authorName.trim() === '') {
        return null;
    }

    try {
        // Try Wikimedia API first
        const wikiQuery = encodeURIComponent(`${authorName}`);
        const wikiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${wikiQuery}&gsrlimit=1&prop=imageinfo&iiprop=url&format=json&origin=*`;

        const wikiResponse = await fetch(wikiUrl);
        const wikiData = await wikiResponse.json();

        if (wikiData.query && wikiData.query.pages) {
            const pages = Object.values(wikiData.query.pages);
            if (pages.length > 0 && pages[0].imageinfo && pages[0].imageinfo[0].url) {
                return pages[0].imageinfo[0].url;
            }
        }

        // Fallback to Unsplash API
        const unsplashAccessKey = process.env.UNSPLASH_ACCESS_KEY;
        if (!unsplashAccessKey) {
            throw new Error('Unsplash API key not configured');
        }

        const unsplashUrl = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(authorName + ' portrait')}&per_page=1`;
        const unsplashResponse = await fetch(unsplashUrl, {
            headers: {
                'Authorization': `Client-ID ${unsplashAccessKey}`
            }
        });

        const unsplashData = await unsplashResponse.json();
        if (unsplashData.results && unsplashData.results.length > 0) {
            return unsplashData.results[0].urls.regular;
        }

        return null;
    } catch (error) {
        console.error('Error fetching author image:', error);
        return null;
    }
}

export function setupQuoteCommand(bot) {
    bot.onText(/\/(quote|qt)/, async (msg) => {
        const chatId = msg.chat.id;

        try {
            await bot.sendChatAction(chatId, 'typing');

            const quote = await fetchQuote();
            const formattedQuote = `*${quote.text}*\n${quote.author ? `— *${quote.author}*` : ''}`;

            // Only fetch image if we have a valid author
            const authorImage = quote.author ? await fetchAuthorImage(quote.author) : null;

            if (authorImage) {
                // Send image with quote as caption
                await bot.sendPhoto(chatId, authorImage, {
                    caption: formattedQuote,
                    parse_mode: 'Markdown'
                });
            } else {
                // Send text-only quote
                await bot.sendMessage(chatId, formattedQuote, {
                    parse_mode: 'Markdown'
                });
            }
        } catch (error) {
            console.error('Error in quote command:', error);
            await bot.sendMessage(chatId, '😔 Having trouble fetching quotes at the moment. Please try again later.');
        }
    });
}