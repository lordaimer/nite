import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameServer } from './websocket/gameServer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Serve static files from the games directory
app.use('/games', express.static(path.join(__dirname, 'games')));

// Initialize WebSocket server
const PORT = process.env.GAME_SERVER_PORT || 3001;
const gameServer = new GameServer(server);

export function initGameServer() {
    server.listen(PORT, () => {
        console.log(`Game server is running on port ${PORT}`);
    });
    return gameServer;
}
