import { HfInference } from '@huggingface/inference';
import { config } from '../../config/env.config.js';

// TODO: Need 11 more API keys to support all 18 models in variety mode
// Currently have 7 keys, so variety mode is limited to 7 models at a time

const MODEL_TOKEN_MAP = {
    // Primary models - These will be used for variety mode since we have limited API keys
    'black-forest-labs/FLUX.1-dev': 0,        // FLUX Dev - Token 1
    'black-forest-labs/FLUX.1-schnell': 1,    // FLUX Schnell - Token 2
    'XLabs-AI/flux-RealismLora': 2,          // FLUX Realism - Token 3
    'Shakker-Labs/FLUX.1-dev-LoRA-Logo-Design': 3, // FLUX Logo - Token 4
    'alvdansen/flux-koda': 4,                 // FLUX Koda - Token 5
    'alvdansen/softserve_anime': 5,           // Anime Style - Token 6
    'Jovie/Midjourney': 6,                    // Midjourney Style - Token 7

    // Secondary models - These will only be available in single model mode until we get more API keys
    'strangerzonehf/Flux-Super-Realism-LoRA': 0,  // Super Realism
    'strangerzonehf/Flux-Midjourney-Mix2-LoRA': 1, // Midjourney Mix
    'strangerzonehf/Flux-Isometric-3D-LoRA': 2,   // Isometric 3D
    'strangerzonehf/Flux-3D-Garment-Mannequin': 3, // 3D Garment
    'strangerzonehf/Flux-Cute-3D-Kawaii-LoRA': 4, // Cute 3D
    'prithivMLmods/Castor-3D-Portrait-Flux-LoRA': 5, // 3D Portrait
    'prithivMLmods/3D-Render-Flux-LoRA': 6,      // 3D Render
    'Shakker-Labs/FLUX.1-dev-LoRA-live-3D': 0,   // Live 3D
    'Shakker-Labs/SD3.5-LoRA-Linear-Red-Light': 1, // Red Light
    'goofyai/3D_Render_for_Flux': 2,            // Goofy 3D
    'renderartist/simplevectorflux': 3           // Vector Art
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
        const tokenIndex = this.tokens.indexOf(token);
        console.log(`🎨 Starting generation for ${model} using token ${tokenIndex + 1}`);
        
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
        if (!client || !token) {
            throw new Error(`No valid client or token found for model ${model}`);
        }
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

        // Create a promise for each model generation
        const modelPromises = models.map(async (model) => {
            try {
                const result = await this.generateImage(prompt, model);
                results.push({ model, image: result });
            } catch (error) {
                console.error(`❌ Failed to generate image for ${model}:`, error.message);
                errors.push({ model, error: error.message });
            }
        });

        // Create a timeout promise
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                reject(new Error('TIMEOUT'));
            }, this.GLOBAL_TIMEOUT);
        });

        try {
            // Race between all model generations and the timeout
            await Promise.race([
                Promise.all(modelPromises),
                timeoutPromise
            ]);
        } catch (error) {
            if (error.message === 'TIMEOUT') {
                console.log(`⏰ Global timeout reached after ${this.GLOBAL_TIMEOUT / 1000} seconds`);
                // Don't throw error, just continue with whatever results we have
            }
        }

        console.log(`🏁 Batch generation completed. Success: ${results.length}, Failures: ${errors.length}`);
        
        // Return results even if incomplete due to timeout
        if (results.length === 0) {
            throw new Error('No images were generated. Please try again.');
        }

        return { results, errors };
    }
}

// Create and export a singleton instance
const huggingFaceService = new HuggingFaceService();
export default huggingFaceService;
