import { HfInference } from '@huggingface/inference';
import { config } from '../../config/env.config.js';

const MODEL_TOKEN_MAP = {
    'black-forest-labs/FLUX.1-dev': 0,        // FLUX Dev - Token 1
    'black-forest-labs/FLUX.1-schnell': 1,    // FLUX Schnell - Token 2
    'XLabs-AI/flux-RealismLora': 2,          // FLUX Realism - Token 3
    'Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design': 3, // FLUX Logo - Token 4
    'alvdansen/flux-koda': 4,                 // FLUX Koda - Token 5
    'alvdansen/softserve_anime': 5            // Anime Style - Token 6
};

class HuggingFaceService {
    constructor() {
        this.tokens = config.huggingface.tokens;
        this.clients = this.tokens.map(token => new HfInference(token));
        this.activeGenerations = new Map(); // Track active generations per token
        this.maxRetries = 2;
        this.currentTokenIndex = 0; // Add this for token rotation
        this.GLOBAL_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
    }

    getNextToken() {
        // Get current token and client
        const currentIndex = this.currentTokenIndex;
        const token = this.tokens[currentIndex];
        const client = this.clients[currentIndex];
        
        // Increment for next use
        this.currentTokenIndex = (this.currentTokenIndex + 1) % this.tokens.length;
        
        return {
            client: client,
            token: token,
            index: currentIndex
        };
    }

    getClientForModel(model, forceRotate = false) {
        if (forceRotate) {
            return this.getNextToken();
        }
        const tokenIndex = MODEL_TOKEN_MAP[model];
        return {
            client: this.clients[tokenIndex],
            token: this.tokens[tokenIndex],
            index: tokenIndex
        };
    }

    async generateImageWithRetry(client, token, prompt, model, retryCount = 0) {
        console.log(`🎨 Starting generation for ${model} using token ${this.tokens.indexOf(token) + 1}`);
        
        try {
            this.activeGenerations.set(token, true);
            const result = await client.textToImage({
                inputs: prompt,
                model: model
            });
            
            // Convert Blob to Buffer
            const arrayBuffer = await result.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            console.log(`✅ Successfully generated image for ${model}`);
            return buffer;
        } catch (error) {
            if (retryCount < this.maxRetries) {
                console.log(`⚠️ Retry ${retryCount + 1} for ${model}: ${error.message}`);
                return this.generateImageWithRetry(client, token, prompt, model, retryCount + 1);
            }
            console.error(`❌ Failed to generate image for ${model} after ${retryCount} retries: ${error.message}`);
            throw error;
        } finally {
            this.activeGenerations.set(token, false);
        }
    }

    async generateImage(prompt, model, forceRotate = false) {
        const { client, token, index } = this.getClientForModel(model, forceRotate);
        try {
            const result = await this.generateImageWithRetry(client, token, prompt, model);
            return result;
        } catch (error) {
            console.error(`❌ Error generating image with token ${index + 1}:`, error.message);
            throw error;
        }
    }

    async generateMultipleImages(prompt, model, count) {
        console.log(`🎨 Starting multiple generation (${count} images) for ${model}`);
        const results = [];
        const errors = [];

        const generateWithTimeout = async () => {
            const promises = Array(count).fill().map((_, index) => {
                // Add a unique timestamp for each request to prevent server-side caching
                const uniquePrompt = `${prompt} [t:${Date.now() + index}]`;
                return this.generateImage(uniquePrompt, model, true)
                    .then(result => {
                        console.log(`✅ Generated image ${index + 1}/${count} for ${model}`);
                        results.push(result);
                    })
                    .catch(error => {
                        console.error(`❌ Failed to generate image ${index + 1}/${count} for ${model}:`, error.message);
                        errors.push(error);
                    });
            });

            // Global timeout promise
            const timeoutPromise = new Promise(resolve => 
                setTimeout(resolve, this.GLOBAL_TIMEOUT)
            );

            // Race between all generations and timeout
            await Promise.race([
                Promise.all(promises),
                timeoutPromise
            ]);

            console.log(`🏁 Multiple generation completed. Success: ${results.length}, Failures: ${errors.length}`);

            // Return whatever images we have, even if incomplete
            return results;
        };

        const generatedImages = await generateWithTimeout();
        
        if (generatedImages.length === 0) {
            throw new Error('Failed to generate any images within the time limit. Please try again.');
        }

        return generatedImages;
    }

    async batchGenerateImages(prompt, models) {
        const results = [];
        const errors = [];
        console.log(`🚀 Starting batch generation for ${models.length} models`);

        // Generate images in parallel, each model using its dedicated token
        const promises = models.map(async (model) => {
            try {
                const result = await this.generateImage(prompt, model);
                const modelName = Object.entries(MODEL_TOKEN_MAP).find(([key, value]) => key === model)[0];
                console.log(`✨ Added ${modelName} result to batch`);
                results.push({ model, image: result });
            } catch (error) {
                const modelName = Object.entries(MODEL_TOKEN_MAP).find(([key, value]) => key === model)[0];
                console.error(`❌ Failed to generate image for ${modelName}:`, error.message);
                errors.push({ model, error: error.message });
            }
        });

        await Promise.all(promises);
        console.log(`🏁 Batch generation completed. Success: ${results.length}, Failures: ${errors.length}`);
        
        // If all models failed, throw an error
        if (results.length === 0 && errors.length === models.length) {
            console.error('❌ All models failed to generate images');
            throw new Error('All models failed to generate images. Please try again.');
        }

        return { results, errors };
    }
}

// Create and export a singleton instance
const huggingFaceService = new HuggingFaceService();
export default huggingFaceService;
