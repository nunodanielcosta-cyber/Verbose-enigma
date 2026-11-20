import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  shoppingList, convertToProduct, packsFor, parseVoice, findDate, parseGS1, parseReceipt,
  effectiveExpiry, expiryStatus, recipeStatus, suggestMinMax, bestMatch, addDays,
} from '../js/domain.js';

const P = (o) => ({ id: o.name, unit: 'un', qty: 0, min: 0, max: 0, ...o });

test('produto no mínimo vai para a lista com a quantidade até ao máximo', () => {
  const list = shoppingList({ products: [P({ name: 'Leite', qty: 2, min: 2, max: 6 }), P({ name: 'Arroz', qty: 3, min: 1, max: 3 })] });
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Leite');
  assert.equal(list[0].qty, 4);
  assert.deepEqual(list[0].reasons, ['mínimo']);
});

test('produto sem mínimo/máximo não entra na lista mesmo esgotado', () => {
  assert.equal(shoppingList({ products: [P({ name: 'Canela', qty: 0 })] }).length, 0);
});

test('receitas planeadas: compra o que falta e repõe até ao máximo', () => {
  const products = [P({ name: 'Massa', unit: 'pacote', package_size: 500, package_unit: 'g', qty: 1, min: 1, max: 3 }), P({ name: 'Natas', unit: 'un', qty: 0 })];
  const recipes = [{ id: 'r', name: 'Carbonara', servings: 2, ingredients: [
    { product_id: 'Massa', qty: 500, unit: 'g' }, { product_id: 'Natas', qty: 1, unit: 'un' }, { name: 'Bacon', qty: 200, unit: 'g' }] }];
  const plan = [{ day: addDays(new Date().toISOString().slice(0, 10), 1), recipe_id: 'r', servings: 4, cooked: false }];
  const list = shoppingList({ products, recipes, plan });
  const by = Object.fromEntries(list.map((x) => [x.name, x]));
  assert.equal(by.Massa.qty, 4); // 1 em casa − 2 pacotes (4 pessoas) = −1 → repor até 3
  assert.deepEqual(by.Massa.reasons, ['mínimo', 'receitas']);
  assert.equal(by.Natas.qty, 2);
  assert.equal(by.Bacon.qty, 400);
});

test('conversões de unidades', () => {
  assert.equal(convertToProduct(200, 'g', { unit: 'kg' }), 0.2);
  assert.equal(convertToProduct(250, 'ml', { unit: 'pacote', package_size: 1, package_unit: 'L' }), 0.25);
  assert.equal(convertToProduct(2, 'un', { unit: 'un' }), 2);
  assert.equal(packsFor({ qty: 18, product: { unit: 'rolo', package_size: 12, package_unit: 'un' } }), 2);
  assert.equal(packsFor({ qty: 1.5, product: { unit: 'kg', package_size: 500, package_unit: 'g' } }), 3);
});

test('validade depois de aberto', () => {
  const today = new Date().toISOString().slice(0, 10);
  const p = { qty: 1, expiry: addDays(today, 100), opened_at: addDays(today, -2), open_days: 3 };
  assert.equal(effectiveExpiry(p), addDays(today, 1));
  assert.equal(expiryStatus(p, 5).level, 'soon');
});

test('voz', () => {
  assert.deepEqual(parseVoice('Gastei dois pacotes de arroz e um leite'), [
    { type: 'consume', qty: 2, text: 'arroz' }, { type: 'consume', qty: 1, text: 'leite' }]);
  assert.deepEqual(parseVoice('comprei 3 iogurtes'), [{ type: 'add', qty: 3, text: 'iogurtes' }]);
  assert.equal(parseVoice('falta lixívia')[0].type, 'shop');
});

test('datas lidas por OCR', () => {
  assert.equal(findDate('CONSUMIR DE PREFERENCIA ANTES DE: 12/08/2027 L23', '2026-11-20'), '2027-08-12');
  assert.equal(findDate('Val. 05.03.27', '2026-11-20'), '2027-03-05');
  assert.equal(findDate('EXP 14 FEV 2027', '2026-11-20'), '2027-02-14');
  assert.equal(findDate('Consumir até fim de: 08/2027', '2026-11-20'), '2027-08-31');
  assert.equal(findDate('sem data aqui', '2026-11-20'), null);
});

test('códigos GS1 com validade', () => {
  assert.deepEqual(parseGS1('(01)05601312000017(17)270812(10)L123'), { gtin: '5601312000017', expiry: '2027-08-12' });
  assert.deepEqual(parseGS1('0105601312000017172708001'), { gtin: '5601312000017', expiry: '2027-08-31' });
  assert.equal(parseGS1('5601312000017'), null);
});

test('talão', () => {
  const lines = parseReceipt(`CONTINENTE\nLEITE MIMOSA M/G 1L      0,95\n2 x IOG NAT DANONE      1,58\nSUBTOTAL 2,53\nTOTAL   2,53\nMULTIBANCO 2,53`);
  assert.deepEqual(lines, [{ name: 'LEITE MIMOSA M/G 1L', qty: 1, price: 0.95 }, { name: 'IOG NAT DANONE', qty: 2, price: 1.58 }]);
  const m = bestMatch('LEITE MIMOSA M/G 1L', [{ name: 'Leite meio-gordo', brand: 'Mimosa' }, { name: 'Leite de coco' }], 0.4);
  assert.equal(m.product.name, 'Leite meio-gordo');
});

test('estado da receita e sugestão de mín./máx.', () => {
  const products = [P({ name: 'Ovos', qty: 2 })];
  const st = recipeStatus({ servings: 2, ingredients: [{ product_id: 'Ovos', qty: 4, unit: 'un' }] }, products);
  assert.equal(st.missing, 1);
  const now = Date.now();
  const events = [...Array(12)].map((_, i) => ({ product_id: 'Leite', type: 'consume', delta: -1, at: new Date(now - i * 2.5 * 86400e3).toISOString() }));
  const s = suggestMinMax(events, 'Leite', now);
  assert.ok(s.perWeek > 2 && s.perWeek < 4);
  assert.ok(s.max > s.min);
});
