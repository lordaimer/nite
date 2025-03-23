import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const APIS = {
    TRUTH_DARE_BOT: 'https://api.truthordarebot.xyz/v1',
    API_NINJAS: 'https://api.api-ninjas.com/v1/truthordare'
};

const API_KEYS = {
    NINJA: process.env.NINJA_API_KEY
};

// Set default rating to R with 70% chance, PG13 with 30% chance
const getRandomRating = () => Math.random() < 0.7 ? 'r' : 'pg13';

// Keywords that indicate group context (questions to filter out)
const groupContextKeywords = [
    'group', 'room', 'everyone', 'anybody', 'anyone',
    'somebody', 'someone', 'people', 'friends', 'players',
    'person to your left', 'person to your right', 'classmate',
    'colleague', 'coworker', 'friend', 'crush', 'class',
    'school', 'work'
];

// Keywords that indicate couple context (good questions)
const coupleContextKeywords = [
    'partner', 'relationship', 'intimate', 'romance', 'romantic',
    'love', 'kiss', 'date', 'bedroom', 'together', 'sex',
    'sensual', 'pleasure', 'touch', 'body', 'passion'
];

function isQuestionCoupleAppropriate(question) {
    if (!question) return false;
    const lowerQuestion = question.toLowerCase();
    
    const hasGroupContext = groupContextKeywords.some(keyword => 
        lowerQuestion.includes(keyword.toLowerCase())
    );
    
    if (hasGroupContext) return false;
    
    const hasCoupleContext = coupleContextKeywords.some(keyword => 
        lowerQuestion.includes(keyword.toLowerCase())
    );
    
    return hasCoupleContext || !hasGroupContext;
}

async function fetchFromTruthDareBot(type, rating) {
    try {
        const response = await fetch(`${APIS.TRUTH_DARE_BOT}/${type}?rating=${rating}&category=romantic`);
        const data = await response.json();
        return data.question;
    } catch (error) {
        console.error('TruthDareBot API Error:', error);
        return null;
    }
}

async function fetchFromApiNinjas(type) {
    try {
        const response = await fetch(`${APIS.API_NINJAS}?type=${type}`, {
            headers: {
                'X-Api-Key': API_KEYS.NINJA
            }
        });
        const data = await response.json();
        return data[0]?.question;
    } catch (error) {
        console.error('API Ninjas Error:', error);
        return null;
    }
}

async function fetchTruthOrDare(type, messageInfo) {
    const { chatId, messageId, bot } = messageInfo;
    const MAX_RETRIES = 5;
    
    for (let retryCount = 1; retryCount <= MAX_RETRIES; retryCount++) {
        try {
            // Update message to show retry attempt
            if (retryCount > 1) {
                await bot.editMessageText(`Retrying... (${retryCount}/${MAX_RETRIES})`, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown'
                });
            }

            const rating = getRandomRating();
            // 60% chance for TruthDareBot, 40% for API Ninjas
            const useFirstApi = Math.random() < 0.6;
            let question;

            if (useFirstApi) {
                question = await fetchFromTruthDareBot(type, rating);
            } else {
                question = await fetchFromApiNinjas(type);
            }
            
            if (question && isQuestionCoupleAppropriate(question)) {
                return {
                    question,
                    rating,
                    success: true
                };
            }

            // Small delay between retries to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error(`Error on retry ${retryCount}:`, error);
            // Continue to next retry
        }
    }
    
    // If we get here, all retries failed
    return {
        question: 'Unable to fetch a question right now. Please try again later.',
        rating: 'unknown',
        success: false
    };
}

export function setupTruthOrDareCommand(bot) {
    // Command handler for /trd
    bot.onText(/\/(trd|truthordare)/, async (msg) => {
        const chatId = msg.chat.id;
        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: 'Truth', callback_data: 'truth' },
                        { text: 'Dare', callback_data: 'dare' }
                    ]
                ]
            }
        };

        await bot.sendMessage(chatId, 'Choose your destiny:', opts);
    });

    // Handle button callbacks
    bot.on('callback_query', async (query) => {
        if (!['truth', 'dare'].includes(query.data)) return;
        
        const type = query.data;
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        // First, update message to show we're fetching
        await bot.editMessageText('Fetching...', {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        });

        const result = await fetchTruthOrDare(type, {
            chatId,
            messageId,
            bot
        });

        const messageText = result.success 
            ? `*${type.charAt(0).toUpperCase() + type.slice(1)}:* ${result.question}`
            : result.question;
        
        await bot.editMessageText(messageText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'Markdown'
        });
    });
}
