import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crearEntorno } from './entorno.mjs';

const HORA = 3600;
const DIA = 24 * HORA;

const { contexto } = crearEntorno();

for (const [nombre, restante] of [
  ['2 semanas', 14 * DIA],
  ['3 días', 3 * DIA],
  ['24 horas', DIA],
  ['6 horas', 6 * HORA],
  ['1 hora', HORA],
  ['10 minutos', 600],
]) {
  test(`recordatorios con ${nombre} por delante`, () => {
    const minutos = Array.from(contexto.recordatoriosEntrega_(restante));

    assert.ok(minutos.length > 0, 'debe haber al menos un recordatorio');
    assert.ok(minutos.length <= 5, 'Google acepta máximo 5');
    minutos.forEach((valor) => {
      assert.ok(Number.isInteger(valor) && valor > 0, `${valor} no es un entero positivo`);
      assert.ok(valor * 60 < restante, `${valor} min caería antes de crear el evento`);
    });
  });
}
