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

const cards = document.querySelectorAll('.game-card');
const light = document.querySelector('.light');
let isTouch = false;

function updateEffects(x, y) {
    // Update light source position
    light.style.opacity = '1';
    light.style.left = `${x}px`;
    light.style.top = `${y}px`;

    // Update each card's glow effect
    cards.forEach(card => {
        const glowContainer = card.querySelector('.glow-container');
        
        // Calculate position relative to card
        const rect = card.getBoundingClientRect();
        const mouseX = x - rect.left;
        const mouseY = y - rect.top;

        // Calculate normalized position (0 to 1)
        const normalizedX = mouseX / rect.width;
        const normalizedY = mouseY / rect.height;

        // Calculate distance from borders
        const distanceFromBorder = Math.min(
            normalizedX,
            1 - normalizedX,
            normalizedY,
            1 - normalizedY
        );

        // Calculate intensity based on proximity to border
        const intensity = Math.max(0, 1 - (distanceFromBorder * 2.5));

        // Update border glow with more focused radial gradient
        glowContainer.style.background = `
            radial-gradient(
                300px at ${mouseX}px ${mouseY}px,
                rgba(255, 255, 255, ${0.25 * intensity}) 0%,
                rgba(255, 255, 255, ${0.15 * intensity}) 25%,
                rgba(255, 255, 255, ${0.05 * intensity}) 35%,
                rgba(255, 255, 255, 0) 70%
            )
        `;

        // Add subtle inner glow
        card.style.background = `
            radial-gradient(
                circle at ${mouseX}px ${mouseY}px,
                rgba(255, 255, 255, ${0.03 * intensity}) 0%,
                rgba(255, 255, 255, 0.01) 50%,
                rgba(255, 255, 255, 0.005) 100%
            )
        `;
    });
}

function resetEffects() {
    light.style.opacity = '0';
    cards.forEach(card => {
        const glowContainer = card.querySelector('.glow-container');
        glowContainer.style.background = 'var(--border-color)';
        card.style.background = 'var(--card-bg)';
    });
}

// Mouse events
document.addEventListener('mousemove', (e) => {
    if (!isTouch) {
        updateEffects(e.clientX, e.clientY);
    }
});

document.addEventListener('mouseleave', () => {
    if (!isTouch) {
        resetEffects();
    }
});

// Touch events
document.addEventListener('touchstart', (e) => {
    isTouch = true;
    const touch = e.touches[0];
    updateEffects(touch.clientX, touch.clientY);
}, { passive: true });

document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    updateEffects(touch.clientX, touch.clientY);
}, { passive: true });

document.addEventListener('touchend', () => {
    resetEffects();
});

// Game card navigation
const actionCard = document.querySelector('.action-card');
actionCard.addEventListener('click', () => {
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
