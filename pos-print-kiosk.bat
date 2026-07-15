@echo off
REM ============================================================
REM  POS Eleven One - SILENT kitchen-ticket print launcher
REM ------------------------------------------------------------
REM  Opens the POS in Chrome "kiosk-printing" mode. In this mode
REM  the browser prints with NO dialog: tapping "Send to Kitchen"
REM  sends the docket straight to the Windows DEFAULT printer.
REM
REM  >> Set your 80mm thermal printer as the Windows default
REM     printer before running this for real kitchen receipts. <<
REM
REM  A dedicated Chrome profile (--user-data-dir) is used so the
REM  kiosk-printing flag is always honored (a normal Chrome that
REM  is already open would otherwise ignore it).
REM ============================================================

set "CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe"
set "POS_URL=http://localhost:5173"
set "PROFILE=%LOCALAPPDATA%\pos-elevenone-kiosk"

if not exist "%CHROME%" (
  echo Chrome not found at "%CHROME%".
  echo Edit this file and set CHROME to your chrome.exe path.
  pause
  exit /b 1
)

REM Add --kiosk for a full-screen tablet POS. Left off here so you
REM can still use the address bar / DevTools while testing.
start "" "%CHROME%" --kiosk-printing --user-data-dir="%PROFILE%" --new-window "%POS_URL%"
