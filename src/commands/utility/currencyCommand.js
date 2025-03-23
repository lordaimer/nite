import URLParse from 'url-parse';
import fetch from 'node-fetch';
import nlp from 'compromise';

const API_BASE_URL = 'https://open.er-api.com/v6/latest';

// Extend compromise with specific currencies
nlp.extend((Doc, world) => {
    world.addWords({
        // Currency codes
        'usd': 'Currency', 'eur': 'Currency', 'cny': 'Currency', 
        'jpy': 'Currency', 'inr': 'Currency',
        // Currency names
        'dollar': 'Currency', 'euro': 'Currency', 'yuan': 'Currency',
        'yen': 'Currency', 'rupee': 'Currency', 'mark': 'Currency',
        // Plurals
        'dollars': 'Currency', 'euros': 'Currency', 'rupees': 'Currency'
    });
});

// Simplified currency mapping
const CURRENCY_MAP = {
    // Codes
    'usd': 'USD',    // US Dollar
    'eur': 'EUR',    // Euro
    'cny': 'CNY',    // Chinese Yuan
    'jpy': 'JPY',    // Japanese Yen
    'inr': 'INR',    // Indian Rupee
    'dem': 'DEM',    // German Mark
    
    // Names
    'dollar': 'USD',
    'euro': 'EUR',
    'yuan': 'CNY',
    'yen': 'JPY',
    'rupee': 'INR',
    'mark': 'DEM',
    
    // Plurals
    'dollars': 'USD',
    'euros': 'EUR',
    'rupees': 'INR',
    
    // Symbols
    '$': 'USD',
    '€': 'EUR',
    '¥': 'CNY',
    '₹': 'INR'
};

async function convertCurrency(amount, fromCurrency, toCurrency) {
    try {
        const url = new URLParse(`${API_BASE_URL}/${fromCurrency}`);
        const response = await fetch(url.toString());
        
        if (!response.ok) {
            return {
                success: false,
                error: 'Currency conversion failed'
            };
        }

        const data = await response.json();
        
        if (data.rates) {
            const rate = data.rates[toCurrency];
            const converted = amount * rate;

            return {
                success: true,
                converted: converted,
                rate: rate,
                time: new Date().toLocaleDateString()
            };
        }

        return {
            success: false,
            error: 'Exchange rate not available'
        };

    } catch (error) {
        return {
            success: false,
            error: 'Failed to get exchange rate'
        };
    }
}

async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
        }
    }
    throw new Error('Max retries reached');
}

export const setupCurrencyCommand = (bot) => {
    bot.onText(/\/(currency|cr)(.*)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const input = match[2].trim();

        if (!input) {
            const helpText = `
💱*Nite Currency Converter* 💱
Convert between major currencies!

*Supported Currencies:*
• USD (US Dollar) $
• EUR (Euro) €
• CNY (Chinese Yuan) ¥
• JPY (Japanese Yen)
• INR (Indian Rupee) ₹
• DEM (German Mark)

*Examples:*
• /cr 100 USD to INR
• /currency 50 euros to dollars
• /cr 1000 yen to rupees
• /currency 75 yuan to usd
`;
            bot.sendMessage(chatId, helpText, { parse_mode: 'Markdown' });
            return;
        }

        try {
            const parsedRequest = parseRequest(input);
            
            if (!parsedRequest.success) {
                bot.sendMessage(chatId, 
                    '❌ Could not understand the request.\nTry: /cr 100 USD to INR');
                return;
            }

            const { amount, fromCurrency, toCurrency } = parsedRequest;
            
            bot.sendChatAction(chatId, 'typing');

            const result = await convertCurrency(amount, fromCurrency, toCurrency);
            
            if (!result.success) {
                bot.sendMessage(chatId, '❌ ' + result.error);
                return;
            }

            const formatNumber = (num) => Math.round(num).toLocaleString('en-US');
            
            const response = `${formatNumber(amount)} ${fromCurrency} = *${formatNumber(result.converted)} ${toCurrency}*
Current Exchange Rate: *${formatNumber(result.rate)} ${toCurrency}*
_Last updated: ${result.time}_`;
            
            bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });

        } catch (error) {
            bot.sendMessage(chatId, ' Something went wrong. Please try again later.');
        }
    });
};

function parseRequest(text) {
    const doc = nlp(text.toLowerCase());
    
    // Extract number
    const numbers = doc.numbers().toNumber().out('array');
    const amount = numbers.length > 0 ? numbers[0] : null;

    if (!amount) return { success: false };

    // Find currencies
    const words = text.toLowerCase()
        .replace(/[.,!?]/g, '')
        .split(' ');
    
    let fromCurrency = null;
    let toCurrency = null;
    let foundTo = false;

    for (const word of words) {
        const currency = CURRENCY_MAP[word];
        if (currency) {
            if (!fromCurrency && !foundTo) {
                fromCurrency = currency;
            } else if (!toCurrency && foundTo) {
                toCurrency = currency;
            }
        }
        if (word === 'to' || word === 'in' || word === 'into') {
            foundTo = true;
        }
    }

    if (!fromCurrency || !toCurrency) return { success: false };

    return {
        success: true,
        amount,
        fromCurrency,
        toCurrency
    };
} 