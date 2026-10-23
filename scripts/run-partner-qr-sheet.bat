@echo off
REM Sync giornaliero foglio "Localis - Partner QR Daily Report" (GA4 -> Google Sheets)
REM Lanciato da Windows Task Scheduler. Auth via service account (non scade).
set PYTHONIOENCODING=utf-8
cd /d C:\Progetti\Sites\LocalisGuide
"C:\Program Files\nodejs\node.exe" scripts\partner-qr-sheet-sync.mjs >> private\partner-qr-sheet.log 2>&1
