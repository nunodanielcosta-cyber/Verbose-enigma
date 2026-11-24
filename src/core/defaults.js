// Configuração inicial. TODOS os valores são editáveis em «Configuração».
// A matriz de indicadores abaixo é um EXEMPLO ilustrativo: substitua códigos, pesos e
// limiares pelos da matriz de contratualização em vigor na sua USF.

export const EXAMPLE_MATRIX = [
  { code: 'EX01', name: 'Hipertensos com PA registada no último semestre', area: 'Doença crónica', weight: 3, direction: 'up', unit: '%', mult: 100, aMin: 60, eMin: 75, eMax: 100, aMax: 100 },
  { code: 'EX02', name: 'Hipertensos < 65 anos com PA < 150/90', area: 'Doença crónica', weight: 3, direction: 'up', unit: '%', mult: 100, aMin: 45, eMin: 60, eMax: 100, aMax: 100 },
  { code: 'EX03', name: 'Diabéticos com HbA1c no último semestre', area: 'Doença crónica', weight: 3, direction: 'up', unit: '%', mult: 100, aMin: 60, eMin: 80, eMax: 100, aMax: 100 },
  { code: 'EX04', name: 'Diabéticos com exame dos pés no último ano', area: 'Doença crónica', weight: 2, direction: 'up', unit: '%', mult: 100, aMin: 55, eMin: 75, eMax: 100, aMax: 100 },
  { code: 'EX05', name: 'Diabéticos com microalbuminúria no último ano', area: 'Doença crónica', weight: 2, direction: 'up', unit: '%', mult: 100, aMin: 50, eMin: 70, eMax: 100, aMax: 100 },
  { code: 'EX06', name: 'Utentes 50-74 anos com rastreio do cancro colorretal', area: 'Rastreios', weight: 3, direction: 'up', unit: '%', mult: 100, aMin: 40, eMin: 55, eMax: 100, aMax: 100 },
  { code: 'EX07', name: 'Mulheres 25-64 anos com rastreio do cancro do colo do útero', area: 'Rastreios', weight: 3, direction: 'up', unit: '%', mult: 100, aMin: 45, eMin: 60, eMax: 100, aMax: 100 },
  { code: 'EX08', name: 'Mulheres 50-69 anos com mamografia nos últimos 2 anos', area: 'Rastreios', weight: 2, direction: 'up', unit: '%', mult: 100, aMin: 50, eMin: 65, eMax: 100, aMax: 100 },
  { code: 'EX09', name: 'Adultos com vacina Td atualizada', area: 'Prevenção', weight: 2, direction: 'up', unit: '%', mult: 100, aMin: 70, eMin: 85, eMax: 100, aMax: 100 },
  { code: 'EX10', name: 'Utentes ≥ 18 anos com IMC registado nos últimos 3 anos', area: 'Prevenção', weight: 1, direction: 'up', unit: '%', mult: 100, aMin: 50, eMin: 70, eMax: 100, aMax: 100 },
  { code: 'EX11', name: 'Internamentos evitáveis (por 1000 utentes)', area: 'Resultados', weight: 2, direction: 'down', unit: '‰', mult: 1000, aMin: 0, eMin: 0, eMax: 6, aMax: 9 },
];

// Regras para a lista de cuidados em falta e para a pré-consulta.
// field = coluna do ficheiro de utentes com a data do último registo; months = validade.
export const DEFAULT_RULES = [
  { id: 'r-pa', name: 'PA registada', indicator: 'EX01', problems: 'K86 K87', field: 'pa', months: 6 },
  { id: 'r-hba1c', name: 'HbA1c', indicator: 'EX03', problems: 'T89 T90', field: 'hba1c', months: 6 },
  { id: 'r-pe', name: 'Exame dos pés', indicator: 'EX04', problems: 'T89 T90', field: 'pe', months: 12 },
  { id: 'r-malb', name: 'Microalbuminúria', indicator: 'EX05', problems: 'T89 T90', field: 'microalb', months: 12 },
  { id: 'r-ccr', name: 'Rastreio do CCR', indicator: 'EX06', ageMin: 50, ageMax: 74, field: 'ccr', months: 24 },
  { id: 'r-ccu', name: 'Rastreio do CCU', indicator: 'EX07', ageMin: 25, ageMax: 64, sex: 'F', field: 'ccu', months: 60 },
  { id: 'r-mama', name: 'Mamografia', indicator: 'EX08', ageMin: 50, ageMax: 69, sex: 'F', field: 'mamografia', months: 24 },
  { id: 'r-td', name: 'Vacina Td', indicator: 'EX09', ageMin: 18, field: 'td', months: 120 },
  { id: 'r-imc', name: 'IMC registado', indicator: 'EX10', ageMin: 18, field: 'imc', months: 36 },
];

// Fatores de ponderação por idade (valores clássicos das USF modelo B; confirme o regime em vigor).
export const DEFAULT_UC_FACTORS = [
  { label: '0-6 anos', min: 0, max: 6, factor: 1.5 },
  { label: '7-64 anos', min: 7, max: 64, factor: 1 },
  { label: '65-74 anos', min: 65, max: 74, factor: 2 },
  { label: '≥ 75 anos', min: 75, max: null, factor: 2.5 },
];

export const CHRONIC_GROUPS = [
  { label: 'Diabetes', codes: 'T89 T90' },
  { label: 'Hipertensão', codes: 'K86 K87' },
  { label: 'Dislipidemia', codes: 'T93' },
  { label: 'Obesidade', codes: 'T82' },
  { label: 'DPOC', codes: 'R95' },
  { label: 'Asma', codes: 'R96' },
  { label: 'Cardiopatia isquémica', codes: 'K74 K75 K76' },
  { label: 'Insuficiência cardíaca', codes: 'K77' },
  { label: 'Depressão', codes: 'P76' },
  { label: 'Gravidez', codes: 'W78' },
];

export const TASK_TYPES = [
  'Renovação de receituário',
  'Resultado de MCDT',
  'Contacto indireto',
  'Email de utente',
  'Relatório / declaração',
  'Referenciação',
  'Outro',
];

export const DELEGATES = ['Enfermeiro(a) de família', 'Secretariado clínico', 'Outro médico'];

// Campos de importação: key = campo interno, synonyms = cabeçalhos reconhecidos automaticamente.
export const PATIENT_FIELDS = [
  { key: 'id', label: 'N.º de utente / processo', required: true, synonyms: ['nutente', 'numeroutente', 'nus', 'sns', 'utente', 'processo', 'nprocesso', 'id'] },
  { key: 'nome', label: 'Nome', synonyms: ['nome', 'nomeutente', 'name'] },
  { key: 'nasc', label: 'Data de nascimento', required: true, synonyms: ['datanascimento', 'nascimento', 'datanasc', 'dn', 'nasc'] },
  { key: 'sexo', label: 'Sexo', synonyms: ['sexo', 'genero', 'sex'] },
  { key: 'telefone', label: 'Telefone', synonyms: ['telefone', 'telemovel', 'contacto', 'tel', 'phone'] },
  { key: 'problemas', label: 'Problemas (códigos ICPC-2)', synonyms: ['problemas', 'icpc', 'icpc2', 'diagnosticos', 'listaproblemas'] },
  { key: 'ultimaConsulta', label: 'Última consulta', synonyms: ['ultimaconsulta', 'dataultimaconsulta', 'ultconsulta'] },
  { key: 'pa', label: 'Último registo de PA', date: true, synonyms: ['pa', 'tensaoarterial', 'ultimapa'] },
  { key: 'hba1c', label: 'Última HbA1c', date: true, synonyms: ['hba1c', 'hemoglobinaglicada', 'ultimahba1c'] },
  { key: 'pe', label: 'Último exame dos pés', date: true, synonyms: ['pe', 'pediabetico', 'exumepes', 'examepes', 'pes'] },
  { key: 'microalb', label: 'Última microalbuminúria', date: true, synonyms: ['microalb', 'microalbuminuria', 'acr', 'ratioalbcreat'] },
  { key: 'imc', label: 'Último IMC', date: true, synonyms: ['imc', 'bmi', 'ultimoimc'] },
  { key: 'td', label: 'Última vacina Td', date: true, synonyms: ['td', 'vacinatd', 'tetano'] },
  { key: 'ccr', label: 'Último rastreio CCR', date: true, synonyms: ['ccr', 'psof', 'colonoscopia', 'rastreioccr'] },
  { key: 'ccu', label: 'Último rastreio CCU', date: true, synonyms: ['ccu', 'citologia', 'hpv', 'colpocitologia', 'rastreioccu'] },
  { key: 'mamografia', label: 'Última mamografia', date: true, synonyms: ['mamografia', 'mamo', 'rastreiomama'] },
];

export const INDICATOR_FIELDS = [
  { key: 'code', label: 'Código do indicador', required: true, synonyms: ['codigo', 'cod', 'code', 'indicador', 'idindicador', 'codindicador'] },
  { key: 'name', label: 'Nome do indicador', synonyms: ['nome', 'designacao', 'descricao', 'nomeindicador', 'indicador'] },
  { key: 'period', label: 'Período (mês)', required: true, synonyms: ['periodo', 'mes', 'data', 'anomes', 'mesreferencia', 'period'] },
  { key: 'num', label: 'Numerador', synonyms: ['numerador', 'num', 'n'] },
  { key: 'den', label: 'Denominador', synonyms: ['denominador', 'den', 'd'] },
  { key: 'value', label: 'Valor / resultado', synonyms: ['valor', 'resultado', 'value', 'taxa', 'proporcao'] },
];

export const AGENDA_FIELDS = [
  { key: 'hora', label: 'Hora', synonyms: ['hora', 'horario', 'time'] },
  { key: 'id', label: 'N.º de utente / processo', required: true, synonyms: ['nutente', 'numeroutente', 'utente', 'processo', 'nprocesso', 'id', 'sns'] },
  { key: 'tipo', label: 'Tipo de consulta', synonyms: ['tipo', 'tipologia', 'tipoconsulta', 'programa'] },
];

export function defaultState() {
  return {
    version: 1,
    settings: {
      medico: '',
      usf: '',
      anoContratual: new Date().getFullYear(),
      scoreMode: 'linear',
      projectionWindow: 6,
      lockMinutes: 10,
      ucReferencia: 2358,
      inactiveMonths: 36,
    },
    matrix: EXAMPLE_MATRIX.map((i) => ({ ...i, enabled: true })),
    rules: DEFAULT_RULES.map((r) => ({ ...r, enabled: true })),
    ucFactors: DEFAULT_UC_FACTORS.map((f) => ({ ...f })),
    chronicGroups: CHRONIC_GROUPS.map((g) => ({ ...g })),
    indicatorData: {},
    patients: [],
    patientsImportedAt: null,
    done: {},
    contacts: {},
    agenda: { date: null, items: [] },
    tasks: [],
  };
}
