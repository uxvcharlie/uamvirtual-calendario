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
