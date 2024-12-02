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
        try {
            // If we're at max capacity, return
            const totalProcessing = Array.from(this.processing.values()).reduce((a, b) => a + b, 0);
            if (totalProcessing >= this.MAX_CONCURRENT_JOBS) {
                return;
            }

            // Safety check for invalid processing states
            for (const [chatId, count] of this.processing.entries()) {
                if (typeof count !== 'number' || count <= 0) {
                    this.processing.delete(chatId);
                }
            }

            // Process as many jobs as we can up to MAX_CONCURRENT_JOBS
            let processedInThisRound = 0;
            while (processedInThisRound < this.MAX_CONCURRENT_JOBS && this.globalQueue.length > 0) {
                const nextJob = this.globalQueue[0];
                
                // Validate job object
                if (!nextJob || !nextJob.chatId || typeof nextJob.job !== 'function') {
                    console.error('Invalid job in queue:', nextJob);
                    this.globalQueue.shift(); // Remove invalid job
                    continue;
                }

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
                processedInThisRound++;

                // Process the job asynchronously
                this.processJob(nextJob.chatId, nextJob.job).catch(error => {
                    console.error(`Job processing failed for chat ${nextJob.chatId}:`, error);
                });
            }
        } catch (error) {
            console.error('Error in processQueue:', error);
        }
    }

    // Process a single job
    async processJob(chatId, job) {
        // Add timeout promise
        const timeout = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Job timed out')), 300000) // 5 minute timeout
        );

        try {
            // Race between job and timeout
            await Promise.race([
                job(),
                timeout
            ]);
        } catch (error) {
            console.error('Error processing upscale job:', error);
            throw error; // Re-throw to be handled by caller
        } finally {
            try {
                // Ensure processing count is properly decremented
                const userProcessing = this.processing.get(chatId);
                if (typeof userProcessing === 'number' && userProcessing > 0) {
                    const newCount = userProcessing - 1;
                    if (newCount <= 0) {
                        this.processing.delete(chatId);
                    } else {
                        this.processing.set(chatId, newCount);
                    }
                } else {
                    // Cleanup invalid state
                    this.processing.delete(chatId);
                }
            } catch (cleanupError) {
                console.error('Error in queue cleanup:', cleanupError);
                // Ensure chat is removed from processing in case of cleanup error
                this.processing.delete(chatId);
            }

            // Process next jobs
            setImmediate(() => this.processQueue());
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
