import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '..', 'data', 'botState.json');

class StateService {
    constructor() {
        this.state = {
            accessMode: 'private'
        };
        this.initState();
    }

    async initState() {
        try {
            const dir = path.dirname(STATE_FILE);
            await fs.mkdir(dir, { recursive: true });
            await this.loadState();
        } catch (error) {
            console.error('Error initializing state:', error);
            await this.saveState();
        }
    }

    async loadState() {
        try {
            try {
                await fs.access(STATE_FILE);
            } catch {
                await this.saveState();
                return;
            }

            const data = await fs.readFile(STATE_FILE, 'utf8');
            const parsedState = JSON.parse(data);
            
            if (typeof parsedState === 'object' && 'accessMode' in parsedState) {
                this.state = parsedState;
            } else {
                console.error('Invalid state structure, using default');
                await this.saveState();
            }
        } catch (error) {
            console.error('Error loading state:', error);
            await this.saveState();
        }
    }

    async saveState() {
        try {
            const stateJson = JSON.stringify(this.state, null, 2);
            await fs.writeFile(STATE_FILE, stateJson, 'utf8');
            
            // Verify the file was written correctly
            const verifyData = await fs.readFile(STATE_FILE, 'utf8');
            const verifyState = JSON.parse(verifyData);
            if (verifyState.accessMode !== this.state.accessMode) {
                throw new Error('State verification failed');
            }
        } catch (error) {
            console.error('Error saving state:', error);
            throw error;
        }
    }

    isPublicMode() {
        return this.state.accessMode === 'public';
    }

    async setAccessMode(mode) {
        if (mode !== 'public' && mode !== 'private') {
            throw new Error('Invalid access mode');
        }
        
        this.state.accessMode = mode;
        await this.saveState();
    }
}

const stateService = new StateService();
export default stateService;
