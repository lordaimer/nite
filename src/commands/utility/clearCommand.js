export function setupClearCommand(bot) {
    bot.onText(/\/clear(?:\s+(\S+))?/, async (msg, match) => {
        const chatId = msg.chat.id;
        const param = match[1]?.toLowerCase();

        // Handle "clear all" case
        if (param === 'all') {
            const confirmMsg = await bot.sendMessage(
                chatId,
                `⚠️ WARNING:\n` +
                `This will:\n` +
                `• Clear all messages in this chat\n` +
                `• Delete all media files in this chat\n\n` +
                `Note: This only affects messages in your chat with the bot.\n\n` +
                `Are you sure?\n\n` +
                `_This message will self-destruct in 30 seconds..._`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [[
                            { text: 'Confirm', callback_data: 'confirm_clear_all' }
                        ]]
                    }
                }
            );

            // Replace message handler with callback query handler
            const confirmHandler = async (query) => {
                if (query.data === 'confirm_clear_all' && query.message.chat.id === chatId) {
                    try {
                        // Answer the callback query to remove loading state
                        await bot.answerCallbackQuery(query.id);

                        // Update the warning message to show cleanup progress
                        await bot.editMessageText(
                            "*Cleanup in progress* ◡",
                            {
                                chat_id: chatId,
                                message_id: confirmMsg.message_id,
                                parse_mode: 'Markdown',
                                reply_markup: { inline_keyboard: [] } // Remove the button
                            }
                        );

                        // Animation frames
                        const frames = ['◜', '◝', '◞', '◟'];
                        let frameIndex = 0;
                        const animationInterval = setInterval(() => {
                            bot.editMessageText(
                                `*Cleanup in progress* ${frames[frameIndex]}`,
                                {
                                    chat_id: chatId,
                                    message_id: confirmMsg.message_id,
                                    parse_mode: 'Markdown'
                                }
                            ).catch(() => {});
                            frameIndex = (frameIndex + 1) % frames.length;
                        }, 150);

                        // Delete messages
                        const deletePromises = [];
                        for (let i = msg.message_id; i > msg.message_id - 1000; i--) {
                            deletePromises.push(bot.deleteMessage(chatId, i).catch(() => {}));
                        }

                        await Promise.all(deletePromises);
                        clearInterval(animationInterval);

                        // Update the message to show completion
                        await bot.editMessageText(
                            `🧹 *Cleanup Complete*\n\n` +
                            `Messages have been deleted.\n\n` +
                            `Note: Messages older than 48 hours cannot be deleted.\n\n` +
                            `_This message will self-destruct in 30 seconds..._`,
                            {
                                chat_id: chatId,
                                message_id: confirmMsg.message_id,
                                parse_mode: 'Markdown'
                            }
                        );

                        // Delete the final message after 30 seconds
                        setTimeout(async () => {
                            await bot.deleteMessage(chatId, confirmMsg.message_id).catch(() => {});
                        }, 30000);

                    } catch (error) {
                        console.error('Clear command failed:', error);
                        
                        const errorMsg = await bot.sendMessage(chatId, 
                            "❌ Error during cleanup. Some messages may not have been deleted.");
                        
                        setTimeout(async () => {
                            await bot.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
                        }, 30000);
                    }
                    
                    // Remove the confirmation handler
                    bot.removeListener('callback_query', confirmHandler);
                }
            };

            // Replace message listener with callback query listener
            bot.on('callback_query', confirmHandler);

            // Update timeout to remove the callback query handler and clean up both messages
            setTimeout(async () => {
                bot.removeListener('callback_query', confirmHandler);
                await bot.deleteMessage(chatId, confirmMsg.message_id).catch(() => {});
                await bot.deleteMessage(chatId, msg.message_id).catch(() => {}); // Delete the original command
            }, 30000);

            return;
        }

        const amount = parseInt(param) || 100;

        // Start the cleanup with animation
        const statusMsg = await bot.sendMessage(
            chatId,
            "*Cleanup in progress* ◡",
            { parse_mode: 'Markdown' }
        );

        // Animation frames - adjusted for smoother rotation
        const frames = ['◜', '◝', '◞', '◟'];
        let frameIndex = 0;
        const animationInterval = setInterval(() => {
            bot.editMessageText(
                `*Cleanup in progress* ${frames[frameIndex]}`,
                {
                    chat_id: chatId,
                    message_id: statusMsg.message_id,
                    parse_mode: 'Markdown'
                }
            ).catch(() => {});
            frameIndex = (frameIndex + 1) % frames.length;
        }, 150);

        try {
            // Create an array of promises for all delete operations
            const deletePromises = [];
            for (let i = msg.message_id; i > msg.message_id - amount; i--) {
                deletePromises.push(bot.deleteMessage(chatId, i).catch(() => {}));
            }

            // Execute all delete operations simultaneously
            await Promise.all(deletePromises);

            // Clear the animation interval and delete the status message
            clearInterval(animationInterval);
            try {
                await bot.deleteMessage(chatId, statusMsg.message_id);
                await bot.deleteMessage(chatId, msg.message_id);
                if (confirmMsg) {
                    await bot.deleteMessage(chatId, confirmMsg.message_id);
                }
            } catch (error) {
                console.error('Error deleting service messages:', error);
            }
            
            const finalMessage = await bot.sendMessage(
                chatId,
                `🧹 *Cleanup Complete*\n\n` +
                `Messages have been deleted.\n\n` +
                `Note: Messages older than 48 hours cannot be deleted.\n\n` +
                `_This message will self-destruct in 30 seconds..._`,
                { parse_mode: 'Markdown' }
            );

            // Delete the final message after 30 seconds
            setTimeout(async () => {
                try {
                    await bot.deleteMessage(chatId, finalMessage.message_id);
                } catch (error) {
                    console.error('Error deleting final message:', error);
                }
            }, 30000);

        } catch (error) {
            clearInterval(animationInterval);
            console.error('Clear command failed:', error);
            const errorMsg = await bot.sendMessage(chatId, 
                "❌ Error during cleanup. Some messages may not have been deleted.");
            
            setTimeout(async () => {
                await bot.deleteMessage(chatId, errorMsg.message_id).catch(() => {});
            }, 30000);
        }
    });
}