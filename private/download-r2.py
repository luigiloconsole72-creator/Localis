import boto3, os

client = boto3.client(
    "s3",
    endpoint_url="https://056403330181e0037dcd3b4f0ea50fda.r2.cloudflarestorage.com",
    aws_access_key_id="f9ec440d6ba774fbebaade8df2138633",
    aws_secret_access_key="f810b5aac6ae0e18148810c3546b70d6fca5c8d5ea96e52566a3165df08ac09a",
    region_name="auto"
)

dest = r"c:\Progetti\Sites\LocalisGuide\private\audio\guides\backup-r2"
keys = [
    "guides/gargano-vieste/full-it.mp3",
    "guides/gargano-nord/full-it.mp3",
    "guides/gargano-paesi/full-it.mp3",
    "guides/gargano-sacro/full-it.mp3",
    "guides/gargano-saline/full-it.mp3",
    "guides/gargano-tremiti/full-it.mp3",
]

for key in keys:
    slug = key.split("/")[1]
    outfile = os.path.join(dest, f"{slug}-it.mp3")
    if os.path.exists(outfile):
        print(f"SKIP {slug}")
        continue
    print(f"Downloading {slug}...", end=" ", flush=True)
    client.download_file("localis-audio", key, outfile)
    size = os.path.getsize(outfile) / 1024 / 1024
    print(f"{size:.1f} MB")

print("Done.")
