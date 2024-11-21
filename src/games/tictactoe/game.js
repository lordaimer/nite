// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.setHeaderColor('secondary_bg_color');
tg.setBackgroundColor('secondary_bg_color');
tg.MainButton.hide();

document.body.classList.add(`tg-theme-${tg.colorScheme}`);

// Get user's first name
const playerName = tg.initDataUnsafe?.user?.first_name || 'Player';

// Game elements
const board = document.querySelector('.game-board');
const cells = document.querySelectorAll('.board-cell');
const turnIndicator = document.querySelector('.turn-indicator');
const light = document.querySelector('#light-effect .light');
let isTouch = false;
const restartButton = document.querySelector('.restart-button');

// Game state
let currentPlayer = 'x';
let gameBoard = Array(9).fill('');
let gameActive = true;
let isAIMode = new URLSearchParams(window.location.search).get('mode') === 'ai';

// Winning combinations
const winPatterns = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
];

function resetGame() {
    gameBoard = ['', '', '', '', '', '', '', '', ''];
    gameActive = true;
    currentPlayer = 'x';
    cells.forEach(cell => {
        cell.className = 'board-cell';
    });
    document.querySelector('.win-line').style.opacity = '0';
    restartButton.style.display = 'none';
    updateTurnIndicator();
}

function updateTurnIndicator() {
    if (!gameActive) return;
    const playerText = currentPlayer === 'x' ? `${playerName}'s` : (isAIMode ? 'Nite\'s' : 'Player O\'s');
    turnIndicator.textContent = `${playerText} turn`;
    turnIndicator.className = `turn-indicator ${currentPlayer}`;
}

function checkWinner() {
    for (const pattern of winPatterns) {
        const [a, b, c] = pattern;
        if (gameBoard[a] && gameBoard[a] === gameBoard[b] && gameBoard[a] === gameBoard[c]) {
            return { winner: gameBoard[a], pattern };
        }
    }
    return null;
}

function showWinLine(pattern) {
    const winLine = document.querySelector('.win-line');
    const a = pattern[0];
    const c = pattern[2];

    // Horizontal win
    if (a === c - 2) {
        winLine.style.width = '92%'; // Slightly shorter than 95%
        winLine.style.height = '8px';
        const row = Math.floor(a / 3);
        winLine.style.top = `calc(${row * 33.33}% + 16.665%)`;
        winLine.style.left = '4%'; // Adjust for the shorter width
        winLine.style.transform = 'none';
    }
    // Vertical win
    else if (a === c - 6) {
        winLine.style.width = '8px';
        winLine.style.height = '92%'; // Slightly shorter than 95%
        const col = a % 3;
        winLine.style.left = `calc(${col * 33.33}% + 16.665%)`;
        winLine.style.top = '4%'; // Adjust for the shorter height
        winLine.style.transform = 'none';
    }
    // Diagonal win
    else {
        const width = '128%'; // Reduced from 133%
        winLine.style.width = width;
        winLine.style.height = '8px';
        winLine.style.top = '50%';
        winLine.style.left = '50%';
        winLine.style.transform = pattern[0] === 0 ? 
            'translate(-50%, -50%) rotate(45deg)' : 
            'translate(-50%, -50%) rotate(-45deg)';
    }
    
    winLine.className = 'win-line ' + currentPlayer;
    winLine.style.opacity = '1';
}

function handleCellClick(index) {
    if (!gameActive || gameBoard[index]) return;

    gameBoard[index] = currentPlayer;
    cells[index].classList.add(currentPlayer);
    
    const result = checkWinner();
    if (result) {
        gameActive = false;
        showWinLine(result.pattern);
        turnIndicator.textContent = currentPlayer === 'x' ? `${playerName} wins!` : (isAIMode ? 'Nite wins!' : 'Player O wins!');
        restartButton.style.display = 'block';
    } else if (!gameBoard.includes('')) {
        gameActive = false;
        turnIndicator.textContent = "It's a draw!";
        // Auto restart after 1.5 seconds on draw
        setTimeout(resetGame, 1500);
    } else {
        currentPlayer = currentPlayer === 'x' ? 'o' : 'x';
        updateTurnIndicator();
        
        if (isAIMode && gameActive && currentPlayer === 'o') {
            setTimeout(makeAIMove, 500);
        }
    }
}

function makeAIMove() {
    const bestMove = findBestMove();
    if (bestMove !== -1) {
        handleCellClick(bestMove);
    }
}

function findBestMove() {
    // First try to win
    const winMove = findWinningMove('o');
    if (winMove !== -1) return winMove;

    // Then block opponent from winning
    const blockMove = findWinningMove('x');
    if (blockMove !== -1) return blockMove;

    // Try to take center
    if (gameBoard[4] === '') return 4;

    // Try to take corners
    const corners = [0, 2, 6, 8];
    const emptyCorners = corners.filter(i => gameBoard[i] === '');
    if (emptyCorners.length > 0) {
        return emptyCorners[Math.floor(Math.random() * emptyCorners.length)];
    }

    // Take any available edge
    const edges = [1, 3, 5, 7];
    const emptyEdges = edges.filter(i => gameBoard[i] === '');
    if (emptyEdges.length > 0) {
        return emptyEdges[Math.floor(Math.random() * emptyEdges.length)];
    }

    return -1;
}

function findWinningMove(player) {
    for (let i = 0; i < 9; i++) {
        if (gameBoard[i] === '') {
            gameBoard[i] = player;
            if (checkWinner()) {
                gameBoard[i] = '';
                return i;
            }
            gameBoard[i] = '';
        }
    }
    return -1;
}

// Light effect handling
function updateEffects(x, y) {
    if (light) {
        light.style.left = x + 'px';
        light.style.top = y + 'px';
        light.style.opacity = '1';
    }
}

function resetEffects() {
    if (light) {
        light.style.opacity = '0';
    }
}

// Event listeners for effects
document.addEventListener('mousemove', (e) => {
    if (!isTouch) updateEffects(e.clientX, e.clientY);
});

document.addEventListener('touchstart', () => {
    isTouch = true;
    resetEffects();
});

document.addEventListener('touchend', resetEffects);

// Handle visibility and resize
document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetEffects();
});

// Initialize game
cells.forEach((cell, index) => {
    cell.addEventListener('click', () => handleCellClick(index));
    cell.addEventListener('touchstart', () => {
        isTouch = true;
    }, { passive: true });
});

restartButton.addEventListener('click', resetGame);

updateTurnIndicator();
