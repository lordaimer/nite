class UpscaleQueue {
    constructor() {
        this.queues = new Map(); // Map of chatId -> queue
        this.processing = new Map(); // Map of chatId -> boolean
    }

    // Add a job to the queue
    addJob(chatId, job) {
        if (!this.queues.has(chatId)) {
            this.queues.set(chatId, []);
        }
        this.queues.get(chatId).push(job);
        this.processQueue(chatId);
    }

    // Process the next job in the queue
    async processQueue(chatId) {
        // If already processing or no jobs, return
        if (this.processing.get(chatId) || !this.queues.has(chatId) || this.queues.get(chatId).length === 0) {
            return;
        }

        try {
            this.processing.set(chatId, true);
            const job = this.queues.get(chatId)[0];
            await job();
            
            // Remove the completed job
            this.queues.get(chatId).shift();
            
            // If queue is empty, delete it
            if (this.queues.get(chatId).length === 0) {
                this.queues.delete(chatId);
            }
        } catch (error) {
            console.error('Error processing upscale job:', error);
        } finally {
            this.processing.set(chatId, false);
            // Process next job if any
            if (this.queues.has(chatId) && this.queues.get(chatId).length > 0) {
                this.processQueue(chatId);
            }
        }
    }

    // Get queue length for a chat
    getQueueLength(chatId) {
        return this.queues.has(chatId) ? this.queues.get(chatId).length : 0;
    }

    // Check if processing for a chat
    isProcessing(chatId) {
        return this.processing.get(chatId) || false;
    }
}

export const upscaleQueue = new UpscaleQueue();
