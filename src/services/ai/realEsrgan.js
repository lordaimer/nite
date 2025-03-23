import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.join(__dirname, '../../../models/realesrgan');
const TEMP_DIR = path.join(os.tmpdir(), 'realesrgan-temp');

// Ensure temp directory exists
await fs.mkdir(TEMP_DIR, { recursive: true });

async function downloadModel() {
    const modelUrl = 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip';
    const modelZipPath = path.join(MODELS_DIR, 'model.zip');
    const modelExePath = path.join(MODELS_DIR, 'realesrgan-ncnn-vulkan.exe');
    
    // Create models directory if it doesn't exist
    await fs.mkdir(MODELS_DIR, { recursive: true });

    // Check if model exists
    try {
        await fs.access(modelExePath);
        console.log('Real-ESRGAN model already exists, skipping download.');
        return;
    } catch {
        console.log('Downloading Real-ESRGAN model...');
        
        const response = await fetch(modelUrl);
        const buffer = await response.arrayBuffer();
        await fs.writeFile(modelZipPath, Buffer.from(buffer));

        // Extract the zip file
        const extract = (await import('extract-zip')).default;
        await extract(modelZipPath, { dir: MODELS_DIR });
        
        // Clean up zip file
        await fs.unlink(modelZipPath);
        console.log('Real-ESRGAN model downloaded and extracted successfully.');
    }
}

export async function upscaleImage(inputBuffer, scale = 4, faceEnhance = true) {
    try {
        // Ensure model is downloaded
        await downloadModel();

        // Create temporary files for input and output
        const timestamp = Date.now();
        const inputPath = path.join(TEMP_DIR, `input_${timestamp}.png`);
        const outputPath = path.join(TEMP_DIR, `output_${timestamp}.png`);

        // Write input buffer to temporary file
        await fs.writeFile(inputPath, inputBuffer);

        // Prepare command arguments
        const args = [
            '-i', inputPath,
            '-o', outputPath,
            '-n', 'realesrgan-x4plus', // Use x4plus model
            '-s', scale.toString(),
        ];

        if (faceEnhance) {
            args.push('-f', 'face');
        }

        // Run Real-ESRGAN
        await new Promise((resolve, reject) => {
            const process = spawn(
                path.join(MODELS_DIR, 'realesrgan-ncnn-vulkan.exe'),
                args,
                { cwd: MODELS_DIR }
            );

            let errorOutput = '';
            process.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Real-ESRGAN failed with code ${code}: ${errorOutput}`));
                }
            });
        });

        // Read the output file
        const outputBuffer = await fs.readFile(outputPath);

        // Clean up temporary files
        await Promise.all([
            fs.unlink(inputPath).catch(() => {}),
            fs.unlink(outputPath).catch(() => {})
        ]);

        return outputBuffer;
    } catch (error) {
        console.error('Error in upscaleImage:', error);
        throw new Error('Failed to upscale image: ' + error.message);
    }
}
