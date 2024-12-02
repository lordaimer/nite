import { HfInference } from '@huggingface/inference';
import { config } from '../../config/env.config.js';

class HuggingFaceService {
    constructor() {
        this.tokens = config.huggingface.tokens;
        this.currentIndex = 0;
        this.clients = this.tokens.map(token => new HfInference(token));
        this.lastUsed = new Map(); // Track last usage time for each token
        this.requestCounts = new Map(); // Track request count for each token
        this.resetTime = 60000; // 1 minute in milliseconds
        this.maxRequestsPerMinute = 3;
    }

    getNextClient() {
        const now = Date.now();
        let attempts = 0;
        const maxAttempts = this.clients.length;

        while (attempts < maxAttempts) {
            const client = this.clients[this.currentIndex];
            const token = this.tokens[this.currentIndex];
            const lastUsedTime = this.lastUsed.get(token) || 0;
            const requestCount = this.requestCounts.get(token) || 0;

            // Reset counter if minute has passed
            if (now - lastUsedTime > this.resetTime) {
                this.requestCounts.set(token, 0);
                this.lastUsed.set(token, now);
                return client;
            }

            // Use this client if under rate limit
            if (requestCount < this.maxRequestsPerMinute) {
                this.requestCounts.set(token, requestCount + 1);
                this.lastUsed.set(token, now);
                return client;
            }

            // Move to next client
            this.currentIndex = (this.currentIndex + 1) % this.clients.length;
            attempts++;
        }

        // If all clients are at rate limit, use the oldest one
        let oldestTime = Infinity;
        let oldestIndex = 0;

        this.lastUsed.forEach((time, token, index) => {
            if (time < oldestTime) {
                oldestTime = time;
                oldestIndex = this.tokens.indexOf(token);
            }
        });

        this.currentIndex = oldestIndex;
        const token = this.tokens[this.currentIndex];
        this.requestCounts.set(token, 1);
        this.lastUsed.set(token, now);
        return this.clients[this.currentIndex];
    }

    async generateImage(prompt, model) {
        const client = this.getNextClient();
        try {
            const result = await client.textToImage({
                inputs: prompt,
                model: model
            });
            return result;
        } catch (error) {
            console.error(`Error generating image with token ${this.currentIndex + 1}:`, error);
            throw error;
        }
    }

    async batchGenerateImages(prompt, models) {
        const results = [];
        const errors = [];

        // Generate images in parallel
        const promises = models.map(async (model) => {
            try {
                const result = await this.generateImage(prompt, model);
                results.push({ model, image: result });
            } catch (error) {
                errors.push({ model, error: error.message });
            }
        });

        await Promise.all(promises);
        return { results, errors };
    }
}

// Create and export a singleton instance
const huggingFaceService = new HuggingFaceService();
export default huggingFaceService;
