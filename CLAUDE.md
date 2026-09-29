# new-comms

Web-based party-line / PGM intercom in the style of Riedel Artist and Bolero. Single site, local
WiFi, no accounts. Phones and browsers are stations; hardware nodes bridge audio interfaces in.

## Where things are

- `docs/superpowers/specs/2026-09-29-new-comms-matrix-design.md` is the **current spec (v2, rev 3)**:
  ports, triggers (key, reply, always, vox, on call) and functions, with the matrix derived.
- `docs/superpowers/plans/2026-09-29-new-comms-matrix-rebuild-plan.md` is the **current plan**: phases
  0-6, in that order. Start there.
- `docs/design/mockups/manager-v2.html` is the visual reference for the Manager. `talk.html` is the
  reference for the phone app.
- The v1 spec, plan and `matrix.html` mockup are history. The v1 code is tagged `v1-channels`.
- `README.md` describes how to run things. It is v1 until phase 6 rewrites it.

```
apps/talk/           phone client (React PWA)
apps/manager/        admin app (React)
services/gateway/    Node/Fastify: state, REST, SSE, signalling; talks to mix-router over TCP
crates/mix-router/   Rust: str0m WebRTC termination and mixing
crates/comms-node/   Rust: bridges an audio interface (cpal) into the system
packages/protocol/   protocol.schema.json (the authority), generated TS types, shared helpers
```

## Commands

```bash
npm run dev          # mix-router + gateway + Talk + Manager, hot reload, HTTPS for phones
npm run seed         # demo show into an empty gateway
npm test             # gateway tests + cargo tests
npm run smoke        # real mix-router, real WebRTC clients over loopback
npm run typecheck    # also fails if packages/protocol/src/generated.ts is stale
npm run generate -w @comms/protocol   # regenerate types after editing the schema
```

## How to work here

**Rapid build, test live.** Get the smallest real thing running and try it, then iterate. Prefer a
running system to a design document. Do not write task-by-task plans; a spec plus a one-page phased
plan is the ceiling. After a change, drive it: the browser pane for UI, `npm run smoke` for audio, a
real phone whenever the change touches audio, WiFi or iOS. Say plainly what was verified and what
was not.

**Atomic commits.** One logical change per commit, and each commit builds and passes tests on its
own. Code, its tests and any generated files (schema to `generated.ts`) go in the same commit. Docs
and mockups are their own commits. Never mix a rename or reformat with a behaviour change. Commit as
you go; do not batch a session into one commit. Subject line in the imperative, under about 70
characters, with a body only when the why is not obvious.

**Checkpoint decisions.** This project was designed in review rounds: propose, get a reaction,
update the spec, then build. Naming, model and UX choices are the user's. Ask before changing the
data model, and record what was decided in the spec, not just in chat.

## Design taste

Plain, not "designed": platform font, sentence case, full words, flat colour. No mono or tracked
uppercase labels, glows or decorative cards. Dark theme. Colour means something: red is only "this
mic is hot", green is audio present or online, amber is a warning. Copy is short and plain; errors
say what happened and what to do.

## Conventions

- The protocol schema is the authority. Change `protocol.schema.json`, regenerate, then change code.
  The gateway validates every request body against it.
- Nothing spawns anything else. mix-router listens on `127.0.0.1:7100` and the gateway connects; a
  connection only becomes the control link after a valid `hello`.
- Audio latency matters: 48 kHz, 10 ms Opus, no per-packet allocation in hot paths you can avoid.
- Rust toolchain is pinned in `rust-toolchain.toml`; `libopus` must be installed (`brew install opus`).
- Talk needs HTTPS for the microphone (self-signed in dev); the gateway serves the built apps in
  production with `npm run show`.

## Gotchas

- macOS `sed` has no `\b`; use `perl -pi -e` for word-boundary edits.
- The browser pane blocks the microphone. Stub `getUserMedia` with a synthetic `MediaStream` to test
  the audio path; the Latency test page does exactly that.
- Vite dev servers, the gateway and mix-router keep running between tests. Stop them, and delete
  `data/`, before a clean-slate run.
- The preview tool opens a browser tab on any port it starts, including mix-router's control port.
  The handshake above exists because of that.
