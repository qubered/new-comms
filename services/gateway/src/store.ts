import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync, copyFileSync, constants } from 'node:fs';
import { dirname } from 'node:path';
import { migrateV1, checkShow, type Show } from '@comms/protocol';
import { validate } from './validate.ts';

export class Store {
  config: Show = { version: 2, name: 'Comms', ports: [], nodes: [] };
  private timer?: NodeJS.Timeout;
  constructor(private readonly path: string) {
    if (!existsSync(path)) return;
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const migrated = raw.version !== 2;
    this.config = validate<Show>('Show', migrated ? migrateV1(raw) : raw);
    const errors = checkShow(this.config).filter(i => i.severity === 'error');
    if (errors.length) throw new Error(`Cannot load show: ${errors.map(i => i.message).join(' ')}`);
    if (migrated) {
      const backup = `${path}.v1.json`;
      if (!existsSync(backup)) copyFileSync(path, backup, constants.COPYFILE_EXCL);
      this.flush();
    }
  }
  save(): void { clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 300); }
  flush(): void {
    clearTimeout(this.timer);
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.config, null, 2) + '\n');
    renameSync(tmp, this.path);
  }
}
