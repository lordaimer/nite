import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';

export class GameServer {
    constructor(server) {
        this.wss = new WebSocketServer({ server });
        this.games = new Map(); // gameId -> { host, guest, gameState }
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.wss.on('connection', (ws) => {
            console.log('New client connected');
            
            // Send initial connection success message
            ws.send(JSON.stringify({ type: 'connected' }));

            ws.on('message', (message) => {
                try {
                    const data = JSON.parse(message);
                    console.log('Received message:', data);
                    this.handleMessage(ws, data);
                } catch (error) {
                    console.error('Error handling message:', error);
                    ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
                }
            });

            ws.on('close', () => {
                console.log('Client disconnected');
                this.handleDisconnect(ws);
            });

            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                try {
                    ws.send(JSON.stringify({ type: 'error', message: 'WebSocket error occurred' }));
                } catch (e) {
                    console.error('Could not send error message to client:', e);
                }
            });
        });

        this.wss.on('error', (error) => {
            console.error('WebSocket server error:', error);
        });
    }

    handleMessage(ws, data) {
        switch (data.type) {
            case 'join':
                this.handleJoin(ws, data);
                break;
            case 'move':
                this.handleMove(ws, data);
                break;
            case 'restart':
                this.handleRestart(ws, data);
                break;
            default:
                ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
        }
    }

    handleJoin(ws, data) {
        const { gameId, role, playerName } = data;
        let game = this.games.get(gameId);

        if (!game) {
            if (role !== 'host') {
                ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
                return;
            }
            // Create new game if host is joining
            game = {
                host: { ws, name: playerName },
                gameState: {
                    board: Array(9).fill(''),
                    currentTurn: 'host',
                    gameActive: true,
                    winner: null
                }
            };
            this.games.set(gameId, game);
            ws.send(JSON.stringify({
                type: 'joined',
                role: 'host',
                gameState: game.gameState
            }));
        } else {
            if (role === 'host' && game.host) {
                ws.send(JSON.stringify({ type: 'error', message: 'Host already exists' }));
                return;
            }
            if (role === 'guest' && game.guest) {
                ws.send(JSON.stringify({ type: 'error', message: 'Guest already exists' }));
                return;
            }

            // Add player to game
            if (role === 'host') {
                game.host = { ws, name: playerName };
            } else {
                game.guest = { ws, name: playerName };
            }

            // Notify both players
            this.broadcastGameState(game, gameId);
        }
    }

    handleMove(ws, data) {
        const { gameId, role, position } = data;
        const game = this.games.get(gameId);

        if (!game) {
            ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
            return;
        }

        // Verify it's the player's turn
        if (game.gameState.currentTurn !== role) {
            ws.send(JSON.stringify({ type: 'error', message: 'Not your turn' }));
            return;
        }

        // Update game state
        const symbol = role === 'host' ? 'X' : 'O';
        game.gameState.board[position] = symbol;

        // Check for win or draw
        const winner = this.checkWinner(game.gameState.board);
        if (winner) {
            game.gameState.winner = winner;
            game.gameState.gameActive = false;
        } else if (!game.gameState.board.includes('')) {
            game.gameState.gameActive = false;
        } else {
            // Switch turns
            game.gameState.currentTurn = role === 'host' ? 'guest' : 'host';
        }

        // Broadcast updated state
        this.broadcastGameState(game, gameId);
    }

    handleRestart(ws, data) {
        const { gameId, role } = data;
        const game = this.games.get(gameId);

        if (!game) {
            ws.send(JSON.stringify({ type: 'error', message: 'Game not found' }));
            return;
        }

        // Reset game state
        game.gameState = {
            board: Array(9).fill(''),
            currentTurn: 'host',
            gameActive: true,
            winner: null
        };

        // Broadcast new state
        this.broadcastGameState(game, gameId);
    }

    handleDisconnect(ws) {
        // Find and cleanup any games this client was part of
        for (const [gameId, game] of this.games.entries()) {
            if (game.host?.ws === ws || game.guest?.ws === ws) {
                const role = game.host?.ws === ws ? 'host' : 'guest';
                const otherPlayer = role === 'host' ? game.guest : game.host;

                if (otherPlayer) {
                    otherPlayer.ws.send(JSON.stringify({
                        type: 'playerDisconnected',
                        role: role
                    }));
                }

                this.games.delete(gameId);
                break;
            }
        }
    }

    broadcastGameState(game, gameId) {
        const baseState = {
            board: game.gameState.board,
            currentTurn: game.gameState.currentTurn,
            gameActive: game.gameState.gameActive,
            winner: game.gameState.winner,
            hostName: game.host?.name,
            guestName: game.guest?.name
        };

        if (game.host) {
            game.host.ws.send(JSON.stringify({
                type: 'gameState',
                ...baseState,
                role: 'host'
            }));
        }

        if (game.guest) {
            game.guest.ws.send(JSON.stringify({
                type: 'gameState',
                ...baseState,
                role: 'guest'
            }));
        }
    }

    checkWinner(board) {
        const winPatterns = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
            [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        for (const pattern of winPatterns) {
            const [a, b, c] = pattern;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a] === 'X' ? 'host' : 'guest';
            }
        }
        return null;
    }
}
