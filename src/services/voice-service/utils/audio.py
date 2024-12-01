import torch
import torchaudio
import numpy as np
from pathlib import Path
from typing import Union, Tuple
import soundfile as sf
import librosa

def load_audio(
    file_path: Union[str, Path],
    target_sr: int = 24000,
    return_tensor: bool = True
) -> Union[torch.Tensor, np.ndarray]:
    """
    Load an audio file and resample if necessary
    """
    try:
        # Load audio file
        if str(file_path).endswith('.wav'):
            waveform, sr = torchaudio.load(file_path)
        else:
            waveform, sr = librosa.load(file_path, sr=None)
            waveform = torch.from_numpy(waveform)
            if len(waveform.shape) == 1:
                waveform = waveform.unsqueeze(0)
        
        # Resample if necessary
        if sr != target_sr:
            resampler = torchaudio.transforms.Resample(sr, target_sr)
            waveform = resampler(waveform)
        
        # Convert to mono if stereo
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        
        return waveform if return_tensor else waveform.numpy()
    
    except Exception as e:
        raise RuntimeError(f"Error loading audio file: {e}")

def save_audio(
    waveform: Union[torch.Tensor, np.ndarray],
    file_path: Union[str, Path],
    sample_rate: int = 24000
) -> None:
    """
    Save audio data to a file
    """
    try:
        # Convert numpy array to tensor if necessary
        if isinstance(waveform, np.ndarray):
            waveform = torch.from_numpy(waveform)
        
        # Ensure correct shape
        if len(waveform.shape) == 1:
            waveform = waveform.unsqueeze(0)
        
        # Save audio
        torchaudio.save(file_path, waveform, sample_rate)
    
    except Exception as e:
        raise RuntimeError(f"Error saving audio file: {e}")

def normalize_audio(waveform: torch.Tensor) -> torch.Tensor:
    """
    Normalize audio to [-1, 1] range
    """
    try:
        # Check if already in correct range
        if torch.max(torch.abs(waveform)) <= 1.0:
            return waveform
        
        return waveform / torch.max(torch.abs(waveform))
    
    except Exception as e:
        raise RuntimeError(f"Error normalizing audio: {e}")

def trim_silence(
    waveform: torch.Tensor,
    threshold_db: float = -40.0,
    min_silence_duration: float = 0.1,
    sample_rate: int = 24000
) -> torch.Tensor:
    """
    Trim silence from the beginning and end of the audio
    """
    try:
        # Convert to numpy for librosa processing
        audio_np = waveform.numpy().squeeze()
        
        # Trim silence
        trimmed_audio, _ = librosa.effects.trim(
            audio_np,
            top_db=-threshold_db,
            frame_length=int(min_silence_duration * sample_rate)
        )
        
        # Convert back to tensor
        return torch.from_numpy(trimmed_audio).unsqueeze(0)
    
    except Exception as e:
        raise RuntimeError(f"Error trimming silence: {e}")
