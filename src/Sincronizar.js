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
