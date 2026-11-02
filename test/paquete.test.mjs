import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import { DESTINO, armarPaquete } from '../scripts/empaquetar.mjs';

test('dist/ está al día con src/', () => {
  assert.equal(readFileSync(DESTINO, 'utf8'), armarPaquete(), 'Corre npm run empaquetar');
});

test('el paquete carga como un solo archivo', () => {
  const contexto = vm.createContext({});
  vm.runInContext(armarPaquete(), contexto);

  assert.equal(typeof contexto.instalar, 'function');
  assert.equal(typeof contexto.sincronizar, 'function');
});
