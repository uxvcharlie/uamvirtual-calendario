/**
 * UAM Virtual → Google Calendar
 * https://github.com/uxvcharlie/uamvirtual-calendario
 *
 * Archivo generado con npm run empaquetar. Licencia MIT.
 * Instalación: sigue los pasos del README del repositorio.
 */

// ---- Calendario.js ----

/**
 * Todo lo que toca Google Calendar. Los ID de evento son fijos (salen del ID de
 * Moodle), así que repetir una corrida nunca duplica eventos. Google solo acepta
 * letras a-v y dígitos en esos ID: por eso se usa la "o" como separador.
 */
function idsCalendarios_() {
  const propiedades = PropertiesService.getScriptProperties();
  return {
    entregas: propiedades.getProperty('CALENDARIO_ENTREGAS'),
    novedades: propiedades.getProperty('CALENDARIO_NOVEDADES'),
  };
}

function crearCalendario_(nombre) {
  return Calendar.Calendars.insert({ summary: nombre, timeZone: CONFIG.ZONA }).id;
}

/** Trae también los borrados, para no recrear lo que quitaste a mano. */
function leerEventos_(calendarioId) {
  const eventos = [];
  let pageToken = null;
  do {
    const opciones = { showDeleted: true, singleEvents: true, maxResults: 2500 };
    if (pageToken) opciones.pageToken = pageToken;
    const pagina = Calendar.Events.list(calendarioId, opciones);
    eventos.push(...(pagina.items || []));
    pageToken = pagina.nextPageToken;
  } while (pageToken);
  return eventos;
}

function estadoEvento_(evento) {
  const privado = (evento.extendedProperties && evento.extendedProperties.private) || {};
  return {
    id: evento.id,
    summary: evento.summary,
    cancelado: evento.status === 'cancelled',
    vence: privado.vence ? Number(privado.vence) : null,
    completada: privado.completada === '1',
  };
}

function insertarSiFalta_(calendarioId, recurso) {
  try {
    Calendar.Events.insert(recurso, calendarioId);
  } catch (error) {
    if (!/already exists/i.test(error.message)) throw error;
  }
}

function momento_(segundos) {
  return { dateTime: new Date(segundos * 1000).toISOString(), timeZone: CONFIG.ZONA };
}

function colorCurso_(cursoId) {
  return String(1 + (cursoId % 11));
}

function recursoEntrega_(entrega, ahora) {
  const minutos = recordatoriosEntrega_(entrega.vence - ahora).slice(0, 5);
  return {
    id: entrega.id,
    summary: `${entrega.curso}: ${entrega.titulo}`,
    description: `<a href="${entrega.url}">Abrir en UAM Virtual</a>`,
    start: momento_(entrega.vence),
    // Un minuto basta: a las 23:59 no se parte el evento en dos días.
    end: momento_(entrega.vence + 60),
    colorId: colorCurso_(entrega.cursoId),
    transparency: 'transparent',
    reminders: {
      useDefault: false,
      overrides: minutos.map((valor) => ({ method: 'popup', minutes: valor })),
    },
    source: { title: 'UAM Virtual', url: entrega.url },
    extendedProperties: { private: { vence: String(entrega.vence), completada: '0' } },
  };
}

/** Evento corto que suena apenas llega al celular: es el "acaban de subir esto". */
function eventoAviso_(id, titulo, lineas, colorId, ahora) {
  const inicio = ahora + CONFIG.MINUTOS_HASTA_AVISO * 60;
  return {
    id,
    summary: titulo,
    description: lineas.join('<br>'),
    start: momento_(inicio),
    end: momento_(inicio + 300),
    colorId,
    transparency: 'transparent',
    reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 0 }] },
  };
}

function lineaNovedad_(item) {
  const fecha = item.vence ? ` — vence ${fechaCorta_(item.vence)}` : '';
  const resumen = item.resumen ? `<br>${escaparHtml_(item.resumen)}` : '';
  return `${item.icono} ${item.tipo}: <a href="${item.url}">${escaparHtml_(item.titulo)}</a>${fecha}${resumen}`;
}

/** Un solo aviso por curso en cada corrida, para que subir 10 archivos no sean 10 notificaciones. */
function recursoNovedad_(curso, nuevas, ahora) {
  const fechas = nuevas.map((item) => item.vence).filter(Boolean);
  const vence = fechas.length ? ` — vence ${fechaCorta_(Math.min(...fechas))}` : '';
  const primera = nuevas[0];
  const titulo =
    nuevas.length === 1
      ? `${primera.icono} ${curso.nombre}: ${primera.titulo}${vence}`
      : `🆕 ${curso.nombre}: ${nuevas.length} novedades${vence}`;
  return eventoAviso_(
    `uamn${curso.id}o${primera.clave}`,
    titulo,
    nuevas.map(lineaNovedad_),
    colorCurso_(curso.id),
    ahora
  );
}

function recursoCambioFecha_(entrega, anterior, ahora) {
  return eventoAviso_(
    `uamc${entrega.eventoId}o${entrega.vence}`,
    `⏰ ${entrega.curso}: ${entrega.titulo} cambió a ${fechaCorta_(entrega.vence)}`,
    [
      `Antes: ${fechaCorta_(anterior)}`,
      `Ahora: ${fechaCorta_(entrega.vence)}`,
      `<a href="${entrega.url}">Abrir en UAM Virtual</a>`,
    ],
    colorCurso_(entrega.cursoId),
    ahora
  );
}

/** El ID lleva el día: si el token sigue vencido, avisa una sola vez por día. */
function recursoTokenVencido_(ahora) {
  return eventoAviso_(
    `uamt${Math.floor(ahora / 86400)}`,
    '⚠️ UAM Virtual: renueva el token',
    [
      'El calendario dejó de actualizarse porque venció el token de Moodle.',
      'Agrega UAM_CIF y UAM_PIN en las Propiedades del script y vuelve a ejecutar instalar.',
    ],
    '11',
    ahora
  );
}

// ---- Config.js ----

/**
 * Ajustes del proyecto. Lo secreto no va aquí: el token de Moodle vive en las
 * Propiedades del script (MOODLE_TOKEN) para que nunca llegue a Git.
 */
const CONFIG = {
  MOODLE_URL: 'https://uamvirtual.uam.edu.ni/grado',
  ZONA: 'America/Managua',

  // Minutos antes de la entrega: 1 día y 3 horas. Google acepta máximo 5.
  RECORDATORIOS_MINUTOS: [1440, 180],

  CALENDARIO_ENTREGAS: 'UAM · Entregas',
  CALENDARIO_NOVEDADES: 'UAM · Novedades',

  // Apps Script solo acepta 1, 5, 10, 15 o 30 minutos.
  MINUTOS_ENTRE_REVISIONES: 30,

  // Fuera de este horario no revisa: lo publicado de noche se avisa en la mañana.
  HORA_INICIO: 6,
  HORA_FIN: 23,

  // Hasta qué tan lejos busca entregas pendientes.
  DIAS_HACIA_ADELANTE: 150,

  // Un evento avisa cuando empieza, y necesita tiempo para llegar al celular
  // antes de esa hora. Por eso la novedad se agenda unos minutos después.
  MINUTOS_HASTA_AVISO: 5,

  // No generan novedades: las etiquetas son títulos decorativos del curso, y
  // algunos docentes crean una asistencia por sesión.
  MODULOS_IGNORADOS: ['label', 'attendance'],

  // No son entregas: cada curso trae una encuesta de revisión de calificación
  // que cierra el mismo día.
  ENTREGAS_IGNORADAS: ['feedback'],

  // Nombres cortos por código de materia, para que quepan en la notificación.
  // Si un código no está aquí se usa el nombre de Moodle, sin código ni grupo.
  NOMBRES_CURSOS: {
    CEP0004: 'Inglés',
    CNU0525: 'Prog. Escritorio',
    EDA0125: 'Educación Ambiental',
    MTM0120: 'Álgebra Lineal',
    SIS0211: 'AGBD',
    SIS0415: 'Redes II',
  },
};

// ---- Moodle.js ----

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

// ---- Normalizar.js ----

/**
 * Funciones puras: convierten las respuestas de Moodle en datos propios y
 * deciden qué hay que hacer. No llaman a ningún servicio, por eso se prueban solas.
 */
const DIAS_ = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES_ = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// Nicaragua no usa horario de verano, así que el desfase es fijo.
const DESFASE_MANAGUA_ = -6 * 3600;

const TIPOS_ = {
  assign: ['📝', 'Tarea'],
  quiz: ['❓', 'Cuestionario'],
  forum: ['💬', 'Foro'],
  resource: ['📎', 'Archivo'],
  folder: ['📁', 'Carpeta'],
  url: ['🔗', 'Enlace'],
  page: ['📄', 'Página'],
  book: ['📚', 'Libro'],
};
const TIPO_OTRO_ = ['🆕', 'Actividad'];

function fechaManagua_(segundos) {
  return new Date((segundos + DESFASE_MANAGUA_) * 1000);
}

function horaManagua_(segundos) {
  return fechaManagua_(segundos).getUTCHours();
}

function fechaCorta_(segundos) {
  const fecha = fechaManagua_(segundos);
  const hora = [fecha.getUTCHours(), fecha.getUTCMinutes()]
    .map((numero) => String(numero).padStart(2, '0'))
    .join(':');
  return `${DIAS_[fecha.getUTCDay()]} ${fecha.getUTCDate()} ${MESES_[fecha.getUTCMonth()]}, ${hora}`;
}

/** Moodle manda los nombres con entidades HTML, por ejemplo "Redes &amp; Datos". */
function decodificarHtml_(texto) {
  return String(texto)
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&');
}

function textoPlano_(html) {
  return decodificarHtml_(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function escaparHtml_(texto) {
  return String(texto).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** "SIS0415 - TECNOLOGIA DE REDES II - GRUPO 2" pasa a "Redes II". */
function nombreCurso_(curso) {
  const nombre = String(curso.fullname).trim();
  const partes = nombre.match(/^([A-Z]+\d+)\s*-\s*(.+?)(?:\s*-\s*GRUPO\s*\d+)?$/);
  if (!partes) return nombre;
  return CONFIG.NOMBRES_CURSOS[partes[1]] || partes[2];
}

function entregaDesdeEvento_(evento) {
  const abre = evento.eventtype === 'open' ? ' (abre)' : '';
  return {
    id: `uame${evento.id}`,
    eventoId: evento.id,
    cursoId: evento.course.id,
    curso: nombreCurso_(evento.course),
    titulo: decodificarHtml_(evento.activityname) + abre,
    vence: evento.timesort,
    url: evento.url,
    // En estos eventos, `instance` es el ID del módulo dentro del curso, no el
    // de la actividad. Por eso se compara con `modulo.id` y no con `modulo.instance`.
    ref: evento.instance,
  };
}

/** En Moodle 4.5 cada módulo trae sus fechas: entrega en tareas, cierre en cuestionarios. */
function venceDeModulo_(modulo) {
  const fecha = (modulo.dates || []).find(({ dataid }) => ['duedate', 'timeclose'].includes(dataid));
  return fecha ? fecha.timestamp : null;
}

function itemsDeModulos_(secciones) {
  return secciones
    .flatMap((seccion) => seccion.modules || [])
    .filter((modulo) => modulo.uservisible !== false)
    .filter((modulo) => !CONFIG.MODULOS_IGNORADOS.includes(modulo.modname))
    .map((modulo) => {
      const [icono, tipo] = TIPOS_[modulo.modname] || TIPO_OTRO_;
      return {
        clave: `m${modulo.id}`,
        ref: modulo.id,
        icono,
        tipo,
        titulo: decodificarHtml_(modulo.name),
        url: modulo.url,
        vence: venceDeModulo_(modulo),
      };
    });
}

function itemsDeAvisos_(discusiones) {
  return discusiones.map((discusion) => ({
    clave: `d${discusion.discussion}`,
    ref: null,
    icono: '📢',
    tipo: 'Aviso',
    titulo: decodificarHtml_(discusion.name),
    url: `${CONFIG.MOODLE_URL}/mod/forum/discuss.php?d=${discusion.discussion}`,
    resumen: textoPlano_(discusion.message).slice(0, 300),
  }));
}

/**
 * Lo que hay que anunciar de un curso: lo que no estaba en `vistos`, con su
 * fecha si tiene, más las entregas nuevas de actividades ya conocidas (el
 * profesor publicó la tarea sin fecha y se la puso después).
 */
function novedadesDeCurso_(items, vistos, creadas) {
  const nuevas = items.filter((item) => !vistos.has(item.clave));

  const yaAnunciadas = new Set(nuevas.map((item) => item.ref));
  const fechasNuevas = creadas
    .filter((entrega) => !yaAnunciadas.has(entrega.ref))
    .map((entrega) => ({
      clave: `f${entrega.eventoId}`,
      ref: entrega.ref,
      icono: '📅',
      tipo: 'Nueva fecha',
      titulo: entrega.titulo,
      url: entrega.url,
      vence: entrega.vence,
    }));

  return nuevas.concat(fechasNuevas);
}

/**
 * Compara lo pendiente en Moodle con lo que ya está en el calendario.
 * Se compara contra `vence` y no contra la hora del evento para respetar los
 * eventos que muevas a mano: solo se tocan si cambia la fecha en Moodle.
 */
function planEntregas_(pendientes, existentes, ahora) {
  const porId = new Map(existentes.map((evento) => [evento.id, evento]));
  const plan = { crear: [], reprogramar: [], reabrir: [], completar: [] };

  pendientes.forEach((entrega) => {
    const evento = porId.get(entrega.id);
    if (!evento) plan.crear.push(entrega);
    else if (evento.cancelado) return; // Lo borraste a mano: no vuelve.
    else if (evento.completada) plan.reabrir.push(entrega);
    else if (evento.vence !== entrega.vence) plan.reprogramar.push({ entrega, anterior: evento.vence });
  });

  // Si una entrega futura ya no está pendiente en Moodle, es que se envió.
  const vigentes = new Set(pendientes.map((entrega) => entrega.id));
  plan.completar = existentes.filter(
    (evento) =>
      !evento.cancelado && !evento.completada && evento.vence > ahora && !vigentes.has(evento.id)
  );

  return plan;
}

// ---- Recordatorios.js ----

/**
 * Decide cuántos minutos antes de la entrega suena cada recordatorio.
 *
 * Usa los de CONFIG.RECORDATORIOS_MINUTOS que todavía alcanzan a sonar. Si la
 * tarea se publicó con tan poco tiempo que ninguno alcanza, avisa a la mitad
 * del tiempo que queda: un recordatorio en el pasado nunca suena.
 */
function recordatoriosEntrega_(segundosRestantes) {
  const minutosRestantes = Math.floor(segundosRestantes / 60);
  const alcanzan = CONFIG.RECORDATORIOS_MINUTOS.filter((minutos) => minutos < minutosRestantes);
  if (alcanzan.length) return alcanzan;
  return [Math.max(1, Math.floor(minutosRestantes / 2))];
}

// ---- Sincronizar.js ----

/**
 * Puntos de entrada del proyecto:
 *   instalar()    se corre una vez a mano desde el editor de Apps Script.
 *   sincronizar() lo corre el disparador cada 30 minutos.
 * Las funciones con guion bajo al final son privadas para Apps Script.
 */
function instalar() {
  const propiedades = PropertiesService.getScriptProperties();
  canjearPin_(propiedades);
  if (!propiedades.getProperty('MOODLE_TOKEN')) {
    throw new Error('Primero agrega UAM_CIF y UAM_PIN en Configuración del proyecto > Propiedades del script.');
  }
  moodle_('core_webservice_get_site_info', {}); // Falla aquí si Moodle no responde a Google.

  [
    ['CALENDARIO_ENTREGAS', CONFIG.CALENDARIO_ENTREGAS],
    ['CALENDARIO_NOVEDADES', CONFIG.CALENDARIO_NOVEDADES],
  ].forEach(([clave, nombre]) => {
    if (!propiedades.getProperty(clave)) propiedades.setProperty(clave, crearCalendario_(nombre));
  });

  ScriptApp.getProjectTriggers()
    .filter((disparador) => disparador.getHandlerFunction() === 'sincronizar')
    .forEach((disparador) => ScriptApp.deleteTrigger(disparador));
  ScriptApp.newTrigger('sincronizar').timeBased().everyMinutes(CONFIG.MINUTOS_ENTRE_REVISIONES).create();

  sincronizarTodo_(ahoraSegundos_());
}

function sincronizar() {
  const ahora = ahoraSegundos_();
  const hora = horaManagua_(ahora);
  if (hora < CONFIG.HORA_INICIO || hora >= CONFIG.HORA_FIN) return;

  try {
    sincronizarTodo_(ahora);
  } catch (error) {
    if (error.codigo !== 'invalidtoken') throw error;
    insertarSiFalta_(idsCalendarios_().novedades, recursoTokenVencido_(ahora));
  }
}

function ahoraSegundos_() {
  return Math.floor(Date.now() / 1000);
}

function sincronizarTodo_(ahora) {
  const calendarios = idsCalendarios_();
  const cursos = leerCursos_();
  const pendientes = leerEntregasPendientes_(ahora).map(entregaDesdeEvento_);
  const existentes = leerEventos_(calendarios.entregas).map(estadoEvento_);

  const plan = planEntregas_(pendientes, existentes, ahora);
  aplicarPlan_(plan, calendarios, ahora);

  // Un curso con problemas no debe dejar a los demás sin revisar.
  cursos.forEach((curso) => {
    try {
      revisarCurso_(curso, plan.crear, calendarios, ahora);
    } catch (error) {
      if (error.codigo === 'invalidtoken') throw error;
      console.error(`No se pudo revisar el curso ${curso.id}: ${error.message}`);
    }
  });
}

function aplicarPlan_(plan, calendarios, ahora) {
  const id = calendarios.entregas;

  plan.crear.forEach((entrega) => insertarSiFalta_(id, recursoEntrega_(entrega, ahora)));

  plan.reabrir.forEach((entrega) => {
    Calendar.Events.patch(recursoEntrega_(entrega, ahora), id, entrega.id);
  });

  plan.reprogramar.forEach(({ entrega, anterior }) => {
    Calendar.Events.patch(recursoEntrega_(entrega, ahora), id, entrega.id);
    insertarSiFalta_(calendarios.novedades, recursoCambioFecha_(entrega, anterior, ahora));
  });

  plan.completar.forEach((evento) => {
    Calendar.Events.patch(
      {
        summary: `✓ ${evento.summary}`,
        reminders: { useDefault: false, overrides: [] },
        extendedProperties: { private: { completada: '1' } },
      },
      id,
      evento.id
    );
  });
}

function revisarCurso_(curso, creadas, calendarios, ahora) {
  const items = itemsDeModulos_(moodle_('core_course_get_contents', { courseid: curso.id })).concat(
    itemsDeAvisos_(leerAvisos_(curso.id))
  );
  const vistos = leerVistos_(curso.id);

  // La primera vez que se ve un curso solo se toma nota: si no, todo lo que ya
  // estaba publicado llegaría de golpe como si fuera nuevo.
  if (vistos) {
    const delCurso = creadas.filter((entrega) => entrega.cursoId === curso.id);
    const nuevas = novedadesDeCurso_(items, vistos, delCurso);
    if (nuevas.length) insertarSiFalta_(calendarios.novedades, recursoNovedad_(curso, nuevas, ahora));
  }

  // Se guarda después de avisar: si el aviso falla, se reintenta en la próxima corrida.
  guardarVistos_(curso.id, items, vistos);
}

function leerVistos_(cursoId) {
  const guardado = PropertiesService.getScriptProperties().getProperty(`VISTOS_${cursoId}`);
  return guardado === null ? null : new Set(guardado.split(',').filter(Boolean));
}

function guardarVistos_(cursoId, items, vistos) {
  const claves = new Set(vistos || []);
  items.forEach((item) => claves.add(item.clave));
  PropertiesService.getScriptProperties().setProperty(`VISTOS_${cursoId}`, [...claves].join(','));
}
