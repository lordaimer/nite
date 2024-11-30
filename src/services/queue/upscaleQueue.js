class UpscaleQueue {
    constructor() {
        this.globalQueue = []; // Array of {chatId, job} objects
        this.processing = new Set(); // Set of currently processing chatIds
        this.MAX_CONCURRENT_JOBS = 2; // Maximum number of parallel processes
    }

    // Add a job to the queue
    addJob(chatId, job) {
        this.globalQueue.push({ chatId, job });
        this.processQueue();
    }

    // Process the next jobs in the queue
    async processQueue() {
        // If we're at max capacity, return
        if (this.processing.size >= this.MAX_CONCURRENT_JOBS) {
            return;
        }

        // Process as many jobs as we can up to MAX_CONCURRENT_JOBS
        while (this.processing.size < this.MAX_CONCURRENT_JOBS && this.globalQueue.length > 0) {
            const nextJob = this.globalQueue[0];
            
            // Skip if this chat already has a job processing
            if (this.processing.has(nextJob.chatId)) {
                // If next job is from same chat, break to maintain order
                break;
            }

            // Remove the job from queue
            this.globalQueue.shift();
            
            // Mark as processing
            this.processing.add(nextJob.chatId);

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
            // Remove from processing set
            this.processing.delete(chatId);
            
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

    // Check if processing for a chat
    isProcessing(chatId) {
        return this.processing.has(chatId);
    }

    // Get queue position for a chat's next job
    getQueuePosition(chatId) {
        const index = this.globalQueue.findIndex(item => item.chatId === chatId);
        return index === -1 ? 0 : index + 1;
    }

    // Get number of currently processing jobs
    getProcessingCount() {
        return this.processing.size;
    }
}

export const upscaleQueue = new UpscaleQueue();
