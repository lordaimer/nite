import axios from 'axios';

// Lingva API endpoints with fallbacks
const LINGVA_INSTANCES = [
    'https://lingva.ml',
    'https://lingva.fossdaily.xyz',
    'https://translate.plausibility.cloud',
    'https://lingva.pussthecat.org'
].map(url => `${url}/api/v1`);

// Supported languages with their codes
const SUPPORTED_LANGUAGES = {
    'auto': 'Auto Detect',
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi'
};

// Add this helper function at the top level
const normalizeLanguageCode = (input) => {
    if (!input) return null;
    
    // Convert to lowercase for consistency
    input = input.toLowerCase().trim();
    
    // Direct match with language code
    if (SUPPORTED_LANGUAGES[input]) {
        return input;
    }
    
    // Match full language name to code
    const languageEntry = Object.entries(SUPPORTED_LANGUAGES)
        .find(([_, name]) => name.toLowerCase() === input);
    
    return languageEntry ? languageEntry[0] : null;
};

async function translateWithFallback(text, targetLang, sourceLang = 'auto') {
    let lastError;
    
    // Try each instance until one works
    for (const apiUrl of LINGVA_INSTANCES) {
        try {
            const response = await axios.get(
                `${apiUrl}/${sourceLang}/${targetLang}/${encodeURIComponent(text)}`,
                { timeout: 5000 } // 5 second timeout
            );
            
            return {
                translated: response.data.translation,
                detectedSourceLang: response.data.info?.detectedSource || sourceLang
            };
        } catch (error) {
            console.error(`Translation error with ${apiUrl}:`, error.message);
            lastError = error;
            continue; // Try next instance
        }
    }
    
    // If all instances failed
    throw lastError || new Error('All translation services failed');
}

// Helper function to create language selection keyboard
const getLanguageKeyboard = () => {
    const keyboard = [];
    const languages = Object.entries(SUPPORTED_LANGUAGES)
        .filter(([code]) => code !== 'auto'); // Remove auto-detect option
    
    // Create rows of 2 buttons each
    for (let i = 0; i < languages.length; i += 2) {
        const row = languages.slice(i, i + 2).map(([code, name]) => ({
            text: name,
            callback_data: `translate_${code}`
        }));
        keyboard.push(row);
    }

    // Add cancel button at the bottom
    keyboard.push([{ text: 'Cancel', callback_data: 'translate_cancel' }]);

    return {
        reply_markup: {
            inline_keyboard: keyboard
        }
    };
};

// When showing help message, use this keyboard
const getQuickAccessKeyboard = () => ({
    reply_markup: {
        inline_keyboard: [
            [
                { text: 'English', callback_data: 'translate_en' },
                { text: 'German', callback_data: 'translate_de' }
            ],
            [
                { text: 'French', callback_data: 'translate_fr' },
                { text: 'Spanish', callback_data: 'translate_es' }
            ],
            [
                { text: 'Japanese', callback_data: 'translate_ja' },
                { text: 'Chinese', callback_data: 'translate_zh' }
            ],
            [
                { text: 'Show All Languages', callback_data: 'translate_more' }
            ]
        ]
    }
});

// When showing "Translate Another" button
const getTranslateAnotherKeyboard = () => ({
    reply_markup: {
        inline_keyboard: [[
            { text: 'Translate Another', callback_data: 'translate_start' }
        ]]
    }
});

export function setupTranslateCommand(bot) {
    // Track users in translation mode
    const translateModeUsers = new Map();

    // Handle /translate, /trans, or /trns command with exact matching
    bot.onText(/^\/(?:translate|trans|trns)$/, async (msg) => {
        const chatId = msg.chat.id;
        
        // Show help message and quick access keyboard
        await bot.sendMessage(
            chatId,
            `*Translation Help*
            
To translate text, use one of these formats:
/translate [language] [text]
/trans [language] [text]
/trns [language] [text]

Examples:
/translate es Hello world
/trans spanish How are you?
/trns japanese Good morning`,
            {
                parse_mode: 'Markdown',
                reply_markup: getQuickAccessKeyboard()
            }
        );
    });

    // Handle translation with parameters
    bot.onText(/^\/(?:translate|trans|trns)\s+([^]+?)\s+(.+)$/, async (msg, match) => {
        const chatId = msg.chat.id;
        const targetLangInput = match[1]?.trim();
        const text = match[2]?.trim();

        // Normalize the language input
        const normalizedLangCode = normalizeLanguageCode(targetLangInput);

        // If we have text but no valid language code, show language selection menu
        if ((!targetLangInput || !normalizedLangCode) && text) {
            await showLanguageSelectionMenu(chatId, text);
            return;
        }

        // Direct translation with valid language parameter
        if (normalizedLangCode && text) {
            try {
                const result = await translateWithFallback(text, normalizedLangCode);
                await bot.sendMessage(
                    chatId,
                    `*Original*: ${text}\n\n*Translation*: \`${result.translated}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: getTranslateAnotherKeyboard()
                    }
                );
            } catch (error) {
                await showLanguageSelectionMenu(chatId, text);
            }
        }
    });

    // When language parameter is invalid or not provided, show quick language selection
    const showLanguageSelectionMenu = async (chatId, text) => {
        // Store the text to translate
        translateModeUsers.set(chatId, { text });

        // Popular languages in 2 columns
        const popularLanguages = [
            ['English', 'en'],
            ['Spanish', 'es'],
            ['Chinese', 'zh'],
            ['Japanese', 'ja'],
            ['Russian', 'ru'],
            ['German', 'de'],
            ['Italian', 'it'],
            ['Hindi', 'hi']
        ];

        const keyboard = [];
        for (let i = 0; i < popularLanguages.length; i += 2) {
            const row = [];
            row.push({
                text: popularLanguages[i][0],
                callback_data: `translate_${popularLanguages[i][1]}`
            });
            if (i + 1 < popularLanguages.length) {
                row.push({
                    text: popularLanguages[i + 1][0],
                    callback_data: `translate_${popularLanguages[i + 1][1]}`
                });
            }
            keyboard.push(row);
        }

        await bot.sendMessage(
            chatId,
            `Select a language or type any language name:

*Text to translate:*
${text}

Examples: Korean, Arabic, Portuguese, Vietnamese, etc.`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: keyboard
                }
            }
        );
    };

    // Handle custom language input
    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        const session = translateModeUsers.get(chatId);
        
        // Only process if user is in translation mode and message is text
        if (session?.text && msg.text && !msg.text.startsWith('/')) {
            try {
                const result = await translateWithFallback(session.text, msg.text.toLowerCase());
                await bot.sendMessage(
                    chatId,
                    `*Original*: ${session.text}\n\n*Translation*: \`${result.translated}\``,
                    {
                        parse_mode: 'Markdown',
                        reply_markup: getTranslateAnotherKeyboard()
                    }
                );
                translateModeUsers.delete(chatId);
            } catch (error) {
                let errorMessage = 'Translation failed. ';
                
                if (error.response?.status === 429) {
                    errorMessage += 'Rate limit exceeded. Please try again later.';
                } else if (error.response?.status === 400) {
                    errorMessage += 'Invalid language specified. Please try a different language name.';
                } else {
                    errorMessage += 'Please try again.';
                }
                
                await bot.sendMessage(
                    chatId,
                    errorMessage,
                    { parse_mode: 'Markdown' }
                );
            }
        }
    });

    // Handle callback queries
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const data = query.data;

        if (!data.startsWith('translate_')) return;

        const lang = data.replace('translate_', '');
        const session = translateModeUsers.get(chatId);

        if (!session) return;

        try {
            if (lang === 'cancel') {
                translateModeUsers.delete(chatId);
                await bot.editMessageText(
                    '❌ Translation cancelled.',
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    }
                );
                return;
            }

            // Show translation in progress
            await bot.editMessageText(
                '🔄 *Translating...*',
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );

            const result = await translateWithFallback(session.text, lang);
            const sourceLangName = SUPPORTED_LANGUAGES[result.detectedSourceLang] || result.detectedSourceLang;
            const targetLangName = SUPPORTED_LANGUAGES[lang];

            await bot.editMessageText(
                `🔤 *Original* (${sourceLangName}):\n${session.text}\n\n` +
                `🌐 *Translation* (${targetLangName}):\n\`${result.translated}\``,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: getTranslateAnotherKeyboard()
                }
            );

            // Clear the session
            translateModeUsers.delete(chatId);

        } catch (error) {
            console.error('Translation error:', error);
            await bot.editMessageText(
                '❌ Sorry, translation failed. Please try again later.',
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );
            translateModeUsers.delete(chatId);
        }
    });
} 