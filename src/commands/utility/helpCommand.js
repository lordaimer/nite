export function setupHelpCommand(bot) {
    const COMMANDS_PER_PAGE = 4;
    
    // Define help message constant
    const HELP_MESSAGE = `Hi, My name is Nite
I am a versatile personal assistant bot currently under development.`;

    const HELP_KEYBOARD = {
        inline_keyboard: [
            [
                { text: 'Commands', callback_data: 'help_commands_1' },
                { text: 'About', callback_data: 'help_about' }
            ]
        ]
    };

    const commands = [
        {
            command: '/start',
            description: 'Start interacting with the bot',
            usage: '/start',
            examples: ['/start'],
            category: 'Utilities',
            note: '\nUse this command to begin interaction or restart the bot.'
        },
        {
            command: '/time, /tm',
            description: 'Display real-time chronological data',
            usage: '/time [timezone]',
            examples: [
                '/time GMT',
                '/time UTC+2',
                '/time America/New_York'
            ],
            category: 'Utilities'
        },
        {
            command: '/imagine, /image, /im',
            description: 'Generate images using AI',
            usage: '/imagine <prompt>',
            examples: [
                '/imagine a sunset over mountains',
                '/i cyberpunk city at night'
            ],
            category: 'AI Generation'
        },
        {
            command: '/currency, /cr',
            description: 'Real-time currency conversions',
            usage: '/currency <amount> <from> <to>',
            examples: [
                '/currency 100 USD EUR',
                '/cr 50 EUR JPY'
            ],
            category: 'Utilities'
        },
        {
            command: '/clear',
            description: 'Clear messages in the current chat',
            usage: '/clear [number | all]',
            examples: [
                '/clear 50 - Delete last 50 messages',
                '/clear all - Delete all messages',
                '/clear - Delete last 100 messages'
            ],
            category: 'Chat Management',
            note: '\nMessages older than 48 hours cannot be deleted due to Telegram limitations.'
        },
        {
            command: '/fact, /facts, /ft',
            description: 'Get interesting facts from various categories',
            usage: '/fact',
            examples: ['/fact'],
            category: 'Entertainment'
        },
        {
            command: '/meme, /mm',
            description: 'Get random memes from Reddit. You can specify a subreddit or use random for variety',
            usage: '/meme [subreddit | random]',
            examples: [
                '/meme - Get meme from default subreddit',
                '/meme dankmemes - Get memes from r/dankmemes',
                '/meme random - Get memes from random subreddits',
                '/mm programmerhumor - Get memes from r/programmerhumor'
            ],
            category: 'Entertainment',
        },
        {
            command: '/joke, /jk',
            description: 'Get random jokes',
            usage: '/joke',
            examples: ['/joke'],
            category: 'Entertainment'
        },
        {
            command: '/transcribe, /trcb',
            description: 'Transcribe voice messages to text',
            usage: '/transcribe',
            examples: [
                '/transcribe - Enter transcription mode',
                '/trcb - Short form command for transcription'
            ],
            category: 'Utilities',
            note: '\nSend a voice message after activating transcription mode. Use the Cancel button to exit the mode.'
        },
        {
            command: '/movie, /mv',
            description: 'Search for movie information with details and high-quality posters',
            usage: '/movie <title or IMDb ID>',
            examples: [
                '/movie The Matrix - Search by movie title',
                '/mv tt0133093 - Search by IMDb ID',
                '/movie The Matrix'
            ],
            category: 'Entertainment',
            note: '\nClicking on the movie title opens its IMDb page. The storyline text is copyable.'
        },
        {
            command: '/translate, /trns',
            description: 'Translate text between languages',
            usage: '/translate or /trns',
            examples: ['/translate', '/trns'],
            category: 'Utilities',
            note: '\nSupports multiple languages with auto-detection capability.'
        },
        {
            command: '/quote, /qt',
            description: 'Get random motivational quotes with authors and tags',
            usage: '/quote',
            examples: ['/quote', '/qt'],
            category: 'Entertainment',
            note: '\nClick "Another Quote" to get a new quote without using the command again.'
        },
        {
            command: '/download, /dl',
            description: 'Download videos from various platforms',
            usage: '/download <url>',
            examples: [
                '/download https://youtube.com/watch?v=...',
                '/dl https://vimeo.com/...'
            ],
            category: 'Media',
            note: '\nSupports multiple platforms including YouTube, Vimeo, and more.'
        },
        {
            command: '/whattowatch, /wtw',
            description: 'Get personalized movie and TV show recommendations',
            usage: '/whattowatch',
            examples: ['/whattowatch', '/wtw'],
            category: 'Entertainment',
            note: '\nUse the interactive buttons to refine your recommendations.'
        },
        {
            command: '/extract, /ext',
            description: 'Extract and send files from a ZIP archive',
            usage: '/extract',
            examples: ['/extract', '/ext'],
            category: 'Utilities',
            note: '\nSend a ZIP file after using this command. You can choose to send all files or select specific ones.'
        },
        {
            command: '/subscribe, /sub',
            description: 'Subscribe to any of the media commands: /meme, /facts, /joke, /quote',
            usage: '/subscribe',
            examples: ['/subscribe', '/sub'],
            category: 'Utilities'
        },
        {
            command: '/unsubscribe, /unsub',
            description: 'Unsubscribe from any active media command subscriptions',
            usage: '/unsubscribe',
            examples: ['/unsubscribe', '/unsub'],
            category: 'Utilities'
        },
        {
            command: '/mysubs',
            description: 'View all your active media command subscriptions',
            usage: '/mysubs',
            examples: ['/mysubs'],
            category: 'Utilities'
        },
        {
            command: '/truthordare, /trd',
            description: 'Play Truth or Dare game',
            usage: '/truthordare [truth|dare]',
            examples: [
                '/truthordare',
                '/tod truth',
                '/tod dare'
            ],
            category: 'Entertainment',
            note: '\nUse buttons to choose between truth or dare, or specify in the command.'
        },
        {
            command: '/bug',
            description: 'Report a bug or issue with the bot',
            usage: '/bug <description>',
            examples: [
                '/bug The /time command shows incorrect timezone',
                '/bug Currency conversion not working for EUR to USD'
            ],
            category: 'Support',
            note: '\nBug reports are reviewed by administrators. Please provide clear and detailed descriptions to help improve the bot.'
        }
    ];

    // Handle /help or /? command
    bot.onText(/\/(help|\?)/, (msg) => {
        const chatId = msg.chat.id;
        
        bot.sendMessage(chatId, HELP_MESSAGE, {
            parse_mode: 'Markdown',
            reply_markup: HELP_KEYBOARD
        });
    });

    // Generate help message for a specific page
    const generateCommandsHelp = (page) => {
        const totalPages = Math.ceil(commands.length / COMMANDS_PER_PAGE);
        const startIdx = (page - 1) * COMMANDS_PER_PAGE;
        const pageCommands = commands.slice(startIdx, startIdx + COMMANDS_PER_PAGE);

        let message = `📚 *Available Commands* (Page ${page}/${totalPages})\n\n`;
        
        pageCommands.forEach(cmd => {
            message += `*${cmd.command}*\n`;
            message += `├ ${cmd.description}\n`;
            message += `├ Usage: ${cmd.usage}\n`;
            message += `├ Examples:\n`;
            cmd.examples.forEach(example => {
                message += `│ • \`${example}\`\n`;
            });
            if (cmd.note) {
                message += `└ Note: _${cmd.note}_\n`;
            }
            message += `\n`;
        });

        message += `_Use the buttons below to navigate_`;
        return message;
    };

    // Generate keyboard for navigation
    const generateNavigationKeyboard = (currentPage) => {
        const totalPages = Math.ceil(commands.length / COMMANDS_PER_PAGE);
        const buttons = [];

        if (currentPage > 1) {
            buttons.push({
                text: '<< Previous',
                callback_data: `help_commands_${currentPage - 1}`
            });
        }

        if (currentPage < totalPages) {
            buttons.push({
                text: 'Next >>',
                callback_data: `help_commands_${currentPage + 1}`
            });
        }

        buttons.push({ text: 'Main Menu', callback_data: 'help_main' });

        return {
            inline_keyboard: [buttons]
        };
    };

    // Handle callback queries
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const messageId = query.message.message_id;

        if (query.data.startsWith('help_commands_')) {
            const page = parseInt(query.data.split('_')[2]);
            const commandsHelp = generateCommandsHelp(page);
            
            await bot.editMessageText(commandsHelp, {
                chat_id: chatId,
                message_id: messageId,
                parse_mode: 'Markdown',
                reply_markup: generateNavigationKeyboard(page)
            });
        } else switch (query.data) {
            case 'help_about':
                const aboutText = `*Nite v1.1*\nA versatile Telegram bot.\nDeveloper: @lordaimer`;
                await bot.editMessageText(aboutText, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: '<< Back', callback_data: 'help_main' }
                        ]]
                    }
                });
                break;

            case 'help_main':
                await bot.editMessageText(HELP_MESSAGE, {
                    chat_id: chatId,
                    message_id: messageId,
                    parse_mode: 'Markdown',
                    reply_markup: HELP_KEYBOARD
                });
                break;
        }

        await bot.answerCallbackQuery(query.id);
    });
}