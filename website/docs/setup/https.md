---
title: HTTPS and microphone permission
---

Talk needs a secure browser context to request a microphone. For a phone reaching another computer, use the HTTPS Talk address. HTTP on `localhost` is a browser exception useful on the host itself; it does not make an HTTP LAN address microphone-capable.

## What happens on first launch

The gateway looks for `data/tls/key.pem` and `data/tls/cert.pem` in the project folder. If they do not exist, it uses OpenSSL to generate a self-signed certificate for `localhost` and the computer’s current IPv4 addresses. The generated certificate lasts 825 days. If generation fails, the terminal reports it and only HTTP is available.

These certificate files stay in `data/tls` even when you use `COMMS_DATA` to move the show state elsewhere. The host must be able to run `openssl` from its launch terminal. An existing certificate pair is loaded as supplied; keeping that pair valid is the host operator’s responsibility.

This page describes `npm run show`. The development pages on ports 5173/5174 use separate Vite certificates, so trusting the show certificate does not establish trust for those pages.

## Choose a trust arrangement

For a controlled rehearsal, the device owner or administrator can install and trust the host’s **public certificate** using that device’s supported certificate process. Verify that it comes from your show computer. Exact controls vary by operating system and device-management policy. Some browsers/devices may still reject a self-signed setup; test before the show.

For a managed venue, ask its network administrator for a certificate trusted by the operator devices, covering the hostname you will actually use. With the host stopped, install the matching PEM certificate and private key at the paths above, then restart. Ensure the certificate chain and device DNS resolution are correct. An organisation-managed local certificate authority is another option when all clients trust it.

Do not send `key.pem` to operators. It is the host’s private key. Only the public certificate is distributed for trust. Do not disable certificate checking or browser security as a workaround.

## Check a device

1. Open the exact HTTPS address you will use during the show.
2. Resolve trust with the device owner or administrator if the browser reports a certificate problem.
3. Join a station and allow microphone access when the browser asks.
4. Select the intended microphone in **Audio devices**.
5. Have another station confirm your speech and test your listening path too.

Certificate trust, site microphone permission and operating-system microphone permission are separate controls. Fixing one does not automatically grant the others. If permission was denied, update the site or OS permission through its settings, then retry in Talk. See [Audio devices](../use/audio-devices.md).

## Address changes and expiry

The host reuses an existing certificate pair. It does **not** automatically renew expired certificates or add a new LAN address. If the host moves networks and clients report a name/address mismatch:

1. Stop the show outside live operation.
2. Back up the current certificate pair securely.
3. Install an updated trusted pair, or move the old pair out of `data/tls` so the next launch can generate a new local pair.
4. Restart on the intended network.
5. Establish trust again on all clients and repeat microphone checks.

A stable host address and a planned certificate process avoid repeating this during a show. A local certificate is not a Manager password: anyone who can reach Manager on the trusted LAN can configure the system.
