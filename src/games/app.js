// Set custom headers for all fetch requests
const originalFetch = window.fetch;
window.fetch = function(url, options = {}) {
    if (!options.headers) {
        options.headers = {};
    }
    options.headers['ngrok-skip-browser-warning'] = 'true';
    options.headers['User-Agent'] = 'NiteGameHub/1.0';
    
    return originalFetch(url, options);
};

// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();

// Hide the main button
tg.MainButton.hide();

// Set theme class on body
document.body.classList.add(`tg-theme-${tg.colorScheme}`);

// Game configurations
const games = {
    tictactoe: {
        name: 'Tic Tac Toe',
        path: '/games/tictactoe/',
        description: 'Classic two-player game'
    }
    // Add more games here
};

// Game selection handling
document.querySelectorAll('.game-card').forEach(card => {
    const gameType = card.dataset.game;
    if (!gameType) return; // Skip if no game type (coming soon cards)
    
    const button = card.querySelector('.play-button');
    if (!button) return;

    button.addEventListener('click', () => {
        // Add pressed animation
        button.style.transform = 'scale(0.95)';
        setTimeout(() => button.style.transform = '', 200);

        // Handle game selection
        const game = games[gameType];
        if (game) {
            // Get the base URL
            const baseUrl = window.location.href.split('/games/')[0];
            const gameUrl = `${baseUrl}${game.path}`;
            
            // Navigate to the game
            window.location.href = gameUrl;
        } else {
            console.warn('Unknown game type:', gameType);
        }
    });
});

// Make game cards interactive
document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
        const game = card.dataset.game;
        if (game === 'tictactoe') {
            window.location.href = 'tictactoe/index.html';
        }
    });
});

// Add card hover effects
document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('mouseover', () => {
        const inner = card.querySelector('.game-card-inner');
        if (inner) {
            inner.style.transform = 'translateY(-5px)';
        }
    });

    card.addEventListener('mouseout', () => {
        const inner = card.querySelector('.game-card-inner');
        if (inner) {
            inner.style.transform = '';
        }
    });
});

// Handle back button
tg.BackButton.onClick(() => {
    window.history.back();
});

// Handle visibility changes
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        // Pause any animations or background tasks
    } else {
        // Resume animations or tasks
    }
});

// Handle viewport changes
window.addEventListener('resize', () => {
    // Adjust layout if needed
    const grid = document.querySelector('.games-grid');
    if (grid) {
        const width = window.innerWidth;
        if (width < 768) {
            grid.style.gridTemplateColumns = '1fr';
        } else {
            grid.style.gridTemplateColumns = 'repeat(auto-fit, minmax(280px, 1fr))';
        }
    }
});
