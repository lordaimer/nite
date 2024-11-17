import fetch from 'node-fetch';

const API_BASE_URL = 'https://api.truthordarebot.xyz/v1';
// Set default rating to R with 70% chance, PG13 with 30% chance
const getRandomRating = () => Math.random() < 0.7 ? 'r' : 'pg13';

// Keywords to detect and replace in questions
const replacements = {
    'your friends': 'your partner',
    'someone in this room': 'your partner',
    'the group': 'your partner',
    'everyone here': 'your partner',
    'the person to your': 'your partner',
    'anyone here': 'your partner',
    'someone here': 'your partner'
};

function makeQuestionCoupleOriented(question) {
    let modifiedQuestion = question.toLowerCase();
    
    // Apply replacements
    for (const [key, value] of Object.entries(replacements)) {
        modifiedQuestion = modifiedQuestion.replace(new RegExp(key, 'gi'), value);
    }
    
    // Capitalize first letter
    return modifiedQuestion.charAt(0).toUpperCase() + modifiedQuestion.slice(1);
}

async function fetchTruthOrDare(type) {
    try {
        const rating = getRandomRating();
        // Add romantic category to get more couple-oriented questions
        const response = await fetch(`${API_BASE_URL}/${type}?rating=${rating}&category=romantic`);
        const data = await response.json();
        
        if (!data.question) {
            throw new Error('No question received');
        }

        const modifiedQuestion = makeQuestionCoupleOriented(data.question);
        
        return {
            question: modifiedQuestion,
            rating
        };
    } catch (error) {
        console.error(`Error fetching ${type}:`, error);
        // Fallback questions if API fails
        const fallbackQuestions = {
            truth: {
                r: [
                    "What's your wildest fantasy involving us?",
                    "What's the most intimate thing you want to try with me?",
                    "What's the sexiest thing about me?",
                    "What's your favorite memory of us together?",
                    "What's something you've been too shy to tell me?",
                ],
                pg13: [
                    "What was your first impression of me?",
                    "What's your favorite physical feature of mine?",
                    "What's the most romantic thing you want us to do together?",
                    "What's your favorite moment we've shared?",
                    "What made you fall for me?",
                ]
            },
            dare: {
                r: [
                    "Give your partner a sensual massage for 5 minutes",
                    "Whisper your wildest fantasy in your partner's ear",
                    "Do a seductive dance for your partner",
                    "Kiss your partner in a place you've never kissed before",
                    "Describe what you want to do to your partner tonight in detail",
                ],
                pg13: [
                    "Give your partner a 30-second neck massage",
                    "Write a short love poem for your partner right now",
                    "Do your best romantic slow dance together",
                    "Give your partner 5 compliments in 30 seconds",
                    "Act out how you'd rescue your partner from danger",
                ]
            }
        };
        
        const questions = fallbackQuestions[type][rating];
        const randomIndex = Math.floor(Math.random() * questions.length);
        
        return {
            question: questions[randomIndex],
            rating
        };
    }
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
        const result = await fetchTruthOrDare(type);
        const messageText = type === 'dare' 
            ? `*Dare:* ${result.question}`
            : `*Truth:* ${result.question}`;
        
        await bot.editMessageText(messageText, {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
    });
}
