import { GoogleGenerativeAI } from '@google/generative-ai';
import { rateLimitService } from './rateLimitService.js';

class LLMService {
    constructor() {
        this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
        this.conversationHistory = new Map();
    }

    async generateResponse(message, chatId) {
        try {
            // Rate limiting check
            if (!this.checkRateLimit(chatId)) {
                return "I'm processing too many requests right now. Please try again in a moment.";
            }

            // Input length check
            if (message.length > 30720) {
                return "Your message is too long. Please send a shorter message (max 30,720 characters).";
            }

            // Get conversation history
            const history = this.conversationHistory.get(chatId) || [];
            
            // Add new message to history
            history.push({ role: 'user', parts: [{ text: message }] });
            if (history.length > 10) {
                history.shift();
            }

            try {
                // Create chat context with correct format
                const chat = this.model.startChat({
                    history: history.map(msg => ({
                        role: msg.role === 'assistant' ? 'model' : msg.role,
                        parts: msg.parts
                    })),
                    generationConfig: {
                        temperature: 0.7,
                        topK: 40,
                        topP: 0.95,
                        maxOutputTokens: 2048,
                    },
                    safetySettings: [
                        {
                            category: "HARM_CATEGORY_HARASSMENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_HATE_SPEECH",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        },
                        {
                            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
                            threshold: "BLOCK_MEDIUM_AND_ABOVE"
                        }
                    ]
                });

                // Send message with proper format
                const result = await chat.sendMessage([{ text: message }]);
                const response = result.response.text();

                // Clean the response of markdown formatting
                const cleanedResponse = this.cleanMarkdown(response);

                // Add cleaned response to history
                history.push({ role: 'model', parts: [{ text: cleanedResponse }] });
                this.conversationHistory.set(chatId, history);

                return cleanedResponse;
            } catch (error) {
                if (error.message?.includes('SAFETY')) {
                    return "I apologize, but I cannot provide information about that topic. Please try rephrasing your request or asking about something else.";
                }
                throw error; // Re-throw other errors to be caught by outer try-catch
            }
        } catch (error) {
            return "I'm having trouble processing your request right now. Please try again in a moment. If the problem persists, contact support.";
        }
    }

    cleanMarkdown(text) {
        return text
            // Remove single asterisks at the start of lines
            .replace(/^\s*\*\s*/gm, '')
            // Fix incomplete bold markers
            .replace(/\*([^*\n]+)\*(\n|$)/g, '$1\n')
            // Properly format bold text
            .replace(/\*\*([^*]+)\*\*/g, '**$1**')
            // Remove any remaining single asterisks
            .replace(/(?<!\*)\*(?!\*)/g, '')
            // Remove italic markers
            .replace(/\_([^_]+)\_/g, '$1')
            // Remove code blocks
            .replace(/```([^`]+)```/g, '$1')
            // Remove inline code
            .replace(/`([^`]+)`/g, '$1')
            // Remove extra spaces at line starts
            .replace(/^[ ]{2,}/gm, '')
            // Ensure paragraphs are separated by double newlines
            .replace(/([^\n])\n([^\n])/g, '$1\n\n$2')
            // Normalize multiple newlines
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    async sendResponse(bot, chatId, response) {
        try {
            let formattedResponse = response
                .replace(/[[\]()>#+\-=|{}.!\\]/g, '\\$&');

            if (formattedResponse.length <= 4096) {
                await bot.sendMessage(chatId, formattedResponse, { 
                    parse_mode: 'MarkdownV2'
                }).catch(() => {
                    // If MarkdownV2 fails, send without parsing
                    return bot.sendMessage(chatId, response);
                });
            } else {
                // Split long responses
                for (let i = 0; i < formattedResponse.length; i += 4096) {
                    const chunk = formattedResponse.substring(i, Math.min(formattedResponse.length, i + 4096));
                    await bot.sendMessage(chatId, chunk, { 
                        parse_mode: 'MarkdownV2'
                    }).catch(() => {
                        // If MarkdownV2 fails, send without parsing
                        return bot.sendMessage(chatId, response.substring(i, Math.min(response.length, i + 4096)));
                    });
                }
            }
        } catch (error) {
            await bot.sendMessage(chatId, '❌ Sorry, I encountered an error while processing your request\\.');
        }
    }

    checkRateLimit(chatId) {
        return rateLimitService.checkLLM(chatId);
    }

    async detectIntent(message) {
        try {
            const prompt = `
            You are an intent detector for a meme bot. Analyze if this message indicates the user wants to see a meme.
            If they mention a specific subreddit, extract it.
            If they mention "random" or want any meme, mark as random.
            
            Respond in this format:
            - If user wants a random meme: "meme:random"
            - If user specifies a subreddit: "meme:subredditname" (without r/ prefix)
            - If not asking for meme: "other"
            
            Examples:
            "send me a meme" -> "meme:random"
            "get a meme from r/memes" -> "meme:memes"
            "show meme from dankmemes" -> "meme:dankmemes"
            "send me a random meme" -> "meme:random"
            "random meme please" -> "meme:random"
            "any meme" -> "meme:random"
            "how are you" -> "other"
            
            Message: "${message}"
            `;

            const result = await this.model.generateContent(prompt);
            const response = result.response.text().toLowerCase().trim();
            
            if (response.startsWith('meme:')) {
                const [intent, subreddit] = response.split(':');
                return {
                    type: 'meme',
                    subreddit: subreddit,
                    isRandom: subreddit === 'random'
                };
            }
            
            return {
                type: 'other',
                subreddit: null,
                isRandom: false
            };
        } catch (error) {
            console.error('Error detecting intent:', error);
            return {
                type: 'other',
                subreddit: null,
                isRandom: false
            };
        }
    }
}

// Create and export a singleton instance
const llmService = new LLMService();
export { llmService };