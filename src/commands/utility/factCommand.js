import fetch from 'node-fetch';
import natural from 'natural';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const TfIdf = natural.TfIdf;
const tokenizer = new natural.WordTokenizer();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read stopwords from JSON file
const stopwordsData = JSON.parse(
    readFileSync(
        join(__dirname, '../../data/stopwords.json'),
        'utf8'
    )
);

const stopwords = new Set(stopwordsData.stopwords);

function getKeywordsFromText(text) {
    // Tokenize and clean the text
    const words = tokenizer.tokenize(text.toLowerCase())
        .filter(word => 
            word.length > 3 && 
            !stopwords.has(word) && 
            /^[a-zA-Z]+$/.test(word)
        );

    // Use TF-IDF to find important words
    const tfidf = new TfIdf();
    tfidf.addDocument(words);

    // Get the top 2-3 most significant keywords
    const terms = tfidf.listTerms(0)
        .filter(term => !stopwords.has(term.term))  // Double check against stopwords
        .slice(0, 3)
        .map(term => term.term);

    // If we have less than 2 keywords, try to get nouns from the text
    if (terms.length < 2) {
        const lexicon = new natural.Lexicon('EN', 'N');
        const ruleSet = new natural.RuleSet('EN');
        const tagger = new natural.BrillPOSTagger(lexicon, ruleSet);
        
        const taggedWords = tagger.tag(words).taggedWords;
        const nouns = taggedWords
            .filter(word => word.tag.startsWith('N'))  // Get only nouns
            .map(word => word.token)
            .filter(word => !stopwords.has(word))
            .slice(0, 3 - terms.length);  // Get enough nouns to have 3 keywords total
        
        terms.push(...nouns);
    }

    return terms.join(' ');
}

async function getRelatedImage(keywords) {
    try {
        // Try Unsplash API first (free tier: 50 requests/hour)
        const unsplashUrl = `https://api.unsplash.com/photos/random?query=${encodeURIComponent(keywords)}&orientation=landscape`;
        const response = await fetch(unsplashUrl, {
            headers: {
                'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
            }
        });

        if (response.ok) {
            const data = await response.json();
            return data.urls.regular;
        }

        // Fallback to Pixabay API (free tier: 5000 requests/hour)
        const pixabayUrl = `https://pixabay.com/api/?key=${process.env.PIXABAY_API_KEY}&q=${encodeURIComponent(keywords)}&orientation=horizontal&per_page=1`;
        const pixabayResponse = await fetch(pixabayUrl);

        if (pixabayResponse.ok) {
            const pixabayData = await pixabayResponse.json();
            if (pixabayData.hits && pixabayData.hits.length > 0) {
                return pixabayData.hits[0].webformatURL;
            }
        }

        throw new Error('No images found from both APIs');
    } catch (error) {
        console.error('Error fetching image:', error);
        return null;
    }
}

async function getFact(category = '') {
    try {
        // Try Ninja API first
        const apiKey = process.env.NINJA_API_KEY;
        const ninjaUrl = `https://api.api-ninjas.com/v1/facts${category ? `?category=${category}` : ''}`;
        
        const response = await fetch(ninjaUrl, {
            headers: {
                'X-Api-Key': apiKey
            }
        });
        
        if (!response.ok) {
            throw new Error(`API responded with status ${response.status}`);
        }

        const data = await response.json();
        if (!data || !Array.isArray(data) || data.length === 0) {
            throw new Error('Invalid data format received');
        }

        const fact = data[0].fact;
        const keywords = getKeywordsFromText(fact);
        const imageUrl = keywords ? await getRelatedImage(keywords) : null;

        return { fact, imageUrl };

    } catch (error) {
        // Fallback to useless facts API
        try {
            const fallbackUrl = 'https://uselessfacts.jsph.pl/api/v2/facts/random';
            const fallbackResponse = await fetch(fallbackUrl);
            
            if (!fallbackResponse.ok) {
                throw new Error(`Fallback API responded with status ${fallbackResponse.status}`);
            }

            const fallbackData = await fallbackResponse.json();
            const fact = fallbackData.text;
            const keywords = getKeywordsFromText(fact);
            const imageUrl = keywords ? await getRelatedImage(keywords) : null;

            return { fact, imageUrl };

        } catch (fallbackError) {
            return { 
                fact: 'Sorry, couldn\'t fetch a fact right now. Please try again later.',
                imageUrl: null 
            };
        }
    }
}

const categories = [
    { text: ' Random', callback_data: 'fact_random' },
    { text: ' Science', callback_data: 'fact_science' },
    { text: ' Animals', callback_data: 'fact_animals' },
    { text: ' History', callback_data: 'fact_history' },
    { text: ' Art', callback_data: 'fact_art' },
    { text: ' Culture', callback_data: 'fact_culture' }
];

function getCategoryKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                categories.slice(0, 2),
                categories.slice(2, 4),
                categories.slice(4, 6)
            ]
        }
    };
}

function getFactKeyboard(category) {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: ' Another Fact', callback_data: `fact_${category}` },
                    { text: ' Change Category', callback_data: 'fact_categories' }
                ]
            ]
        }
    };
}

export function setupFactCommand(bot) {
    // Handle /fact, /facts, and /ft commands
    const commandRegex = /^\/(?:fact|facts|ft)$/;
    bot.onText(commandRegex, async (msg) => {
        const chatId = msg.chat.id;
        await bot.sendMessage(
            chatId,
            'Choose a category for your fact:',
            getCategoryKeyboard()
        );
    });

    // Handle callback queries
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;
        const data = query.data;

        if (!data.startsWith('fact_')) return;

        const category = data.replace('fact_', '');

        try {
            // For category selection
            if (category === 'categories') {
                // Delete the current message (whether it's a photo or text)
                await bot.deleteMessage(chatId, messageId);
                
                // Send new category selection message
                await bot.sendMessage(
                    chatId,
                    'Choose a category for your fact:',
                    getCategoryKeyboard()
                );
                return;
            }

            // For fetching new facts
            const loadingMsg = await bot.sendMessage(chatId, ' Fetching an interesting fact...');
            await bot.deleteMessage(chatId, messageId); // Delete the previous fact

            const { fact, imageUrl } = await getFact(category === 'random' ? '' : category);

            // Delete loading message
            await bot.deleteMessage(chatId, loadingMsg.message_id);

            // Send the fact with image if available
            if (imageUrl) {
                await bot.sendPhoto(chatId, imageUrl, {
                    caption: fact,
                    reply_markup: getFactKeyboard(category).reply_markup
                });
            } else {
                await bot.sendMessage(
                    chatId, 
                    fact,
                    getFactKeyboard(category)
                );
            }
        } catch (error) {
            console.error('Error in fact callback:', error);
            
            // Try to delete the loading message if it exists
            try {
                await bot.deleteMessage(chatId, loadingMsg?.message_id);
            } catch (e) {
                // Ignore deletion errors
            }
            
            await bot.sendMessage(
                chatId,
                ' Sorry, something went wrong. Please try again.',
                getCategoryKeyboard()
            );
        }
    });
}

export { getFact };