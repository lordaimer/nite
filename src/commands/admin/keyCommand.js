import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config/env.config.js';
import { HfInference } from '@huggingface/inference';

export function setupKeyCommand(bot) {
    bot.onText(/\/key$/, async (msg) => {
        const chatId = msg.chat.id;
        if (msg.from.id.toString() !== config.telegram.adminId) {
            await bot.sendMessage(chatId, '⚠️ This command is only available to administrators.');
            return;
        }
        
        await bot.sendMessage(
            chatId,
            '⚠️ Please provide a HuggingFace API token.\n' +
            'Usage: `/key YOUR_TOKEN_HERE`\n\n' +
            'Example: `/key hf_xxxxxxxxxxxxxxxxxxxxxx`',
            { parse_mode: 'Markdown' }
        );
    });

    bot.onText(/\/key\s+(.+)/, async (msg, match) => {
        const chatId = msg.chat.id;
        const userId = msg.from.id.toString();
        
        // Check if user is admin
        if (userId !== config.telegram.adminId) {
            await bot.sendMessage(chatId, '⚠️ This command is only available to administrators.');
            return;
        }

        const token = match[1].trim();
        
        try {
            // Validate token by making a test API call
            const hf = new HfInference(token);
            await bot.sendMessage(chatId, '🔄 Validating token...');
            
            try {
                // Test with a quick image generation
                await hf.textToImage({
                    inputs: "test",
                    model: "stabilityai/stable-diffusion-2-1"
                });
            } catch (error) {
                console.error('Token validation error:', error.message);
                if (error.message.includes('Rate limit')) {
                    await bot.sendMessage(chatId, '✅ Token is valid! (Rate limit hit, but token works)');
                } else {
                    await bot.sendMessage(chatId, '❌ Invalid token. Please check your token and try again.');
                    return;
                }
            }

            // Read current .env file
            const envPath = path.resolve(process.cwd(), '.env');
            const envContent = await fs.readFile(envPath, 'utf-8');
            
            // Find the last HUGGING_FACE_TOKEN entry
            const tokenEntries = envContent.match(/HUGGING_FACE_TOKEN_\d+=/g) || [];
            const lastTokenNumber = tokenEntries.length > 0
                ? Math.max(...tokenEntries.map(entry => parseInt(entry.match(/\d+/)[0])))
                : 0;
            
            const newTokenNumber = lastTokenNumber + 1;
            const newTokenEntry = `\nHUGGING_FACE_TOKEN_${newTokenNumber}=${token}`;
            
            // Add new token to .env file
            let newEnvContent;
            if (envContent.includes('# Hugging Face API Keys')) {
                // Add after the last token entry
                const lastTokenIndex = envContent.lastIndexOf('HUGGING_FACE_TOKEN_');
                const insertPosition = envContent.indexOf('\n', lastTokenIndex);
                newEnvContent = insertPosition !== -1
                    ? envContent.slice(0, insertPosition) + newTokenEntry + envContent.slice(insertPosition)
                    : envContent + newTokenEntry;
            } else {
                // Add at the end with section header
                newEnvContent = envContent + '\n# Hugging Face API Keys' + newTokenEntry;
            }
            
            await fs.writeFile(envPath, newEnvContent, 'utf-8');
            
            await bot.sendMessage(
                chatId,
                `✅ Successfully added new HuggingFace token ${newTokenNumber}.\n` +
                'Please restart the bot for the changes to take effect.',
                { parse_mode: 'Markdown' }
            );
            
        } catch (error) {
            console.error('Error adding token:', error);
            await bot.sendMessage(
                chatId,
                '❌ An error occurred while adding the token. Please try again later.'
            );
        }
    });
}
