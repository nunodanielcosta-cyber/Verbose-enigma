// OtoDita — vocabulário, secções e comandos de voz para Otorrinolaringologia (pt-PT)

/** Remove acentos e passa a minúsculas (para comparação). */
export function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Grupos SOAP usados para agrupar as secções. */
export const GROUPS = [
  { id: 'S', label: 'Subjetivo', soapTitle: 'S (Subjetivo)' },
  { id: 'O', label: 'Exame objetivo', soapTitle: 'O (Objetivo)' },
  { id: 'A', label: 'Avaliação', soapTitle: 'A (Avaliação)' },
  { id: 'P', label: 'Plano', soapTitle: 'P (Plano)' },
];

/**
 * Secções do registo ORL.
 *  - triggers: palavras que, ditas no início de uma frase, abrem a secção
 *    (prefixo "+" = a palavra faz parte do conteúdo e é mantida, ex.: "Reavaliação em 3 meses")
 *  - keywords: termos que ajudam a classificar frases ditas sem cabeçalho
 *  - llm: descrição do campo usada no pedido à IA local
 */
export const SECTIONS = [
  {
    id: 'motivo', group: 'S', label: 'Motivo da consulta', short: 'Motivo',
    triggers: ['motivo da consulta', 'motivo de consulta', 'motivo'],
    keywords: ['enviado por', 'referenciado por', 'referenciada por', 'enviada por', 'pedido de consulta'],
    llm: 'motivo da consulta / queixa principal (curto, 1 linha)',
  },
  {
    id: 'hda', group: 'S', label: 'História da doença atual', short: 'HDA',
    triggers: ['historia da doenca atual', 'historia da doenca actual', 'historia atual', 'anamnese', 'hda', 'doenca atual'],
    keywords: [
      'refere', 'referia', 'queixa', 'queixas', 'nega', 'ha ', 'desde', 'inicio', 'agravamento', 'melhoria', 'evolucao',
      'otalgia', 'hipoacusia', 'acufeno', 'acufenos', 'zumbido', 'vertigem', 'vertigens', 'tontura', 'tonturas', 'desequilibrio',
      'obstrucao nasal', 'congestao nasal', 'epistaxe', 'epistaxis', 'disfonia', 'rouquidao', 'disfagia', 'odinofagia',
      'roncopatia', 'ressona', 'apneias presenciadas', 'sonolencia', 'cefaleia', 'febre', 'prurido', 'plenitude aural',
      'autofonia', 'anosmia', 'hiposmia', 'cacosmia', 'esternutos', 'espirros', 'globus', 'pirose', 'tosse', 'otorragia',
      'dor', 'episodios', 'crises', 'recorrente', 'recorrentes',
    ],
    llm: 'história da doença atual: sintomas, lateralidade, início, duração, evolução, fatores de agravamento/alívio, tratamentos já feitos',
  },
  {
    id: 'antecedentes', group: 'S', label: 'Antecedentes / Medicação / Alergias', short: 'Antecedentes',
    triggers: ['antecedentes pessoais', 'antecedentes familiares', 'antecedentes', 'medicacao habitual'],
    keywords: [
      'antecedentes', 'alergia', 'alergias', 'alergico', 'alergica', 'medicacao habitual', 'medicado habitualmente',
      'medicada habitualmente', 'hta', 'hipertensao', 'diabetes', 'dislipidemia', 'fumador', 'fumadora', 'ex-fumador',
      'tabagismo', 'habitos tabagicos', 'habitos alcoolicos', 'cirurgia previa', 'cirurgias previas', 'operado a', 'operada a',
      'anticoagulado', 'anticoagulada', 'hipocoagulado', 'asma', 'dpoc', 'mnca', 'macnc',
    ],
    llm: 'antecedentes pessoais e familiares relevantes, cirurgias prévias, medicação habitual, alergias (incluir "Sem alergias conhecidas" se referido), hábitos',
  },
  {
    id: 'otoscopia', group: 'O', label: 'Otoscopia / Otomicroscopia', short: 'Otoscopia',
    triggers: ['otoscopia', 'otomicroscopia', 'otoendoscopia', 'exame otologico'],
    keywords: [
      'membrana timpanica', 'membranas timpanicas', 'timpano', 'timpanos', 'cae', 'canal auditivo', 'canais auditivos', 'cerumen',
      'rolhao', 'otorreia', 'perfuracao', 'nacarad', 'triangulo luminoso', 'retracao', 'retraida', 'efusao', 'colesteatoma',
      'miringite', 'timpanosclerose', 'exostose', 'otomicose', 'bolsa de retracao', 'cabo do martelo', 'pars flaccida',
      'pars tensa', 'tubo de ventilacao', 'tubos de ventilacao', 'abaulad', 'hiperemia da membrana',
    ],
    macro: 'CAE livres e permeáveis bilateralmente. Membranas timpânicas íntegras, nacaradas, com triângulo luminoso preservado, sem sinais de efusão ou retração.',
    llm: 'otoscopia/otomicroscopia: CAE e membranas timpânicas, por lado (OD/OE)',
  },
  {
    id: 'rinoscopia', group: 'O', label: 'Rinoscopia / Endoscopia nasal', short: 'Rinoscopia',
    triggers: ['rinoscopia anterior', 'rinoscopia', 'endoscopia nasal', 'nasoendoscopia', 'endoscopia nasossinusal', 'fossas nasais'],
    keywords: [
      'septo', 'desvio septal', 'corneto', 'cornetos', 'fossa nasal', 'fossas nasais', 'meato medio', 'meatos medios', 'polipo nasal',
      'polipos nasais', 'polipose', 'mucosa nasal', 'crostas', 'adenoide', 'adenoides', 'rinofaringe', 'cavum', 'valvula nasal',
      'esporao', 'concha bolhosa', 'hipertrofia dos cornetos', 'secrecoes mucopurulentas', 'trompa de eustaquio', 'rosenmuller',
    ],
    macro: 'Septo nasal centrado. Cornetos inferiores eutróficos. Mucosa nasal rosada, sem secreções ou lesões. Meatos médios livres. Rinofaringe livre.',
    llm: 'rinoscopia anterior e/ou endoscopia nasal: septo, cornetos, mucosa, meatos, rinofaringe',
  },
  {
    id: 'orofaringe', group: 'O', label: 'Cavidade oral / Orofaringe', short: 'Orofaringe',
    triggers: ['orofaringe', 'cavidade oral', 'boca e orofaringe', 'orofaringoscopia', 'exame da boca'],
    keywords: [
      'amigdala', 'amigdalas', 'uvula', 'palato', 'lingua', 'pilares', 'cavidade oral', 'mallampati', 'friedman',
      'exsudado', 'kissing', 'grau i', 'grau ii', 'grau iii', 'grau iv', 'base da lingua', 'mucosa oral', 'dentes', 'dentaria',
    ],
    macro: 'Cavidade oral e orofaringe sem lesões. Amígdalas palatinas grau I, simétricas, sem exsudado. Úvula centrada, palato mole com mobilidade simétrica.',
    llm: 'cavidade oral e orofaringe: amígdalas (grau), úvula, palato, língua, Mallampati/Friedman se referido',
  },
  {
    id: 'laringe', group: 'O', label: 'Laringoscopia', short: 'Laringoscopia',
    triggers: ['nasofibrolaringoscopia', 'fibrolaringoscopia', 'videolaringoscopia', 'videoestroboscopia', 'estroboscopia', 'laringoscopia indireta', 'laringoscopia', 'laringe'],
    keywords: [
      'cordas vocais', 'corda vocal', 'pregas vocais', 'prega vocal', 'glote', 'glotic', 'epiglote', 'aritenoide', 'aritenoides',
      'valecula', 'valeculas', 'seios piriformes', 'seio piriforme', 'hipofaringe', 'comissura', 'nodulos vocais', 'polipo vocal',
      'edema de reinke', 'leucoplasia', 'supraglote', 'subglote', 'bandas ventriculares', 'encerramento glotico', 'fenda glotica',
    ],
    macro: 'Epiglote, valéculas e seios piriformes livres. Pregas vocais nacaradas, de bordo livre regular, com mobilidade preservada e simétrica. Encerramento glótico completo.',
    llm: 'laringoscopia (indireta/nasofibrolaringoscopia/estroboscopia): supraglote, pregas vocais, mobilidade, encerramento glótico, hipofaringe',
  },
  {
    id: 'pescoco', group: 'O', label: 'Pescoço', short: 'Pescoço',
    triggers: ['pescoco', 'palpacao cervical', 'exame cervical', 'palpacao do pescoco'],
    keywords: ['adenopatia', 'adenopatias', 'adenomegalia', 'adenomegalias', 'tiroide', 'tiroideia', 'massa cervical', 'parotida', 'parotidas', 'submandibular', 'cervical', 'cervicais', 'nodulo tiroideu'],
    macro: 'Pescoço sem adenopatias ou massas palpáveis. Glândulas salivares sem alterações. Tiroide não palpável.',
    llm: 'palpação cervical: adenopatias, massas, glândulas salivares, tiroide',
  },
  {
    id: 'vestibular', group: 'O', label: 'Acumetria / Exame vestibular', short: 'Acumetria/Vestibular',
    triggers: ['acumetria', 'exame vestibular', 'exame otoneurologico', 'diapasoes', 'provas vestibulares', 'exame neurologico'],
    keywords: [
      'weber', 'rinne', 'nistagmo', 'romberg', 'unterberger', 'fukuda', 'dix-hallpike', 'dix hallpike', 'head impulse', 'hit ',
      'head shake', 'skew', 'manobra de epley', 'pagnini', 'mclure', 'provas cerebelosas', 'dismetria', 'marcha', 'frenzel', 'diapasao',
      'pares cranianos', 'facial', 'house-brackmann', 'house brackmann',
    ],
    macro: 'Weber indiferente. Rinne positivo bilateralmente. Sem nistagmo espontâneo ou evocado pelo olhar. Head impulse test negativo bilateralmente. Romberg e Unterberger sem alterações. Provas cerebelosas sem alterações.',
    llm: 'acumetria (Weber, Rinne) e exame vestibular/otoneurológico: nistagmo, HIT, Dix-Hallpike, Romberg, Unterberger, provas cerebelosas, nervo facial',
  },
  {
    id: 'exame', group: 'O', label: 'Outros achados do exame objetivo', short: 'Outros (EO)',
    triggers: ['exame objetivo', 'exame objectivo', 'ao exame objetivo', 'ao exame', 'exame fisico', 'outros achados'],
    keywords: ['bom estado geral', 'estado geral', 'pavilhao auricular', 'pavilhoes auriculares', 'mastoide', 'tragus', 'piramide nasal', 'face'],
    llm: 'outros achados do exame objetivo não incluídos acima (estado geral, pavilhão auricular, mastoide, pirâmide nasal, face)',
  },
  {
    id: 'complementares', group: 'O', label: 'Exames complementares (resultados)', short: 'MCDT',
    triggers: ['exames complementares', 'meios complementares', 'mcdts', 'mcdt', 'resultados'],
    keywords: [
      'audiograma', 'audiometria', 'timpanograma', 'timpanometria', 'impedancimetria', 'reflexos estapedicos', 'reflexo estapedico',
      'tc', 'tac', 'tomografia', 'ressonancia', 'rm', 'peate', 'potenciais evocados', 'otoemissoes', 'polissonografia', 'poligrafia',
      'iah', 'videonistagmografia', 'vng', 'vhit', 'vemp', 'biopsia', 'histologia', 'analises', 'hemograma', 'ecografia', 'citologia',
      'limiar', 'limiares', 'db', 'srt', 'discriminacao', 'curva tipo', 'tipo a', 'tipo b', 'tipo c',
    ],
    llm: 'resultados de exames complementares já realizados (audiograma com limiares/tipo de hipoacusia, timpanograma, TC, RM, PSG/IAH, vHIT, biópsias, análises)',
  },
  {
    id: 'diagnostico', group: 'A', label: 'Diagnóstico / Avaliação', short: 'Diagnóstico',
    triggers: ['hipotese diagnostica', 'hipoteses diagnosticas', 'diagnosticos', 'diagnostico', 'impressao clinica', 'avaliacao', 'conclusao'],
    keywords: ['diagnostico', 'hipotese', 'compativel com', 'sugestivo de', 'sugestiva de', 'provavel', 'a excluir', 'diagnostico diferencial'],
    llm: 'diagnóstico(s) e hipóteses diagnósticas, com lateralidade (ex.: "Otite média aguda direita"); um por linha se vários',
  },
  {
    id: 'plano', group: 'P', label: 'Plano / Terapêutica', short: 'Plano',
    triggers: ['plano terapeutico', 'plano', 'terapeutica', 'tratamento', 'prescricao', 'conduta', '+proposta'],
    keywords: [
      'prescrev', 'prescrito', 'medicad', 'iniciar', 'inicia', 'manter', 'mantem', 'suspender', 'suspende', 'mg', 'comprimido', 'comprimidos',
      'spray', 'gotas', 'lavagens', 'lavagem nasal', 'irrigacao', 'soro fisiologico', 'corticoide', 'antibiotico', 'anti-histaminico',
      'cirurgia', 'proposta', 'propoe', 'propor', 'proposto', 'proposta cirurgica', 'pedir', 'pedido', 'pede-se', 'peco', 'requisit',
      'solicit', 'encaminh', 'referenci', 'vezes por dia', 'de 8 em 8', 'de 12 em 12', 'id', 'bid', 'tid', 'em sos', 'reabilitacao vestibular',
      'protese auditiva', 'proteses auditivas', 'aparelho auditivo', 'cpap', 'terapia da fala', 'terapia vocal', 'higiene vocal',
      'repetir', 'agendar', 'marcar', 'lista de espera', 'consentimento informado', 'epley',
    ],
    llm: 'plano: terapêutica (fármaco, dose, posologia, duração), MCDT pedidos, procedimentos realizados na consulta, proposta cirúrgica, referenciações, recomendações',
  },
  {
    id: 'seguimento', group: 'P', label: 'Seguimento', short: 'Seguimento',
    triggers: ['seguimento', '+proxima consulta', '+reavaliacao', 'follow up'],
    keywords: ['reavaliacao', 'reavaliar', 'consulta de seguimento', 'proxima consulta', 'voltar a consulta', 'alta', 'sos', 'retorno', 'controlo em', 'revisao em'],
    llm: 'seguimento: reavaliação/próxima consulta (prazo), alta, sinais de alarme / regressar em SOS',
  },
];

export const SECTION_BY_ID = Object.fromEntries(SECTIONS.map((s) => [s.id, s]));

/** Verbos que indicam pedidos/terapêutica (têm prioridade na classificação). */
export const PLAN_VERBS = ['pedir', 'pede-se', 'peco', 'requisit', 'solicit', 'agendar', 'marcar', 'prescrev', 'iniciar', 'inicia ', 'propoe', 'propor', 'proposta', 'encaminh', 'referenci'];

/** Frases que, ditas a seguir ao nome do exame, expandem para o texto-padrão "normal". */
export const NORMAL_WORDS = ['normal', 'normais', 'sem alteracoes', 'sem alteracoes de relevo', 'sem alteracoes significativas', 'sem particularidades', 'inocente'];

// Fronteiras de palavra compatíveis com letras acentuadas
const B = '(?<![\\p{L}\\d])';
const E = '(?![\\p{L}\\d])';
const rx = (p, flags = 'giu') => new RegExp(B + p + E, flags);

/** Comandos de pontuação ditados (ordem importa: mais longos primeiro). */
export const VOICE_COMMANDS = [
  [rx('ponto (?:e|é) v[ií]rgula'), ';'],
  [rx('ponto de interroga[çc][ãa]o'), '?'],
  [rx('ponto de exclama[çc][ãa]o'), '!'],
  [rx('ponto (?:par[áa]grafo|final par[áa]grafo)'), '.\n'],
  [rx('(?:novo par[áa]grafo|nova linha|mudar de linha|par[áa]grafo)'), '\n'],
  [rx('ponto final'), '.'],
  [rx('ponto(?! de)'), '.'],
  [rx('dois pontos'), ':'],
  [rx('v[ií]rgula'), ','],
  [rx('(?:abre|abrir) par[êe]nteses'), ' ('],
  [rx('(?:fecha|fechar) par[êe]nteses'), ') '],
  [rx('barra'), '/'],
  [rx('(?:h[íi]fen|tra[çc]o)'), '-'],
];

/** Correções de termos ORL frequentemente mal reconhecidos (aplicadas a ditado e transcrição). */
export const CORRECTIONS = [
  [rx('c\\.?\\s?a\\.?\\s?e'), 'CAE'],
  [rx('v\\s?p\\s?p\\s?b'), 'VPPB'],
  [rx('s\\s?a\\s?o\\s?s'), 'SAOS'],
  [rx('o\\s?r\\s?l'), 'ORL'],
  [rx('i\\s?a\\s?h'), 'IAH'],
  [rx('p\\s?e\\s?a\\s?t\\s?e'), 'PEATE'],
  [rx('v\\s?-?\\s?hit'), 'vHIT'],
  [rx('v\\s?e\\s?m\\s?p'), 'VEMP'],
  [rx('v\\s?n\\s?g'), 'VNG'],
  [rx('t\\s?a\\s?c'), 'TAC'],
  [rx('t\\s?c'), 'TC'],
  [rx('r\\s?m'), 'RM'],
  [rx('c\\s?pap'), 'CPAP'],
  [rx('m\\s?c\\s?d\\s?t\\s?s?'), 'MCDT'],
  [rx('dix\\s*-?\\s*hall?\\s*pi(?:ke|que|k)'), 'Dix-Hallpike'],
  [rx('(?:weber|v[ée]ber|veber)'), 'Weber'],
  [rx('(?:rinne|rine|rin[eê]|rini|rinê)'), 'Rinne'],
  [rx('unterberg(?:er)?'), 'Unterberger'],
  [rx('romberg'), 'Romberg'],
  [rx('valsalva'), 'Valsalva'],
  [rx('toynbee'), 'Toynbee'],
  [rx('epley'), 'Epley'],
  [rx('frenzel'), 'Frenzel'],
  [rx('reinke'), 'Reinke'],
  [rx('mallampati'), 'Mallampati'],
  [rx('friedman'), 'Friedman'],
  [rx('house[\\s-]?brackmann'), 'House-Brackmann'],
  [rx('(?:m[ée]ni[èe]re|meniere)'), 'Ménière'],
  [rx('trompa de eust[áa]quio'), 'trompa de Eustáquio'],
  [rx('rosenm[üu]ller'), 'Rosenmüller'],
  [rx('membrana timpanica'), 'membrana timpânica'],
  [rx('membranas timpanicas'), 'membranas timpânicas'],
  [rx('timpanos'), 'tímpanos'],
  [rx('timpano'), 'tímpano'],
  [rx('otite media'), 'otite média'],
  [rx('amigdala'), 'amígdala'],
  [rx('amigdalas'), 'amígdalas'],
  [rx('uvula'), 'úvula'],
  [rx('cerumen'), 'cerúmen'],
  [rx('polipo'), 'pólipo'],
  [rx('polipos'), 'pólipos'],
  [rx('neuro[\\s-]sensorial'), 'neurossensorial'],
  [rx('rino[\\s-]sinusite'), 'rinossinusite'],
  [rx('naso[\\s-]fibro[\\s-]?laringoscopia'), 'nasofibrolaringoscopia'],
  [rx('oto[\\s-]scopia'), 'otoscopia'],
  [rx('rino[\\s-]scopia'), 'rinoscopia'],
  [rx('oto[\\s-]microscopia'), 'otomicroscopia'],
  [rx('otorr[ée]ia'), 'otorreia'],
  [rx('rinorr[ée]ia'), 'rinorreia'],
  [rx('epistaxis'), 'epistaxe'],
  [rx('nistagmus'), 'nistagmo'],
  [rx('acuf[ée]nos'), 'acufenos'],
  [rx('acuf[ée]no'), 'acufeno'],
  [rx('decib[ée]is'), 'dB'],
  [rx('quilo[\\s-]?hertz|kilo[\\s-]?hertz'), 'kHz'],
  [rx('hertz'), 'Hz'],
  [rx('miligramas'), 'mg'],
  [rx('mililitros'), 'mL'],
  [rx('(timpanograma|curva)( tipo) (a|b|c|as|ad)'), (m, a, b, c) => `${a}${b} ${c.length === 1 ? c.toUpperCase() : c[0].toUpperCase() + c[1]}`],
];

/** Aplica comandos de pontuação ditados. */
export function applyVoiceCommands(text) {
  let t = ' ' + text + ' ';
  for (const [re, rep] of VOICE_COMMANDS) t = t.replace(re, rep);
  return tidy(t);
}

/** Aplica correções de terminologia ORL. */
export function applyCorrections(text) {
  let t = text;
  for (const [re, rep] of CORRECTIONS) t = t.replace(re, rep);
  return t;
}

/** Limpa espaços à volta da pontuação e capitaliza o início das frases. */
export function tidy(text) {
  let t = text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/ +([.,;:!?)])/g, '$1')
    .replace(/\( +/g, '(')
    .replace(/([.,;:!?])(?=[\p{L}\d(])/gu, '$1 ')
    .replace(/(\d)([.,]) (\d)/g, '$1$2$3') // 1.5 / 0,5
    .replace(/(\d) ?\/ ?(\d)/g, '$1/$2')
    .replace(/([.!?])\.+/g, '$1')
    .replace(/,\./g, '.')
    .trim();
  return capitalizeSentences(t);
}

export function capitalizeSentences(t) {
  return t.replace(/(^|[.!?]\s+|\n)(\p{Ll})/gu, (m, p, c) => p + c.toUpperCase());
}

export function capitalizeFirst(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
