from pathlib import Path

# Base directory
BASE_DIR = Path(__file__).parent.absolute()

# Model configurations
MODEL_CONFIG = {
    "name": "SWivid/F5-TTS",
    "sample_rate": 24000,
    "use_gpu": True,
}

# API configurations
API_CONFIG = {
    "host": "0.0.0.0",
    "port": 8000,
    "debug": False,
}

# File handling
FILE_CONFIG = {
    "temp_dir": BASE_DIR / "temp",
    "max_file_size": 10 * 1024 * 1024,  # 10MB
    "allowed_extensions": [".wav", ".mp3", ".ogg"],
}

# Create necessary directories
FILE_CONFIG["temp_dir"].mkdir(exist_ok=True)
