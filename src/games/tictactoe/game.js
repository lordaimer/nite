// Initialize Telegram WebApp
const tg = window.Telegram.WebApp;
tg.expand();
tg.setHeaderColor('secondary_bg_color');
tg.setBackgroundColor('secondary_bg_color');
tg.MainButton.hide();

document.body.classList.add(`tg-theme-${tg.colorScheme}`);

// Game elements
const board = document.querySelector('.game-board');
const cells = document.querySelectorAll('.board-cell');
const turnIndicator = document.querySelector('.turn-indicator');
const light = document.querySelector('.light');
let isTouch = false;

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
    gameBoard = Array(9).fill('');
    gameActive = true;
    currentPlayer = 'x';
    cells.forEach(cell => {
        cell.className = 'board-cell';
    });
    const winLine = document.querySelector('.win-line');
    winLine.className = 'win-line';
    winLine.style.opacity = '0';
    updateTurnIndicator();
}

function updateTurnIndicator() {
    if (!gameActive) return;
    const playerText = currentPlayer === 'x' ? 'Your' : (isAIMode ? 'AI\'s' : 'Player O\'s');
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
    const [a, b, c] = pattern;
    const cellSize = getComputedStyle(document.documentElement).getPropertyValue('--cell-size').trim();
    const gap = getComputedStyle(document.documentElement).getPropertyValue('--board-gap').trim();
    const gapSize = parseInt(gap);
    
    // Calculate the angle and position for the win line
    if (a % 3 === 0 && b % 3 === 1 && c % 3 === 2) {
        // Horizontal line
        winLine.style.width = '95%';
        winLine.style.height = '8px';
        // Position at the vertical center of each row (33.33% per row)
        winLine.style.top = `calc(${Math.floor(a / 3) * 33.33}% + 16.665%)`;
        winLine.style.left = '2.5%'; // Center the shortened line
        winLine.style.transform = 'translateY(-50%)';
    } else if (a % 3 === b % 3 && b % 3 === c % 3) {
        // Vertical line
        winLine.style.width = '8px';
        winLine.style.height = '95%';
        // Position at the horizontal center of each column (33.33% per column)
        winLine.style.left = `calc(${a % 3 * 33.33}% + 16.665%)`;
        winLine.style.top = '2.5%'; // Center the shortened line
        winLine.style.transform = 'translateX(-50%)';
    } else {
        // Diagonal line - different sizes for X and O
        if (currentPlayer === 'x') {
            winLine.style.width = '140%';  // Longer for X
        } else {
            winLine.style.width = '130%';  // Shorter for O
        }
        winLine.style.height = '8px';
        winLine.style.top = '50%';
        winLine.style.left = '50%';
        winLine.style.transform = pattern[0] === 0 ? 
            'translate(-50%, -50%) rotate(45deg)' : 
            'translate(-50%, -50%) rotate(-45deg)';
    }
    
    // Add the winner's class to the win line
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
        turnIndicator.textContent = currentPlayer === 'x' ? 'You win!' : (isAIMode ? 'AI wins!' : 'Player O wins!');
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

// Initialize game
cells.forEach((cell, index) => {
    cell.addEventListener('click', () => handleCellClick(index));
});

updateTurnIndicator();
