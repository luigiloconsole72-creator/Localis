import boto3, re, os, subprocess, json

R2_ENDPOINT = "https://056403330181e0037dcd3b4f0ea50fda.r2.cloudflarestorage.com"
R2_KEY      = "f9ec440d6ba774fbebaade8df2138633"
R2_SECRET   = "f810b5aac6ae0e18148810c3546b70d6fca5c8d5ea96e52566a3165df08ac09a"
BUCKET      = "localis-audio"
BACKUP      = r"c:\Progetti\Sites\LocalisGuide\private\audio\guides\backup-r2"
GUIDES_DIR  = r"c:\Progetti\Sites\LocalisGuide\src\content\guides"
SCRIPTS_DIR = r"c:\Progetti\Sites\LocalisGuide\src\content\scripts"

# Guides to fix: slug -> R2 key for the IT audio
TARGETS = {
    "alberobello":      "guides/alberobello/full-it.mp3",
    "bari-sotterranea": "guides/bari-sotterranea/full-it.mp3",
    "bari-vecchia":     "guides/bari-vecchia/full-it.mp3",
    "cisternino":       "guides/cisternino/full-it.mp3",
    "fasano":           "guides/fasano/full-it.mp3",
    "il-meglio-di-bari":"guides/il-meglio-di-bari/full-it.mp3",
    "locorotondo":      "guides/locorotondo/full-it.mp3",
    "martina-franca":   "guides/martina-franca/full-it.mp3",
    "ostuni":           "guides/ostuni/full-it.mp3",
    "porto-bari":       "guides/porto-bari/full-it.mp3",
    "san-nicola":       "guides/san-nicola/full-it.mp3",
    "tre-teatri":       "guides/tre-teatri/full-it.mp3",
}

client = boto3.client(
    "s3",
    endpoint_url=R2_ENDPOINT,
    aws_access_key_id=R2_KEY,
    aws_secret_access_key=R2_SECRET,
    region_name="auto"
)

def get_duration(mp3):
    r = subprocess.run(
        [r"C:\ffmpeg\bin\ffprobe.exe", "-v", "quiet", "-print_format", "json", "-show_format", mp3],
        capture_output=True, text=True
    )
    return int(float(json.loads(r.stdout)["format"]["duration"]))

def chapter_starts_from_script(script_path, n_chapters, total_seconds):
    if not os.path.exists(script_path):
        print(f"  WARNING: no script at {script_path}, using uniform split")
        return [int(i * total_seconds / n_chapters) for i in range(n_chapters)]

    with open(script_path, encoding="utf-8") as f:
        text = f.read()

    parts = re.split(r"CAP\.\s*\d+\s*[—\-]", text)
    chapters = [p for p in parts if len(p.strip()) > 30]

    if len(chapters) == 0:
        parts = re.split(r"={5,}", text)
        chapters = [p for p in parts if p.strip() and len(p.strip()) > 50]

    if len(chapters) == 0:
        print(f"  WARNING: no CAP/===== sections found, using uniform split")
        return [int(i * total_seconds / n_chapters) for i in range(n_chapters)]

    if len(chapters) != n_chapters:
        print(f"  INFO: script={len(chapters)} sections, MDX={n_chapters} chapters — trimming/padding")

    while len(chapters) < n_chapters:
        chapters.append("")
    chapters = chapters[:n_chapters]

    counts = [max(len(re.sub(r'\s+', ' ', c.strip())), 1) for c in chapters]
    total_chars = sum(counts)
    starts, t = [], 0.0
    for c in counts:
        starts.append(int(t))
        t += (c / total_chars) * total_seconds
    return starts

# --- Download missing files ---
print("=== DOWNLOAD ===")
for slug, r2_key in TARGETS.items():
    outfile = os.path.join(BACKUP, f"{slug}-it.mp3")
    if os.path.exists(outfile):
        print(f"  SKIP {slug}")
        continue
    print(f"  Downloading {slug}...", end=" ", flush=True)
    client.download_file(BUCKET, r2_key, outfile)
    size = os.path.getsize(outfile) / 1024 / 1024
    print(f"{size:.1f} MB")

# --- Calculate and patch ---
print("\n=== PATCH MDX ===")
for slug in TARGETS:
    mp3      = os.path.join(BACKUP, f"{slug}-it.mp3")
    mdx_path = os.path.join(GUIDES_DIR, f"{slug}.mdx")
    script_path = os.path.join(SCRIPTS_DIR, f"{slug}-it.txt")

    with open(mdx_path, encoding="utf-8") as f:
        content = f.read()

    n_chapters = len(re.findall(r"^\s+- title_it:", content, re.MULTILINE))
    # Skip if all starts already non-zero (already fixed)
    zero_count = len(re.findall(r"    start_seconds: 0\b", content))
    if zero_count <= 1:
        print(f"  SKIP {slug} (already has timestamps)")
        continue

    total = get_duration(mp3)
    starts = chapter_starts_from_script(script_path, n_chapters, total)

    fmt = lambda s: f"{s//60}:{s%60:02d}"
    print(f"\n  {slug} ({n_chapters} cap, {total//60}m{total%60:02d}s):")
    print(f"    {[fmt(s) for s in starts]}")

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
    print(f"    updated.")

print("\nDone.")
