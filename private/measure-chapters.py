import subprocess, json, os, re

FFPROBE = r"C:\ffmpeg\bin\ffprobe.exe"
BACKUP = r"c:\Progetti\Sites\LocalisGuide\private\audio\guides\backup-r2"
GUIDES_DIR = r"c:\Progetti\Sites\LocalisGuide\src\content\guides"

def get_duration(path):
    r = subprocess.run([FFPROBE,"-v","quiet","-print_format","json","-show_format",path],
                       capture_output=True, text=True)
    return float(json.loads(r.stdout)["format"]["duration"])

slugs = [
    "gargano-vieste","gargano-nord","gargano-paesi",
    "gargano-sacro","gargano-saline","gargano-tremiti",
]

for slug in slugs:
    mp3 = os.path.join(BACKUP, f"{slug}-it.mp3")
    if not os.path.exists(mp3):
        print(f"MISSING: {mp3}")
        continue
    total = get_duration(mp3)
    print(f"\n{slug}: {int(total)}s ({int(total//60)}m{int(total%60):02d}s)")

    # Read MDX to count chapters
    mdx = os.path.join(GUIDES_DIR, f"{slug}.mdx")
    with open(mdx, encoding="utf-8") as f:
        content = f.read()
    chapter_count = len(re.findall(r"^\s+- title:", content, re.MULTILINE))
    print(f"  chapters: {chapter_count}")
    print(f"  avg per chapter: {total/chapter_count:.0f}s")
    # Evenly distributed start_seconds
    starts = [int(i * total / chapter_count) for i in range(chapter_count)]
    print(f"  starts: {starts}")
