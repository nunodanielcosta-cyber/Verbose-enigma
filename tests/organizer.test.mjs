import { test } from 'node:test';
import assert from 'node:assert/strict';
import { organize, classify } from '../js/organizer.js';
import { applyVoiceCommands, applyCorrections } from '../js/orl.js';

test('comandos de pontuação ditados', () => {
  assert.equal(applyVoiceCommands('otoscopia dois pontos membranas íntegras ponto final'), 'Otoscopia: membranas íntegras.');
  assert.equal(applyVoiceCommands('amoxicilina 1 g de 8 barra 8 horas vírgula durante 8 dias'), 'Amoxicilina 1 g de 8/8 horas, durante 8 dias');
  assert.equal(applyVoiceCommands('ponto de situação'), 'Ponto de situação');
});

test('correções de termos ORL', () => {
  assert.equal(applyCorrections('weber indiferente, rine positivo'), 'Weber indiferente, Rinne positivo');
  assert.equal(applyCorrections('manobra de dix hallpike positiva'), 'manobra de Dix-Hallpike positiva');
  assert.equal(applyCorrections('timpanograma tipo b à direita'), 'timpanograma tipo B à direita');
  assert.equal(applyCorrections('membrana timpanica abaulada'), 'membrana timpânica abaulada');
});

test('organiza ditado com cabeçalhos', () => {
  const n = organize(
    'Motivo da consulta: otalgia direita. Refere otalgia direita há 3 dias com febre. Antecedentes: HTA, sem alergias conhecidas. ' +
    'Otoscopia: membrana timpânica direita abaulada e hiperemiada, OE normal. Rinoscopia normal. Orofaringe sem alterações. ' +
    'Diagnóstico: otite média aguda direita. Plano: amoxicilina 1 g de 8/8 h durante 8 dias. Reavaliação em 2 semanas.'
  );
  assert.equal(n.motivo, 'Otalgia direita.');
  assert.match(n.hda, /há 3 dias/);
  assert.match(n.antecedentes, /HTA/);
  assert.match(n.otoscopia, /abaulada/);
  assert.match(n.rinoscopia, /Septo nasal centrado/);
  assert.match(n.orofaringe, /Amígdalas palatinas/);
  assert.equal(n.diagnostico, 'Otite média aguda direita.');
  assert.match(n.plano, /amoxicilina/i);
  assert.equal(n.seguimento, 'Reavaliação em 2 semanas.');
});

test('classifica frases sem cabeçalho', () => {
  const n = organize('Queixa-se de hipoacusia esquerda progressiva. Septo desviado para a direita. Pregas vocais móveis. Pedir audiograma tonal e timpanograma.');
  assert.match(n.hda, /hipoacusia/);
  assert.match(n.rinoscopia, /Septo/);
  assert.match(n.laringe, /Pregas vocais/);
  assert.match(n.plano, /Pedir audiograma/);
  assert.equal(n.complementares, '');
});

test('cabeçalho explícito mantém-se em frases ambíguas', () => {
  const n = organize('Diagnóstico: rinite alérgica. Desvio septal.');
  assert.equal(n.diagnostico, 'Rinite alérgica. Desvio septal.');
  assert.equal(classify('pedir TC dos seios perinasais').best, 'plano');
});
