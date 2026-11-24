# Bússola MGF

Aplicação para **Windows** de apoio ao médico de família numa **USF modelo B**. Funciona sem Internet e guarda os dados apenas no computador, cifrados com uma palavra-passe.

> Ferramenta independente de apoio. Não é um sistema oficial nem substitui o BI-CSP, o MIM@UF ou o SClínico. Em caso de diferença, prevalecem sempre os valores oficiais.

## O que faz

| Módulo | Para quê |
|---|---|
| **Os meus indicadores** | Valor atual de cada indicador, meta, estado (esperado / aceitável / fora) e IDE estimado. Mostra quantos **utentes faltam** para chegar ao esperado e quantos por mês até dezembro. Faz uma **projeção até 31/12** com a tendência dos últimos meses do ano contratual. Inclui um **simulador** («se fechar 10 utentes neste indicador, o IDE sobe X») e ordena os indicadores pelos **pontos de IDE por utente**. Tem um gráfico de evolução com faixas de referência e exporta para CSV. |
| **Cuidados em falta** | Cruza a lista de utentes com regras configuráveis (PA, HbA1c, pé diabético, microalbuminúria, rastreios do CCR, CCU e mama, Td, IMC…). Lista quem está em falta, **por ordem de prioridade**: dá mais peso aos indicadores onde cada utente vale mais IDE. Permite marcar como feito, registar o estado do contacto e **exportar a lista para convocatória** pelo secretariado. |
| **Pré-consulta** | Para cada utente da agenda do dia, mostra o que falta registar e para que indicadores conta («conta para 4 indicadores, faltam IMC e Td»). Tem botões «✓ feito», impressão e PDF. |
| **Lista e UC ponderadas** | Utentes inscritos, unidades ponderadas por grupo etário, diferença face à referência, pirâmide etária e grupos de risco (ICPC-2). Lista os utentes sem consulta há 36 meses ou mais e tem um **simulador de novas inscrições**. |
| **Tarefas não presenciais** | Renovações de receituário, resultados de MCDT, contactos indiretos, emails, relatórios e referenciações. Cada tarefa tem estado (pendente, feito, delegado), prazo, prioridade e **cronómetro do tempo gasto**. As estatísticas por tipo e período exportam para CSV. |

## Instalar

1. Descarregue o instalador `Bussola-MGF-Setup-x.y.z.exe`. Em alternativa, use a versão portátil `Bussola-MGF-Portatil-x.y.z.exe`, que não precisa de instalação.
   - Os executáveis são gerados automaticamente no GitHub Actions (workflow «Compilar para Windows»): abra a última execução e descarregue o artefacto **Bussola-MGF-Windows**.
2. O executável não tem assinatura digital, por isso o Windows SmartScreen pode avisar «O Windows protegeu o computador». Clique em **Mais informações → Executar mesmo assim**.
3. No primeiro arranque, defina uma palavra-passe com 8 ou mais caracteres. **Se a esquecer, os dados não podem ser recuperados.**
4. Para experimentar, use **Importar dados → Carregar dados de demonstração**. Todos os dados de demonstração são fictícios.

Requisitos: Windows 10 ou 11, de 64 bits.

📘 **Manual do utilizador:** [docs/Manual-Bussola-MGF.pdf](docs/Manual-Bussola-MGF.pdf). Explica como trabalhar com a app e como obter e preparar os dados.

## Importar os seus dados

Aceita **CSV** (separador `;` ou `,`, em UTF-8 ou Windows-1252) e **Excel `.xlsx`**. Os nomes das colunas não precisam de ser exatos: a app sugere a correspondência e pode corrigi-la antes de importar. Em **Importar dados** há um «Modelo CSV» para cada tipo. A pasta [`exemplos/`](exemplos/) tem ficheiros completos com dados fictícios.

- **Resultados de indicadores**: uma linha por indicador e mês, com código, período (`10/2026`, `2026-10` ou `out 2026`), numerador e denominador, ou só o valor. Exporte do BI-CSP ou do MIM@UF e, se preciso, ajuste o ficheiro a este formato.
- **Lista de utentes**: n.º de utente, data de nascimento, sexo, problemas (códigos ICPC-2 separados por espaço) e a data do último registo de cada cuidado. Por exemplo: *Última HbA1c*, *Último exame dos pés*, *Último rastreio CCR*. As colunas extra são guardadas e podem ser usadas em regras próprias.
- **Agenda do dia**: hora e n.º de utente. Os utentes também podem ser adicionados um a um.
- **Matriz de indicadores**: em **Configuração → Importar matriz**, com código, peso, sentido e limites aceitável e esperado. Veja `exemplos/matriz-exemplo.csv`.

> ⚠️ A **matriz que vem com a app é um exemplo** (códigos EX01 a EX11). Antes de usar os números a sério, substitua-a pela matriz de contratualização em vigor na sua USF: códigos, pesos e limiares. Confirme também os **fatores de ponderação** e a **UC de referência**, em Configuração.

## Como são feitas as contas

- **Pontuação de cada indicador**: 100% dentro do intervalo esperado e 0% fora do aceitável. Entre os dois, sobe de forma linear; em alternativa, há o modo por escalões, em que o aceitável vale 50%. O **IDE estimado** é a média das pontuações ponderada pelos pesos.
- **Utentes em falta**: o número mínimo de cumpridores a mais (ou de casos a menos, nos indicadores em que menor é melhor) para chegar ao limite do esperado, com o denominador atual.
- **Projeção**: regressão linear dos últimos meses (6 por omissão) **do ano contratual**, até dezembro. Os meses de anos anteriores não entram, porque muitos indicadores recomeçam a contar em janeiro.
- **Prioridade na lista de cuidados**: soma, para cada cuidado em falta, de 1 mais 10 × os pontos de IDE por utente do indicador associado.

## Segurança e privacidade

- Os dados ficam em `%APPDATA%\Bússola MGF\dados.bmgf`, **cifrados com AES-256-GCM**. A chave é derivada da palavra-passe com *scrypt*, e a palavra-passe nunca é guardada.
- A app **bloqueia sozinha** após 10 minutos sem atividade (configurável).
- **Não há acesso à Internet**: todos os pedidos de rede da interface são bloqueados e não há telemetria.
- A interface corre isolada (`contextIsolation` e `sandbox`) e sem acesso ao Node.
- As **cópias de segurança** (`.bmgf`) ficam cifradas. Os ficheiros **exportados** (CSV e PDF) **não** são cifrados: trate-os como dados de saúde e apague-os quando já não forem precisos. O mesmo vale para os ficheiros originais que importou.
- O tratamento de dados pessoais de saúde deve respeitar o RGPD e as orientações do encarregado de proteção de dados da sua ULS.

## Desenvolvimento

```bash
npm install
npm start               # abre a app (Electron)
npm test                # testes unitários (cálculos, importação, cifra)
npm run test:ui         # teste de fumo da interface (Chromium headless)
npm run test:electron   # teste de fumo da app Electron real (em Linux: xvfb-run -a npm run test:electron)
npm run dist            # instalador NSIS + portátil (em Windows; em Linux precisa de Wine)
npm run dist:zip        # versão em ZIP (funciona em qualquer sistema)
npm run exemplos        # gera de novo os ficheiros de exemplo
npm run manual          # gera de novo o manual em PDF (docs/Manual-Bussola-MGF.pdf)
```

Estrutura:

- `src/core/`: cálculos puros e testáveis (indicadores, regras, lista, tarefas, CSV, importação, dados de demonstração).
- `src/main/`: processo principal do Electron (janela, armazenamento cifrado, leitura de ficheiros).
- `src/renderer/`: interface (HTML, CSS e JavaScript, sem frameworks).
