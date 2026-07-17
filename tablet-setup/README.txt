RestoPOS - connect a tablet over HTTPS
======================================

The POS now runs over HTTPS. Each tablet must trust the shop's local
certificate authority ONCE, then it can use the POS securely.

On the tablet, everything is downloaded from this page:

    http://192.168.1.166:5480

STEP 1 - install the certificate (one time per tablet)
------------------------------------------------------
Android:
  1. Open http://192.168.1.166:5480 in Chrome and tap caddy-root-ca.crt
     to download it.
  2. Open Settings > Security & privacy > More security settings
     (or "Encryption & credentials") > Install a certificate > CA certificate.
  3. Tap "Install anyway" on the warning, then pick the downloaded
     caddy-root-ca.crt from Downloads.

iPad / iPhone:
  1. Open http://192.168.1.166:5480 in Safari, tap caddy-root-ca.crt,
     and tap "Allow" when asked to download a configuration profile.
  2. Settings > General > VPN & Device Management > tap the
     "Caddy Local Authority" profile > Install.
  3. Settings > General > About > Certificate Trust Settings > switch ON
     full trust for "Caddy Local Authority".

STEP 2 - open the POS
---------------------
    https://192.168.1.166:5443

The padlock should show with no warnings. Bookmark it / add to home screen.

Notes
-----
- The old http://192.168.1.166:5180 address should no longer be used.
- 192.168.1.166 is the POS PC's Wi-Fi address. Give this PC a fixed
  address (DHCP reservation) in the router so it never changes. If it
  does change: update frontend/.env and the Caddyfile, and re-visit the
  new address on every tablet (certificates are re-issued automatically).
- The HTTPS proxy (Caddy) starts automatically when the POS PC logs in.
  To start it by hand: run start-caddy.vbs in this folder.
