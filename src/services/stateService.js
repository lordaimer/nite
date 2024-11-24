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
            // Check if state file exists
            const exists = await fs.access(STATE_FILE)
                .then(() => true)
                .catch(() => false);

            if (!exists) {
                // Create default state if file doesn't exist
                await this.saveState();
                return;
            }

            // Read and parse state file
            const data = await fs.readFile(STATE_FILE, 'utf8');
            const state = JSON.parse(data);

            if (typeof state.accessMode === 'string') {
                this.state = state;
            } else {
                // Reset to default if invalid
                this.state = { accessMode: 'private' };
                await this.saveState();
            }
        } catch (error) {
            console.error('Error loading state:', error.message);
            this.state = { accessMode: 'private' };
            await this.saveState();
        }
    }

    async saveState() {
        try {
            // Ensure state has the correct structure
            const validState = {
                accessMode: this.state.accessMode === 'public' ? 'public' : 'private'
            };
            
            const stateJson = JSON.stringify(validState, null, 2);
            
            // Write to file
            await fs.writeFile(STATE_FILE, stateJson, { encoding: 'utf8', flag: 'w' });
            
            // Verify the written content
            const written = await fs.readFile(STATE_FILE, 'utf8');
            const parsed = JSON.parse(written);
            
            if (parsed.accessMode !== validState.accessMode) {
                throw new Error('State verification failed');
            }
        } catch (error) {
            console.error('Error saving state:', error.message);
            // Write a clean state as fallback
            const fallbackState = JSON.stringify({ accessMode: 'private' }, null, 2);
            await fs.writeFile(STATE_FILE, fallbackState, { encoding: 'utf8', flag: 'w' });
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
