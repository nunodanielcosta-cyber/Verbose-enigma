// Fruta e legumes comuns em Portugal, com valores de partida razoáveis.
// days   = quantos dias dura depois de comprado (validade automática)
// kg     = peso médio de uma unidade (para converter "0,856 kg" do talão em unidades)
// alias  = palavras que aparecem nos talões (sem acentos, minúsculas)
// Ajusta à vontade: são só sugestões iniciais.
import { normalize } from './domain.js';

const F = (name, emoji, o) => ({ name, emoji, unit: 'un', min: 0, max: 0, days: 7, kg: null, alias: [], where: 'Fruteira', ...o });

export const PRODUCE = [
  // Fruta
  F('Banana', '🍌', { days: 5, min: 2, max: 8, kg: 0.18, alias: ['banana', 'bananas'] }),
  F('Maçã', '🍎', { days: 21, min: 2, max: 8, kg: 0.17, alias: ['maca', 'macas', 'gala', 'golden', 'fuji', 'royal', 'reineta', 'starking', 'pink lady'] }),
  F('Pera', '🍐', { days: 7, min: 2, max: 6, kg: 0.17, alias: ['pera', 'peras', 'rocha'] }),
  F('Laranja', '🍊', { days: 14, min: 2, max: 8, kg: 0.2, alias: ['laranja', 'laranjas'] }),
  F('Tangerina', '🍊', { days: 10, max: 8, kg: 0.08, alias: ['tangerina', 'clementina', 'mandarina', 'tangerinas', 'clementinas'] }),
  F('Limão', '🍋', { days: 21, min: 1, max: 4, kg: 0.1, alias: ['limao', 'limoes', 'lima'] }),
  F('Kiwi', '🥝', { days: 10, max: 6, kg: 0.09, alias: ['kiwi', 'kiwis'] }),
  F('Morangos', '🍓', { unit: 'caixa', days: 3, max: 1, kg: 0.5, alias: ['morango', 'morangos'], where: 'Frigorífico' }),
  F('Uvas', '🍇', { unit: 'cacho', days: 5, max: 2, kg: 0.5, alias: ['uva', 'uvas'], where: 'Frigorífico' }),
  F('Mirtilos', '🫐', { unit: 'caixa', days: 5, max: 1, kg: 0.125, alias: ['mirtilo', 'mirtilos'], where: 'Frigorífico' }),
  F('Pêssego', '🍑', { days: 4, max: 6, kg: 0.15, alias: ['pessego', 'pessegos', 'nectarina', 'nectarinas'] }),
  F('Ameixa', '🟣', { days: 5, max: 6, kg: 0.06, alias: ['ameixa', 'ameixas'] }),
  F('Cerejas', '🍒', { unit: 'caixa', days: 4, max: 1, kg: 0.5, alias: ['cereja', 'cerejas'], where: 'Frigorífico' }),
  F('Ananás', '🍍', { days: 5, max: 1, kg: 1.2, alias: ['ananas', 'abacaxi'] }),
  F('Melão', '🍈', { days: 7, max: 1, kg: 1.6, alias: ['melao', 'meloa'] }),
  F('Melancia', '🍉', { days: 7, max: 1, kg: 4, alias: ['melancia'] }),
  F('Manga', '🥭', { days: 5, max: 2, kg: 0.35, alias: ['manga', 'mangas'] }),
  F('Abacate', '🥑', { days: 4, max: 3, kg: 0.2, alias: ['abacate', 'abacates'] }),
  // Legumes
  F('Tomate', '🍅', { days: 7, min: 2, max: 6, kg: 0.15, alias: ['tomate', 'tomates', 'cherry', 'chucha'] }),
  F('Cebola', '🧅', { days: 30, min: 2, max: 6, kg: 0.15, alias: ['cebola', 'cebolas', 'cebolinho'], where: 'Despensa' }),
  F('Alho', '🧄', { unit: 'cabeça', days: 60, min: 1, max: 3, kg: 0.05, alias: ['alho', 'alhos'], where: 'Despensa' }),
  F('Batata', '🥔', { unit: 'kg', days: 30, min: 1, max: 3, alias: ['batata', 'batatas'], where: 'Despensa' }),
  F('Batata-doce', '🍠', { unit: 'kg', days: 21, max: 1, alias: ['batata doce'], where: 'Despensa' }),
  F('Cenoura', '🥕', { days: 21, min: 2, max: 8, kg: 0.08, alias: ['cenoura', 'cenouras'], where: 'Frigorífico' }),
  F('Alface', '🥬', { days: 5, max: 1, kg: 0.4, alias: ['alface', 'iceberg'], where: 'Frigorífico' }),
  F('Salada (saco)', '🥗', { unit: 'saco', days: 4, max: 1, kg: 0.2, alias: ['salada', 'rucula', 'canonigos', 'mistura'], where: 'Frigorífico' }),
  F('Espinafres', '🥬', { unit: 'saco', days: 4, max: 1, kg: 0.25, alias: ['espinafre', 'espinafres'], where: 'Frigorífico' }),
  F('Couve', '🥬', { days: 7, max: 1, kg: 1, alias: ['couve', 'lombarda', 'portuguesa', 'galega', 'repolho'], where: 'Frigorífico' }),
  F('Brócolos', '🥦', { days: 5, max: 1, kg: 0.4, alias: ['brocolo', 'brocolos', 'brocolis'], where: 'Frigorífico' }),
  F('Couve-flor', '🥦', { days: 7, max: 1, kg: 1, alias: ['couve flor'], where: 'Frigorífico' }),
  F('Pepino', '🥒', { days: 7, max: 2, kg: 0.3, alias: ['pepino', 'pepinos'], where: 'Frigorífico' }),
  F('Curgete', '🥒', { days: 7, max: 2, kg: 0.3, alias: ['curgete', 'courgette', 'curgetes'], where: 'Frigorífico' }),
  F('Pimento', '🫑', { days: 10, max: 3, kg: 0.2, alias: ['pimento', 'pimentos'], where: 'Frigorífico' }),
  F('Beringela', '🍆', { days: 7, max: 1, kg: 0.3, alias: ['beringela', 'berinjela'], where: 'Frigorífico' }),
  F('Cogumelos', '🍄', { unit: 'caixa', days: 4, max: 1, kg: 0.25, alias: ['cogumelo', 'cogumelos', 'champignon'], where: 'Frigorífico' }),
  F('Alho-francês', '🌿', { days: 10, max: 2, kg: 0.3, alias: ['alho frances', 'alho porro'], where: 'Frigorífico' }),
  F('Abóbora', '🎃', { unit: 'kg', days: 30, max: 1, alias: ['abobora'], where: 'Despensa' }),
  F('Feijão-verde', '🫛', { unit: 'kg', days: 5, max: 0.5, alias: ['feijao verde'], where: 'Frigorífico' }),
  F('Milho', '🌽', { days: 5, max: 2, kg: 0.3, alias: ['maçaroca', 'macaroca', 'milho doce'], where: 'Frigorífico' }),
  F('Gengibre', '🫚', { days: 21, max: 1, kg: 0.1, alias: ['gengibre'], where: 'Frigorífico' }),
  F('Salsa', '🌿', { unit: 'molho', days: 5, max: 1, kg: 0.05, alias: ['salsa'], where: 'Frigorífico' }),
  F('Coentros', '🌿', { unit: 'molho', days: 5, max: 1, kg: 0.05, alias: ['coentro', 'coentros'], where: 'Frigorífico' }),
];

/** Encontra a fruta/legume a que um texto (ex.: linha de talão "MACA GALA KG") se refere. */
// Se a linha tiver uma destas palavras, é um produto transformado (polpa de tomate, sumo de laranja…), não fresco.
const NOT_FRESH = /\b(polpa|molho|sumo|nectar|conserva|lata|compota|doce de|iogurte|gelado|bolacha|chips|congelad|seco|secos|desidratad|puré|pure|creme|sopa|ketchup|xarope|aroma|batido|vinagre)/;

export function matchProduce(text) {
  const t = ' ' + normalize(text) + ' ';
  if (NOT_FRESH.test(t)) return null;
  let best = null;
  for (const item of PRODUCE) {
    for (const a of [normalize(item.name), ...item.alias]) {
      // palavra inteira, ou início de palavra por causa das abreviaturas dos talões
      // (ex.: "BANAN" ou "CENOURAS"); só para palavras de 6+ letras, para "maca" não apanhar "macarrão"
      const hit = t.includes(' ' + a + ' ') || (a.length >= 6 && t.includes(' ' + a.slice(0, a.length - 1)));
      if (hit && (!best || a.length > best.len)) best = { item, len: a.length };
    }
  }
  return best?.item || null;
}

/** Dados para criar o produto no stock a partir do catálogo. */
export function productFromCatalog(item) {
  return {
    name: item.name, grp: 'alimentar', category: 'Frutas e legumes', location: item.where, unit: item.unit,
    min: item.min, max: item.max, shelf_days: item.days, compare_as: normalize(item.name), qty: 0,
    unit_kg: item.kg,
  };
}

/** Converte um peso do talão na unidade do produto (ex.: 0,856 kg de banana ≈ 5 un). */
export function unitsFromKg(kg, product, item) {
  if (!(kg > 0)) return null;
  if (product?.unit === 'kg') return +kg.toFixed(3);
  if (product?.unit === 'g') return Math.round(kg * 1000);
  const per = product?.unit_kg || item?.kg;
  return per ? Math.max(1, Math.round(kg / per)) : null;
}

export const emojiOfProduce = (name) => PRODUCE.find((p) => normalize(p.name) === normalize(name))?.emoji || null;
