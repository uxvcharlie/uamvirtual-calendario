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
