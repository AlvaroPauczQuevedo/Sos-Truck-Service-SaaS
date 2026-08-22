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
usuários padrão e **não** insere nenhum dado de exemplo.

Com `NODE_ENV=production` o seed é mais rígido sozinho: **nunca** cria dados de
demonstração e **não usa senha padrão** — sorteia uma senha para cada usuário e a
mostra uma única vez no console. Anote na hora; ela não aparece de novo. (Se
esquecer, a administração redefine em *Usuários › Redefinir senha*.)

### Configuração

Copie `.env.example` para `.env` e ajuste o que for necessário:

| Variável           | Para que serve                                    | Padrão                  |
|--------------------|---------------------------------------------------|-------------------------|
| `PORT`             | Porta do servidor HTTP                            | `3000`                  |
| `JWT_SECRET`       | Segredo que assina a sessão (mín. 32 caracteres)  | gerado automaticamente  |
| `JWT_EXPIRES`      | Duração da sessão                                 | `12h`                   |
| `DB_PATH`          | Arquivo do banco SQLite                           | `./data/sos-truck.db`   |
| `UPLOAD_DIR`       | Pasta das fotos originais                         | `./data/uploads`        |
| `MAX_UPLOAD_BYTES` | Tamanho máximo por foto                           | 15 MB                   |
| `TRUST_PROXY`      | Só ligue se houver proxy real na frente           | desligado               |
| `LIMITE_REQ_MINUTO`| Teto de requisições por IP por minuto na API      | `300`                   |

Em produção, rode com `NODE_ENV=production` atrás de HTTPS — o cookie de sessão passa
a ser enviado apenas por conexão segura.

#### Sobre o `TRUST_PROXY`

Deixe **vazio** quando o Node atende direto. Ligar sem proxy real é perigoso: o
`X-Forwarded-For` passa a ser aceito como verdade, e como qualquer um pode mandar
esse cabeçalho, o bloqueio de força bruta do login vira decoração — basta variar o
valor para ganhar um IP novo a cada tentativa. Preencha (`TRUST_PROXY=1`) apenas se
houver Nginx, Apache, Cloudflare ou equivalente na frente.

#### Sobre o `JWT_SECRET`

Quem souber este valor fabrica uma sessão de administrador sem saber senha nenhuma.
Por isso **não existe valor padrão no código**. Gere o seu:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Se `JWT_SECRET` ficar em branco — ou vier com o valor de exemplo, ou com menos de 32
caracteres — o sistema avisa no console e usa um segredo aleatório que ele mesmo gera
e guarda em `data/.segredo-sessao` (fora do repositório). A oficina continua
funcionando, mas o certo é definir o seu no `.env`. **Ao trocar o segredo, todas as
sessões abertas caem** e cada um faz login de novo.

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
- **O link de redefinição nunca é público** — a tela "Esqueci minha senha" registra o
  pedido e manda procurar a administração, mas **não devolve o link**. Quem o entrega
  é a administração, em *Usuários › Gerar link*. Devolvê-lo na tela de login daria a
  conta a qualquer um que soubesse o e-mail do administrador.
- **Sair do sistema encerra a sessão de verdade** — o token daquele aparelho para de
  valer no servidor na hora, não só some do navegador.
- **Trocar a senha desconecta os outros aparelhos** — quem troca a senha continua
  conectado onde está; os demais caem. Vale também quando a administração redefine a
  senha de alguém ou inativa um usuário.
- **Senha de pelo menos 8 caracteres**, com as óbvias recusadas (`sos12345`,
  `senha123`, sequências, um caractere repetido, o próprio e-mail). Sem exigir
  símbolo — isso só empurra todo mundo para `Senha@123`.
- **Só entra imagem de verdade** — o formato é conferido nos primeiros bytes do
  arquivo, não no que o navegador diz estar enviando.
- **Força bruta barrada por e-mail + IP**, com o IP resolvido pelo servidor, sem
  aceitar cabeçalho forjado. Há ainda um teto geral de requisições por minuto.

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

### As fotos saem impressas

**As fotos tiradas na oficina são impressas junto com o documento**, no fim, agrupadas
pelo que documentam — para as tabelas continuarem limpas:

- **Na ficha:** *Fotos gerais da ficha*, depois *Problema 01 — …*, depois *Peça 01 — …*
- **Na ordem de compra:** as fotos das peças compradas, por item, para o fornecedor
  conferir que separou a peça certa

Cada foto sai numa moldura com a legenda, quem enviou e a data. Sobre a impressão:

- **A foto é reduzida só para o papel.** O arquivo original em disco continua
  intacto; a cópia de impressão tem no máximo 1100 px e vai para uma pasta de cache
  (`data/uploads/.impressao/`), preparada já no momento do envio. Assim uma ficha com
  12 fotos vira um PDF de menos de 0,5 MB, e não de 40 MB.
- **A rotação do celular é corrigida** pela etiqueta EXIF — foto tirada em pé sai em
  pé, e não deitada.
- **Limites:** 8 fotos por problema/peça e 32 por documento. O que passar disso fica
  registrado com uma nota no PDF e continua acessível no sistema.
- **JPG e PNG são impressos.** HEIC e WEBP não podem ser embutidos em PDF sem
  biblioteca nativa: no lugar da imagem sai um aviso, e a foto segue visível no
  sistema. (Ao enviar pelo navegador, o iPhone já converte HEIC em JPG.)

---

## Tecnologia

| Camada     | Escolha |
|------------|---------|
| Servidor   | Node.js + Express 5 |
| Banco      | SQLite (sql.js) com chaves estrangeiras e índices |
| Sessão     | JWT em cookie `httpOnly`, senhas com bcrypt, bloqueio após tentativas seguidas |
| Uploads    | Multer, arquivos originais em pastas por mês |
| PDF        | PDFKit |
| Fotos no PDF | jpeg-js + pngjs — JavaScript puro, sem compilador C |
| Interface  | JavaScript puro (módulos ES), sem build e sem framework |

Não há etapa de compilação: o que está em `public/` é o que roda no navegador.

### Estrutura

```
server/
  index.js            servidor, rotas e tratamento de erros
  db.js               esquema do banco e numeração sequencial
  seed.js             categorias, configurações e dados de demonstração
  lib/                auth, validação, histórico, fotos, imagem, PDF, formatação pt-BR
  routes/             auth, caminhões, fichas, peças, cotações, ordens, relatórios…
public/
  index.html          casca do aplicativo
  css/app.css         identidade visual completa
  js/                 api, estado, navegação, componentes
  js/views/           uma tela por arquivo
data/
  sos-truck.db        banco de dados
  uploads/AAAA-MM/    fotos originais (nunca alteradas)
  uploads/.impressao/ cópias reduzidas usadas nos PDFs (cache, pode ser apagada)
scripts/
  teste-api.sh        88 verificações de ponta a ponta na API
  teste-navegador.js  37 verificações na interface real (requer Playwright)
  teste-fotos-pdf.js  17 verificações do preparo das fotos para impressão
  teste-seguranca.js  36 verificações das defesas de acesso (sessão, senha, CSP…)
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
