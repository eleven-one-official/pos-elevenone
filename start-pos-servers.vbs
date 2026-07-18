' Starts the RestoPOS dev servers (Laravel :8001 + Vite :5180) hidden, without a console window.
' A copy of this file sits in the user's Startup folder so it runs at logon.
Dim cmd
cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Elevenone\Projects\pos-elevenone\start-pos-servers.ps1"""
CreateObject("WScript.Shell").Run cmd, 0, False
