import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import { fileTypeFromBuffer } from 'file-type';
import { downloadFile } from '../../services/downloadService.js';
import { createTempDir, cleanupTempDir } from '../../services/fileService.js';

export function setupExtractCommand(bot, limit) {
    const userStates = new Map();
    const rateLimit = new Map();

    const handleExtract = async (msg) => {
        const chatId = msg.chat.id;
        
        // Reset user state
        userStates.set(chatId, {
            waitingForZip: true,
            messageId: null,
            extractedFiles: [],
            extractPath: null
        });

        const response = await bot.sendMessage(
            chatId,
            'Please send me a ZIP file to extract.',
            { reply_to_message_id: msg.message_id }
        );

        userStates.get(chatId).messageId = response.message_id;
    };

    bot.onText(/\/(extract|ext)/, async (msg) => {
        const chatId = msg.chat.id;
        const now = Date.now();

        if (rateLimit.has(chatId)) {
            const lastUsage = rateLimit.get(chatId);
            if (now - lastUsage < limit) {
                await bot.sendMessage(chatId, `You are using this command too frequently. Please try again in ${Math.ceil((limit - (now - lastUsage)) / 1000)} seconds.`);
                return;
            }
        }

        rateLimit.set(chatId, now);

        try {
            await handleExtract(msg);
        } catch (error) {
            console.error('Error in extract command:', error);
            bot.sendMessage(msg.chat.id, 'Sorry, something went wrong. Please try again later.');
        }
    });

    bot.on('document', async (msg) => {
        const chatId = msg.chat.id;
        const userState = userStates.get(chatId);
        
        if (!userState?.waitingForZip) return;

        const file = msg.document;
        const fileId = file.file_id;

        try {
            console.log(`[DEBUG] Starting extraction process for file: ${file.file_name}`);
            console.log(`[DEBUG] File ID: ${fileId}`);
            console.log(`[DEBUG] File size: ${file.file_size} bytes`);
            console.log(`[DEBUG] MIME type: ${file.mime_type}`);

            // Update message to show processing status
            await bot.editMessageText(
                'Processing your ZIP file...',
                {
                    chat_id: chatId,
                    message_id: userState.messageId
                }
            );

            // Download the file
            console.log('[DEBUG] Initiating file download');
            const filePath = await downloadFile(bot, fileId);
            console.log(`[DEBUG] File downloaded to: ${filePath}`);

            const downloadDir = path.dirname(filePath);
            console.log(`[DEBUG] Download directory: ${downloadDir}`);

            console.log('[DEBUG] Reading file for validation');
            const fileBuffer = fs.readFileSync(filePath);
            console.log(`[DEBUG] File read, size: ${fileBuffer.length} bytes`);
            
            try {
                // Verify if it's a ZIP file
                console.log('[DEBUG] Checking file type');
                const fileType = await fileTypeFromBuffer(fileBuffer);
                console.log(`[DEBUG] File type detected:`, fileType);

                if (!fileType || fileType.mime !== 'application/zip') {
                    throw new Error('The file you sent is not a ZIP file.');
                }

                // Create temp directory for extraction
                console.log('[DEBUG] Creating extraction directory');
                const extractPath = await createTempDir();
                console.log(`[DEBUG] Extraction path: ${extractPath}`);
                userState.extractPath = extractPath;

                // Extract the ZIP file
                console.log('[DEBUG] Starting ZIP extraction');
                const zip = new AdmZip(filePath);
                zip.extractAllTo(extractPath, true);
                console.log('[DEBUG] ZIP extraction completed');

                // Get list of extracted files
                console.log('[DEBUG] Scanning extracted files');
                const extractedFiles = [];
                const processDirectory = (dir, prefix = '') => {
                    const items = fs.readdirSync(dir);
                    for (const item of items) {
                        const fullPath = path.join(dir, item);
                        const relativePath = prefix ? `${prefix}/${item}` : item;
                        const stats = fs.statSync(fullPath);
                        if (stats.isDirectory()) {
                            extractedFiles.push({ path: relativePath, isDir: true });
                            processDirectory(fullPath, relativePath);
                        } else {
                            extractedFiles.push({ path: relativePath, isDir: false });
                        }
                    }
                };
                processDirectory(extractPath);
                console.log(`[DEBUG] Found ${extractedFiles.length} files/folders`);
                userState.extractedFiles = extractedFiles;

                // Show success message with options
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: 'Send All', callback_data: 'ext_send_all' },
                            { text: 'Select Files', callback_data: 'ext_select' }
                        ]
                    ]
                };

                await bot.editMessageText(
                    `✅ ZIP file extracted successfully!\nFound ${extractedFiles.length} files/folders.\nWhat would you like to do?`,
                    {
                        chat_id: chatId,
                        message_id: userState.messageId,
                        reply_markup: keyboard
                    }
                );
                
                // Update state
                userState.waitingForZip = false;

            } finally {
                // Cleanup the downloaded zip file and its directory
                try {
                    console.log('[DEBUG] Cleaning up downloaded file');
                    fs.unlinkSync(filePath);
                    fs.rmdirSync(downloadDir);
                    console.log('[DEBUG] Cleanup completed');
                } catch (error) {
                    console.error('[DEBUG] Error during cleanup:', error);
                }
            }

        } catch (error) {
            await bot.editMessageText(
                `❌ Error: ${error.message}`,
                {
                    chat_id: chatId,
                    message_id: userState.messageId
                }
            );
            userStates.delete(chatId);
        }
    });

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const userState = userStates.get(chatId);
        const messageId = query.message.message_id;
        const data = query.data;
        
        if (!userState || !data.startsWith('ext_')) return;

        if (data === 'ext_send_all') {
            try {
                await bot.editMessageText(
                    'Sending all files...',
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );

                const extractPath = userState.extractPath;
                const files = userState.extractedFiles;

                let successCount = 0;
                let errorCount = 0;

                for (const file of files) {
                    if (file.isDir) continue; // Skip directories

                    const fullPath = path.join(extractPath, file.path);
                    console.log(`[DEBUG] Sending file: ${fullPath}`);

                    try {
                        // Create a read stream for the file
                        const fileStream = fs.createReadStream(fullPath);
                        const stats = fs.statSync(fullPath);

                        // Send as document with original filename
                        await bot.sendDocument(chatId, fileStream, {
                            filename: path.basename(file.path),
                            caption: `File: ${file.path}\nSize: ${formatFileSize(stats.size)}`
                        });

                        successCount++;
                        console.log(`[DEBUG] Successfully sent: ${file.path}`);
                    } catch (error) {
                        console.error(`[DEBUG] Error sending file ${file.path}:`, error);
                        errorCount++;
                    }
                }

                // Send summary message
                let summaryMessage = `✅ Sent ${successCount} files successfully.`;
                if (errorCount > 0) {
                    summaryMessage += `\n❌ Failed to send ${errorCount} files.`;
                }

                await bot.editMessageText(
                    summaryMessage,
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );

            } catch (error) {
                console.error('[DEBUG] Error in send all:', error);
                await bot.editMessageText(
                    '❌ Error sending files: ' + error.message,
                    {
                        chat_id: chatId,
                        message_id: messageId
                    }
                );
            } finally {
                // Clean up
                cleanupExtractedFiles(userState);
                userStates.delete(chatId);
            }
            return;
        }

        if (data === 'ext_select') {
            // Count files and folders
            const fileCount = userState.extractedFiles.filter(f => !f.isDir).length;
            const folderCount = userState.extractedFiles.filter(f => f.isDir).length;

            const keyboard = {
                inline_keyboard: [
                    ...userState.extractedFiles.map(file => ([{
                        text: `${file.isDir ? '📁' : '📄'} ${file.path}`,
                        callback_data: `ext_file_${file.path}`
                    }])),
                    [{
                        text: '✅ Done',
                        callback_data: `ext_done_${fileCount}_${folderCount}`
                    }]
                ]
            };

            await bot.editMessageText(
                `Select files to send:\nTotal: ${fileCount} files, ${folderCount} folders`,
                {
                    chat_id: chatId,
                    message_id: messageId,
                    reply_markup: keyboard
                }
            );
            await bot.answerCallbackQuery(query.id);

        } else if (data.startsWith('ext_file_')) {
            const filePath = data.replace('ext_file_', '');
            const fileInfo = userState.extractedFiles.find(f => f.path === filePath);

            if (fileInfo) {
                if (fileInfo.isDir) {
                    await bot.answerCallbackQuery(query.id, {
                        text: '📁 This is a directory',
                        show_alert: true
                    });
                    return;
                }

                try {
                    const fullPath = path.join(userState.extractPath, filePath);
                    console.log(`[DEBUG] Sending individual file: ${fullPath}`);

                    // Create a read stream for the file
                    const fileStream = fs.createReadStream(fullPath);
                    const stats = fs.statSync(fullPath);

                    // Send as document with original filename
                    await bot.sendDocument(chatId, fileStream, {
                        filename: path.basename(filePath),
                        caption: `File: ${filePath}\nSize: ${formatFileSize(stats.size)}`
                    });

                    console.log(`[DEBUG] Successfully sent: ${filePath}`);
                    await bot.answerCallbackQuery(query.id, {
                        text: '✅ File sent!',
                        show_alert: false
                    });
                } catch (error) {
                    console.error(`[DEBUG] Error sending file ${filePath}:`, error);
                    await bot.answerCallbackQuery(query.id, {
                        text: '❌ Failed to send file: ' + error.message,
                        show_alert: true
                    });
                }
            }
        } else if (data.startsWith('ext_done_')) {
            const [_, fileCount, folderCount] = data.split('_');
            
            await bot.editMessageText(
                `File extraction complete:\nTotal extracted: ${fileCount} files, ${folderCount} folders`,
                {
                    chat_id: chatId,
                    message_id: messageId
                }
            );
            await bot.answerCallbackQuery(query.id);

            // Cleanup
            cleanupExtractedFiles(userState);
            userStates.delete(chatId);
        }
    });
}

function formatFileSize(size) {
    if (size < 1024) return `${size} bytes`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
    if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function cleanupExtractedFiles(userState) {
    const extractPath = userState.extractPath;
    const files = userState.extractedFiles;

    for (const file of files) {
        if (file.isDir) continue; // Skip directories

        const fullPath = path.join(extractPath, file.path);
        try {
            fs.unlinkSync(fullPath);
        } catch (error) {
            console.error(`[DEBUG] Error deleting file ${file.path}:`, error);
        }
    }

    try {
        fs.rmdirSync(extractPath);
    } catch (error) {
        console.error(`[DEBUG] Error deleting directory ${extractPath}:`, error);
    }
}
