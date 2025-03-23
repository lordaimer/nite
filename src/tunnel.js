import { spawn } from 'child_process';
import { join } from 'path';
import dotenv from 'dotenv';
import { updateMiniAppUrl } from './commands/media/gameAppCommand.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let tunnelProcess = null;
const RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

async function attemptTunnelSetup() {
    return new Promise((resolve) => {
        try {
            const cloudflaredPath = join(process.cwd(), 'cloudflared.exe');
            const port = process.env.PORT || 3000;

            // Cleanup any existing tunnel process
            if (tunnelProcess) {
                tunnelProcess.kill();
            }

            // Start cloudflared tunnel as a child process
            tunnelProcess = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`], {
                windowsHide: true
            });

            // Handle tunnel output
            tunnelProcess.stdout.on('data', (data) => {
                const output = data.toString();
                console.log('Cloudflare tunnel output:', output);
            });

            let tunnelUrl = null;
            tunnelProcess.stderr.on('data', (data) => {
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
                
                // Check for rate limit error
                if (output.includes('429 Too Many Requests')) {
                    console.log('Cloudflare rate limit hit. Will retry in 5 minutes.');
                }
                
                // Log other messages for debugging
                if (!output.includes('INF')) {  // Only log non-INFO messages
                    console.error('Cloudflare tunnel error:', output);
                }
            });

            tunnelProcess.on('close', (code) => {
                if (code !== 0) {
                    console.error(`Cloudflare tunnel process exited with code ${code}`);
                    resolve(null);
                }
            });

            // Set a timeout for tunnel creation
            setTimeout(() => {
                if (!tunnelUrl) {
                    console.log('Tunnel setup timed out or failed. Will retry in 5 minutes.');
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

async function setupTunnel() {
    let tunnelUrl = await attemptTunnelSetup();
    
    // If tunnel setup fails, start retry mechanism
    if (!tunnelUrl) {
        console.log('Starting tunnel retry mechanism...');
        
        // Set up retry interval
        const retryInterval = setInterval(async () => {
            console.log('Attempting to create tunnel again...');
            tunnelUrl = await attemptTunnelSetup();
            
            if (tunnelUrl) {
                console.log('Tunnel successfully created on retry!');
                clearInterval(retryInterval);
            }
        }, RETRY_INTERVAL);

        // Handle process shutdown
        process.on('SIGINT', () => {
            if (tunnelProcess) {
                tunnelProcess.kill();
            }
            clearInterval(retryInterval);
            process.exit();
        });
    }

    return tunnelUrl;
}

export { setupTunnel };
