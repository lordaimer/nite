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
    return new Promise((resolve) => {
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

            let tunnelUrl = null;
            tunnel.stderr.on('data', (data) => {
                const output = data.toString();
                
                // Look for the tunnel URL in the stderr output
                if (output.includes('Your quick Tunnel has been created!')) {
                    const match = output.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
                    if (match) {
                        tunnelUrl = match[0];
                        // Set the BASE_URL in process.env
                        process.env.BASE_URL = tunnelUrl;
                        const miniAppUrl = `${tunnelUrl}/games/gamehub/gamehub.html`;
                        console.log('Mini App URL set to:', miniAppUrl);
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
                    // Don't reject, just resolve with null to indicate tunnel failed
                    resolve(null);
                }
            });

            // Set a timeout for tunnel creation
            setTimeout(() => {
                if (!tunnelUrl) {
                    console.log('Tunnel setup timed out or failed. Bot will continue without tunnel.');
                    resolve(null);
                } else {
                    resolve(tunnelUrl);
                }
            }, 10000); // Wait 10 seconds max for tunnel

        } catch (error) {
            console.error('Error setting up tunnel:', error);
            resolve(null);
        }
    });
}

export { setupTunnel };
