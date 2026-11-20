import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSize, parseUnitPrice, pickSame, pickCheapest, genericName, withUnitPrice } from '../supabase/functions/precos/lib.js';
import { parseSfccGrid, mapMercadona } from '../supabase/functions/precos/stores.js';

test('tamanhos e preço por unidade', () => {
  assert.deepEqual(parseSize('Leite Meio-Gordo 6x1L'), { amount: 6, unit: 'L' });
  assert.deepEqual(parseSize('Arroz Agulha emb. 1 kg'), { amount: 1, unit: 'kg' });
  assert.deepEqual(parseSize('Esparguete 500 gr'), { amount: 0.5, unit: 'kg' });
  assert.deepEqual(parseSize('Papel Higiénico 12 rolos'), { amount: 12, unit: 'un' });
  assert.deepEqual(parseUnitPrice('1,09 €/lt'), { value: 1.09, unit: 'L' });
  assert.equal(withUnitPrice({ name: 'Azeite 750 ml', price: 7.5 }).unit_price, 10);
});

const results = [
  { name: 'Leite UHT Meio-Gordo Mimosa 1L', brand: 'Mimosa', price: 0.95 },
  { name: 'Leite UHT Meio-Gordo Continente 1L', brand: 'Continente', price: 0.79 },
  { name: 'Leite UHT Magro Mimosa 1L', brand: 'Mimosa', price: 0.93 },
  { name: 'Leite Meio-Gordo Mimosa 6x1L', brand: 'Mimosa', price: 5.49 },
  { name: 'Bebida de Aveia 1L', brand: 'Alpro', price: 1.99 },
];
const item = { name: 'Leite meio-gordo', brand: 'Mimosa', size: '1L' };

test('mesmo produto: marca e tamanho certos', () => {
  const same = pickSame(item, results);
  assert.equal(same.name, 'Leite UHT Meio-Gordo Mimosa 1L');
});

test('mais barato da categoria compara por litro', () => {
  assert.equal(genericName(item), 'leite meio gordo');
  const cheap = pickCheapest(item, results);
  assert.equal(cheap.name, 'Leite UHT Meio-Gordo Continente 1L');
  assert.equal(cheap.unit_price, 0.79);
});

test('produto de outra marca não conta como o mesmo', () => {
  assert.equal(pickSame({ name: 'Detergente roupa', brand: 'Skip' }, [{ name: 'Detergente Roupa Persil 40 doses', brand: 'Persil', price: 9 }]), null);
});

test('grelha SFCC (formato de exemplo)', async (t) => {
  let parseHTML;
  try { ({ parseHTML } = await import('linkedom')); } catch { return t.skip('linkedom não instalado (npm install)'); }
  const html = `<div class="product-grid">
    <div class="product" data-pid="2210946"><div class="product-tile" data-pid="2210946" data-product-tile-impression='{"name":"Leite UHT Meio Gordo","id":"2210946","price":0.95,"brand":"Mimosa"}'>
      <a href="/produto/leite-uht-meio-gordo-mimosa-2210946.html"><img data-src="https://img/x.jpg"></a>
      <div class="pwc-tile--quantity">emb. 1 lt</div>
      <div class="pwc-tile--price-secondary">0,95 €/lt</div></div></div>
    <div class="product" data-pid="7"><div class="pdp-link"><a href="/p/7.html">Lixívia Tradicional 2L</a></div>
      <span class="sales"><span class="value" content="1.29">1,29 €</span></span></div></div>`;
  const out = parseSfccGrid(parseHTML(html).document, 'https://www.continente.pt');
  assert.equal(out.length, 2);
  assert.deepEqual({ ...out[0], size: undefined }, { name: 'Leite UHT Meio Gordo', brand: 'Mimosa', price: 0.95, unit_price: 0.95, unit_label: '€/L', size: undefined, url: 'https://www.continente.pt/produto/leite-uht-meio-gordo-mimosa-2210946.html', image: 'https://img/x.jpg' });
  assert.equal(out[1].price, 1.29);
  assert.deepEqual(out[1].size, { amount: 2, unit: 'L' });
});

test('produto Mercadona', () => {
  const p = mapMercadona({ display_name: 'Leite meio-gordo Hacendado', packaging: 'Pacote', brand: 'Hacendado', share_url: 'https://x', price_instructions: { unit_price: '0.89', reference_price: '0.890', reference_format: 'L', unit_size: 1, size_format: 'l' } });
  assert.equal(p.price, 0.89);
  assert.equal(p.unit_label, '€/L');
  assert.equal(p.name, 'Leite meio-gordo Hacendado Pacote 1 l');
});
