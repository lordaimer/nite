import { voiceService } from '../../services/api/voiceService.js';

// Track users who are in transcribe mode
const transcribeModeUsers = new Set();

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
    // Handle /transcribe command
    bot.onText(/\/(transcribe|trcb)/, async (msg) => {
        const chatId = msg.chat.id;
        
        // Add user to transcribe mode
        transcribeModeUsers.add(chatId);
        
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
    bot.on('callback_query', async (query) => {
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
    });

    // Handle voice messages for transcription
    bot.on('voice', async (msg) => {
        const chatId = msg.chat.id;

        if (!transcribeModeUsers.has(chatId)) return;
        transcribeModeUsers.delete(chatId);

        await handleTranscription(bot, msg);
    });
}

export { transcribeModeUsers }; 
