import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import axios from 'axios';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, 'movies.db');

let db = null;

export async function initializeDatabase() {
    if (!db) {
        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        // Drop existing table and create new one with clean schema
        await db.exec(`
            DROP TABLE IF EXISTS watched_movies;
            CREATE TABLE watched_movies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                movie_id TEXT NOT NULL,
                movie_title TEXT NOT NULL,
                UNIQUE(user_id, movie_id)
            );
        `);
    }
    return db;
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

export async function addWatchedMovie(userId, movieId) {
    const db = await initializeDatabase();
    try {
        const movieTitle = await getMovieTitleFromTMDB(movieId);
        if (!movieTitle) {
            throw new Error('Could not fetch movie title');
        }

        await db.run(
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
    const db = await initializeDatabase();
    try {
        return await db.all(
            'SELECT * FROM watched_movies WHERE user_id = ? ORDER BY id DESC',
            [userId]
        );
    } catch (error) {
        console.error('Error getting watched movies:', error);
        return [];
    }
}

export async function isMovieWatched(userId, movieId) {
    const db = await initializeDatabase();
    try {
        const result = await db.get(
            'SELECT 1 FROM watched_movies WHERE user_id = ? AND movie_id = ?',
            [userId, movieId]
        );
        return !!result;
    } catch (error) {
        console.error('Error checking if movie is watched:', error);
        return false;
    }
}
