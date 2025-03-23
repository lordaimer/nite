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
tg.setHeaderColor('secondary_bg_color');
tg.setBackgroundColor('secondary_bg_color');
tg.MainButton.hide();

document.documentElement.style.setProperty('--tg-footer-height', '0px');
document.documentElement.classList.add('no-footer');
document.body.classList.add(`tg-theme-${tg.colorScheme}`);

const cards = document.querySelectorAll('.game-card');
const light = document.querySelector('.light');
let isTouch = false;
let isButtonPressed = false;  // Track if any button was pressed

function updateEffects(x, y) {
    if (isButtonPressed) return; // Skip hover effects if button is being pressed
    
    light.style.opacity = '1';
    light.style.left = `${x}px`;
    light.style.top = `${y}px`;

    cards.forEach(card => {
        const glowContainer = card.querySelector('.glow-container');
        const rect = card.getBoundingClientRect();
        const mouseX = x - rect.left;
        const mouseY = y - rect.top;

        const normalizedX = mouseX / rect.width;
        const normalizedY = mouseY / rect.height;
        const distanceFromBorder = Math.min(
            normalizedX, 1 - normalizedX,
            normalizedY, 1 - normalizedY
        );
        const intensity = Math.max(0, 1 - (distanceFromBorder * 2.5));

        if (!card.matches(':active')) { // Only update hover effect if not pressed
            glowContainer.style.background = `radial-gradient(
                300px at ${mouseX}px ${mouseY}px,
                rgba(255, 255, 255, ${0.25 * intensity}) 0%,
                rgba(255, 255, 255, ${0.15 * intensity}) 25%,
                rgba(255, 255, 255, ${0.05 * intensity}) 35%,
                rgba(255, 255, 255, 0) 70%
            )`;

            card.style.background = `radial-gradient(
                circle at ${mouseX}px ${mouseY}px,
                rgba(255, 255, 255, ${0.03 * intensity}) 0%,
                rgba(255, 255, 255, 0.01) 50%,
                rgba(255, 255, 255, 0.005) 100%
            )`;
        }
    });
}

function resetEffects() {
    light.style.opacity = '0';
    
    // If a button was pressed, skip all animations
    if (isButtonPressed) return;
    
    cards.forEach(card => {
        const glowContainer = card.querySelector('.glow-container');
        let progress = 0;
        const animate = () => {
            progress = Math.min(1, progress + 0.05);
            const easeInProgress = progress * progress;
            
            // Calculate opacities with bottom-to-top animation
            const bottomOpacity = 0.2 * easeInProgress;
            const middleOpacity = progress < 0.3 ? 0 : 0.15 * ((progress - 0.3) / 0.7);
            const topOpacity = progress < 0.6 ? 0 : 0.1 * ((progress - 0.6) / 0.4);
            
            glowContainer.style.background = `linear-gradient(
                180deg,
                rgba(255, 255, 255, ${topOpacity}) 0%,
                rgba(255, 255, 255, ${middleOpacity}) 50%,
                rgba(255, 255, 255, ${bottomOpacity}) 100%
            )`;
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };
        
        requestAnimationFrame(animate);
        card.style.background = 'var(--card-bg)';
    });
}

// Event listeners for effects
document.addEventListener('mousemove', (e) => {
    if (!isTouch) updateEffects(e.clientX, e.clientY);
});

document.addEventListener('mouseleave', () => {
    if (!isTouch) resetEffects();
    isButtonPressed = false;
});

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
    setTimeout(() => {
        isButtonPressed = false;
    }, 100);
});

// Add mousedown and mouseup listeners
cards.forEach(card => {
    card.addEventListener('mousedown', () => {
        isButtonPressed = true;
    });
    
    card.addEventListener('touchstart', () => {
        isButtonPressed = true;
    });
});

// Global mouseup and touchend listeners
document.addEventListener('mouseup', () => {
    isButtonPressed = false;
});

// Game navigation
document.getElementById('play-ai').addEventListener('click', () => {
    isButtonPressed = true;
    window.location.href = '/games/tictactoe/tictactoe.html?mode=ai';
});

document.getElementById('play-friend').addEventListener('click', () => {
    isButtonPressed = true;
    // Generate a unique game ID using chat ID and random string
    const chatId = tg.initDataUnsafe?.user?.id || Date.now(); // Use chat ID if available
    const randomStr = Math.random().toString(36).substring(2, 8);
    const gameId = `${chatId}-${randomStr}`;
    
    // Create a Telegram deep link that opens the bot chat with the game invite command
    const botUsername = 'niitebot';
    const deepLink = `https://t.me/${botUsername}?start=game_${gameId}`;
    
    // Show message with the invite link
    tg.showPopup({
        title: '🎮 Game Invite Created',
        message: 'Share this message with your friend to start playing!\n\n' +
                'Note: You can forward this message to anyone you want to play with.',
        buttons: [
            { id: 'copy', type: 'default', text: '📋 Copy Invite Link' }
        ]
    }, (buttonId) => {
        if (buttonId === 'copy') {
            // Copy the invite link to clipboard
            navigator.clipboard.writeText(deepLink).then(() => {
                tg.showAlert('✅ Game invite link copied to clipboard!');
            }).catch(() => {
                tg.showAlert('❌ Failed to copy link. Please try again.');
            });
        }
    });
});

// Handle visibility and resize
document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetEffects();
});

window.addEventListener('resize', () => {
    const grid = document.querySelector('.games-grid');
    if (grid) {
        grid.style.gridTemplateColumns = window.innerWidth < 768 ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))';
    }
});

// Navigation
tg.BackButton.onClick(() => window.history.back());

// Game configurations
const games = {
    tictactoe: {
        name: 'Tic Tac Toe',
        path: '/games/tictactoe/',
        description: 'Classic two-player game'
    }
    // Add more games here
};
