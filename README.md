# 🥫 Despensa

Web app simples para catalogar o que há na despensa (e frigorífico, congelador…).

## Funcionalidades
- Adicionar/editar produtos: nome, quantidade, unidade, categoria, local, validade, mínimo e notas
- Botões **− / +** para atualizar a quantidade num toque
- Pesquisa, filtros por categoria e local, ordenação por nome/validade/quantidade
- Alertas de produtos fora de validade ou a expirar nos próximos 7 dias
- **Lista de compras** automática: produtos esgotados ou abaixo do mínimo definido
- Funciona offline e pode ser instalada no telemóvel ("Adicionar ao ecrã principal")
- Exportar/Importar backup em JSON

## Como usar
Não há dependências nem build. Basta abrir `index.html` no browser, ou servir a pasta:

```sh
python3 -m http.server 8000   # depois abrir http://localhost:8000
```

### Publicar grátis no GitHub Pages
Settings → Pages → *Deploy from a branch* → escolher o branch e a pasta `/ (root)`.

## Onde ficam os dados
No `localStorage` do browser, em cada dispositivo. Por isso:
- Dispositivos diferentes têm dados diferentes — usa **Exportar/Importar** para passar dados de um para o outro.
- Faz backup de vez em quando (limpar os dados do site apaga a despensa).

## Estrutura
| Ficheiro | Para quê |
|---|---|
| `index.html` | Estrutura da página e formulário |
| `style.css` | Aspeto (inclui modo escuro) |
| `app.js` | Toda a lógica (~250 linhas, comentada) |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Modo offline e instalação como app |
