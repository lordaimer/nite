import { spawn } from 'child_process';
import { join } from 'path';
import dotenv from 'dotenv';
import { updateMiniAppUrl } from './commands/media/gameAppCommand.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupTunnel() {
    try {
        const cloudflaredPath = join(process.cwd(), 'cloudflared.exe');
        const port = process.env.PORT || 3000;

        // Start cloudflared tunnel as a child process
        const tunnel = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`]);

        // Handle tunnel output
        tunnel.stdout.on('data', (data) => {
            const output = data.toString();
            console.log('Cloudflare tunnel output:', output);
        });

        tunnel.stderr.on('data', (data) => {
            const output = data.toString();
            
            // Look for the tunnel URL in the stderr output
            if (output.includes('Your quick Tunnel has been created!')) {
                const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                if (match) {
                    const url = match[0];
                    const miniAppUrl = `${url}/games/gamehub.html`;
                    console.log(' Mini App URL set to:', miniAppUrl);
                    updateMiniAppUrl(miniAppUrl);
                }
            }
            
            // Log other messages for debugging
            if (!output.includes('INF')) {  // Only log non-INFO messages
                console.error('Cloudflare tunnel error:', output);
            }
        });

        tunnel.on('close', (code) => {
            if (code !== 0) {
                console.error(`Cloudflare tunnel process exited with code ${code}`);
                process.exit(1);
            }
        });

        // Keep the process running
        process.on('SIGINT', () => {
            tunnel.kill();
            process.exit();
        });

    } catch (error) {
        console.error('Error setting up Cloudflare tunnel:', error);
        process.exit(1);
    }
}

export { setupTunnel };
