# SOS Truck Service — Gestão de Fichas e Peças

Sistema web completo para o controle de manutenção de frota: cadastro de caminhões,
fichas de inspeção mecânica, registro de problemas com fotos, solicitação de peças,
cotação com vários fornecedores, geração de ordens de compra e acompanhamento da
entrega e instalação.

Feito para ser usado **com uma mão, no celular, dentro da oficina** — e também no
computador da administração. Todo o sistema está em português do Brasil, com valores
em real e datas no formato DD/MM/AAAA.

---

## Como rodar

```bash
npm install          # instala as dependências
npm run seed         # cria o banco, as categorias de peças e os dados de demonstração
npm start            # sobe o servidor em http://localhost:3000
```

Durante o desenvolvimento, `npm run dev` reinicia o servidor a cada alteração.

### Acessos de demonstração

| Perfil        | E-mail                      | Senha      |
|---------------|-----------------------------|------------|
| Administração | admin@sostruck.com.br       | `sos12345` |
| Mecânico      | mecanico@sostruck.com.br    | `sos12345` |
| Mecânico      | jonas@sostruck.com.br       | `sos12345` |

> Válido apenas em ambiente de desenvolvimento/seed com dados de demonstração.
> Troque as senhas no primeiro acesso em *Configurações › Minha conta*.

### Começar com os dados reais da SOS Truck Service

```bash
npm run seed -- --reset --sem-demo
```

Isso limpa o banco, mantém as 22 categorias e 191 subcategorias de peças, recria os
usuários padrão e **não** insere nenhum dado de exemplo. Troque as senhas no primeiro
acesso em *Configurações › Minha conta*.

### Configuração

Copie `.env.example` para `.env` e ajuste o que for necessário:

| Variável           | Para que serve                                    | Padrão                  |
|--------------------|---------------------------------------------------|-------------------------|
| `PORT`             | Porta do servidor HTTP                            | `3000`                  |
| `JWT_SECRET`       | Segredo que assina a sessão — **troque sempre**   | valor de desenvolvimento|
| `JWT_EXPIRES`      | Duração da sessão                                 | `12h`                   |
| `DB_PATH`          | Arquivo do banco SQLite                           | `./data/sos-truck.db`   |
| `UPLOAD_DIR`       | Pasta das fotos originais                         | `./data/uploads`        |
| `MAX_UPLOAD_BYTES` | Tamanho máximo por foto                           | 15 MB                   |

Em produção, rode com `NODE_ENV=production` atrás de HTTPS — o cookie de sessão passa
a ser enviado apenas por conexão segura.

---

## O fluxo completo

```
Mecânico                                    Administração
────────                                    ─────────────
1. Cadastra ou seleciona o caminhão
2. Abre a ficha (rascunho)  ─────┐
3. Registra os problemas         │
4. Anexa fotos                   │
5. Solicita as peças             │
6. Envia para a administração ───┴──────►  7. Analisa a ficha na fila
                                            (pode devolver para correção)
                                        ►  8. Aceita e cria a cotação
                                        ►  9. Lança as propostas manualmente
                                        ► 10. Compara e escolhe o fornecedor
                                        ► 11. Aprova a cotação
                                        ► 12. Gera a ordem de compra (PDF)
                                        ► 13. Registra o recebimento
14. Confirma que recebeu a peça  ◄──────
15. Marca como instalada
16. Finaliza o serviço mecânico  ───────►  17. Finaliza a ficha
```

Cada passo grava **usuário, data e hora** no histórico e dispara notificações
para quem precisa agir.

---

## Perfis de acesso

**Mecânico** — cadastra e consulta caminhões, cria fichas, registra problemas, anexa
fotos pela câmera ou galeria, solicita peças com quantidade, urgência e observações,
acompanha o status, confirma o recebimento e a instalação e finaliza o serviço.

**Administração** — tudo o que o mecânico faz, mais: analisar e devolver fichas,
cadastrar fornecedores, criar cotações, lançar propostas, comparar valores, aprovar,
gerar ordens de compra, controlar recebimento, ver relatórios e gerenciar usuários,
empresas e configurações.

O mecânico **nunca** vê valores, margens, fornecedores ou dados financeiros. Essa
separação é aplicada no servidor, não apenas na tela: as rotas administrativas
respondem `403` e as consultas de peças e fichas omitem os campos de valor.

---

## Telas

| Área        | Telas |
|-------------|-------|
| Acesso      | Login · Recuperação de senha · Redefinição de senha |
| Operação    | Painel do mecânico · Painel administrativo · Fila de fichas · Lista de fichas · Nova ficha · Detalhes da ficha (com problemas, peças, fotos, comentários e histórico) |
| Frota       | Cadastro de caminhões · Detalhes e histórico do caminhão |
| Peças       | Consulta de peças com filtros por situação, urgência e categoria |
| Compras     | Central de cotações · Comparação de fornecedores · Ordens de compra · Detalhe da ordem · Controle de recebimento · Cadastro de fornecedores |
| Gestão      | Relatórios · Gestão de usuários · Configurações e empresas |

O cadastro de problemas e a solicitação de peças acontecem em janelas dentro da
ficha — assim o mecânico não perde o contexto durante a inspeção.

---

## O que o sistema garante

- **Numeração automática** — `FIC-2026-0001`, `COT-2026-0001`, `OC-2026-0001`,
  sequenciais por ano e geradas dentro de uma transação.
- **Sem caminhões duplicados** — placa e chassi são únicos, com aviso em tempo real
  durante a digitação.
- **Validações de envio** — a ficha só vai para a administração com caminhão,
  diagnóstico, mecânico responsável e ao menos um problema. A peça exige categoria,
  nome, quantidade e motivo da troca.
- **Nada é apagado** — fichas, cotações, ordens e peças são canceladas, nunca
  excluídas, e sempre com confirmação e motivo obrigatório.
- **Fotos originais preservadas** — remover uma foto desfaz apenas o vínculo; o
  arquivo continua em disco.
- **Cálculo automático** — subtotal, desconto, frete, total por proposta, total por
  fornecedor, total geral e a diferença entre a proposta mais barata e a mais cara.
- **A melhor proposta é destacada, nunca escolhida sozinha** — a decisão é sempre
  de uma pessoa, e é possível usar fornecedores diferentes na mesma ficha.
- **Histórico completo** — toda ação registra quem fez, quando e de qual IP.

---

## Categorias de peças

As peças são obrigatoriamente classificadas pelo sistema do caminhão, em dois níveis
(22 categorias e 191 subcategorias):

Motor · Alimentação e injeção · Admissão e escapamento · Arrefecimento · Lubrificação ·
Caixa de câmbio · Embreagem · Diferencial · Transmissão e cardã · Suspensão · Direção ·
Freios · Elétrico e eletrônico · Baterias e alternador · Chassi · Cabine e acabamento ·
Rodas e pneus · Iluminação e sinalização · Pneumático · Hidráulico · Acessórios · Outros

Exemplo: `Motor › Cabeçote` · `Freios › Lonas e pastilhas` · `Suspensão › Bolsa de ar`

---

## Documentos em PDF

- **Ordem de compra** — dados do fornecedor, do caminhão e da empresa, itens com
  valores, totais e campos de assinatura. Pode ser impressa, baixada ou compartilhada.
- **Ficha de inspeção** — caminhão, diagnóstico, problemas, peças, comunicação e a
  confirmação do mecânico. Quando o mecânico gera o PDF, os valores são omitidos.

---

## Tecnologia

| Camada     | Escolha |
|------------|---------|
| Servidor   | Node.js + Express 5 |
| Banco      | SQLite (better-sqlite3) com WAL, chaves estrangeiras e índices |
| Sessão     | JWT em cookie `httpOnly`, senhas com bcrypt, bloqueio após tentativas seguidas |
| Uploads    | Multer, arquivos originais em pastas por mês |
| PDF        | PDFKit |
| Interface  | JavaScript puro (módulos ES), sem build e sem framework |

Não há etapa de compilação: o que está em `public/` é o que roda no navegador.

### Estrutura

```
server/
  index.js            servidor, rotas e tratamento de erros
  db.js               esquema do banco e numeração sequencial
  seed.js             categorias, configurações e dados de demonstração
  lib/                auth, validação, histórico, fotos, PDF, formatação pt-BR
  routes/             auth, caminhões, fichas, peças, cotações, ordens, relatórios…
public/
  index.html          casca do aplicativo
  css/app.css         identidade visual completa
  js/                 api, estado, navegação, componentes
  js/views/           uma tela por arquivo
data/
  sos-truck.db        banco de dados
  uploads/AAAA-MM/    fotos originais
scripts/
  teste-api.sh        83 verificações de ponta a ponta na API
  teste-navegador.js  37 verificações na interface real (requer Playwright)
```

---

## Testes

Com o servidor rodando em outra porta para não misturar com os dados de trabalho:

```bash
PORT=3311 npm start &                # sobe o servidor de teste
BASE=http://localhost:3311 bash scripts/teste-api.sh
```

O roteiro percorre login, permissões por perfil, cadastro de caminhões com bloqueio de
duplicidade, validações da ficha, fluxo completo até a instalação da peça, cálculos da
cotação, geração de PDF, cancelamentos com confirmação, relatórios e exportação CSV.

Para testar a interface de verdade em um navegador:

```bash
npm install --no-save playwright
node scripts/teste-navegador.js /tmp/tiros
```

Ele navega como mecânico no tamanho de um celular e como administração no computador,
executa o fluxo inteiro e guarda as capturas de tela na pasta indicada.

---

## Identidade visual

Vermelho `#C81E1E` como cor principal, grafite `#23262B` nos cabeçalhos e menus,
fundos claros para leitura, cantos levemente arredondados e status sempre
identificados por cor. Botões com no mínimo 46 px de altura, campos com 48 px e
menu inferior fixo no celular — pensado para quem está de luva, em pé, ao lado do
caminhão.
