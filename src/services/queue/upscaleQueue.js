class UpscaleQueue {
    constructor() {
        this.globalQueue = []; // Array of {chatId, job} objects
        this.processing = new Map(); // Map of chatId -> number of jobs processing
        this.MAX_CONCURRENT_JOBS = 2; // Maximum number of parallel processes
        this.MAX_PER_USER = 2; // Maximum concurrent jobs per user
        this.isProcessing = false; // Flag to track if queue is being processed
    }

    // Add a job to the queue
    addJob(chatId, job) {
        this.globalQueue.push({ chatId, job });
        // Start processing if not already processing
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    // Process the next jobs in the queue
    async processQueue() {
        // If already processing, return
        if (this.isProcessing) {
            return;
        }

        try {
            this.isProcessing = true;

            while (true) { // Continue processing until no more jobs can be processed
                // Get total processing count
                const totalProcessing = Array.from(this.processing.values()).reduce((a, b) => a + b, 0);
                if (totalProcessing >= this.MAX_CONCURRENT_JOBS || this.globalQueue.length === 0) {
                    break; // Exit if at capacity or no more jobs
                }

                // Safety check for invalid processing states
                for (const [chatId, count] of this.processing.entries()) {
                    if (typeof count !== 'number' || count <= 0) {
                        this.processing.delete(chatId);
                    }
                }

                let jobProcessed = false;
                for (let i = 0; i < this.globalQueue.length; i++) {
                    const nextJob = this.globalQueue[i];
                    
                    // Validate job object
                    if (!nextJob || !nextJob.chatId || typeof nextJob.job !== 'function') {
                        console.error('Invalid job in queue:', nextJob);
                        this.globalQueue.splice(i, 1); // Remove invalid job
                        i--; // Adjust index
                        continue;
                    }

                    const userProcessing = this.processing.get(nextJob.chatId) || 0;
                    
                    // Skip if this user is at their max concurrent jobs
                    if (userProcessing >= this.MAX_PER_USER) {
                        continue;
                    }

                    // Remove the job from queue
                    this.globalQueue.splice(i, 1);
                    
                    // Increment processing count for this user
                    this.processing.set(nextJob.chatId, userProcessing + 1);
                    jobProcessed = true;

                    // Process the job asynchronously
                    this.processJob(nextJob.chatId, nextJob.job)
                        .catch(error => {
                            console.error(`Job processing failed for chat ${nextJob.chatId}:`, error);
                        })
                        .finally(() => {
                            // Try to process more jobs when this one finishes
                            this.processQueue();
                        });
                    
                    break; // Process one job at a time
                }

                if (!jobProcessed) {
                    break; // No jobs could be processed in this iteration
                }
            }
        } catch (error) {
            console.error('Error in processQueue:', error);
        } finally {
            this.isProcessing = false;
            
            // If there are still jobs and capacity, process them
            const totalProcessing = Array.from(this.processing.values()).reduce((a, b) => a + b, 0);
            if (this.globalQueue.length > 0 && totalProcessing < this.MAX_CONCURRENT_JOBS) {
                setImmediate(() => this.processQueue());
            }
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
