import subprocess, re, os

FFMPEG = r"C:\ffmpeg\bin\ffmpeg.exe"
BACKUP = r"c:\Progetti\Sites\LocalisGuide\private\audio\guides\backup-r2"
GUIDES_DIR = r"c:\Progetti\Sites\LocalisGuide\src\content\guides"

def detect_silences(mp3, noise_db=-35, min_duration=0.8):
    """Return list of (silence_start, silence_end) tuples."""
    r = subprocess.run(
        [FFMPEG, "-i", mp3, "-af",
         f"silencedetect=noise={noise_db}dB:d={min_duration}",
         "-f", "null", "-"],
        capture_output=True, text=True
    )
    output = r.stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", output)]
    ends   = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", output)]
    return list(zip(starts, ends))

def silences_to_chapter_starts(silences, n_chapters, total_duration):
    """Pick the n_chapters-1 longest silences as chapter boundaries."""
    if not silences:
        return [0] + [int(i * total_duration / n_chapters) for i in range(1, n_chapters)]
    # midpoint of each silence = chapter boundary candidate
    midpoints = [int((s + e) / 2) for s, e in silences]
    # sort by silence duration descending, pick top n_chapters-1
    durations = [(e - s, int((s+e)/2)) for s, e in silences]
    durations.sort(reverse=True)
    boundaries = sorted([m for _, m in durations[:n_chapters-1]])
    return [0] + boundaries

def get_duration(mp3):
    import json
    r = subprocess.run(
        [r"C:\ffmpeg\bin\ffprobe.exe", "-v", "quiet", "-print_format", "json",
         "-show_format", mp3],
        capture_output=True, text=True
    )
    return int(float(r.stdout and __import__("json").loads(r.stdout)["format"]["duration"] or 0))

slugs = [
    "gargano-vieste","gargano-nord","gargano-paesi",
    "gargano-sacro","gargano-saline","gargano-tremiti",
]

for slug in slugs:
    mp3 = os.path.join(BACKUP, f"{slug}-it.mp3")
    mdx_path = os.path.join(GUIDES_DIR, f"{slug}.mdx")

    with open(mdx_path, encoding="utf-8") as f:
        content = f.read()

    n_chapters = len(re.findall(r"^\s+- title_it:", content, re.MULTILINE))
    total = get_duration(mp3)

    print(f"\n{slug} ({n_chapters} cap, {total}s):", flush=True)
    silences = detect_silences(mp3, noise_db=-40, min_duration=1.2)
    print(f"  {len(silences)} silences detected")
    starts = silences_to_chapter_starts(silences, n_chapters, total)
    print(f"  starts: {starts}")

    # Format as mm:ss for readability
    def fmt(s): return f"{s//60}:{s%60:02d}"
    print(f"  times:  {[fmt(s) for s in starts]}")

    # Update MDX
    idx = 0
    def replace_start(m):
        global idx
        val = starts[idx] if idx < len(starts) else 0
        idx += 1
        return f"{m.group(1)}{val}"
    new_content = re.sub(r"(    start_seconds: )\d+", replace_start, content)

    # Update duration_seconds
    new_content = re.sub(r"(duration_seconds: )\d+", rf"\g<1>{total}", new_content, count=1)

    with open(mdx_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"  → updated.")

print("\nDone.")
