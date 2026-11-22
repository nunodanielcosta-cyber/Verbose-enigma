# 🥫 Despensa

A despensa da família, sempre em dia: stock partilhado em tempo real, validades, lista de compras automática,
leitor de códigos de barras, receitas com plano semanal e comparação de preços entre lojas.

Sem build e sem frameworks: HTML, CSS e JavaScript simples. Os dados ficam no [Supabase](https://supabase.com) (grátis).

## O que faz

| | |
|---|---|
| **Stock** | Alimentar, bebidas, limpeza, higiene, casa, animais, bebé… Mínimo e máximo por produto, local, validade, "aberto em" com validade depois de aberto. |
| **Lista de compras** | Automática: quando um produto chega ao **mínimo**, entra na lista para comprar **até ao máximo**. Junta também o que falta para as **refeições planeadas** e itens adicionados à mão. Agrupa por corredor, por tipo ou pela loja mais barata. Um toque em ✓ e o produto entra no stock. |
| **Leitor de códigos** | Câmara do telemóvel. Produto novo → preenche nome, marca, foto e tamanho a partir do Open Food Facts (e bases irmãs para limpeza/higiene). Modo "Arrumar compras" (com escolha rápida de validade) e modo "Gastar". Modo contínuo para ler vários seguidos. |
| **Fruta e legumes** | Grelha com ~40 frutas e legumes: um toque para arrumar ou gastar. Validade automática ("dura X dias depois de comprado") e mínimo/máximo sugeridos. Lista editável em `js/produce.js`. |
| **Talão** | Fotografia do talão → cada linha vai para o produto certo (ou cria um novo). Entende pesos ("0,856 kg" de bananas ≈ 5 un) e quantidades ("2 X 0,89"); regista os preços. |
| **Validade** | Escolha rápida (+1 semana, +1 mês…), leitura da data com a câmara (OCR) e leitura automática quando o código é GS1 DataMatrix com validade. |
| **Preços** | Edge Function que procura cada produto no **Continente, Pingo Doce e Auchan**: o **mesmo produto** e o **mais barato da categoria** (por kg/L). Mostra o total por loja e a melhor combinação. Lidl e Mercadona não têm loja online em Portugal: preços manuais ou pelo talão. |
| **Receitas e plano** | Receitas com ingredientes ligados ao stock, plano semanal (almoço/jantar), "Cozinhei" desconta o stock, sugestões para **usar primeiro** o que está a expirar. |
| **Família** | Cada pessoa entra com o seu email; código de convite; histórico de quem fez o quê; alterações aparecem na hora em todos os telemóveis. |
| **Extras** | Comandos de voz ("gastei dois iogurtes", "falta lixívia"), leitura de talões, notificações, gastos por mês e por tipo, desperdício, sugestão de mínimo/máximo pelo consumo, modo escuro, funciona offline e instala-se como app. |

## Experimentar já

Abre a app e escolhe **"Experimentar com dados de exemplo"**: tudo funciona com dados de exemplo guardados só no browser
(exceto a procura automática de preços, que precisa do Supabase).

```sh
npm start            # ou: python3 -m http.server 8000  → http://localhost:8000
```

## Pôr a funcionar para a família (≈ 15 minutos)

### 1. Criar a base de dados
1. Cria uma conta em [supabase.com](https://supabase.com) → **New project** (região: *West EU*).
2. **SQL Editor → New query**, cola o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e carrega em **Run**.
3. **Authentication → Sign In / Providers → Email**: confirma que está ativo.
4. A entrada é feita pelo link que chega por email (no plano gratuito não é possível mudar o texto do email).
   O plano gratuito envia poucos emails por hora: cada pessoa só precisa de entrar uma vez por dispositivo.

### 2. Publicar a app (GitHub Pages)
1. No GitHub: **Settings → Pages → Deploy from a branch** → escolhe o branch e a pasta `/ (root)`.
2. Fica disponível em `https://<utilizador>.github.io/<repositório>/`.
3. No Supabase: **Authentication → URL Configuration** → em *Site URL* e *Redirect URLs* coloca esse endereço.

### 3. Ligar a app ao Supabase
Em **Project Settings → API** copia o *Project URL* e a *anon public key* para [`js/config.js`](js/config.js).
(A chave anon é pública por natureza; a segurança vem das regras do `schema.sql`: cada casa só vê os seus dados.)

### 4. Ativar a comparação de preços
**Pelo painel (sem instalar nada):** Edge Functions → *Deploy a new function* → *Via Editor* → nome `precos` →
apaga o código de exemplo e cola o conteúdo de [`supabase/precos-um-ficheiro.ts`](supabase/precos-um-ficheiro.ts) → *Deploy*.
(Esse ficheiro é gerado com `npm run bundle` a partir de `supabase/functions/precos/`.)

**Diagnóstico das lojas:** na função, botão *Test* com o corpo
`{"diagnose": true, "q": "leite meio gordo"}` — mostra o que cada loja devolve, útil para acertar os leitores.

**Ou pela linha de comandos:**
```sh
npx supabase login
npx supabase functions deploy precos --project-ref <REF do projeto>
```

### 5. Convidar a família
Na app: **Mais → Família → Convidar**. Cada pessoa abre o link, entra com o seu email e escolhe
"Juntar-me à família" com o código. No telemóvel: menu do browser → **Adicionar ao ecrã principal**.

## ⚠️ Sobre a comparação de preços
As lojas não têm API pública: a função lê as páginas de pesquisa dos sites (uso pessoal, com cache de 6 h e poucos pedidos de cada vez).
- Testado contra os sites reais em novembro de 2026 (Continente, Pingo Doce e Auchan a funcionar). Se uma loja mudar o site e deixar
  de devolver resultados, a app avisa ("Sem resposta de: …") e as outras continuam a funcionar.
- Para corrigir uma loja, normalmente basta ajustar o URL ou os seletores em
  [`supabase/functions/precos/stores.js`](supabase/functions/precos/stores.js) (`SFCC_SELECTORS`).
- Os termos de uso dos sites podem não permitir leitura automática; usa com moderação.
- Preços online podem diferir da loja física. A Lidl e a Mercadona não têm loja online de alimentação em Portugal.
- Se o "mesmo produto" apanhar uma variante errada (ex.: integral, húmido), acrescenta a palavra a `VARIANTS` em `lib.js`.

## Estrutura

```
index.html, css/app.css      página e visual (cores em variáveis no topo do CSS)
js/config.js                 ligação ao Supabase
js/domain.js                 regras: lista de compras, validades, receitas, voz, talões (sem interface, testado)
js/store.js                  dados em memória + sincronização (Supabase em tempo real ou modo demonstração)
js/auth.js                   entrar, criar casa, juntar-se com código
js/views/*.js                ecrãs: início, stock, produto, lista, preços, receitas, mais
js/scanner.js, ocr.js        câmara: códigos de barras, datas e talões
js/voice.js, notify.js       voz e notificações
supabase/schema.sql          tabelas e regras de segurança
supabase/functions/precos/   procura de preços nas lojas (lib.js = lógica testada, stores.js = um leitor por loja)
tests/                       npm install && npm test
```

Bibliotecas carregadas do CDN só quando são precisas: `@supabase/supabase-js`, `barcode-detector` (quando o browser
não tem leitor nativo, ex.: iPhone) e `tesseract.js` (OCR).
