#!/usr/bin/env bash
# Teste funcional ponta a ponta da API do SOS Truck Service.
set -u
BASE="${BASE:-http://localhost:3311}"
TMP="$(mktemp -d)"
OK=0; FALHA=0

c() { curl -s --noproxy '*' "$@"; }
adm() { c -b "$TMP/adm.txt" "$@"; }
mec() { c -b "$TMP/mec.txt" "$@"; }

verificar() { # nome | esperado_regex | conteudo
  if printf '%s' "$3" | grep -qE "$2"; then echo "  ok   $1"; OK=$((OK+1));
  else echo "  FALHA $1"; echo "        esperado /$2/ em: $(printf '%s' "$3" | head -c 400)"; FALHA=$((FALHA+1)); fi
}

echo "== Autenticação =="
c -c "$TMP/adm.txt" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"admin@sostruck.com.br","senha":"sos12345"}' > "$TMP/r"
verificar "login da administração" '"perfil":"admin"' "$(cat $TMP/r)"
c -c "$TMP/mec.txt" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' \
  -d '{"email":"mecanico@sostruck.com.br","senha":"sos12345"}' > "$TMP/r"
verificar "login do mecânico" '"perfil":"mecanico"' "$(cat $TMP/r)"
verificar "bloqueio sem sessão" 'Sessão expirada' "$(c $BASE/api/painel)"
verificar "recuperação de senha" 'link_recuperacao' \
  "$(c -X POST $BASE/api/auth/recuperar-senha -H 'Content-Type: application/json' -d '{"email":"mecanico@sostruck.com.br"}')"

echo "== Permissões por perfil =="
verificar "mecânico não acessa fornecedores" 'exclusiva da administração' "$(mec $BASE/api/fornecedores)"
verificar "mecânico não acessa cotações"     'exclusiva da administração' "$(mec $BASE/api/cotacoes)"
verificar "mecânico não acessa ordens"       'exclusiva da administração' "$(mec $BASE/api/ordens)"
verificar "mecânico não acessa relatórios"   'exclusiva da administração' "$(mec $BASE/api/relatorios/geral)"
verificar "mecânico não lista usuários"      'exclusiva da administração' "$(mec $BASE/api/usuarios)"
verificar "administração acessa fornecedores" '"itens"' "$(adm $BASE/api/fornecedores)"

echo "== Painéis =="
verificar "painel administrativo"  'fichas_aguardando_analise' "$(adm $BASE/api/painel)"
verificar "painel do mecânico"     'minhas_fichas_abertas'     "$(mec $BASE/api/painel)"
verificar "painel oculta finanças do mecânico" 'ausente' \
  "$(mec $BASE/api/painel | grep -q financeiro && echo presente || echo ausente)"

echo "== Caminhões =="
verificar "listagem de caminhões" '"total":6' "$(adm "$BASE/api/caminhoes")"
verificar "busca por placa"       'ABC1D23'   "$(adm "$BASE/api/caminhoes?busca=ABC1D23")"
verificar "busca rápida"          'F-101'     "$(adm "$BASE/api/caminhoes/busca-rapida?termo=F-10")"
verificar "detalhe com histórico" '"fichas"'  "$(adm $BASE/api/caminhoes/1)"

NOVO=$(mec -X POST "$BASE/api/caminhoes" -H 'Content-Type: application/json' \
  -d '{"placa":"XYZ9A88","chassi":"9BM111222333444AA","codigo_frota":"F-999","marca":"Scania","modelo":"P360","ano_fabricacao":2020,"ano_modelo":2021,"km_atual":150000,"tipo":"Truck / Toco","cor":"Branco","empresa_id":1,"motorista_nome":"Teste Motorista","motorista_telefone":"41999998888"}')
verificar "mecânico cadastra caminhão" '"placa":"XYZ9A88"' "$NOVO"
ID_NOVO=$(printf '%s' "$NOVO" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
verificar "bloqueio de placa duplicada" 'já existe|Já existe' \
  "$(mec -X POST "$BASE/api/caminhoes" -H 'Content-Type: application/json' -d '{"placa":"XYZ-9A88","marca":"Volvo"}')"
verificar "bloqueio de chassi duplicado" 'chassi já pertence' \
  "$(mec -X POST "$BASE/api/caminhoes" -H 'Content-Type: application/json' -d '{"placa":"AAA1B11","chassi":"9BM111222333444AA"}')"
verificar "validação de placa inválida" 'Placa inválida' \
  "$(mec -X POST "$BASE/api/caminhoes" -H 'Content-Type: application/json' -d '{"placa":"123"}')"
verificar "verificação de duplicidade" '"placa":\{' "$(mec "$BASE/api/caminhoes/verificar-duplicidade?placa=XYZ9A88")"

echo "== Ficha: criação e validações =="
FICHA=$(mec -X POST "$BASE/api/fichas" -H 'Content-Type: application/json' \
  -d "{\"caminhao_id\":$ID_NOVO,\"km\":151000,\"motivo_entrada\":\"Teste automatizado\",\"relato_motorista\":\"Ruído na cabine\",\"prioridade\":\"alta\"}")
verificar "abertura de ficha com número automático" 'FIC-[0-9]{4}-[0-9]{4}' "$FICHA"
FID=$(printf '%s' "$FICHA" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
verificar "ficha nasce como rascunho" '"status":"rascunho"' "$FICHA"
verificar "envio bloqueado sem diagnóstico" 'diagnóstico' \
  "$(mec -X POST "$BASE/api/fichas/$FID/enviar" -H 'Content-Type: application/json' -d '{"assinatura":"Carlos"}')"

mec -X PUT "$BASE/api/fichas/$FID" -H 'Content-Type: application/json' \
  -d '{"km":151000,"motivo_entrada":"Teste automatizado","diagnostico":"Buchas da suspensão da cabine ressecadas.","prioridade":"alta","servicos_recomendados":"Troca das buchas"}' > /dev/null
verificar "envio bloqueado sem problema" 'problema encontrado' \
  "$(mec -X POST "$BASE/api/fichas/$FID/enviar" -H 'Content-Type: application/json' -d '{"assinatura":"Carlos"}')"

PROB=$(mec -X POST "$BASE/api/fichas/$FID/problemas" -H 'Content-Type: application/json' \
  -d '{"titulo":"Buchas da cabine ressecadas","descricao":"Cabine batendo em lombadas","sistema":"Cabine e acabamento","gravidade":"media","servico_necessario":"Troca das buchas","impede_uso":false}')
verificar "cadastro de problema" '"titulo":"Buchas da cabine ressecadas"' "$PROB"
PROB_ID=$(printf '%s' "$PROB" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
verificar "sistema inválido rejeitado" 'Valor inválido' \
  "$(mec -X POST "$BASE/api/fichas/$FID/problemas" -H 'Content-Type: application/json' -d '{"titulo":"Teste","sistema":"Inexistente"}')"

echo "== Peças =="
CATS=$(mec "$BASE/api/pecas/categorias")
verificar "árvore de categorias" 'subcategorias' "$CATS"
CAT_ID=$(printf '%s' "$CATS" | python3 -c "import json,sys;d=json.load(sys.stdin);c=[x for x in d['itens'] if x['nome']=='Cabine e acabamento'][0];print(c['id'])")
SUB_ID=$(printf '%s' "$CATS" | python3 -c "import json,sys;d=json.load(sys.stdin);c=[x for x in d['itens'] if x['nome']=='Cabine e acabamento'][0];print([s for s in c['subcategorias'] if s['nome']=='Suspensão da cabine'][0]['id'])")
verificar "peça sem motivo é rejeitada" 'Motivo da troca' \
  "$(mec -X POST "$BASE/api/fichas/$FID/pecas" -H 'Content-Type: application/json' -d "{\"categoria_id\":$CAT_ID,\"nome\":\"Bucha\",\"quantidade\":2}")"
verificar "peça sem categoria é rejeitada" 'Categoria' \
  "$(mec -X POST "$BASE/api/fichas/$FID/pecas" -H 'Content-Type: application/json' -d '{"nome":"Bucha","quantidade":2,"motivo_troca":"Desgaste"}')"
PECA=$(mec -X POST "$BASE/api/fichas/$FID/pecas" -H 'Content-Type: application/json' \
  -d "{\"categoria_id\":$CAT_ID,\"subcategoria_id\":$SUB_ID,\"problema_id\":$PROB_ID,\"nome\":\"Kit de buchas da suspensão da cabine\",\"descricao\":\"Kit completo\",\"codigo_referencia\":\"KB-CAB-01\",\"marca_preferencial\":\"Sabó\",\"quantidade\":2,\"unidade\":\"KIT\",\"posicao\":\"Dianteiro\",\"tipo_peca\":\"original\",\"urgencia\":\"alta\",\"motivo_troca\":\"Buchas ressecadas causando ruído\"}")
verificar "solicitação de peça" 'Kit de buchas' "$PECA"
PECA_ID=$(printf '%s' "$PECA" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
verificar "mecânico não vê valores da peça" 'ausente' \
  "$(printf '%s' "$PECA" | grep -q 'valor_aprovado\|fornecedor_escolhido' && echo presente || echo ausente)"
verificar "subcategoria de outra categoria é rejeitada" 'não pertence' \
  "$(mec -X POST "$BASE/api/fichas/$FID/pecas" -H 'Content-Type: application/json' -d "{\"categoria_id\":$CAT_ID,\"subcategoria_id\":1,\"nome\":\"Peça de teste\",\"quantidade\":1,\"motivo_troca\":\"teste de validação\"}")"

echo "== Fluxo da ficha =="
verificar "envio para administração" '"status":"aguardando_analise"' \
  "$(mec -X POST "$BASE/api/fichas/$FID/enviar" -H 'Content-Type: application/json' -d '{"assinatura":"Carlos Ferreira"}')"
verificar "ficha bloqueada após envio" 'não pode mais ser alterada' \
  "$(mec -X PUT "$BASE/api/fichas/$FID" -H 'Content-Type: application/json' -d '{"diagnostico":"alterado"}')"
verificar "administração recebe notificação" 'Nova ficha para análise' "$(adm $BASE/api/notificacoes)"
verificar "devolução exige motivo" 'obrigatório' \
  "$(adm -X POST "$BASE/api/fichas/$FID/devolver" -H 'Content-Type: application/json' -d '{}')"
verificar "devolução para correção" '"status":"devolvida"' \
  "$(adm -X POST "$BASE/api/fichas/$FID/devolver" -H 'Content-Type: application/json' -d '{"motivo":"Faltou informar o código da peça original."}')"
verificar "mecânico notificado da devolução" 'devolvida para correção' "$(mec $BASE/api/notificacoes)"
verificar "mecânico volta a editar" '"numero"' \
  "$(mec -X PUT "$BASE/api/fichas/$FID" -H 'Content-Type: application/json' -d '{"km":151000,"diagnostico":"Buchas da suspensão da cabine ressecadas. Código original SC-778812.","prioridade":"alta"}')"
mec -X POST "$BASE/api/fichas/$FID/enviar" -H 'Content-Type: application/json' -d '{"assinatura":"Carlos Ferreira"}' > /dev/null
verificar "ficha aceita pela administração" '"status":"em_cotacao"' \
  "$(adm -X POST "$BASE/api/fichas/$FID/aceitar" -H 'Content-Type: application/json' -d '{}')"

echo "== Cotação =="
COT=$(adm -X POST "$BASE/api/cotacoes" -H 'Content-Type: application/json' -d "{\"ficha_id\":$FID}")
verificar "cotação com número automático" 'COT-[0-9]{4}-[0-9]{4}' "$COT"
CID=$(printf '%s' "$COT" | python3 -c "import json,sys;print(json.load(sys.stdin)['cotacao']['id'])")
verificar "cotação duplicada bloqueada" 'já possui a cotação' \
  "$(adm -X POST "$BASE/api/cotacoes" -H 'Content-Type: application/json' -d "{\"ficha_id\":$FID}")"
P1=$(adm -X POST "$BASE/api/cotacoes/$CID/propostas" -H 'Content-Type: application/json' \
  -d "{\"peca_id\":$PECA_ID,\"fornecedor_id\":1,\"marca_oferecida\":\"Sabó\",\"codigo_peca\":\"SB-778812\",\"valor_unitario\":320.50,\"desconto\":20,\"frete\":45,\"prazo_entrega_dias\":5,\"forma_pagamento\":\"Boleto 30 dias\",\"garantia\":\"6 meses\",\"disponibilidade\":\"Em estoque\",\"vendedor_nome\":\"Marcos\"}")
verificar "proposta 1 registrada" '"total_propostas":1' "$P1"
verificar "cálculo automático do total" '"valor_total":666' "$P1"
adm -X POST "$BASE/api/cotacoes/$CID/propostas" -H 'Content-Type: application/json' \
  -d "{\"peca_id\":$PECA_ID,\"fornecedor_id\":2,\"marca_oferecida\":\"Original\",\"valor_unitario\":295,\"desconto\":0,\"frete\":60,\"prazo_entrega_dias\":3,\"forma_pagamento\":\"Boleto 30/60\",\"disponibilidade\":\"Em estoque\"}" > "$TMP/p2"
verificar "proposta 2 registrada" '"total_propostas":2' "$(cat $TMP/p2)"
verificar "menor valor destacado" '"menor_valor":true' "$(cat $TMP/p2)"
verificar "diferença entre fornecedores calculada" '"diferenca_menor"' "$(cat $TMP/p2)"
verificar "nenhuma proposta pré-selecionada" '"pecas_selecionadas":0' "$(cat $TMP/p2)"
verificar "desconto maior que o total é rejeitado" 'desconto não pode ser maior' \
  "$(adm -X POST "$BASE/api/cotacoes/$CID/propostas" -H 'Content-Type: application/json' -d "{\"peca_id\":$PECA_ID,\"fornecedor_id\":1,\"valor_unitario\":100,\"desconto\":99999}")"
PROP_ID=$(cat "$TMP/p2" | python3 -c "
import json,sys
d=json.load(sys.stdin)
p=[x for x in d['itens'][0]['propostas'] if x['menor_valor']][0]
print(p['id'])")
verificar "seleção manual do fornecedor" '"pecas_selecionadas":1' \
  "$(adm -X POST "$BASE/api/cotacoes/propostas/$PROP_ID/selecionar" -H 'Content-Type: application/json' -d '{}')"
adm -X POST "$BASE/api/cotacoes/$CID/enviar-aprovacao" -H 'Content-Type: application/json' -d '{}' > /dev/null
verificar "aprovação da cotação" '"status":"aprovada"' \
  "$(adm -X POST "$BASE/api/cotacoes/$CID/aprovar" -H 'Content-Type: application/json' -d '{"confirmar":true}')"

echo "== Ordem de compra =="
verificar "prévia agrupada por fornecedor" '"grupos"' "$(adm $BASE/api/ordens/previa/$CID)"
OC=$(adm -X POST "$BASE/api/ordens" -H 'Content-Type: application/json' \
  -d "{\"cotacao_id\":$CID,\"fornecedor_id\":2,\"forma_pagamento\":\"Boleto 30/60\",\"endereco_entrega\":\"Oficina SOS — Curitiba/PR\",\"observacoes\":\"Entregar aos cuidados da oficina\"}")
verificar "ordem com número automático" 'OC-[0-9]{4}-[0-9]{4}' "$OC"
OID=$(printf '%s' "$OC" | python3 -c "import json,sys;print(json.load(sys.stdin)['id'])")
verificar "total da ordem calculado" '"total":650' "$OC"
verificar "ordem sem peças pendentes bloqueada" 'Não há peças aprovadas pendentes' \
  "$(adm -X POST "$BASE/api/ordens" -H 'Content-Type: application/json' -d "{\"cotacao_id\":$CID,\"fornecedor_id\":2}")"
c -o "$TMP/oc.pdf" -w '%{http_code} %{content_type}' --noproxy '*' -b "$TMP/adm.txt" "$BASE/api/ordens/$OID/pdf" > "$TMP/pdfr"
verificar "PDF da ordem de compra" '200 application/pdf' "$(cat $TMP/pdfr)"
verificar "PDF é um arquivo válido" 'PDF document' "$(file $TMP/oc.pdf)"

echo "== Recebimento e instalação =="
ITEM=$(adm $BASE/api/ordens/$OID | python3 -c "import json,sys;print(json.load(sys.stdin)['itens'][0]['id'])")
verificar "recebimento total da ordem" '"status":"recebida"' \
  "$(adm -X POST "$BASE/api/ordens/$OID/receber" -H 'Content-Type: application/json' -d "{\"itens\":[{\"item_id\":$ITEM}],\"nota_fiscal\":\"12345\"}")"
verificar "mecânico notificado do recebimento" 'Peças recebidas' "$(mec $BASE/api/notificacoes)"
verificar "mecânico confirma recebimento" '"status":"entregue"' \
  "$(mec -X POST "$BASE/api/pecas/$PECA_ID/confirmar-recebimento" -H 'Content-Type: application/json' -d '{}')"
verificar "mecânico marca como instalada" '"status":"instalada"' \
  "$(mec -X POST "$BASE/api/pecas/$PECA_ID/instalar" -H 'Content-Type: application/json' -d '{}')"
verificar "ficha avança para serviço concluído" 'servico_concluido' "$(mec $BASE/api/fichas/$FID)"
verificar "conclusão do serviço pelo mecânico" '"status":"servico_concluido"' \
  "$(mec -X POST "$BASE/api/fichas/$FID/concluir-servico" -H 'Content-Type: application/json' -d '{"observacao":"Serviço finalizado e testado."}')"
verificar "finalização pela administração" '"status":"concluida"' \
  "$(adm -X POST "$BASE/api/fichas/$FID/finalizar" -H 'Content-Type: application/json' -d '{"confirmar":true}')"

echo "== Histórico, PDF e relatórios =="
verificar "histórico da ficha registrado" 'peca_instalada' "$(adm "$BASE/api/sistema/historico?entidade=ficha&entidade_id=$FID")"
verificar "histórico registra o usuário" 'Carlos Ferreira' "$(adm "$BASE/api/sistema/historico?entidade=ficha&entidade_id=$FID")"
c -o "$TMP/fic.pdf" -w '%{http_code}' --noproxy '*' -b "$TMP/mec.txt" "$BASE/api/fichas/$FID/pdf" > "$TMP/pdfr2"
verificar "PDF da ficha (mecânico)" '200' "$(cat $TMP/pdfr2)"
verificar "PDF da ficha é válido" 'PDF document' "$(file $TMP/fic.pdf)"
verificar "relatório geral" '"tempo_medio_dias"' "$(adm $BASE/api/relatorios/geral)"
verificar "relatório por categoria" '"itens"' "$(adm $BASE/api/relatorios/categorias)"
verificar "relatório de fornecedores" '"itens"' "$(adm $BASE/api/relatorios/fornecedores)"
verificar "relatório de mecânicos" '"itens"' "$(adm $BASE/api/relatorios/mecanicos)"
verificar "exportação CSV" 'Ficha;Placa' "$(adm $BASE/api/relatorios/exportar/fichas | head -1)"

echo "== Cancelamento com confirmação =="
FICHA2=$(mec -X POST "$BASE/api/fichas" -H 'Content-Type: application/json' -d "{\"caminhao_id\":$ID_NOVO,\"km\":152000,\"motivo_entrada\":\"Teste de cancelamento\",\"diagnostico\":\"Teste\"}")
FID2=$(printf '%s' "$FICHA2" | sed -n 's/.*"id":\([0-9]*\).*/\1/p' | head -1)
verificar "cancelamento exige confirmação" 'Confirme o cancelamento' \
  "$(adm -X POST "$BASE/api/fichas/$FID2/cancelar" -H 'Content-Type: application/json' -d '{"motivo":"Aberta por engano"}')"
verificar "cancelamento com confirmação" '"status":"cancelada"' \
  "$(adm -X POST "$BASE/api/fichas/$FID2/cancelar" -H 'Content-Type: application/json' -d '{"motivo":"Aberta por engano no teste","confirmar":true}')"
verificar "ficha cancelada permanece no sistema" "\"id\":$FID2" "$(adm $BASE/api/fichas/$FID2)"

echo "== Usuários e configurações =="
verificar "criação de usuário" '"perfil":"mecanico"' \
  "$(adm -X POST "$BASE/api/usuarios" -H 'Content-Type: application/json' -d '{"nome":"Teste Mecânico","email":"teste.mec@sostruck.com.br","senha":"senha123","perfil":"mecanico"}')"
verificar "e-mail duplicado bloqueado" 'Já existe' \
  "$(adm -X POST "$BASE/api/usuarios" -H 'Content-Type: application/json' -d '{"nome":"Outro","email":"teste.mec@sostruck.com.br","senha":"senha123","perfil":"mecanico"}')"
verificar "senha fraca bloqueada" 'pelo menos 6' \
  "$(adm -X POST "$BASE/api/usuarios" -H 'Content-Type: application/json' -d '{"nome":"Usuário Teste","email":"x@sostruck.com.br","senha":"123","perfil":"mecanico"}')"
verificar "gravação de configurações" 'SOS TRUCK SERVICE LTDA' \
  "$(adm -X PUT "$BASE/api/sistema/configuracoes" -H 'Content-Type: application/json' -d '{"empresa_nome":"SOS TRUCK SERVICE LTDA","empresa_telefone":"4133330000"}')"
verificar "domínios disponíveis" 'status_ficha' "$(c $BASE/api/sistema/dominios)"

echo
echo "==================================="
echo " Aprovados: $OK   Falhas: $FALHA"
echo "==================================="
rm -rf "$TMP"
[ "$FALHA" -eq 0 ]
