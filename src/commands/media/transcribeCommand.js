import { voiceService } from '../../services/api/voiceService.js';
import { storageService } from '../../services/api/storageService.js';

// Track users who are in transcribe mode with timestamps
const transcribeModeUsers = new Map();  

// Helper function for transcription process with loading animation
export async function handleTranscription(bot, msg) {
    const chatId = msg.chat.id;

    // Start with initial frame
    const statusMessage = await bot.sendMessage(
        chatId, 
        '*Transcription in progress* ◡', 
        { parse_mode: 'MarkdownV2' }
    );

    // Setup animation frames
    const frames = ['◜', '◝', '◞', '◟'];
    let frameIndex = 0;
    const animationInterval = setInterval(() => {
        bot.editMessageText(
            `*Transcription in progress* ${frames[frameIndex]}`,
            {
                chat_id: chatId,
                message_id: statusMessage.message_id,
                parse_mode: 'MarkdownV2'
            }
        ).catch(() => {});
        frameIndex = (frameIndex + 1) % frames.length;
    }, 150);

    try {
        const file = await bot.getFile(msg.voice.file_id);
        const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
        
        const tempFilePath = await voiceService.downloadVoice(fileUrl);
        const transcription = await voiceService.transcribeAudio(tempFilePath);

        // Clear animation and show result
        clearInterval(animationInterval);
        
        // Escape special characters for MarkdownV2
        const escapedTranscription = transcription.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');

        await bot.editMessageText(
            `*Transcription:*\n${escapedTranscription}`, 
            {
                chat_id: chatId,
                message_id: statusMessage.message_id,
                parse_mode: 'MarkdownV2'
            }
        );
    } catch (error) {
        // Clear animation on error
        clearInterval(animationInterval);
        console.error('Error transcribing voice message:', error);
        
        await bot.editMessageText(
            '❌ Sorry, I had trouble transcribing your voice message\\. Please try again\\.', 
            {
                chat_id: chatId,
                message_id: statusMessage.message_id,
                parse_mode: 'MarkdownV2'
            }
        );
    }
}

export function setupTranscribeCommand(bot) {
    // Clear any existing users in transcribe mode
    transcribeModeUsers.clear();

    // Handle /transcribe command with start anchor and exact match
    bot.onText(/^(\/transcribe|\/trcb)$/, async (msg) => {
        const chatId = msg.chat.id;
        
        // Check if user is already in transcribe mode
        const existingSession = transcribeModeUsers.get(chatId);
        if (existingSession) {
            const now = Date.now();
            // If the session is less than 1 minute old, don't send another message
            if (now - existingSession < 60000) {
                return;
            }
            // Clean up old session
            transcribeModeUsers.delete(chatId);
        }
        
        // Add user to transcribe mode with timestamp
        transcribeModeUsers.set(chatId, Date.now());
        
        await bot.sendMessage(
            chatId, 
            'Please send a voice message to transcribe.', 
            { 
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[
                        { text: 'Cancel', callback_data: 'cancel_transcribe' }
                    ]]
                }
            }
        );
    });

    // Handle cancel button callback
    const callbackHandler = async (query) => {
        if (query.data === 'cancel_transcribe') {
            const chatId = query.message.chat.id;
            if (transcribeModeUsers.has(chatId)) {
                transcribeModeUsers.delete(chatId);
                await bot.editMessageText(
                    'Transcription mode cancelled.',
                    {
                        chat_id: chatId,
                        message_id: query.message.message_id
                    }
                );
            }
            await bot.answerCallbackQuery(query.id);
        }
    };

    // Remove any existing callback handlers and add the new one
    bot.removeListener('callback_query', callbackHandler);
    bot.on('callback_query', callbackHandler);

    // Handle voice messages for transcription
    const voiceHandler = async (msg) => {
        const chatId = msg.chat.id;

        if (!transcribeModeUsers.has(chatId)) return;
        transcribeModeUsers.delete(chatId);

        await handleTranscription(bot, msg);
    };

    // Remove any existing voice handlers and add the new one
    bot.removeListener('voice', voiceHandler);
    bot.on('voice', voiceHandler);

    // Clean up old sessions every minute
    setInterval(() => {
        const now = Date.now();
        transcribeModeUsers.forEach((timestamp, chatId) => {
            if (now - timestamp > 60000) {  // Remove sessions older than 1 minute
                transcribeModeUsers.delete(chatId);
            }
        });
    }, 60000);
}

export { transcribeModeUsers };
