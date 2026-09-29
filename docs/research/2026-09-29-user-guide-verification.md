# User guide verification — 2026-09-29

The user-facing Docusaurus site is in `website/`: 38 guides covering system setup,
configuration, Talk, show operations, worked examples, rationale and terminology.
It contains 11 screenshots from the running application and three explanatory SVGs.

## Checks completed

- Reviewed setup/runtime instructions against launcher, TLS, gateway persistence,
  migration and hardware-node implementation.
- Independently cross-reviewed configuration/concept guides and operator/recipe
  guides against the implementation; corrected trigger moves, conference gain,
  Reply targeting, device preferences, output meter interpretation and test setup.
- `npm run build`, including Manager, Talk and the guide, passed.
- `npm run typecheck` passed, including generated protocol freshness.
- `npm test` passed: 75 tests across Talk, protocol, gateway and Rust.
- Docusaurus production build rejects broken links; independent generated-site
  audit found no unresolved local links, image sources or fragment targets.
- Local production search returned IFB guides and Enter opened the selected result.
- Desktop and 390-pixel mobile browser checks exercised navigation and screenshot
  rendering. The mobile article had no document-level horizontal overflow.
- Full-size screenshot links returned PNGs successfully after disabling forced
  trailing slashes. Screenshot captions explain demo/offline and no-mic states.
- Existing locked package versions did not change. Added documentation packages
  only; a scoped override selects patched `serialize-javascript` 7.0.5 for the
  Docusaurus bundler. npm audit still reports upstream moderate advisories and the
  pre-existing high advisory on `@fastify/static`; this was not a security audit.

Screenshots used a disposable show state under `/tmp`, with the built-in stations
and an explicitly labelled demo hardware inventory. No physical rack or successful
phone microphone path is implied by those pictures. Physical iOS/Android,
multichannel-interface and venue-WiFi acceptance remain unverified, as recorded in
`2026-09-29-v2-verification.md` and the guide's limits/preflight pages.

## Local viewing and static output

`npm run docs:build` creates `website/build/`. `npm run docs:serve -- --port 3000`
serves it separately from Talk/Manager. Search and illustrations are served locally.
For a static host, set `DOCS_URL` to the site's origin and `DOCS_BASE_URL` to its
mount path when building (defaults are localhost:3000 and `/`). Public hosting
was not provisioned or claimed as part of this documentation change.
