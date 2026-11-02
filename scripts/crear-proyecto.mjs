/**
 * Crea el proyecto de Apps Script en tu cuenta. clasp baja el manifiesto por
 * defecto al crearlo, y ese pisaría el nuestro, que es el que activa el
 * servicio de Calendar. Por eso se guarda antes y se restaura después.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const MANIFIESTO = 'src/appsscript.json';

const original = readFileSync(MANIFIESTO);
const { status } = spawnSync(
  'npx',
  ['clasp', 'create-script', '--type', 'standalone', '--title', 'UAM Virtual Calendario', '--rootDir', 'src'],
  { stdio: 'inherit' }
);

writeFileSync(MANIFIESTO, original);
rmSync('src/Code.js', { force: true });

process.exit(status ?? 1);
