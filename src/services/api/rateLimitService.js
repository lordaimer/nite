class RateLimitService {
    constructor() {
        this.userLimits = new Map();
        this.globalLimits = new Map();
        this.LLM_MAX_REQUESTS = 20;  // 20 requests per minute per user
        this.LLM_TIME_WINDOW = 60000; // 1 minute in milliseconds
    }

    check(userId, action, maxRequests, timeWindow) {
        const key = `${userId}:${action}`;
        const now = Date.now();
        const userRequests = this.userLimits.get(key) || [];

        // Remove expired timestamps
        const validRequests = userRequests.filter(timestamp => now - timestamp < timeWindow);

        if (validRequests.length >= maxRequests) {
            return false;
        }

        // Add new request timestamp
        validRequests.push(now);
        this.userLimits.set(key, validRequests);
        return true;
    }

    checkGlobal(action, maxRequests, timeWindow) {
        const now = Date.now();
        const globalRequests = this.globalLimits.get(action) || [];

        // Remove expired timestamps
        const validRequests = globalRequests.filter(timestamp => now - timestamp < timeWindow);

        if (validRequests.length >= maxRequests) {
            return false;
        }

        // Add new request timestamp
        validRequests.push(now);
        this.globalLimits.set(action, validRequests);
        return true;
    }

    checkLLM(chatId) {
        return this.check(chatId, 'llm', this.LLM_MAX_REQUESTS, this.LLM_TIME_WINDOW);
    }

    // Clean up old entries periodically
    cleanup() {
        const now = Date.now();

        // Cleanup user limits
        for (const [key, timestamps] of this.userLimits.entries()) {
            const validTimestamps = timestamps.filter(ts => now - ts < 3600000); // 1 hour
            if (validTimestamps.length === 0) {
                this.userLimits.delete(key);
            } else {
                this.userLimits.set(key, validTimestamps);
            }
        }

        // Cleanup global limits
        for (const [action, timestamps] of this.globalLimits.entries()) {
            const validTimestamps = timestamps.filter(ts => now - ts < 3600000); // 1 hour
            if (validTimestamps.length === 0) {
                this.globalLimits.delete(action);
            } else {
                this.globalLimits.set(action, validTimestamps);
            }
        }
    }
}

export const rateLimitService = new RateLimitService();

// Run cleanup every hour
setInterval(() => {
    rateLimitService.cleanup();
}, 3600000); 