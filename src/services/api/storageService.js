import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { EventEmitter } from 'events';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../data');
const STORAGE_PATH = path.join(DATA_DIR, 'subscriptions.json');
const subscriptionEmitter = new EventEmitter();
let subscriptionsMap = new Map();

class StorageService {
    constructor() {
        this.dataPath = DATA_DIR;
        this.bugsFile = path.join(this.dataPath, 'bugs.json');
        this.initializeStorage();
    }

    initializeStorage() {
        // Create data directory if it doesn't exist
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }

        // Initialize bugs file
        if (!fs.existsSync(this.bugsFile)) {
            fs.writeFileSync(this.bugsFile, JSON.stringify([]));
        }

        // Initialize subscriptions
        if (!fs.existsSync(STORAGE_PATH)) {
            fs.writeFileSync(STORAGE_PATH, JSON.stringify({}), 'utf8');
        } else {
            this.loadSubscriptions();
        }
    }

    // Bug reports methods
    getBugReports() {
        try {
            const data = fs.readFileSync(this.bugsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error reading bug reports:', error);
            return [];
        }
    }

    addBugReport(report) {
        try {
            const bugs = this.getBugReports();
            bugs.push({
                ...report,
                id: Date.now(),
                status: 'pending',
                createdAt: new Date().toISOString()
            });
            fs.writeFileSync(this.bugsFile, JSON.stringify(bugs, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving bug report:', error);
            return false;
        }
    }

    updateBugStatus(bugId, status) {
        try {
            const bugs = this.getBugReports();
            const bugIndex = bugs.findIndex(bug => bug.id === bugId);
            if (bugIndex !== -1) {
                bugs[bugIndex].status = status;
                bugs[bugIndex].updatedAt = new Date().toISOString();
                fs.writeFileSync(this.bugsFile, JSON.stringify(bugs, null, 2));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Error updating bug status:', error);
            return false;
        }
    }

    // Subscription methods
    loadSubscriptions() {
        try {
            const data = fs.readFileSync(STORAGE_PATH, 'utf8');
            if (!data.trim()) {
                subscriptionsMap = new Map();
                return subscriptionsMap;
            }
            const parsedData = JSON.parse(data);
            subscriptionsMap = new Map(Object.entries(parsedData));
            return subscriptionsMap;
        } catch (error) {
            console.error('Error loading subscriptions:', error);
            return new Map();
        }
    }

    saveSubscriptions(subscriptions) {
        try {
            const data = JSON.stringify(Object.fromEntries(subscriptions), null, 2);
            fs.writeFileSync(STORAGE_PATH, data, 'utf8');
            subscriptionsMap = new Map(subscriptions);
        } catch (error) {
            console.error('Error saving subscriptions:', error);
        }
    }

    updateSubscription(chatId, subscriptionData) {
        subscriptionsMap.set(chatId.toString(), subscriptionData);
        this.saveSubscriptions(subscriptionsMap);
        subscriptionEmitter.emit('subscriptionChange', chatId, subscriptionData);
    }

    removeSubscription(chatId) {
        if (subscriptionsMap.has(chatId.toString())) {
            subscriptionsMap.delete(chatId.toString());
            this.saveSubscriptions(subscriptionsMap);
            subscriptionEmitter.emit('subscriptionChange', chatId, null);
        }
    }

    getSubscriptions() {
        return subscriptionsMap;
    }

    onSubscriptionChange(callback) {
        subscriptionEmitter.on('subscriptionChange', callback);
    }
}

export const storageService = new StorageService();