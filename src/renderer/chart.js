// Gráficos SVG simples: evolução mensal com faixas de referência e projeção; pirâmide etária.

import { s, fmt } from './ui.js';
import { periodIndex, periodFromIndex } from '../core/dates.js';
import { valueOf, multOf } from '../core/indicators.js';

export function evolutionChart(series, ind, projection, endPeriod) {
  const W = 420;
  const H = 230;
  const P = { l: 44, r: 16, t: 14, b: 30 };
  const pts = Object.keys(series || {})
    .sort()
    .map((p) => ({ p, x: periodIndex(p), y: valueOf(series[p], ind) }))
    .filter((q) => q.y !== null);
  if (!pts.length) return null;
  const x0 = pts[0].x;
  const x1 = Math.max(pts[pts.length - 1].x, endPeriod ? periodIndex(endPeriod) : 0);
  const vals = pts.map((q) => q.y);
  if (projection) vals.push(projection.predicted);
  for (const k of ['aMin', 'eMin', 'eMax', 'aMax']) if (ind[k] !== '' && ind[k] != null && isFinite(+ind[k])) vals.push(+ind[k]);
  let ymin = Math.min(...vals);
  let ymax = Math.max(...vals);
  const pad = (ymax - ymin) * 0.08 || 5;
  ymin = Math.max(0, ymin - pad);
  ymax = ind.unit === '%' || !ind.unit ? Math.min(multOf(ind), ymax + pad) : ymax + pad;
  if (ymax <= ymin) ymax = ymin + 1;
  const X = (x) => P.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - P.l - P.r);
  const Y = (y) => P.t + (1 - (y - ymin) / (ymax - ymin)) * (H - P.t - P.b);
  const clampY = (y) => Math.min(ymax, Math.max(ymin, y));
  const band = (lo, hi, cls) => {
    const a = lo === '' || lo == null ? ymin : clampY(+lo);
    const b = hi === '' || hi == null ? ymax : clampY(+hi);
    if (b <= a) return null;
    return s('rect', { x: P.l, y: Y(b), width: W - P.l - P.r, height: Y(a) - Y(b), class: cls });
  };
  const ticks = [];
  for (let i = 0; i <= 4; i++) {
    const v = ymin + ((ymax - ymin) * i) / 4;
    ticks.push(s('line', { x1: P.l, x2: W - P.r, y1: Y(v), y2: Y(v), class: 'grid' }), s('text', { x: P.l - 6, y: Y(v) + 4, 'text-anchor': 'end', class: 'axis' }, fmt.num(v, ymax - ymin < 10 ? 1 : 0)));
  }
  const xt = [];
  const step = Math.max(1, Math.ceil((x1 - x0 + 1) / 6));
  for (let x = x0; x <= x1; x += step) xt.push(s('text', { x: X(x), y: H - 10, 'text-anchor': 'middle', class: 'axis' }, fmt.period(periodFromIndex(x)).replace(' 20', '/')));
  const line = pts.map((q, i) => `${i ? 'L' : 'M'}${X(q.x).toFixed(1)},${Y(q.y).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return s(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart', role: 'img', 'aria-label': `Evolução de ${ind.name}` },
    band(ind.aMin, ind.aMax, 'band-acc'),
    band(ind.eMin, ind.eMax, 'band-esp'),
    ticks,
    xt,
    s('path', { d: line, class: 'line' }),
    pts.map((q) => s('circle', { cx: X(q.x), cy: Y(q.y), r: 3, class: 'dot' }, s('title', null, `${fmt.period(q.p)}: ${fmt.val(q.y, ind)}`))),
    projection && endPeriod
      ? [
          s('path', { d: `M${X(last.x)},${Y(last.y)} L${X(periodIndex(endPeriod))},${Y(clampY(projection.predicted))}`, class: 'proj' }),
          s('circle', { cx: X(periodIndex(endPeriod)), cy: Y(clampY(projection.predicted)), r: 4, class: 'dot proj-dot' }, s('title', null, `Projeção ${fmt.period(endPeriod)}: ${fmt.val(projection.predicted, ind)}`)),
        ]
      : null,
  );
}

export function pyramid(bands) {
  const W = 520;
  const rowH = 14;
  const H = bands.length * rowH + 30;
  const mid = W / 2;
  const max = Math.max(1, ...bands.map((b) => Math.max(b.M, b.F)));
  const scale = (mid - 50) / max;
  const rows = [...bands].reverse().map((b, i) => {
    const y = 18 + i * rowH;
    return s(
      'g',
      null,
      s('rect', { x: mid - 22 - b.M * scale, y, width: b.M * scale, height: rowH - 3, class: 'pyr-m' }, s('title', null, `Homens ${b.label}: ${b.M}`)),
      s('rect', { x: mid + 22, y, width: b.F * scale, height: rowH - 3, class: 'pyr-f' }, s('title', null, `Mulheres ${b.label}: ${b.F}`)),
      s('text', { x: mid, y: y + rowH - 5, 'text-anchor': 'middle', class: 'axis' }, b.label),
    );
  });
  return s(
    'svg',
    { viewBox: `0 0 ${W} ${H}`, class: 'chart pyramid', role: 'img', 'aria-label': 'Pirâmide etária da lista' },
    s('text', { x: mid - 30, y: 11, 'text-anchor': 'end', class: 'axis strong' }, 'Homens'),
    s('text', { x: mid + 30, y: 11, class: 'axis strong' }, 'Mulheres'),
    rows,
  );
}
