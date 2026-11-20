// Dados de exemplo para o modo demonstração (sem Supabase).
import { addDays, todayISO } from './domain.js';

export function demoData() {
  const t = todayISO();
  const now = Date.now();
  const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();
  const H = 'demo';
  const P = (id, o) => ({ id, household_id: H, qty: 0, min: 0, max: 0, unit: 'un', grp: 'alimentar', updated_at: iso(1), ...o });

  const products = [
    P('arroz', { name: 'Arroz agulha', brand: 'Cigala', category: 'Mercearia', location: 'Despensa', unit: 'pacote', package_size: 1, package_unit: 'kg', qty: 1, min: 1, max: 3, expiry: addDays(t, 240), compare_as: 'arroz agulha 1kg' }),
    P('massa', { name: 'Esparguete', brand: 'Milaneza', category: 'Mercearia', location: 'Despensa', unit: 'pacote', package_size: 500, package_unit: 'g', qty: 3, min: 1, max: 4, expiry: addDays(t, 400) }),
    P('leite', { name: 'Leite meio-gordo', brand: 'Mimosa', category: 'Laticínios', location: 'Despensa', unit: 'L', package_size: 1, package_unit: 'L', qty: 2, min: 3, max: 8, expiry: addDays(t, 60), compare_as: 'leite meio gordo' }),
    P('iogurte', { name: 'Iogurte natural', brand: 'Danone', category: 'Laticínios', location: 'Frigorífico', qty: 4, min: 2, max: 8, expiry: addDays(t, 2) }),
    P('ovos', { name: 'Ovos M', category: 'Frescos', location: 'Frigorífico', qty: 6, min: 6, max: 12, expiry: addDays(t, 12) }),
    P('tomate', { name: 'Polpa de tomate', brand: 'Guloso', category: 'Conservas', location: 'Despensa', unit: 'lata', qty: 1, min: 1, max: 3, expiry: addDays(t, 300), opened_at: addDays(t, -3), open_days: 4 }),
    P('atum', { name: 'Atum em óleo', brand: 'Bom Petisco', category: 'Conservas', location: 'Despensa', unit: 'lata', qty: 5, min: 2, max: 6, expiry: addDays(t, 700) }),
    P('frango', { name: 'Peito de frango', category: 'Talho', location: 'Congelador', unit: 'kg', qty: 0.8, min: 0, max: 0, expiry: addDays(t, -1) }),
    P('cebola', { name: 'Cebola', category: 'Frutas e legumes', location: 'Despensa', unit: 'kg', qty: 1.5, min: 0.5, max: 2, expiry: addDays(t, 20) }),
    P('azeite', { name: 'Azeite virgem extra', brand: 'Gallo', category: 'Mercearia', location: 'Despensa', unit: 'garrafa', package_size: 750, package_unit: 'ml', qty: 1, min: 1, max: 2, expiry: addDays(t, 500) }),
    P('cafe', { name: 'Café cápsulas', brand: 'Delta Q', grp: 'bebidas', category: 'Café e chá', location: 'Cozinha', unit: 'caixa', qty: 2, min: 1, max: 4, expiry: addDays(t, 200) }),
    P('agua', { name: 'Água 6x1,5L', brand: 'Luso', grp: 'bebidas', category: 'Águas', location: 'Garagem', unit: 'pacote', qty: 1, min: 1, max: 3 }),
    P('detergente', { name: 'Detergente roupa', brand: 'Skip', grp: 'limpeza', category: 'Roupa', location: 'Lavandaria', unit: 'garrafa', qty: 1, min: 1, max: 2 }),
    P('loica', { name: 'Detergente loiça', brand: 'Fairy', grp: 'limpeza', category: 'Cozinha', location: 'Cozinha', unit: 'frasco', qty: 2, min: 1, max: 3 }),
    P('lixivia', { name: 'Lixívia', brand: 'Neoblanc', grp: 'limpeza', category: 'Casa', location: 'Lavandaria', unit: 'garrafa', qty: 0, min: 1, max: 2 }),
    P('papel', { name: 'Papel higiénico', brand: 'Renova', grp: 'higiene', category: 'Papel', location: 'Arrecadação', unit: 'rolo', package_size: 12, package_unit: 'un', qty: 6, min: 8, max: 24 }),
    P('pasta', { name: 'Pasta de dentes', brand: 'Colgate', grp: 'higiene', category: 'Higiene oral', location: 'Casa de banho', qty: 1, min: 1, max: 3 }),
    P('racao', { name: 'Ração gato', brand: 'Purina', grp: 'animais', category: 'Gato', location: 'Despensa', unit: 'kg', qty: 2, min: 1, max: 4 }),
  ];

  const R = (id, name, servings, tags, ingredients, instructions) => ({ id, household_id: H, name, servings, tags, ingredients, instructions, updated_at: iso(5) });
  const recipes = [
    R('r1', 'Esparguete à bolonhesa', 4, ['massa', 'rápido'], [
      { product_id: 'massa', name: 'Esparguete', qty: 500, unit: 'g' },
      { product_id: 'tomate', name: 'Polpa de tomate', qty: 1, unit: 'lata' },
      { product_id: 'cebola', name: 'Cebola', qty: 150, unit: 'g' },
      { product_id: null, name: 'Carne picada', qty: 500, unit: 'g' },
    ], 'Refogar a cebola em azeite, juntar a carne e a polpa. Cozer a massa e servir.'),
    R('r2', 'Arroz de atum', 4, ['peixe', 'económico'], [
      { product_id: 'arroz', name: 'Arroz agulha', qty: 300, unit: 'g' },
      { product_id: 'atum', name: 'Atum em óleo', qty: 2, unit: 'lata' },
      { product_id: 'cebola', name: 'Cebola', qty: 100, unit: 'g' },
      { product_id: 'tomate', name: 'Polpa de tomate', qty: 0.5, unit: 'lata' },
    ], 'Refogar a cebola, juntar o tomate e o arroz, cobrir com água. No fim, envolver o atum.'),
    R('r3', 'Omelete com iogurte e ervas', 2, ['vegetariano', 'rápido'], [
      { product_id: 'ovos', name: 'Ovos', qty: 4, unit: 'un' },
      { product_id: 'iogurte', name: 'Iogurte natural', qty: 1, unit: 'un' },
    ], 'Bater os ovos com o iogurte, temperar e cozinhar em lume brando.'),
    R('r4', 'Frango no forno', 4, ['carne'], [
      { product_id: 'frango', name: 'Peito de frango', qty: 0.8, unit: 'kg' },
      { product_id: 'cebola', name: 'Cebola', qty: 200, unit: 'g' },
      { product_id: 'azeite', name: 'Azeite', qty: 50, unit: 'ml' },
    ], 'Temperar o frango, regar com azeite e levar ao forno a 200 ºC durante 40 minutos.'),
  ];

  const meal_plan = [
    { id: 'm1', household_id: H, day: addDays(t, 1), meal: 'jantar', recipe_id: 'r1', servings: 4, cooked: false },
    { id: 'm2', household_id: H, day: addDays(t, 3), meal: 'almoco', recipe_id: 'r2', servings: 4, cooked: false },
  ];

  const prices = [];
  const pr = (product_id, store, price, unit_price, unit_label, days, name, kind = 'same') =>
    prices.push({ id: `pr-${prices.length}`, household_id: H, product_id, store, kind, price, unit_price, unit_label, name, fetched_at: iso(days) });
  pr('leite', 'continente', 0.95, 0.95, '€/L', 2, 'Leite Mimosa Meio-Gordo 1L');
  pr('leite', 'pingodoce', 0.92, 0.92, '€/L', 2, 'Leite Mimosa Meio-Gordo 1L');
  pr('leite', 'auchan', 0.97, 0.97, '€/L', 2, 'Leite Mimosa Meio-Gordo 1L');
  pr('leite', 'mercadona', 0.89, 0.89, '€/L', 2, 'Leite Hacendado Meio-Gordo 1L', 'cheapest');
  pr('leite', 'continente', 0.79, 0.79, '€/L', 2, 'Leite Continente Meio-Gordo 1L', 'cheapest');
  pr('leite', 'pingodoce', 0.78, 0.78, '€/L', 2, 'Leite Pingo Doce Meio-Gordo 1L', 'cheapest');
  pr('papel', 'continente', 4.99, 0.42, '€/rolo', 3, 'Renova Papel Higiénico 12 rolos');
  pr('papel', 'auchan', 4.79, 0.40, '€/rolo', 3, 'Renova Papel Higiénico 12 rolos');
  pr('papel', 'mercadona', 3.20, 0.27, '€/rolo', 3, 'Papel higiénico Bosque Verde 12 rolos', 'cheapest');
  pr('lixivia', 'pingodoce', 1.29, 0.65, '€/L', 3, 'Lixívia Neoblanc 2L');
  pr('lixivia', 'lidl', 0.99, 0.50, '€/L', 6, 'Lixívia W5 2L', 'manual');

  const events = [];
  const ev = (product_id, product_name, type, delta, daysAgo, user_name, extra = {}) =>
    events.push({ id: `e-${events.length}`, household_id: H, product_id, product_name, type, delta, at: iso(daysAgo), user_id: user_name === 'Eu' ? 'demo-user' : 'demo-2', user_name, ...extra });
  for (let i = 0; i < 12; i++) ev('leite', 'Leite meio-gordo', 'consume', -1, i * 2.5 + 0.3, i % 2 ? 'Eu' : 'Rita');
  for (let i = 0; i < 6; i++) ev('cafe', 'Café cápsulas', 'consume', -1, i * 5 + 1, 'Rita');
  ev('iogurte', 'Iogurte natural', 'consume', -2, 0.1, 'Rita');
  ev('lixivia', 'Lixívia', 'consume', -1, 0.2, 'Eu');
  ev('frango', 'Peito de frango', 'add', 0.8, 4, 'Eu');
  const spend = [[120, 'alimentar'], [35, 'limpeza'], [22, 'higiene'], [18, 'bebidas'], [14, 'animais']];
  for (let m = 0; m < 6; m++) for (const [v, g] of spend) ev(null, 'Compras', 'buy', 1, m * 30 + 5, m % 2 ? 'Eu' : 'Rita', { price: Math.round(v * (0.8 + ((m * 7 + v) % 5) / 10)), grp: g, store: ['continente', 'pingodoce', 'mercadona'][m % 3] });

  const members = [
    { id: 'mem1', household_id: H, user_id: 'demo-user', display_name: 'Eu' },
    { id: 'mem2', household_id: H, user_id: 'demo-2', display_name: 'Rita' },
  ];

  const toMap = (arr) => Object.fromEntries(arr.map((r) => [r.id, r]));
  return {
    products: toMap(products), recipes: toMap(recipes), meal_plan: toMap(meal_plan), prices: toMap(prices),
    events: toMap(events), members: toMap(members), shopping_items: toMap([
      { id: 'x1', household_id: H, name: 'Pão de forma', qty: 1, unit: 'un', product_id: null },
    ]),
  };
}
