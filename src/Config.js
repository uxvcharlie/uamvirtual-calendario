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
