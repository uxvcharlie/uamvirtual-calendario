/**
 * Guarda respuestas reales de Moodle en explorar-salida/ (ignorada por Git)
 * para comparar los datos de verdad con lo que espera el código.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { leerToken, llamar } from './lib.mjs';

const SALIDA = 'explorar-salida';
const DIAS = 150;

const guardar = (nombre, datos) =>
  writeFile(join(SALIDA, `${nombre}.json`), JSON.stringify(datos, null, 2));

const token = await leerToken();
await mkdir(SALIDA, { recursive: true });

const ahora = Math.floor(Date.now() / 1000);

const { courses } = await llamar(token, 'core_course_get_enrolled_courses_by_timeline_classification', {
  classification: 'inprogress',
  limit: 0,
  offset: 0,
});
await guardar('cursos', courses);

const pendientes = await llamar(token, 'core_calendar_get_action_events_by_timesort', {
  timesortfrom: ahora,
  timesortto: ahora + DIAS * 86400,
  limitnum: 50,
  limittononsuspendedevents: 1,
});
await guardar('pendientes', pendientes);
console.log(`Entregas pendientes: ${pendientes.events.length}`);

for (const curso of courses) {
  const contenido = await llamar(token, 'core_course_get_contents', { courseid: curso.id });
  await guardar(`contenido-${curso.id}`, contenido);

  const foros = await llamar(token, 'mod_forum_get_forums_by_courses', { 'courseids[0]': curso.id });
  await guardar(`foros-${curso.id}`, foros);

  const avisos = foros.find((foro) => foro.type === 'news');
  if (avisos) {
    const discusiones = await llamar(token, 'mod_forum_get_forum_discussions', {
      forumid: avisos.id,
      page: 0,
      perpage: 10,
    });
    await guardar(`avisos-${curso.id}`, discusiones);
  }

  const conteo = {};
  contenido
    .flatMap((seccion) => seccion.modules ?? [])
    .forEach(({ modname }) => {
      conteo[modname] = (conteo[modname] ?? 0) + 1;
    });
  console.log(`${curso.id} ${curso.fullname}: ${JSON.stringify(conteo)}`);
}
