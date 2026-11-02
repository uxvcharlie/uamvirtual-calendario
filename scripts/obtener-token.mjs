/**
 * Pide CIF y PIN en la terminal, saca el token de la app móvil de Moodle y lo
 * guarda con permisos 600 fuera del repo. El PIN no se guarda en ningún lado y
 * el token no se imprime: se copia al portapapeles.
 */
import { spawnSync } from 'node:child_process';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { MOODLE_URL, RUTA_TOKEN, llamar } from './lib.mjs';

const NECESARIAS = [
  'core_course_get_enrolled_courses_by_timeline_classification',
  'core_calendar_get_action_events_by_timesort',
  'core_course_get_contents',
  'mod_forum_get_forums_by_courses',
  'mod_forum_get_forum_discussions',
];

async function preguntar(texto) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const respuesta = await rl.question(texto);
  rl.close();
  return respuesta.trim();
}

async function preguntarOculto(texto) {
  process.stdout.write(texto);
  const silencio = new Writable({ write: (_trozo, _codificacion, listo) => listo() });
  const rl = readline.createInterface({ input: process.stdin, output: silencio, terminal: true });
  const respuesta = await rl.question('');
  rl.close();
  process.stdout.write('\n');
  return respuesta;
}

function copiarAlPortapapeles(texto) {
  // Sin tuberías en stdout: wl-copy queda en segundo plano y las dejaría abiertas.
  const resultado = spawnSync('wl-copy', { input: texto, stdio: ['pipe', 'ignore', 'ignore'] });
  return resultado.status === 0;
}

const username = await preguntar('CIF: ');
const password = await preguntarOculto('PIN (no se ve al escribir): ');

const respuesta = await fetch(`${MOODLE_URL}/login/token.php`, {
  method: 'POST',
  body: new URLSearchParams({ username, password, service: 'moodle_mobile_app' }),
});
const datos = await respuesta.json();

if (!datos.token) {
  console.error(`Moodle no dio token: ${datos.errorcode} (${datos.error})`);
  process.exit(1);
}

const sitio = await llamar(datos.token, 'core_webservice_get_site_info');

await mkdir(dirname(RUTA_TOKEN), { recursive: true, mode: 0o700 });
await writeFile(RUTA_TOKEN, `${datos.token}\n`, { mode: 0o600 });
await chmod(RUTA_TOKEN, 0o600);

const disponibles = new Set(sitio.functions.map((funcion) => funcion.name));
const faltantes = NECESARIAS.filter((funcion) => !disponibles.has(funcion));

console.log(`Conectado a ${sitio.sitename} (Moodle ${sitio.release}).`);
console.log(`Funciones disponibles: ${disponibles.size}.`);
console.log(faltantes.length ? `FALTAN: ${faltantes.join(', ')}` : 'Están todas las funciones que usa el proyecto.');
console.log(`Token guardado en ${RUTA_TOKEN}.`);
console.log(copiarAlPortapapeles(datos.token) ? 'Token copiado al portapapeles.' : `Para verlo: cat ${RUTA_TOKEN}`);
