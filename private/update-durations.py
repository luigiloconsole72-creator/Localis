import subprocess, json, os, re

FFPROBE = r"C:\ffmpeg\bin\ffprobe.exe"
BACKUP = r"c:\Progetti\Sites\LocalisGuide\private\audio\guides\backup-r2"
GUIDES_DIR = r"c:\Progetti\Sites\LocalisGuide\src\content\guides"

def get_duration(path):
    r = subprocess.run([FFPROBE,"-v","quiet","-print_format","json","-show_format",path],
                       capture_output=True, text=True)
    return int(float(json.loads(r.stdout)["format"]["duration"]))

slugs = [
    "gargano-vieste","gargano-nord","gargano-paesi",
    "gargano-sacro","gargano-saline","gargano-tremiti",
]

for slug in slugs:
    mp3 = os.path.join(BACKUP, f"{slug}-it.mp3")
    mdx_path = os.path.join(GUIDES_DIR, f"{slug}.mdx")

    total = get_duration(mp3)
    print(f"{slug}: {total}s ({total//60}m{total%60:02d}s)")

    with open(mdx_path, encoding="utf-8") as f:
        content = f.read()

    # Count chapters
    chapter_count = len(re.findall(r"^\s+- title_it:", content, re.MULTILINE))
    starts = [int(i * total / chapter_count) for i in range(chapter_count)]
    print(f"  {chapter_count} chapters, starts: {starts}")

    # Update duration_seconds
    content = re.sub(r"(duration_seconds: )0", rf"\g<1>{total}", content, count=1)
    # Update each start_seconds: 0 sequentially
    idx = 0
    def replace_start(m):
        global idx
        val = starts[idx] if idx < len(starts) else 0
        idx += 1
        return f"{m.group(1)}{val}"
    content = re.sub(r"(    start_seconds: )0", replace_start, content)

    with open(mdx_path, "w", encoding="utf-8") as f:
        f.write(content)
    print(f"  updated.")

print("\nAll done.")
