import { createServer, type Socket } from 'node:net';
import { createInterface } from 'node:readline';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { Gateway } from './gateway.ts';
import { MixRouter } from './router.ts';
import { Store } from './store.ts';

it('resends persisted operator levels after the control link reconnects', async () => {
  let current: Socket | undefined;
  const configs: any[] = [];
  const server = createServer(socket => {
    current = socket;
    const lines = createInterface({ input: socket });
    lines.on('line', line => {
      const command = JSON.parse(line);
      if (command.cmd === 'hello') socket.write('{"event":"ready"}\n{"event":"sync","sessions":[]}\n');
      if (command.cmd === 'configPorts') configs.push(command);
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const router = new MixRouter(`127.0.0.1:${address.port}`);
  const gateway = new Gateway(new Store(join(mkdtempSync(join(tmpdir(), 'router-cache-')), 'show.json')), router);
  const phone = gateway.createPort({ name: 'Phone', type: 'station', triggers: [] });
  const registration = { nodeId: 'rack', name: 'Rack', address: '', inputs: [], outputs: [] };
  gateway.registerNode(registration);
  router.start();
  try {
    await expect.poll(() => configs.length).toBe(1);
    // A no-change hardware heartbeat must retain the cached configuration's current data.
    gateway.registerNode(registration);
    current!.write(JSON.stringify({ event: 'portState', portId: phone.id, keys: {}, micOff: false, voxOpen: false, incoming: [], audible: [], lastCaller: null, volumes: {}, masterVolume: 43 }) + '\n');
    await expect.poll(() => gateway.live.get(phone.id)?.masterVolume).toBe(43);
    current!.destroy();
    await expect.poll(() => configs.length, { timeout: 4000 }).toBe(2);
    expect(configs[1].ports.find((p: any) => p.id === phone.id).station.masterVolume).toBe(43);
  } finally {
    router.stop(); current?.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    gateway.store.flush();
  }
});
