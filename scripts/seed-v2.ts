// npx tsx scripts/seed-v2.ts --output /path/to/state.json
// npx tsx scripts/seed-v2.ts https://gateway:8080
import { writeFileSync, existsSync } from 'node:fs';
import { demoShow, checkPorts } from '../packages/protocol/src/index.ts';
const show = demoShow();
const errors = checkPorts(show.ports).filter(issue => issue.severity === 'error');
if (errors.length) throw new Error(JSON.stringify(errors));
const args = process.argv.slice(2);
if (args[0] === '--output') {
  if (!args[1]) throw new Error('Provide a state.json destination.');
  if (existsSync(args[1])) throw new Error('The destination already exists; choose an empty destination.');
  writeFileSync(args[1], JSON.stringify(show, null, 2) + '\n', { flag: 'wx' });
  console.log(`Wrote v2 show to ${args[1]}.`);
} else {
  const base = (args[0] ?? 'http://localhost:8080') + '/api/v2';
  const current = await fetch(base + '/state');
  if (!current.ok) throw new Error(`Cannot read v2 state: ${current.status} ${await current.text()}`);
  const state = await current.json();
  if (state.ports.length || state.nodes.length) throw new Error('Gateway already has a show; not seeding.');
  const response = await fetch(base + '/show', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(show) });
  if (!response.ok) throw new Error(`Cannot seed v2 show: ${response.status} ${await response.text()}`);
  console.log('Seeded v2 show: 4 stations, 2 conferences and All call.');
}
