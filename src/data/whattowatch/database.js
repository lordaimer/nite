import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';
import fs from 'fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const watchedDbPath = path.join(__dirname, 'watched.db');
const watchlistDbPath = path.join(__dirname, 'watchlist.db');

let watchedDb = null;
let watchlistDb = null;

// Initialize both databases
export async function initializeDatabases() {
    try {
        // Ensure directory exists
        await fs.mkdir(__dirname, { recursive: true });

        // Initialize watched movies database
        if (!watchedDb) {
            watchedDb = await open({
                filename: watchedDbPath,
                driver: sqlite3.Database
            });

            await watchedDb.exec(`
                CREATE TABLE IF NOT EXISTS watched_movies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    movie_id TEXT NOT NULL,
                    movie_title TEXT NOT NULL,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, movie_id)
                );
            `);
        }

        // Initialize watchlist database
        if (!watchlistDb) {
            watchlistDb = await open({
                filename: watchlistDbPath,
                driver: sqlite3.Database
            });

            await watchlistDb.exec(`
                CREATE TABLE IF NOT EXISTS watchlist (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    movie_id TEXT NOT NULL,
                    movie_title TEXT NOT NULL,
                    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, movie_id)
                );
            `);
        }

        return { watchedDb, watchlistDb };
    } catch (error) {
        console.error('Error initializing databases:', error);
        throw error;
    }
}

async function getMovieTitleFromTMDB(movieId) {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
            params: {
                api_key: process.env.TMDB_API_KEY
            }
        });
        return response.data.title;
    } catch (error) {
        console.error('Error fetching movie title:', error);
        return null;
    }
}

// Watched Movies Functions
export async function addWatchedMovie(userId, movieId) {
    const { watchedDb } = await initializeDatabases();
    try {
        const movieTitle = await getMovieTitleFromTMDB(movieId);
        if (!movieTitle) {
            throw new Error('Could not fetch movie title');
        }

        await watchedDb.run(
            'INSERT OR REPLACE INTO watched_movies (user_id, movie_id, movie_title) VALUES (?, ?, ?)',
            [userId, movieId, movieTitle]
        );
        return true;
    } catch (error) {
        console.error('Error adding watched movie:', error);
        return false;
    }
}

export async function getWatchedMovies(userId) {
    const { watchedDb } = await initializeDatabases();
    try {
        return await watchedDb.all(
            'SELECT * FROM watched_movies WHERE user_id = ? ORDER BY added_at DESC',
            [userId]
        );
    } catch (error) {
        console.error('Error getting watched movies:', error);
        return [];
    }
}

export async function isMovieWatched(userId, movieId) {
    const { watchedDb } = await initializeDatabases();
    try {
        const result = await watchedDb.get(
            'SELECT 1 FROM watched_movies WHERE user_id = ? AND movie_id = ?',
            [userId, movieId]
        );
        return !!result;
    } catch (error) {
        console.error('Error checking if movie is watched:', error);
        return false;
    }
}

// Watchlist Functions
export async function addToWatchlist(userId, movieId) {
    const { watchlistDb } = await initializeDatabases();
    try {
        // Check if movie is already watched
        if (await isMovieWatched(userId, movieId)) {
            return { success: false, message: 'Movie is already in your watched list' };
        }

        // Check if movie is already in watchlist
        const existing = await isInWatchlist(userId, movieId);
        if (existing) {
            return { success: false, message: 'Movie is already in your watchlist' };
        }

        const movieTitle = await getMovieTitleFromTMDB(movieId);
        if (!movieTitle) {
            return { success: false, message: 'Could not fetch movie title' };
        }

        await watchlistDb.run(
            'INSERT INTO watchlist (user_id, movie_id, movie_title) VALUES (?, ?, ?)',
            [userId, movieId, movieTitle]
        );
        return { success: true, message: 'Added to watchlist' };
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        return { success: false, message: 'Failed to add to watchlist' };
    }
}

export async function removeFromWatchlist(userId, movieId) {
    const { watchlistDb } = await initializeDatabases();
    try {
        const result = await watchlistDb.run(
            'DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?',
            [userId, movieId]
        );
        return result.changes > 0;
    } catch (error) {
        console.error('Error removing from watchlist:', error);
        return false;
    }
}

export async function getWatchlist(userId) {
    const { watchlistDb } = await initializeDatabases();
    try {
        return await watchlistDb.all(
            'SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC',
            [userId]
        );
    } catch (error) {
        console.error('Error getting watchlist:', error);
        return [];
    }
}

export async function isInWatchlist(userId, movieId) {
    const { watchlistDb } = await initializeDatabases();
    try {
        const result = await watchlistDb.get(
            'SELECT 1 FROM watchlist WHERE user_id = ? AND movie_id = ?',
            [userId, movieId]
        );
        return !!result;
    } catch (error) {
        console.error('Error checking watchlist:', error);
        return false;
    }
}
