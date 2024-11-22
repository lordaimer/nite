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
                    imdb_id TEXT,
                    omdb_id TEXT,
                    movie_title TEXT NOT NULL,
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
                    imdb_id TEXT,
                    omdb_id TEXT,
                    movie_title TEXT NOT NULL,
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

// Get movie details from TMDB
async function getMovieDetails(movieId) {
    try {
        // Get TMDB movie details
        const tmdbResponse = await axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
            params: {
                api_key: process.env.TMDB_API_KEY,
                append_to_response: 'external_ids'
            }
        });

        const movieTitle = tmdbResponse.data.title;
        const imdbId = tmdbResponse.data.external_ids?.imdb_id || null;

        // Get OMDB details if IMDB ID is available
        let omdbId = null;
        if (imdbId) {
            const omdbResponse = await axios.get(`http://www.omdbapi.com/`, {
                params: {
                    apikey: process.env.OMDB_API_KEY,
                    i: imdbId
                }
            });
            
            if (omdbResponse.data.Response === 'True') {
                omdbId = omdbResponse.data.imdbID; // Using IMDB ID as OMDB ID since they're the same
            }
        }

        return {
            title: movieTitle,
            imdbId,
            omdbId
        };
    } catch (error) {
        console.error('Error getting movie details:', error);
        return null;
    }
}

// Watched Movies Functions
export async function addWatchedMovie(userId, movieId) {
    const { watchedDb } = await initializeDatabases();
    try {
        // Check if movie is already watched
        const existing = await isMovieWatched(userId, movieId);
        if (existing) {
            return { success: false, message: 'Movie is already in your watched list' };
        }

        const movieDetails = await getMovieDetails(movieId);
        if (!movieDetails) {
            return { success: false, message: 'Could not fetch movie details' };
        }

        await watchedDb.run(
            'INSERT INTO watched_movies (user_id, movie_id, imdb_id, omdb_id, movie_title) VALUES (?, ?, ?, ?, ?)',
            [userId, movieId, movieDetails.imdbId, movieDetails.omdbId, movieDetails.title]
        );
        return { success: true, message: 'Added to watched list' };
    } catch (error) {
        console.error('Error adding watched movie:', error);
        return { success: false, message: 'Failed to add movie to watched list' };
    }
}

export async function getWatchedMovies(userId) {
    const { watchedDb } = await initializeDatabases();
    try {
        return await watchedDb.all(
            'SELECT * FROM watched_movies WHERE user_id = ? ORDER BY id DESC',
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

        const movieDetails = await getMovieDetails(movieId);
        if (!movieDetails) {
            return { success: false, message: 'Could not fetch movie details' };
        }

        await watchlistDb.run(
            'INSERT INTO watchlist (user_id, movie_id, imdb_id, omdb_id, movie_title) VALUES (?, ?, ?, ?, ?)',
            [userId, movieId, movieDetails.imdbId, movieDetails.omdbId, movieDetails.title]
        );
        return { success: true, message: 'Added to watchlist' };
    } catch (error) {
        console.error('Error adding to watchlist:', error);
        return { success: false, message: 'Failed to add movie to watchlist' };
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
            'SELECT * FROM watchlist WHERE user_id = ? ORDER BY id DESC',
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
