---
title: Install the host
---

Install and build before arriving at a venue without internet. The first dependency download and Rust build need network access; normal show audio stays on the LAN.

## 1. Prepare the computer

Install Git, Node.js 22.12 or newer, and [rustup from the official Rust site](https://rustup.rs/). Use the Node installer from [nodejs.org](https://nodejs.org/en/download). The repository selects its required Rust version when you build inside it.

On macOS, install Apple’s command-line compiler tools if needed:

```bash
xcode-select --install
```

If you already use Homebrew, install the audio build dependencies:

```bash
brew install opus pkg-config openssl
```

On Debian/Ubuntu-based Linux, the equivalent build prerequisites include:

```bash
sudo apt install build-essential pkg-config libopus-dev libasound2-dev openssl git
```

Install a suitable Node and Rust version separately; the distribution’s default Node package may be older than required. Linux/Pi hardware and performance still need local verification.

Confirm the tools are available in the terminal you will use:

```bash
node --version
npm --version
rustup --version
openssl version
```

## 2. Obtain the application

```bash
git clone https://github.com/qubered/new-comms.git
cd new-comms
npm ci
```

These guides describe the ports-model version. If an older checkout shows a channel-based interface, obtain the ports-model release or branch supplied by the project owner before following these steps. Repository access may require your GitHub credentials if the repository is private.

`npm ci` installs the exact locked dependency versions. Keep the project folder intact: the launcher expects to find its web apps, audio binaries and saved show together.

## 3. Build before show day

```bash
cargo build --release -p mix-router
npm run build
```

The first build can take several minutes. Read the first actual error if a build fails. An Opus/linker error usually means the native audio libraries or compiler tools are missing. A Node engine error means your terminal is using the wrong Node version. Do not continue with a failed build and assume the interfaces are current.

## 4. Start the system

Continue with [Start a show](start-a-show.md). For ordinary operation use `npm run show`; it builds and launches the host services and serves the completed interfaces.

## Keep the guide available locally

The documentation is bundled in the repository. After building it, serve it in another terminal:

```bash
npm run docs:build
npm run docs:serve -- --port 3000
```

Read it at `http://localhost:3000/` on the host or `http://SHOW-IP:3000/` from the same LAN. This is a separate documentation server, not the Talk or Manager address. Its pages, screenshots and search index are local; external reference links still need internet. Keep the guide’s terminal open while people need it.
