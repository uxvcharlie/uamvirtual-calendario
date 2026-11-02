import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const MOODLE_URL = 'https://uamvirtual.uam.edu.ni/grado';

// Fuera del repo a propósito: así el token no puede terminar en un commit.
export const RUTA_TOKEN = join(homedir(), '.config', 'uamvirtual-calendario', 'token');

export async function leerToken() {
  return (await readFile(RUTA_TOKEN, 'utf8')).trim();
}

export async function llamar(token, funcion, parametros = {}) {
  const respuesta = await fetch(`${MOODLE_URL}/webservice/rest/server.php`, {
    method: 'POST',
    body: new URLSearchParams({
      wstoken: token,
      wsfunction: funcion,
      moodlewsrestformat: 'json',
      ...parametros,
    }),
  });
  const datos = await respuesta.json();
  if (datos?.exception) throw new Error(`${funcion}: ${datos.errorcode} (${datos.message})`);
  return datos;
}
