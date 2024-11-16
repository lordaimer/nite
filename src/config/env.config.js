export function validateEnvironment() {
    const requiredEnvVars = [
        'TELEGRAM_BOT_TOKEN',
        'GOOGLE_API_KEY',
        'NINJA_API_KEY',
        'UNSPLASH_ACCESS_KEY',
        'PIXABAY_API_KEY',
        'HUGGING_FACE_TOKEN',
        'ELEVENLABS_API_KEY',
        'OMDB_API_KEY',
        'TMDB_API_KEY',
        'ADMIN_USER_ID',
        'ARANE_CHAT_ID',
        'YVAINE_CHAT_ID'
    ];

    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
        throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    return true;
}

export const config = {
    telegram: {
        token: process.env.TELEGRAM_BOT_TOKEN,
        adminId: process.env.ADMIN_USER_ID,
        araneId: process.env.ARANE_CHAT_ID,
        yvaineId: process.env.YVAINE_CHAT_ID
    },
    google: {
        apiKey: process.env.GOOGLE_API_KEY
    },
    ninja: {
        apiKey: process.env.NINJA_API_KEY
    },
    unsplash: {
        accessKey: process.env.UNSPLASH_ACCESS_KEY
    },
    pixabay: {
        apiKey: process.env.PIXABAY_API_KEY
    },
    huggingface: {
        token: process.env.HUGGING_FACE_TOKEN
    },
    elevenlabs: {
        apiKey: process.env.ELEVENLABS_API_KEY
    },
    omdb: {
        apiKey: process.env.OMDB_API_KEY
    },
    tmdb: {
        apiKey: process.env.TMDB_API_KEY
    }
};
