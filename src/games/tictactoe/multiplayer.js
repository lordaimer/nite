// Multiplayer game state management
class MultiplayerGame {
    constructor() {
        this.gameState = {
            board: Array(9).fill(''),
            currentTurn: 'host',
            gameActive: true,
            winner: null
        };
        this.role = new URLSearchParams(window.location.search).get('role');
        this.gameId = new URLSearchParams(window.location.search).get('gameId');
        this.playerName = window.Telegram.WebApp.initDataUnsafe?.user?.first_name || 'Player';
        this.setupWebSocket();
        this.updateTurnIndicator();
    }

    setupWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsPort = process.env.GAME_SERVER_PORT || 3001;
        const wsUrl = `${wsProtocol}//${window.location.hostname}:${wsPort}`;
        console.log('Connecting to WebSocket server at:', wsUrl);
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('Connected to game server');
            this.joinGame();
        };

        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleServerMessage(data);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.showError('Connection error. Please try again.');
        };

        this.ws.onclose = () => {
            console.log('Disconnected from game server');
            this.showError('Connection lost. Please refresh to reconnect.');
        };
    }

    joinGame() {
        this.ws.send(JSON.stringify({
            type: 'join',
            gameId: this.gameId,
            role: this.role,
            playerName: this.playerName
        }));
    }

    handleServerMessage(data) {
        switch (data.type) {
            case 'gameState':
                this.updateGameState(data);
                break;
            case 'error':
                this.showError(data.message);
                break;
            case 'playerDisconnected':
                this.handlePlayerDisconnect(data);
                break;
        }
    }

    updateGameState(data) {
        this.gameState = {
            board: data.board,
            currentTurn: data.currentTurn,
            gameActive: data.gameActive,
            winner: data.winner,
            hostName: data.hostName,
            guestName: data.guestName
        };

        // Update the game board
        const cells = document.querySelectorAll('.board-cell');
        this.gameState.board.forEach((value, index) => {
            cells[index].className = `board-cell cell${value ? ` ${value.toLowerCase()}` : ''}`;
            cells[index].textContent = value;
        });

        this.updateTurnIndicator();
    }

    makeMove(position) {
        if (!this.gameState.gameActive || this.gameState.board[position]) return;

        this.ws.send(JSON.stringify({
            type: 'move',
            gameId: this.gameId,
            role: this.role,
            position: position
        }));
    }

    updateTurnIndicator() {
        const turnIndicator = document.getElementById('turn-indicator');
        if (!turnIndicator) return;

        if (!this.gameState.gameActive) {
            if (this.gameState.winner) {
                const winnerName = this.gameState.winner === 'host' ? 
                    this.gameState.hostName : 
                    this.gameState.guestName;
                turnIndicator.textContent = `${winnerName} wins!`;
            } else {
                turnIndicator.textContent = "It's a draw!";
            }
            turnIndicator.className = 'turn-indicator';
            return;
        }

        if (!this.gameState.guestName) {
            turnIndicator.textContent = 'Waiting for opponent...';
            turnIndicator.className = 'turn-indicator waiting';
            return;
        }

        const currentPlayerName = this.gameState.currentTurn === 'host' ? 
            this.gameState.hostName : 
            this.gameState.guestName;
        turnIndicator.textContent = `${currentPlayerName}'s turn`;
        turnIndicator.className = `turn-indicator ${this.gameState.currentTurn === 'host' ? 'x' : 'o'}`;
    }

    handlePlayerDisconnect(data) {
        const role = data.role;
        const playerName = role === 'host' ? this.gameState.hostName : this.gameState.guestName;
        this.showError(`${playerName} has disconnected`);
    }

    showError(message) {
        const turnIndicator = document.getElementById('turn-indicator');
        if (turnIndicator) {
            turnIndicator.textContent = message;
            turnIndicator.className = 'turn-indicator error';
        }
    }

    restartGame() {
        if (!this.gameState.gameActive) {
            this.ws.send(JSON.stringify({
                type: 'restart',
                gameId: this.gameId,
                role: this.role
            }));
        }
    }
}

// Export the MultiplayerGame class
window.MultiplayerGame = MultiplayerGame;
