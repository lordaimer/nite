class UpscaleQueue {
    constructor() {
        this.globalQueue = []; // Array of {chatId, job} objects
        this.processing = new Map(); // Map of chatId -> number of jobs processing
        this.MAX_CONCURRENT_JOBS = 2; // Maximum number of parallel processes
        this.MAX_PER_USER = 2; // Maximum concurrent jobs per user
    }

    // Add a job to the queue
    addJob(chatId, job) {
        this.globalQueue.push({ chatId, job });
        this.processQueue();
    }

    // Process the next jobs in the queue
    async processQueue() {
        // If we're at max capacity, return
        const totalProcessing = Array.from(this.processing.values()).reduce((a, b) => a + b, 0);
        if (totalProcessing >= this.MAX_CONCURRENT_JOBS) {
            return;
        }

        // Process as many jobs as we can up to MAX_CONCURRENT_JOBS
        while (totalProcessing < this.MAX_CONCURRENT_JOBS && this.globalQueue.length > 0) {
            const nextJob = this.globalQueue[0];
            const userProcessing = this.processing.get(nextJob.chatId) || 0;
            
            // Skip if this user is at their max concurrent jobs
            if (userProcessing >= this.MAX_PER_USER) {
                // Check next job
                if (this.globalQueue.length > 1) {
                    // Move this job to the end and try the next one
                    this.globalQueue.push(this.globalQueue.shift());
                    continue;
                }
                break;
            }

            // Remove the job from queue
            this.globalQueue.shift();
            
            // Increment processing count for this user
            this.processing.set(nextJob.chatId, userProcessing + 1);

            // Process the job
            this.processJob(nextJob.chatId, nextJob.job);
        }
    }

    // Process a single job
    async processJob(chatId, job) {
        try {
            await job();
        } catch (error) {
            console.error('Error processing upscale job:', error);
        } finally {
            // Decrement processing count for this user
            const userProcessing = this.processing.get(chatId) - 1;
            if (userProcessing <= 0) {
                this.processing.delete(chatId);
            } else {
                this.processing.set(chatId, userProcessing);
            }
            
            // Process next jobs
            this.processQueue();
        }
    }

    // Get queue length for a chat
    getQueueLength(chatId) {
        return this.globalQueue.filter(item => item.chatId === chatId).length;
    }

    // Get total queue length
    getTotalQueueLength() {
        return this.globalQueue.length;
    }

    // Check if processing for a chat and get count
    getProcessingCount(chatId) {
        return this.processing.get(chatId) || 0;
    }

    // Get queue position for a chat's next job
    getQueuePosition(chatId) {
        const index = this.globalQueue.findIndex(item => item.chatId === chatId);
        return index === -1 ? 0 : index + 1;
    }

    // Get total number of processing jobs
    getTotalProcessingCount() {
        return Array.from(this.processing.values()).reduce((a, b) => a + b, 0);
    }
}

export const upscaleQueue = new UpscaleQueue();
