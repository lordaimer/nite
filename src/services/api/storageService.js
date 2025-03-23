import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { EventEmitter } from 'events';
import moment from 'moment-timezone';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../data');
const STORAGE_PATH = path.join(DATA_DIR, 'subscriptions.json');
const BUGS_PATH = path.join(DATA_DIR, 'bugs.json');
const subscriptionEmitter = new EventEmitter();
let subscriptionsMap = new Map();
let botInstance = null;

class StorageService {
    constructor() {
        this.dataPath = DATA_DIR;
        this.bugsFile = BUGS_PATH;
        this.initializeStorage();
        this.setupSubscriptionListener();
    }

    setupSubscriptionListener() {
        subscriptionEmitter.removeAllListeners('subscriptionChange');
        
        subscriptionEmitter.on('subscriptionChange', async (chatId, subscriptionData) => {
            if (!botInstance || !subscriptionData) return;
            
            for (const [type, data] of Object.entries(subscriptionData)) {
                if (data.times && data.times.length > 0) {
                    const timesStr = data.times.map(time => 
                        moment(time, 'HH:mm').format('h:mm A')
                    ).join(', ');
                    
                    try {
                        await botInstance.sendMessage(
                            chatId,
                            `✅ Successfully updated ${type} subscription times: ${timesStr}`,
                            { parse_mode: 'Markdown' }
                        );
                    } catch (error) {
                        console.error('Error sending subscription confirmation:', error);
                    }
                }
            }
        });
    }

    setBotInstance(bot) {
        botInstance = bot;
    }

    initializeStorage() {
        if (!fs.existsSync(this.dataPath)) {
            fs.mkdirSync(this.dataPath, { recursive: true });
        }

        if (!fs.existsSync(this.bugsFile)) {
            fs.writeFileSync(this.bugsFile, JSON.stringify([]));
        }

        if (!fs.existsSync(STORAGE_PATH)) {
            fs.writeFileSync(STORAGE_PATH, JSON.stringify({}), 'utf8');
        }
        
        this.loadSubscriptions();

        const oldPath = path.join(__dirname, '../../../commands/data/subscriptions.json');
        if (fs.existsSync(oldPath)) {
            try {
                const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
                const currentData = Object.fromEntries(subscriptionsMap);
                const mergedData = { ...oldData, ...currentData };
                
                fs.writeFileSync(STORAGE_PATH, JSON.stringify(mergedData, null, 2), 'utf8');
                subscriptionsMap = new Map(Object.entries(mergedData));
                
                fs.unlinkSync(oldPath);
            } catch (error) {
                console.error('Error migrating old subscriptions:', error);
            }
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

            // Add file locking to prevent race conditions
            const lockFile = `${this.bugsFile}.lock`;
            if (fs.existsSync(lockFile)) {
                return false;
            }

            // Create lock file
            fs.writeFileSync(lockFile, 'locked');

            try {
                // Check for duplicate reports in the last minute
                const now = Date.now();
                const recentDuplicate = bugs.some(bug =>
                    bug.userId === report.userId &&
                    bug.description === report.description &&
                    now - new Date(bug.createdAt).getTime() < 60000
                );

                if (recentDuplicate) {
                    return true; // Return true to prevent error message
                }

                // Add the new report
                bugs.push({
                    ...report,
                    id: Date.now(),
                    status: 'pending',
                    createdAt: new Date().toISOString()
                });

                fs.writeFileSync(this.bugsFile, JSON.stringify(bugs, null, 2));
                return true;
            } finally {
                // Always remove the lock file
                fs.unlinkSync(lockFile);
            }
        } catch (error) {
            console.error('Error saving bug report:', error);
            // Try to clean up lock file if it exists
            try {
                const lockFile = `${this.bugsFile}.lock`;
                if (fs.existsSync(lockFile)) {
                    fs.unlinkSync(lockFile);
                }
            } catch (cleanupError) {
                console.error('Error cleaning up lock file:', cleanupError);
            }
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

    areSubscriptionsEqual(sub1, sub2) {
        if (!sub1 || !sub2) return sub1 === sub2;
        
        const types = new Set([...Object.keys(sub1), ...Object.keys(sub2)]);
        
        for (const type of types) {
            const sub1Data = sub1[type];
            const sub2Data = sub2[type];
            
            if (!sub1Data || !sub2Data) return false;
            
            if (sub1Data.timezone !== sub2Data.timezone) return false;
            
            const times1 = new Set(sub1Data.times || []);
            const times2 = new Set(sub2Data.times || []);
            
            if (times1.size !== times2.size) return false;
            
            for (const time of times1) {
                if (!times2.has(time)) return false;
            }
        }
        
        return true;
    }

    updateSubscription(chatId, subscriptionData) {
        const chatIdStr = chatId.toString();
        const currentData = subscriptionsMap.get(chatIdStr);
        
        if (!currentData || !this.areSubscriptionsEqual(currentData, subscriptionData)) {
            subscriptionsMap.set(chatIdStr, subscriptionData);
            this.saveSubscriptions(subscriptionsMap);
            subscriptionEmitter.emit('subscriptionChange', chatId, subscriptionData);
        }
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