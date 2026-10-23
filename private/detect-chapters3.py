import re, os, subprocess, json

BACKUP = r"c:\Progetti\Sites\LocalisGuide\private\audio\guides\backup-r2"
GUIDES_DIR = r"c:\Progetti\Sites\LocalisGuide\src\content\guides"
SCRIPTS_DIR = r"c:\Progetti\Sites\LocalisGuide\src\content\scripts"

def get_duration(mp3):
    r = subprocess.run(
        [r"C:\ffmpeg\bin\ffprobe.exe", "-v", "quiet", "-print_format", "json", "-show_format", mp3],
        capture_output=True, text=True
    )
    return int(float(json.loads(r.stdout)["format"]["duration"]))

def chapter_starts_from_script(script_path, n_chapters, total_seconds):
    with open(script_path, encoding="utf-8") as f:
        text = f.read()

    # Split on CAP. N markers
    parts = re.split(r"CAP\.\s*\d+\s*[—\-]", text)
    chapters = [p for p in parts if len(p.strip()) > 30]

    if len(chapters) != n_chapters:
        print(f"  WARNING: script has {len(chapters)} CAP sections, MDX has {n_chapters}")
        # proportional by char count anyway
        if len(chapters) == 0:
            return [int(i * total_seconds / n_chapters) for i in range(n_chapters)]

    # Use however many we have, pad/trim to n_chapters
    while len(chapters) < n_chapters:
        chapters.append("")
    chapters = chapters[:n_chapters]

    counts = [max(len(re.sub(r'\s+', ' ', c.strip())), 1) for c in chapters]
    total_chars = sum(counts)
    starts = []
    t = 0.0
    for c in counts:
        starts.append(int(t))
        t += (c / total_chars) * total_seconds
    return starts

slugs = [
    "gargano-vieste","gargano-nord","gargano-paesi",
    "gargano-sacro","gargano-saline","gargano-tremiti",
]

for slug in slugs:
    mp3 = os.path.join(BACKUP, f"{slug}-it.mp3")
    mdx_path = os.path.join(GUIDES_DIR, f"{slug}.mdx")
    script_path = os.path.join(SCRIPTS_DIR, f"{slug}-it.txt")

    with open(mdx_path, encoding="utf-8") as f:
        content = f.read()

    n_chapters = len(re.findall(r"^\s+- title_it:", content, re.MULTILINE))
    total = get_duration(mp3)

    print(f"\n{slug} ({n_chapters} cap, {total//60}m{total%60:02d}s):")
    starts = chapter_starts_from_script(script_path, n_chapters, total)
    fmt = lambda s: f"{s//60}:{s%60:02d}"
    print(f"  {[fmt(s) for s in starts]}")

    idx = 0
    def replace_start(m):
        global idx
        val = starts[idx] if idx < len(starts) else 0
        idx += 1
        return f"{m.group(1)}{val}"

    new_content = re.sub(r"(    start_seconds: )\d+", replace_start, content)
    new_content = re.sub(r"(duration_seconds: )\d+", rf"\g<1>{total}", new_content, count=1)

    with open(mdx_path, "w", encoding="utf-8") as f:
        f.write(new_content)
    print(f"  updated.")

print("\nDone.")
