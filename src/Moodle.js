/**
 * Cliente de la API REST de Moodle, la misma que usa la app oficial.
 * Se autentica con un token (ver scripts/obtener-token.mjs), nunca con el PIN.
 */
class ErrorMoodle extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.codigo = codigo;
  }
}

/**
 * Arma el cuerpo como texto. Si se le pasa un objeto, Apps Script no manda los
 * números tal cual, y Moodle rechaza el entero con "invalidparameter".
 */
function formulario_(campos) {
  return Object.entries(campos)
    .map(([nombre, valor]) => `${encodeURIComponent(nombre)}=${encodeURIComponent(valor)}`)
    .join('&');
}

function moodle_(funcion, parametros) {
  const token = PropertiesService.getScriptProperties().getProperty('MOODLE_TOKEN');
  if (!token) throw new ErrorMoodle('invalidtoken', 'Falta MOODLE_TOKEN en las propiedades del script.');

  const respuesta = UrlFetchApp.fetch(`${CONFIG.MOODLE_URL}/webservice/rest/server.php`, {
    method: 'post',
    muteHttpExceptions: true,
    payload: formulario_(
      Object.assign({ wstoken: token, wsfunction: funcion, moodlewsrestformat: 'json' }, parametros)
    ),
  });

  let datos;
  try {
    datos = JSON.parse(respuesta.getContentText());
  } catch (error) {
    throw new ErrorMoodle('respuesta_invalida', `HTTP ${respuesta.getResponseCode()} en ${funcion}`);
  }
  if (datos && datos.exception) throw new ErrorMoodle(datos.errorcode, datos.message);
  return datos;
}

/**
 * Cambia CIF y PIN por un token, una sola vez. Se borran de las propiedades
 * antes de revisar la respuesta, para que el PIN no quede guardado si falla.
 */
function canjearPin_(propiedades) {
  const username = propiedades.getProperty('UAM_CIF');
  const password = propiedades.getProperty('UAM_PIN');
  if (!username || !password) return;

  const respuesta = UrlFetchApp.fetch(`${CONFIG.MOODLE_URL}/login/token.php`, {
    method: 'post',
    muteHttpExceptions: true,
    payload: formulario_({ username, password, service: 'moodle_mobile_app' }),
  });
  propiedades.deleteProperty('UAM_PIN');
  propiedades.deleteProperty('UAM_CIF');

  const datos = JSON.parse(respuesta.getContentText());
  if (!datos.token) throw new Error(`Moodle no dio token: ${datos.error || datos.errorcode}`);
  propiedades.setProperty('MOODLE_TOKEN', datos.token);
}

function leerCursos_() {
  const { courses } = moodle_('core_course_get_enrolled_courses_by_timeline_classification', {
    classification: 'inprogress',
    limit: 0,
    offset: 0,
  });
  return courses
    .filter((curso) => !curso.hidden)
    .map((curso) => ({ id: curso.id, nombre: nombreCurso_(curso) }));
}

/**
 * Entregas pendientes del usuario: es la línea de tiempo del panel de Moodle,
 * así que lo ya enviado deja de aparecer aquí. Moodle da máximo 50 por página.
 */
function leerEntregasPendientes_(ahora) {
  const eventos = [];
  let despuesDe = 0;
  for (let pagina = 0; pagina < 10; pagina++) {
    const { events, lastid } = moodle_('core_calendar_get_action_events_by_timesort', {
      timesortfrom: ahora,
      timesortto: ahora + CONFIG.DIAS_HACIA_ADELANTE * 86400,
      aftereventid: despuesDe,
      limitnum: 50,
      limittononsuspendedevents: 1,
    });
    eventos.push(...events);
    if (events.length < 50) break;
    despuesDe = lastid;
  }
  return eventos.filter((evento) => !CONFIG.ENTREGAS_IGNORADAS.includes(evento.modulename));
}

/** Discusiones recientes del foro de avisos del curso. */
function leerAvisos_(cursoId) {
  const foros = moodle_('mod_forum_get_forums_by_courses', { 'courseids[0]': cursoId });
  const avisos = foros.find((foro) => foro.type === 'news');
  if (!avisos) return [];
  const { discussions } = moodle_('mod_forum_get_forum_discussions', {
    forumid: avisos.id,
    page: 0,
    perpage: 10,
  });
  return discussions;
}
