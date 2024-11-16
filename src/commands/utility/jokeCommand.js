async function fetchJoke() {
    try {
        // Using JokeAPI with more categories and no safe-mode filter
        // Categories: Programming, Misc, Dark, Pun, Spooky, Christmas
        const response = await fetch('https://v2.jokeapi.dev/joke/Any?type=single');
        const data = await response.json();
        
        if (data.error) {
            return 'Sorry, I couldn\'t fetch a joke right now. Try again later!';
        }
        
        return data.joke;
    } catch (error) {
        console.error('Error fetching joke:', error);
        return 'Sorry, I couldn\'t fetch a joke right now. Try again later!';
    }
}

// Store user joke history: userId -> Set of jokes
const userJokeHistory = new Map();

export function setupJokeCommand(bot) {
    bot.onText(/\/(joke|jk)/, async (msg) => {
        const userId = msg.from.id;
        
        // Initialize user's joke history if it doesn't exist
        if (!userJokeHistory.has(userId)) {
            userJokeHistory.set(userId, new Set());
        }

        const userHistory = userJokeHistory.get(userId);
        
        // Try to get a unique joke (max 5 attempts)
        let joke;
        let attempts = 0;
        do {
            joke = await fetchJoke();
            attempts++;
        } while (userHistory.has(joke) && attempts < 5);

        // If we found a new joke, add it to history
        if (!userHistory.has(joke)) {
            userHistory.add(joke);
            
            // If history gets too large (e.g., over 100 jokes), clear it
            if (userHistory.size > 100) {
                userHistory.clear();
            }
        }

        // Send the joke
        await bot.sendMessage(msg.chat.id, joke);
    });
}

export { fetchJoke };  // Add this export 