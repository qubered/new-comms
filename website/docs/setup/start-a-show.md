---
title: Start your first show
---

## 1. Connect the host

Join the show network. Prefer a wired connection from the host to the access point. Note its LAN IPv4 address and arrange for it to stay stable. Keep the computer on power and prevent system sleep during the show.

## 2. Launch

From the `new-comms` folder:

```bash
npm run show
```

Wait for the build to finish and the gateway addresses to appear. Leave this terminal running. **Ctrl-C stops the show services**, including the audio router; it does not merely close a setup window.

| Application | Default address | Used by |
| --- | --- | --- |
| Talk | `https://SHOW-IP:8443/` | Operators |
| Manager | `https://SHOW-IP:8443/manager/` | Show configuration |
| Hardware registration | `http://SHOW-IP:8080/` | Interface bridges |

On the host you may use `localhost` in place of `SHOW-IP`. On a phone, `localhost` means the phone itself, so use the host’s LAN address. If the printed address belongs to a VPN or the wrong interface, use the correct show-LAN address. See [network setup](network.md).

## 3. Establish HTTPS trust

A fresh host creates a local certificate. A phone needs a secure, trusted page for microphone access. Complete [HTTPS and certificate setup](https.md) before distributing the Talk address. Opening a certificate warning page is not the same as successfully enabling the microphone.

## 4. Create a show or try the example

Open Manager. An empty system has no ports. Follow the [small-show recipe](../recipes/small-show.md) to create your roles and party lines yourself.

To load the built-in example into an **empty** show, leave the launcher running and open another terminal in the project folder:

```bash
npm run seed
```

This creates Stage Manager, Director, Camera 1 and Camera 2; Show and Cams conferences; and an All call group. Stage Manager calls Show. Director calls Show, Cams and All. Both camera stations call Cams. All targets Stage Manager and both cameras. There is no hardware or IFB in the seed.

The seed refuses to overwrite a show that already has any port or node. Do not delete an existing show just to try it. Use a separate state file for a rehearsal instead:

```bash
COMMS_DATA=/absolute/path/to/rehearsal.json npm run show
```

Stop the existing launcher before starting another on the same ports. Then seed the empty rehearsal normally. Keep track of the chosen file; the usual show is still in its original location.

## 5. Join and test

Open Talk on two devices, choose different stations sharing a conference, grant microphone access and test speech both ways. Release each key and verify the intended listeners remain. Check **Live** in Manager for connection and routing state. A green connection indicator is not proof that the correct physical microphone or earpiece is selected.

Use [preflight](../operate/preflight.md) before real operation. For the example show, do not expect Camera 1 to hear Show until you explicitly add that route.

## Name, stop and restart

To choose the show name displayed in the apps, set it when launching:

```bash
COMMS_NAME="Evening show" npm run show
```

Save configuration in Manager before stopping. Stop with Ctrl-C and wait for shutdown; the gateway flushes saved state. Restarting loads the same state file. Operators may reconnect, but open talk keys are not a cue to resume speaking automatically. Confirm their connection and routing again.

`npm run dev` is a development launcher with different browser ports (5173 and 5174) and separate certificates. Its browser API proxy expects the gateway on port 8080; changing the gateway’s `PORT` does not update that proxy. Use the show addresses above when following this operator guide.
