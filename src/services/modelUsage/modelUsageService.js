import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ModelUsageService {
    constructor() {
        this.dataPath = path.join(__dirname, '../../data/modelUsage.json');
        this.ensureDataFile();
        this.data = this.loadData();
    }

    ensureDataFile() {
        const dataDir = path.dirname(this.dataPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        if (!fs.existsSync(this.dataPath)) {
            const initialData = {
                users: {},
                global: {
                    models: {},
                    totalGenerations: 0
                }
            };
            fs.writeFileSync(this.dataPath, JSON.stringify(initialData, null, 2));
        }
    }

    loadData() {
        try {
            const data = fs.readFileSync(this.dataPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading model usage data:', error);
            return {
                users: {},
                global: {
                    models: {},
                    totalGenerations: 0
                }
            };
        }
    }

    saveData() {
        try {
            fs.writeFileSync(this.dataPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Error saving model usage data:', error);
        }
    }

    initializeUserIfNeeded(userId) {
        if (!this.data.users[userId]) {
            this.data.users[userId] = {
                models: {},
                totalGenerations: 0
            };
        }
    }

    initializeModelIfNeeded(modelStats, modelName) {
        if (!modelStats[modelName]) {
            modelStats[modelName] = {
                count: 0,
                lastUsed: null
            };
        }
    }

    trackModelUsage(userId, modelName) {
        // Initialize structures if needed
        this.initializeUserIfNeeded(userId);
        this.initializeModelIfNeeded(this.data.users[userId].models, modelName);
        this.initializeModelIfNeeded(this.data.global.models, modelName);

        const timestamp = new Date().toISOString();

        // Update user stats
        const userModel = this.data.users[userId].models[modelName];
        userModel.count++;
        userModel.lastUsed = timestamp;
        this.data.users[userId].totalGenerations++;

        // Update global stats
        const globalModel = this.data.global.models[modelName];
        globalModel.count++;
        globalModel.lastUsed = timestamp;
        this.data.global.totalGenerations++;

        this.saveData();
    }

    getUserTopModels(userId, allModels) {
        this.initializeUserIfNeeded(userId);
        const userModels = this.data.users[userId].models;

        // Initialize any missing models with 0 count
        allModels.forEach(modelName => {
            this.initializeModelIfNeeded(userModels, modelName);
        });

        // Sort models by count and then by last used
        return allModels.sort((a, b) => {
            const aStats = userModels[a];
            const bStats = userModels[b];
            
            if (aStats.count !== bStats.count) {
                return bStats.count - aStats.count;
            }
            
            // If counts are equal, sort by last used
            if (!aStats.lastUsed && !bStats.lastUsed) return 0;
            if (!aStats.lastUsed) return 1;
            if (!bStats.lastUsed) return -1;
            return new Date(bStats.lastUsed) - new Date(aStats.lastUsed);
        });
    }

    getGlobalTopModels(allModels) {
        const globalModels = this.data.global.models;

        // Initialize any missing models with 0 count
        allModels.forEach(modelName => {
            this.initializeModelIfNeeded(globalModels, modelName);
        });

        // Sort models by count and then by last used
        return allModels.sort((a, b) => {
            const aStats = globalModels[a];
            const bStats = globalModels[b];
            
            if (aStats.count !== bStats.count) {
                return bStats.count - aStats.count;
            }
            
            // If counts are equal, sort by last used
            if (!aStats.lastUsed && !bStats.lastUsed) return 0;
            if (!aStats.lastUsed) return 1;
            if (!bStats.lastUsed) return -1;
            return new Date(bStats.lastUsed) - new Date(aStats.lastUsed);
        });
    }
}

// Create and export a singleton instance
const modelUsageService = new ModelUsageService();
export default modelUsageService;
