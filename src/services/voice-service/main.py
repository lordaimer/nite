import os
import subprocess
from fastapi import FastAPI, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
import tempfile
from pathlib import Path
import shutil
import logging
import toml

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="F5-TTS Voice Service")

# Constants
TEMP_DIR = Path("temp")
SAMPLE_RATE = 24000

# Create temp directory if it doesn't exist
TEMP_DIR.mkdir(exist_ok=True)

class F5TTSService:
    def __init__(self):
        # Check if F5-TTS is installed
        try:
            subprocess.run(["f5-tts_infer-cli", "--help"], capture_output=True, check=True)
            logger.info("F5-TTS CLI found")
        except subprocess.CalledProcessError:
            logger.error("F5-TTS CLI not found. Please install F5-TTS package.")
            raise RuntimeError("F5-TTS CLI not found")

    async def process_audio(self, audio_file: UploadFile, ref_text: str, gen_text: str):
        # Create temporary directory for processing
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_dir = Path(temp_dir)
            
            # Save uploaded audio file
            audio_path = temp_dir / "reference.wav"
            with audio_path.open("wb") as buffer:
                shutil.copyfileobj(audio_file.file, buffer)
            
            # Create config file
            config = {
                "model": {
                    "name": "F5-TTS",
                    "pretrained": True,
                },
                "inference": {
                    "ref_audio": str(audio_path),
                    "ref_text": ref_text,
                    "gen_text": gen_text,
                    "output_dir": str(temp_dir)
                }
            }
            
            config_path = temp_dir / "config.toml"
            with open(config_path, "w") as f:
                toml.dump(config, f)
            
            try:
                # Run F5-TTS CLI
                result = subprocess.run(
                    ["f5-tts_infer-cli", "-c", str(config_path)],
                    capture_output=True,
                    text=True,
                    check=True
                )
                
                # Find generated audio file
                output_files = list(temp_dir.glob("*.wav"))
                if not output_files:
                    raise RuntimeError("No output audio file found")
                
                # Copy output to persistent storage
                output_path = TEMP_DIR / f"output_{audio_file.filename}"
                shutil.copy2(output_files[0], output_path)
                
                return output_path
                
            except subprocess.CalledProcessError as e:
                logger.error(f"F5-TTS CLI error: {e.stderr}")
                raise HTTPException(status_code=500, detail=f"F5-TTS processing failed: {e.stderr}")

# Initialize service
try:
    f5_service = F5TTSService()
except Exception as e:
    logger.error(f"Failed to initialize F5-TTS service: {e}")
    raise

@app.post("/clone")
async def clone_voice(
    audio_file: UploadFile = File(...),
    ref_text: str = Form(...),
    gen_text: str = Form(...)
):
    """
    Clone a voice from an audio file and generate speech with the provided text.
    
    Parameters:
    - audio_file: Reference audio file for voice cloning
    - ref_text: Text content of the reference audio
    - gen_text: Text to be synthesized with the cloned voice
    """
    try:
        output_path = await f5_service.process_audio(audio_file, ref_text, gen_text)
        return FileResponse(
            output_path,
            media_type="audio/wav",
            filename=f"cloned_{audio_file.filename}"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """
    Check if the service is healthy
    """
    return {
        "status": "healthy",
        "f5tts_available": True
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
