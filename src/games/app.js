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

// Expand to full height and hide bot name in footer
tg.expand();
tg.setHeaderColor('secondary_bg_color');
tg.setBackgroundColor('secondary_bg_color');

// Hide the main button and bot name in footer
tg.MainButton.hide();
if (tg.platform !== 'unknown') {
    document.documentElement.style.setProperty('--tg-footer-height', '0px');
    document.documentElement.classList.add('no-footer');
}

// Set theme class on body
document.body.classList.add(`tg-theme-${tg.colorScheme}`);

// Light effect
const lightEffect = document.querySelector('.light');
let isTouch = false;
let lightTimeout;

// Mouse move light effect
document.addEventListener('mousemove', (e) => {
    if (!isTouch) {
        clearTimeout(lightTimeout);
        lightEffect.style.opacity = '1';
        lightEffect.style.left = `${e.clientX}px`;
        lightEffect.style.top = `${e.clientY}px`;
        
        // Start fade out timer
        lightTimeout = setTimeout(() => {
            lightEffect.style.opacity = '0';
        }, 1000);
    }
});

document.addEventListener('mouseleave', () => {
    if (!isTouch) {
        lightEffect.style.opacity = '0';
    }
});

// Touch effect
document.addEventListener('touchstart', (e) => {
    isTouch = true;
    const touch = e.touches[0];
    clearTimeout(lightTimeout);
    lightEffect.style.opacity = '1';
    lightEffect.style.left = `${touch.clientX}px`;
    lightEffect.style.top = `${touch.clientY}px`;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    lightEffect.style.left = `${touch.clientX}px`;
    lightEffect.style.top = `${touch.clientY}px`;
}, { passive: true });

document.addEventListener('touchend', () => {
    lightTimeout = setTimeout(() => {
        lightEffect.style.opacity = '0';
    }, 1000);
});

// Game card navigation
const gameCard = document.querySelector('.game-card');
gameCard.addEventListener('click', () => {
    window.location.href = 'tictactoe/index.html';
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

// Game configurations
const games = {
    tictactoe: {
        name: 'Tic Tac Toe',
        path: '/games/tictactoe/',
        description: 'Classic two-player game'
    }
    // Add more games here
};
