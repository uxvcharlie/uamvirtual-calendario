/**
 * Junta src/ en un solo archivo para instalar sin terminal: se copia y se pega
 * en un proyecto nuevo de Apps Script. Corre esto después de cambiar src/.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SRC = new URL('../src/', import.meta.url);
export const DESTINO = new URL('../dist/uam-calendario.js', import.meta.url);

const ENCABEZADO = `/**
 * UAM Virtual → Google Calendar
 * https://github.com/uxvcharlie/uamvirtual-calendario
 *
 * Archivo generado con npm run empaquetar. Licencia MIT.
 * Instalación: sigue los pasos del README del repositorio.
 */
`;

export function armarPaquete() {
  const archivos = readdirSync(SRC)
    .filter((archivo) => archivo.endsWith('.js'))
    .sort();
  const partes = archivos.map(
    (archivo) => `\n// ---- ${archivo} ----\n\n${readFileSync(new URL(archivo, SRC), 'utf8')}`
  );
  return ENCABEZADO + partes.join('');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  mkdirSync(new URL('./', DESTINO), { recursive: true });
  writeFileSync(DESTINO, armarPaquete());
  console.log(`Paquete listo: ${fileURLToPath(DESTINO)}`);
}
