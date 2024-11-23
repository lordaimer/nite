import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function queryDatabase() {
    const db = await open({
        filename: './src/data/whattowatch/watched.db',
        driver: sqlite3.Database
    });

    // Your query here
    const query = process.argv[2] || 'SELECT * FROM watched_movies';
    
    try {
        const results = await db.all(query);
        console.table(results);
    } catch (error) {
        console.error('Error executing query:', error.message);
    } finally {
        await db.close();
    }
}

queryDatabase();
