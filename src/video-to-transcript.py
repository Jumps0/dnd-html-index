# mkv/mp4 video transcriber using Purfview's Faster-Whisper-XXL engine. Outputs SRT transcript, JSON transcipt /w probabilities, and timestamped text file.
import subprocess
import sys
import json
from pathlib import Path

def transcribe_with_xxl(video_path, exe_path, model_name="medium.en", output_dir=None):
    """
    Calls Purfview's Faster-Whisper-XXL and converts output to a timestamped transcript.
    """
    video_path = Path(video_path).resolve()
    exe_path = Path(exe_path).resolve()
    
    if not video_path.exists():
        print(f"Error: Video file not found: {video_path}")
        return
    
    if not exe_path.exists():
        print(f"Error: Faster-Whisper-XXL executable not found: {exe_path}")
        return

    if output_dir is None:
        output_dir = video_path.parent
    
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Define output base name (XXL will create .srt and .json here)
    base_name = video_path.stem
    srt_file = output_dir / f"{base_name}.srt"
    json_file = output_dir / f"{base_name}.json"
    transcript_file = output_dir / f"{base_name}_transcript.txt"

    # Build command based on Purfview's syntax
    # Note: --ff_rnndn_sh is the specific denoise flag you requested.
    cmd = [
        str(exe_path),
        str(video_path),
        "--model", model_name,
        "--vad_method", "pyannote_v3",
        "--ff_rnndn_sh",
        "--standard",
        "--output_dir", str(output_dir),
        "--output_format", "srt", "json",  # Request both for timestamp flexibility
        "--print_progress",
        "--beep_off"
    ]

    print(f"Running: {' '.join(cmd)}")
    try:
        subprocess.run(cmd, check=True, text=True)
    except subprocess.CalledProcessError as e:
        print(f"Transcription failed with exit code {e.returncode}")
        return

    # Post-process: Prefer JSON for clean timestamps, fallback to SRT parsing
    if json_file.exists():
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Faster-Whisper JSON structure usually has 'segments'
            segments = data.get("segments", [])
            if not segments and isinstance(data, list):
                # Sometimes it outputs a raw list of segments
                segments = data
            
            with open(transcript_file, 'w', encoding='utf-8') as out:
                for seg in segments:
                    start = seg.get("start", 0)
                    end = seg.get("end", 0)
                    text = seg.get("text", "").strip()
                    if text:
                        # Format: [HH:MM:SS.mmm --> HH:MM:SS.mmm] Text
                        out.write(f"[{format_time(start)} --> {format_time(end)}] {text}\n")
            print(f"Transcript saved to: {transcript_file}")
            
        except Exception as e:
            print(f"Error parsing JSON, trying SRT fallback: {e}")
            _parse_srt(srt_file, transcript_file)
    elif srt_file.exists():
        _parse_srt(srt_file, transcript_file)
    else:
        print("No output file found (SRT or JSON) to convert.")

def format_time(seconds):
    """Convert float seconds to HH:MM:SS.mmm format."""
    millis = int((seconds - int(seconds)) * 1000)
    seconds = int(seconds)
    mins, secs = divmod(seconds, 60)
    hrs, mins = divmod(mins, 60)
    return f"{hrs:02d}:{mins:02d}:{secs:02d}.{millis:03d}"

def _parse_srt(srt_path, out_path):
    """Simple fallback parser if JSON is missing or invalid."""
    if not srt_path.exists():
        print("SRT file not found either.")
        return
    
    print(f"Parsing SRT: {srt_path}")
    with open(srt_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into blocks by double newline
    blocks = content.strip().split('\n\n')
    with open(out_path, 'w', encoding='utf-8') as out:
        for block in blocks:
            lines = block.split('\n')
            if len(lines) >= 3:
                # Line 1 is index, Line 2 is timestamp, Line 3+ is text
                timestamp = lines[1].replace(',', '.')  # Normalize comma to dot if needed
                text = ' '.join(lines[2:]).strip()
                out.write(f"[{timestamp}] {text}\n")
    print(f"Transcript saved to: {out_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python transcribe.py <video_file> <path_to_faster-whisper-xxl> [output_dir]")
        sys.exit(1)
    
    video = sys.argv[1]
    exe = sys.argv[2]
    out = sys.argv[3] if len(sys.argv) > 3 else None
    
    transcribe_with_xxl(video, exe, model_name="medium.en", output_dir=out)