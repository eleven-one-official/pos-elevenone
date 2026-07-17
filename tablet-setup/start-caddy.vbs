' Starts the RestoPOS HTTPS proxy (Caddy) hidden, without a console window.
' A copy of this file sits in the user's Startup folder so it runs at logon.
Dim exe, cfg
exe = CreateObject("WScript.Shell").ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\WinGet\Packages\CaddyServer.Caddy_Microsoft.Winget.Source_8wekyb3d8bbwe\caddy.exe"
cfg = "C:\Elevenone\Projects\pos-elevenone\Caddyfile"
CreateObject("WScript.Shell").Run """" & exe & """ start --config """ & cfg & """", 0, False
