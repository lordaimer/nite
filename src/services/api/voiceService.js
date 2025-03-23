import { HfInference } from '@huggingface/inference';
import fs from 'fs';
import { promisify } from 'util';
import fetch from 'node-fetch';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const writeFile = promisify(fs.writeFile);
const unlink = promisify(fs.unlink);
const readFile = promisify(fs.readFile);

class VoiceService {
    constructor() {
        if (!process.env.HUGGING_FACE_TOKEN_1) {
            throw new Error('HUGGING_FACE_TOKEN_1 is not set in environment variables');
        }
        this.hf = new HfInference(process.env.HUGGING_FACE_TOKEN_1);
    }

    async downloadVoice(fileUrl) {
        try {
            const response = await fetch(fileUrl);
            if (!response.ok) {
                throw new Error(`Failed to download voice file: ${response.statusText}`);
            }
            
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            
            const tempDir = path.join(process.cwd(), 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }
            
            const tempPath = path.join(tempDir, `voice_${Date.now()}.oga`);
            await writeFile(tempPath, buffer);
            return tempPath;
        } catch (error) {
            console.error('Error downloading voice:', error);
            throw error;
        }
    }

    async transcribeAudio(filePath) {
        try {
            const audioBuffer = await readFile(filePath);
            
            const result = await this.hf.automaticSpeechRecognition({
                model: 'openai/whisper-base',
                data: audioBuffer,
            });
            
            return result.text;
        } catch (error) {
            console.error('Error transcribing audio:', error);
            throw error;
        } finally {
            try {
                await unlink(filePath);
            } catch (error) {
                console.error('Error cleaning up file:', error);
            }
        }
    }
}

export const voiceService = new VoiceService();