import ngrok from 'ngrok';
import dotenv from 'dotenv';
import { updateMiniAppUrl } from './commands/media/gameAppCommand.js';
dotenv.config();

async function setupTunnel() {
    try {
        const url = await ngrok.connect({
            addr: process.env.PORT || 3000,
            region: 'us',
            authtoken: process.env.NGROK_AUTHTOKEN
        });
        
        const miniAppUrl = `${url}/games`;
        updateMiniAppUrl(miniAppUrl);
        
        return url;
    } catch (error) {
        process.exit(1);
    }
}

export { setupTunnel };
