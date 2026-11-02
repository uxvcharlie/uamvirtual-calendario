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
