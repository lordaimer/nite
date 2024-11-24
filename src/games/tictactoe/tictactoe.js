// Checkpoint Hover Glow Effect Design 

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
const turnIndicator = document.getElementById('turn-indicator');
const light = document.querySelector('#light-effect .light');
let isTouch = false;
const restartButton = document.querySelector('.restart-button');

// Game state
let currentPlayer = 'x';
let gameBoard = Array(9).fill('');
let gameActive = true;
const urlParams = new URLSearchParams(window.location.search);
const gameMode = urlParams.get('mode');
const isAIMode = gameMode === 'ai';
const isOnlineMode = gameMode === 'online';
let multiplayerGame;

if (isOnlineMode) {
    multiplayerGame = new MultiplayerGame();
}

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
    // Reset background to X's turn
    document.body.classList.remove('o-turn');
    updateTurnIndicator();
    if (document.querySelector('.winning-line')) {
        document.querySelector('.winning-line').remove();
    }
    document.querySelector('.win-line').style.opacity = '0';
    restartButton.style.display = 'none';
    if (!isOnlineMode) {
        updateTurnIndicator();
    }
}

function updateTurnIndicator() {
    if (isOnlineMode) return; // Handled by multiplayer.js
    
    if (!gameActive) return;
    turnIndicator.textContent = `${currentPlayer.toUpperCase()}'s Turn`;
    turnIndicator.className = `turn-indicator ${currentPlayer}`;
    // Update background color based on current player
    document.body.classList.toggle('o-turn', currentPlayer === 'o');
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
        winLine.style.width = '92%';
        winLine.style.height = '8px';
        const row = Math.floor(a / 3);
        winLine.style.top = `calc(${row * 33.33}% + 16.665%)`;
        winLine.style.left = '4%';
        winLine.style.transform = 'none';
    }
    // Vertical win
    else if (a === c - 6) {
        winLine.style.width = '8px';
        winLine.style.height = '92%';
        const col = a % 3;
        winLine.style.left = `calc(${col * 33.33}% + 16.665%)`;
        winLine.style.top = '4%';
        winLine.style.transform = 'none';
    }
    // Diagonal win
    else {
        const width = '128%';
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
    if (!gameActive || gameBoard[index] !== '') return;

    if (isOnlineMode) {
        const role = multiplayerGame.getRole();
        if (!role || currentPlayer !== role) return;
        multiplayerGame.makeMove(index, role);
        return;
    }

    gameBoard[index] = currentPlayer;
    cells[index].className = `board-cell ${currentPlayer}`;

    const result = checkWinner();
    if (result) {
        gameActive = false;
        showWinLine(result.pattern);
        turnIndicator.textContent = currentPlayer === 'x' ? 
            `${playerName} wins!` : 
            (isAIMode ? 'Nite wins!' : 'Player O wins!');
        restartButton.style.display = 'block';
        return;
    }

    if (!gameBoard.includes('')) {
        gameActive = false;
        turnIndicator.textContent = "It's a draw!";
        restartButton.style.display = 'block';
        return;
    }

    currentPlayer = currentPlayer === 'x' ? 'o' : 'x';
    updateTurnIndicator();

    if (isAIMode && currentPlayer === 'o' && gameActive) {
        setTimeout(makeAIMove, 500);
    }
}

function makeAIMove() {
    const move = findBestMove();
    if (move !== null) {
        handleCellClick(move);
    }
}

function findBestMove() {
    // First, try to win
    const winningMove = findWinningMove('o');
    if (winningMove !== null) return winningMove;

    // Then, block player's winning move
    const blockingMove = findWinningMove('x');
    if (blockingMove !== null) return blockingMove;

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

    return null;
}

function findWinningMove(player) {
    for (let i = 0; i < 9; i++) {
        if (gameBoard[i] === '') {
            gameBoard[i] = player;
            const result = checkWinner();
            gameBoard[i] = '';
            if (result && result.winner === player) {
                return i;
            }
        }
    }
    return null;
}

// Light effect handling
function updateEffects(x, y) {
    const rect = board.getBoundingClientRect();
    const boardX = rect.left + rect.width / 2;
    const boardY = rect.top + rect.height / 2;
    const angle = Math.atan2(y - boardY, x - boardX) * 180 / Math.PI;
    light.style.transform = `rotate(${angle}deg)`;
}

function resetEffects() {
    if (!isTouch) {
        light.style.transform = 'rotate(0deg)';
    }
}

// Event listeners for effects
document.addEventListener('mousemove', (e) => {
    if (!isTouch) updateEffects(e.clientX, e.clientY);
});

document.addEventListener('touchstart', () => {
    isTouch = true;
    light.style.animation = 'rotate 4s linear infinite';
});

// Event listeners for game
cells.forEach((cell, index) => {
    cell.addEventListener('click', () => handleCellClick(index));
});

restartButton.addEventListener('click', resetGame);

// Initialize turn indicator
if (!isOnlineMode) {
    updateTurnIndicator();
}
