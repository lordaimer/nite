// Initialize Telegram WebApp
const telegram = window.Telegram.WebApp;
telegram.ready();

// Set theme
document.documentElement.style.setProperty('--tg-theme-bg-color', telegram.backgroundColor);
document.documentElement.style.setProperty('--tg-theme-text-color', telegram.textColor);
document.documentElement.style.setProperty('--tg-theme-button-color', telegram.buttonColor);
document.documentElement.style.setProperty('--tg-theme-button-text-color', telegram.buttonTextColor);

// Game configurations
const games = {
    tictactoe: {
        name: 'Tic Tac Toe',
        path: '/games/tictactoe/',
        description: 'Classic two-player game'
    }
    // Add more games here
};

// Handle game selection
document.querySelectorAll('.game-card').forEach(card => {
    card.addEventListener('click', () => {
        const gameId = card.dataset.game;
        const game = games[gameId];
        
        if (game) {
            // Get the base URL
            const baseUrl = window.location.href.split('/games/')[0];
            const gameUrl = `${baseUrl}${game.path}`;
            
            // Navigate to the game
            window.location.href = gameUrl;
        }
    });
});
