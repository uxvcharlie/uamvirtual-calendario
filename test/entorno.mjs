/**
 * Corre el código de src/ en Node con versiones falsas de los servicios de
 * Google. Apps Script no tiene módulos: todos los archivos comparten el mismo
 * ámbito global, y eso es justo lo que hace vm con un solo contexto.
 */
import { readdirSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = new URL('../src/', import.meta.url).pathname;
const ID_VALIDO = /^[a-v0-9]{5,1024}$/;

// Martes 3 de noviembre de 2026, 10:00 en Managua.
export const MARTES_10AM = Date.UTC(2026, 10, 3, 16) / 1000;
export const DIA = 86400;

export function crearEntorno() {
  const moodle = { cursos: [], pendientes: [], contenidos: {}, foros: {}, discusiones: {}, errores: {} };
  const propiedades = new Map([['MOODLE_TOKEN', 'token-de-prueba']]);
  const calendarios = new Map();
  const llamadas = [];
  const disparadores = [];

  const eventosDe = (id) => {
    if (!calendarios.has(id)) calendarios.set(id, new Map());
    return calendarios.get(id);
  };

  const responder = (datos) => ({
    getContentText: () => JSON.stringify(datos),
    getResponseCode: () => 200,
  });

  const respuestaMoodle = (funcion, parametros) => {
    switch (funcion) {
      case 'core_webservice_get_site_info':
        return { sitename: 'Prueba' };
      case 'core_course_get_enrolled_courses_by_timeline_classification':
        return { courses: moodle.cursos };
      case 'core_calendar_get_action_events_by_timesort':
        return { events: moodle.pendientes, lastid: 0 };
      case 'core_course_get_contents':
        return moodle.contenidos[parametros.courseid] ?? [];
      case 'mod_forum_get_forums_by_courses':
        return moodle.foros[parametros['courseids[0]']] ?? [];
      case 'mod_forum_get_forum_discussions':
        return { discussions: moodle.discusiones[parametros.forumid] ?? [] };
      default:
        throw new Error(`Función de Moodle sin simular: ${funcion}`);
    }
  };

  const contexto = vm.createContext({
    __ahora: MARTES_10AM,
    console: { error() {}, log() {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (clave) => propiedades.get(clave) ?? null,
        setProperty: (clave, valor) => propiedades.set(clave, valor),
        deleteProperty: (clave) => propiedades.delete(clave),
      }),
    },
    UrlFetchApp: {
      fetch(url, { payload }) {
        // Un objeto aquí funcionaría en Node y fallaría en Apps Script: los
        // números no llegan a Moodle tal cual. Por eso se exige texto.
        if (typeof payload !== 'string') throw new Error('El cuerpo debe ir como texto');
        const campos = Object.fromEntries(new URLSearchParams(payload));
        if (url.endsWith('/login/token.php')) {
          return responder(
            campos.password === 'pin-correcto'
              ? { token: 'token-nuevo' }
              : { error: 'Usuario o contraseña equivocados', errorcode: 'invalidlogin' }
          );
        }
        const { wsfunction: funcion, ...parametros } = campos;
        llamadas.push(funcion);
        const error = moodle.errores[funcion] ?? moodle.errores[`${funcion}:${parametros.courseid}`];
        if (error) return responder({ exception: 'x', errorcode: error, message: error });
        return responder(respuestaMoodle(funcion, parametros));
      },
    },
    Calendar: {
      Calendars: {
        insert({ summary }) {
          const id = `cal:${summary}`;
          eventosDe(id);
          return { id };
        },
      },
      Events: {
        list: (id) => ({ items: [...eventosDe(id).values()] }),
        insert(recurso, id) {
          if (!ID_VALIDO.test(recurso.id)) throw new Error(`ID de evento inválido: ${recurso.id}`);
          if (recurso.reminders.overrides.length > 5) throw new Error('Más de 5 recordatorios');
          if (eventosDe(id).has(recurso.id)) throw new Error('The requested identifier already exists.');
          eventosDe(id).set(recurso.id, { status: 'confirmed', ...recurso });
        },
        patch(recurso, id, eventoId) {
          const evento = eventosDe(id).get(eventoId);
          const privado = {
            ...evento.extendedProperties?.private,
            ...recurso.extendedProperties?.private,
          };
          Object.assign(evento, recurso, { extendedProperties: { private: privado } });
        },
      },
    },
    ScriptApp: {
      getProjectTriggers: () => [...disparadores],
      deleteTrigger: (disparador) => disparadores.splice(disparadores.indexOf(disparador), 1),
      newTrigger(funcion) {
        const disparador = { getHandlerFunction: () => funcion };
        const constructor = {
          timeBased: () => constructor,
          everyMinutes(minutos) {
            disparador.minutos = minutos;
            return constructor;
          },
          create: () => disparadores.push(disparador),
        };
        return constructor;
      },
    },
  });

  readdirSync(SRC)
    .filter((archivo) => archivo.endsWith('.js'))
    .forEach((archivo) => vm.runInContext(readFileSync(SRC + archivo, 'utf8'), contexto, { filename: archivo }));
  vm.runInContext('Date.now = () => __ahora * 1000', contexto);

  const leer = (nombre) =>
    JSON.parse(JSON.stringify([...eventosDe(`cal:UAM · ${nombre}`).values()]));

  return {
    contexto,
    moodle,
    propiedades,
    llamadas,
    disparadores,
    entregas: () => leer('Entregas'),
    novedades: () => leer('Novedades'),
    evento: (nombre, id) => eventosDe(`cal:UAM · ${nombre}`).get(id),
    irA(segundos) {
      contexto.__ahora = segundos;
    },
  };
}

// Las formas de estos datos salen de respuestas reales de Moodle 4.5.
export const CURSO = { id: 10, fullname: 'MTM0120 - ALGEBRA LINEAL - GRUPO 5', hidden: false };

export const moduloDe = (id, modname, name, vence = null) => ({
  id,
  modname,
  name,
  instance: id + 1000,
  uservisible: true,
  url: `https://uam.test/mod/${modname}/view.php?id=${id}`,
  dates: vence ? [{ label: 'Cierre:', timestamp: vence, dataid: 'duedate' }] : [],
});

/** En estos eventos, `instance` es el ID del módulo: por eso se llama `moduloId`. */
export const pendienteDe = (id, moduloId, vence, extra = {}) => ({
  id,
  name: `Vencimiento de Tarea ${moduloId}`,
  activityname: `Tarea ${moduloId}`,
  eventtype: 'due',
  timesort: vence,
  url: `https://uam.test/mod/assign/view.php?id=${moduloId}`,
  modulename: 'assign',
  instance: moduloId,
  course: CURSO,
  ...extra,
});
