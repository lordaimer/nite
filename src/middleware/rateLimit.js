const userRateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_REQUESTS = 3; // Maximum 3 requests per second

export function rateLimitMiddleware(userId) {
    // Admin bypass - always allow admin user
    if (userId.toString() === process.env.ADMIN_USER_ID) {
        return true;
    }

    const now = Date.now();
    const userLimit = userRateLimits.get(userId) || { count: 0, timestamp: now };

    // Reset count if window has passed
    if (now - userLimit.timestamp >= RATE_LIMIT_WINDOW) {
        userLimit.count = 0;
        userLimit.timestamp = now;
    }

    // Increment count and check limit
    userLimit.count++;
    userRateLimits.set(userId, userLimit);

    return userLimit.count <= MAX_REQUESTS;
}
