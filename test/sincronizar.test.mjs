import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CURSO, DIA, MARTES_10AM, crearEntorno, moduloDe, pendienteDe } from './entorno.mjs';

const MEDIA_HORA = 1800;
const VENCE = MARTES_10AM + 5 * DIA;

/** Entorno ya instalado, con un curso que tiene un archivo publicado. */
function instalado({ pendientes = [] } = {}) {
  const e = crearEntorno();
  e.moodle.cursos = [CURSO];
  e.moodle.pendientes = pendientes;
  e.moodle.contenidos[10] = [{ modules: [moduloDe(1, 'resource', 'Sílabo')] }];
  e.contexto.instalar();
  return e;
}

const publicar = (e, ...modulos) => e.moodle.contenidos[10][0].modules.push(...modulos);

test('instalar toma nota de lo publicado sin avisar y deja el disparador', () => {
  const e = instalado({ pendientes: [pendienteDe(100, 5, VENCE)] });
  assert.equal(e.entregas().length, 1);
  assert.equal(e.novedades().length, 0);
  assert.equal(e.disparadores.length, 1);
  assert.equal(e.disparadores[0].minutos, 30);
});

test('instalar dos veces no duplica calendarios ni disparadores', () => {
  const e = instalado();
  const calendario = e.propiedades.get('CALENDARIO_ENTREGAS');
  e.contexto.instalar();
  assert.equal(e.propiedades.get('CALENDARIO_ENTREGAS'), calendario);
  assert.equal(e.disparadores.length, 1);
});

test('una presentación nueva avisa con un evento que suena en 5 minutos', () => {
  const e = instalado();
  publicar(e, moduloDe(2, 'resource', 'Sesión 16'));
  e.contexto.sincronizar();

  const [novedad] = e.novedades();
  assert.equal(novedad.summary, '📎 Álgebra Lineal: Sesión 16');
  assert.equal(novedad.start.dateTime, new Date((MARTES_10AM + 300) * 1000).toISOString());
  assert.deepEqual(novedad.reminders.overrides, [{ method: 'popup', minutes: 0 }]);
});

test('varias cosas nuevas en un curso son un solo aviso', () => {
  const e = instalado();
  publicar(e, moduloDe(2, 'resource', 'Lámina 1'), moduloDe(3, 'url', 'Video'));
  e.contexto.sincronizar();

  assert.equal(e.novedades().length, 1);
  const [novedad] = e.novedades();
  assert.equal(novedad.summary, '🆕 Álgebra Lineal: 2 novedades');
  assert.match(novedad.description, /Lámina 1/);
  assert.match(novedad.description, /Video/);
});

test('una tarea nueva crea la entrega y el aviso trae la fecha', () => {
  const e = instalado();
  publicar(e, moduloDe(5, 'assign', 'Tarea 5', VENCE));
  e.moodle.pendientes = [pendienteDe(100, 5, VENCE)];
  e.contexto.sincronizar();

  assert.equal(e.entregas()[0].summary, 'Álgebra Lineal: Tarea 5');
  assert.equal(e.entregas()[0].start.dateTime, new Date(VENCE * 1000).toISOString());
  assert.equal(e.novedades().length, 1);
  assert.equal(e.novedades()[0].summary, '📝 Álgebra Lineal: Tarea 5 — vence dom 8 nov, 10:00');
});

test('avisa cuando el profesor le pone fecha a una tarea ya publicada', () => {
  const e = instalado();
  publicar(e, moduloDe(5, 'assign', 'Tarea 5'));
  e.contexto.sincronizar();
  assert.equal(e.novedades().length, 1);

  e.moodle.pendientes = [pendienteDe(100, 5, VENCE)];
  e.irA(MARTES_10AM + MEDIA_HORA);
  e.contexto.sincronizar();

  assert.equal(e.novedades().length, 2);
  assert.match(e.novedades()[1].summary, /^📅 Álgebra Lineal: Tarea 5 — vence/);
});

test('si cambia la fecha mueve el evento y avisa', () => {
  const e = instalado({ pendientes: [pendienteDe(100, 5, VENCE)] });
  const nueva = VENCE + 2 * DIA;
  e.moodle.pendientes = [pendienteDe(100, 5, nueva)];
  e.contexto.sincronizar();

  assert.equal(e.entregas()[0].start.dateTime, new Date(nueva * 1000).toISOString());
  assert.match(e.novedades()[0].summary, /^⏰ .*cambió a mar 10 nov, 10:00$/);
  assert.match(e.novedades()[0].description, /Antes: dom 8 nov, 10:00/);
});

test('no pisa un evento que moviste a mano', () => {
  const e = instalado({ pendientes: [pendienteDe(100, 5, VENCE)] });
  const movido = { dateTime: '2026-11-07T15:00:00.000Z', timeZone: 'America/Managua' };
  e.evento('Entregas', 'uame100').start = movido;
  e.contexto.sincronizar();

  assert.deepEqual(e.entregas()[0].start, movido);
});

test('lo enviado se marca con ✓ y deja de recordar; si vuelve, se reabre', () => {
  const pendiente = pendienteDe(100, 5, VENCE);
  const e = instalado({ pendientes: [pendiente] });

  e.moodle.pendientes = [];
  e.contexto.sincronizar();
  assert.equal(e.entregas()[0].summary, '✓ Álgebra Lineal: Tarea 5');
  assert.deepEqual(e.entregas()[0].reminders.overrides, []);

  e.moodle.pendientes = [pendiente];
  e.contexto.sincronizar();
  assert.equal(e.entregas()[0].summary, 'Álgebra Lineal: Tarea 5');
  assert.ok(e.entregas()[0].reminders.overrides.length > 0);
});

test('lo que venció no se marca como enviado', () => {
  const e = instalado({ pendientes: [pendienteDe(100, 5, VENCE)] });
  e.moodle.pendientes = [];
  e.irA(VENCE + DIA);
  e.contexto.sincronizar();

  assert.equal(e.entregas()[0].summary, 'Álgebra Lineal: Tarea 5');
});

test('lo que borraste del calendario no vuelve', () => {
  const e = instalado({ pendientes: [pendienteDe(100, 5, VENCE)] });
  e.evento('Entregas', 'uame100').status = 'cancelled';
  e.contexto.sincronizar();

  assert.equal(e.entregas().length, 1);
  assert.equal(e.entregas()[0].status, 'cancelled');
});

test('correr dos veces sin cambios no hace nada nuevo', () => {
  const e = instalado({ pendientes: [pendienteDe(100, 5, VENCE)] });
  e.contexto.sincronizar();
  e.contexto.sincronizar();

  assert.equal(e.entregas().length, 1);
  assert.equal(e.novedades().length, 0);
});

test('los avisos del foro también llegan, con un resumen', () => {
  const e = instalado();
  e.moodle.foros[10] = [{ id: 7, type: 'news' }];
  e.moodle.discusiones[7] = [{ discussion: 44, name: 'No hay clase', message: '<p>Nos vemos&nbsp;el lunes</p>' }];
  e.contexto.sincronizar();

  const [novedad] = e.novedades();
  assert.equal(novedad.summary, '📢 Álgebra Lineal: No hay clase');
  assert.match(novedad.description, /Nos vemos el lunes/);
});

test('ignora etiquetas, asistencias y lo que el estudiante no puede ver', () => {
  const e = instalado();
  publicar(
    e,
    moduloDe(2, 'label', 'Unidad 3'),
    moduloDe(3, 'attendance', 'Asistencia'),
    { ...moduloDe(4, 'resource', 'Oculto'), uservisible: false }
  );
  e.contexto.sincronizar();

  assert.equal(e.novedades().length, 0);
});

test('las encuestas no cuentan como entregas', () => {
  const encuesta = pendienteDe(100, 5, VENCE, { modulename: 'feedback', eventtype: 'close' });
  const e = instalado({ pendientes: [encuesta] });

  assert.equal(e.entregas().length, 0);
});

test('un cuestionario que abre se distingue del que cierra', () => {
  const abre = pendienteDe(100, 5, VENCE, { modulename: 'quiz', eventtype: 'open', activityname: 'Quiz 1' });
  const e = instalado({ pendientes: [abre] });

  assert.equal(e.entregas()[0].summary, 'Álgebra Lineal: Quiz 1 (abre)');
});

test('los nombres largos de Moodle se acortan', () => {
  const { contexto } = crearEntorno();
  const nombre = (fullname) => contexto.nombreCurso_({ fullname });

  assert.equal(nombre('SIS0415 - TECNOLOGIA DE REDES II - GRUPO 2'), 'Redes II');
  assert.equal(nombre('ABC0001 - OTRA MATERIA - GRUPO 1'), 'OTRA MATERIA');
  assert.equal(nombre('Curso sin formato'), 'Curso sin formato');
});

test('los nombres con entidades HTML salen limpios', () => {
  const e = instalado();
  publicar(e, moduloDe(2, 'resource', 'Redes &amp; Datos'));
  e.contexto.sincronizar();

  assert.equal(e.novedades()[0].summary, '📎 Álgebra Lineal: Redes & Datos');
});

test('un curso nuevo no suelta todo lo que ya tenía', () => {
  const e = instalado();
  e.moodle.cursos = [CURSO, { ...CURSO, id: 20, fullname: 'Redes II' }];
  e.moodle.contenidos[20] = [{ modules: [moduloDe(50, 'resource', 'A'), moduloDe(51, 'resource', 'B')] }];
  e.contexto.sincronizar();

  assert.equal(e.novedades().length, 0);
});

test('un curso con error no frena a los demás y se reintenta', () => {
  const e = instalado();
  e.moodle.cursos = [{ ...CURSO, id: 20, fullname: 'Redes II' }, CURSO];
  e.moodle.contenidos[20] = [{ modules: [] }];
  e.contexto.sincronizar();

  publicar(e, moduloDe(2, 'resource', 'Sesión 16'));
  e.moodle.errores['core_course_get_contents:20'] = 'accessexception';
  e.contexto.sincronizar();
  assert.equal(e.novedades().length, 1);
});

test('con el token vencido avisa una sola vez por día', () => {
  const e = instalado();
  e.moodle.errores.core_course_get_enrolled_courses_by_timeline_classification = 'invalidtoken';

  e.contexto.sincronizar();
  e.irA(MARTES_10AM + MEDIA_HORA);
  e.contexto.sincronizar();
  assert.equal(e.novedades().length, 1);
  assert.equal(e.novedades()[0].summary, '⚠️ UAM Virtual: renueva el token');

  e.irA(MARTES_10AM + DIA);
  e.contexto.sincronizar();
  assert.equal(e.novedades().length, 2);
});

test('de madrugada no revisa', () => {
  const e = instalado();
  e.llamadas.length = 0;
  e.irA(MARTES_10AM + 13 * 3600); // 23:00 en Managua
  e.contexto.sincronizar();
  e.irA(MARTES_10AM + 19 * 3600); // 05:00 en Managua
  e.contexto.sincronizar();

  assert.equal(e.llamadas.length, 0);
});

test('instalar cambia CIF y PIN por un token y borra los dos', () => {
  const e = crearEntorno();
  e.propiedades.delete('MOODLE_TOKEN');
  e.propiedades.set('UAM_CIF', '123');
  e.propiedades.set('UAM_PIN', 'pin-correcto');
  e.contexto.instalar();

  assert.equal(e.propiedades.get('MOODLE_TOKEN'), 'token-nuevo');
  assert.equal(e.propiedades.has('UAM_CIF'), false);
  assert.equal(e.propiedades.has('UAM_PIN'), false);
});

test('con un PIN equivocado falla, pero tampoco lo deja guardado', () => {
  const e = crearEntorno();
  e.propiedades.delete('MOODLE_TOKEN');
  e.propiedades.set('UAM_CIF', '123');
  e.propiedades.set('UAM_PIN', 'pin-malo');

  assert.throws(() => e.contexto.instalar(), /Moodle no dio token/);
  assert.equal(e.propiedades.has('UAM_PIN'), false);
});

test('sin token ni PIN explica qué falta', () => {
  const e = crearEntorno();
  e.propiedades.delete('MOODLE_TOKEN');

  assert.throws(() => e.contexto.instalar(), /UAM_CIF y UAM_PIN/);
});

test('los ceros y los corchetes llegan a Moodle tal cual', () => {
  const { contexto } = crearEntorno();
  assert.equal(
    contexto.formulario_({ limit: 0, 'courseids[0]': 8202 }),
    'limit=0&courseids%5B0%5D=8202'
  );
});

test('las fechas salen en español y en hora de Managua', () => {
  const e = crearEntorno();
  assert.equal(e.contexto.fechaCorta_(MARTES_10AM), 'mar 3 nov, 10:00');
});
