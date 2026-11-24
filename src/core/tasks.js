// Caixa de tarefas não presenciais: estatísticas de volume e tempo.

export function taskMinutes(t, now = Date.now()) {
  let m = +t.minutes || 0;
  if (t.timerStart) m += (now - t.timerStart) / 60000;
  return m;
}

/** Estatísticas das tarefas criadas entre fromISO e toISO (inclusive). */
export function taskStats(tasks, fromISO, toISO, now = Date.now()) {
  const sel = tasks.filter((t) => {
    const d = (t.created || '').slice(0, 10);
    return (!fromISO || d >= fromISO) && (!toISO || d <= toISO);
  });
  const byType = {};
  let minutes = 0;
  for (const t of sel) {
    const k = t.type || 'Outro';
    byType[k] ??= { type: k, count: 0, minutes: 0, done: 0, delegated: 0 };
    const m = taskMinutes(t, now);
    byType[k].count++;
    byType[k].minutes += m;
    if (t.status === 'feito') byType[k].done++;
    if (t.status === 'delegado') byType[k].delegated++;
    minutes += m;
  }
  return {
    count: sel.length,
    minutes,
    pending: sel.filter((t) => t.status === 'pendente').length,
    done: sel.filter((t) => t.status === 'feito').length,
    delegated: sel.filter((t) => t.status === 'delegado').length,
    byType: Object.values(byType).sort((a, b) => b.count - a.count),
  };
}

export function newTaskId() {
  return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
