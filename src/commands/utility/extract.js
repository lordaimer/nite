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
            extractPath: null,
            currentPath: ''
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
                await showFileList(bot, chatId, userState.messageId, userState);
                
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

                        // Send document without caption
                        await bot.sendDocument(chatId, fileStream, {
                            filename: path.basename(file.path)
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
            await showFileList(bot, chatId, messageId, userState);
            await bot.answerCallbackQuery(query.id);

        } else if (data.startsWith('ext_file_')) {
            const filePath = data.replace('ext_file_', '');
            const fileInfo = userState.extractedFiles.find(f => f.path === filePath);

            if (fileInfo) {
                if (fileInfo.isDir) {
                    // Navigate into directory
                    userState.currentPath = filePath;
                    await showFileList(bot, chatId, messageId, userState);
                    await bot.answerCallbackQuery(query.id, {
                        text: `📁 Opened folder: ${path.basename(filePath)}`,
                        show_alert: false
                    });
                    return;
                }

                try {
                    const fullPath = path.join(userState.extractPath, filePath);
                    console.log(`[DEBUG] Sending individual file: ${fullPath}`);

                    // Create a read stream for the file
                    const fileStream = fs.createReadStream(fullPath);
                    const stats = fs.statSync(fullPath);

                    // Send document without caption
                    await bot.sendDocument(chatId, fileStream, {
                        filename: path.basename(filePath)
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
        } else if (data === 'ext_back') {
            // Navigate back to parent directory
            userState.currentPath = path.dirname(userState.currentPath);
            if (userState.currentPath === '.') userState.currentPath = ''; // Reset to root if we're at .
            
            await showFileList(bot, chatId, messageId, userState);
            await bot.answerCallbackQuery(query.id, {
                text: '📁 Returned to parent folder',
                show_alert: false
            });
        } else if (data.startsWith('ext_done_')) {
            // Extract numbers after 'ext_done_'
            const counts = data.substring('ext_done_'.length).split('_');
            const fileCount = counts[0];
            const folderCount = counts[1];
            
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

    async function showFileList(bot, chatId, messageId, userState) {
        const currentPath = userState.currentPath;
        console.log(`[DEBUG] Showing files for path: ${currentPath}`);

        // Calculate total counts from all extracted files
        const totalFiles = userState.extractedFiles.filter(f => !f.isDir).length;
        const totalFolders = userState.extractedFiles.filter(f => f.isDir).length;

        // Filter files for current directory
        const filesInDir = userState.extractedFiles.filter(file => {
            if (!currentPath) {
                return !file.path.includes('/');
            } else {
                const relativePath = path.relative(currentPath, file.path);
                return relativePath && !relativePath.includes('/') && file.path.startsWith(currentPath + '/');
            }
        });

        // Separate directories and files in current directory
        const directories = filesInDir.filter(f => f.isDir);
        const files = filesInDir.filter(f => !f.isDir);

        // Create keyboard buttons, directories first then files
        const directoryButtons = directories.map(dir => ([{
            text: `📁 ${path.basename(dir.path)}`,
            callback_data: `ext_file_${dir.path}`
        }]));

        const fileButtons = files.map(file => ([{
            text: `📄 ${path.basename(file.path)}`,
            callback_data: `ext_file_${file.path}`
        }]));

        // Add navigation buttons
        const navButtons = [];
        if (currentPath) {
            navButtons.push({
                text: '⬅️ Back',
                callback_data: 'ext_back'
            });
        }
        navButtons.push({
            text: '✅ Done',
            callback_data: `ext_done_${totalFiles}_${totalFolders}`
        });

        const keyboard = {
            inline_keyboard: [
                ...directoryButtons,
                ...fileButtons,
                navButtons
            ]
        };

        // Create message text with current path and total counts
        let messageText = 'Select files to send:\n';
        if (currentPath) {
            messageText += `📁 Current folder: ${currentPath}\n`;
            messageText += `Files in current folder: ${files.length} files, ${directories.length} folders\n`;
        }
        messageText += `Total extracted: ${totalFiles} files, ${totalFolders} folders`;

        await bot.editMessageText(messageText, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: keyboard
        });
    }

    function formatFileSize(size) {
        if (size < 1024) return `${size} bytes`;
        if (size < 1024 * 1024) return `${(size / 1024).toFixed(2)} KB`;
        if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(2)} MB`;
        return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    }

    function cleanupExtractedFiles(userState) {
        if (!userState.extractPath) {
            console.log('[DEBUG] No extraction path to clean up');
            return;
        }

        const extractPath = userState.extractPath;
        console.log(`[DEBUG] Cleaning up extracted files at: ${extractPath}`);

        try {
            // Use recursive deletion for the entire directory
            fs.rmSync(extractPath, { recursive: true, force: true });
            console.log(`[DEBUG] Successfully cleaned up directory: ${extractPath}`);
        } catch (error) {
            console.error(`[DEBUG] Error during cleanup: ${error.message}`);
        }
    }
}
