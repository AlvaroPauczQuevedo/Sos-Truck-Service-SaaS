'use strict';
/** Fichas mecanicas: criacao, problemas, pecas, fluxo de aprovacao e comentarios. */
const express = require('express');
const { db, gerarNumero } = require('../db');
const { rota, erro } = require('../lib/http');
const v = require('../lib/validacao');
const { exigirLogin, exigirAdmin, ehAdmin } = require('../lib/auth');
const { registrar, diferencas, notificarUsuario, notificarPerfil } = require('../lib/registro');
const { upload } = require('../lib/upload');
const fotosLib = require('../lib/fotos');
const L = require('../lib/fichas');
const D = require('../lib/dominio');

const router = express.Router();
router.use(exigirLogin);

// ------------------------------------------------------------------ Listagem
router.get('/', rota((req, res) => {
  const { busca, status, prioridade, caminhao_id, mecanico_id, empresa_id, de, ate, fila } = req.query;
  const pagina = Math.max(1, Number(req.query.pagina) || 1);
  const porPagina = Math.min(100, Math.max(5, Number(req.query.por_pagina) || 20));
  const filtros = [];
  const params = {};

  // O mecanico nunca ve rascunhos de outros mecanicos.
  if (!ehAdmin(req)) {
    filtros.push(`(f.mecanico_id = @eu OR f.status <> 'rascunho')`);
    params.eu = req.usuario.id;
    if (req.query.minhas === '1') { filtros.push('f.mecanico_id = @eu'); }
  }
  if (busca && String(busca).trim()) {
    params.busca = `%${String(busca).trim()}%`;
    filtros.push(`(f.numero LIKE @busca OR REPLACE(c.placa,'-','') LIKE @busca OR c.codigo_frota LIKE @busca
                   OR c.chassi LIKE @busca OR c.modelo LIKE @busca OR e.nome LIKE @busca OR u.nome LIKE @busca)`);
  }
  if (status) {
    const lista = String(status).split(',').map((s) => s.trim()).filter(Boolean);
    filtros.push(`f.status IN (${lista.map((_, i) => `@st${i}`).join(',')})`);
    lista.forEach((s, i) => { params[`st${i}`] = s; });
  }
  if (fila === '1') filtros.push(`f.status IN ('aguardando_analise','devolvida')`);
  if (prioridade) { filtros.push('f.prioridade = @prioridade'); params.prioridade = prioridade; }
  if (caminhao_id) { filtros.push('f.caminhao_id = @caminhao_id'); params.caminhao_id = Number(caminhao_id); }
  if (mecanico_id) { filtros.push('f.mecanico_id = @mecanico_id'); params.mecanico_id = Number(mecanico_id); }
  if (empresa_id) { filtros.push('c.empresa_id = @empresa_id'); params.empresa_id = Number(empresa_id); }
  if (de) { filtros.push('date(f.aberta_em) >= @de'); params.de = v.data(de, 'período inicial'); }
  if (ate) { filtros.push('date(f.aberta_em) <= @ate'); params.ate = v.data(ate, 'período final'); }

  const onde = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const total = db.prepare(
    `SELECT COUNT(*) AS t FROM fichas f
       JOIN caminhoes c ON c.id = f.caminhao_id
       JOIN usuarios u ON u.id = f.mecanico_id
       LEFT JOIN empresas e ON e.id = c.empresa_id ${onde}`
  ).get(params).t;

  const ordem = fila === '1'
    ? `ORDER BY CASE f.prioridade WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, f.enviada_em`
    : 'ORDER BY f.aberta_em DESC';

  let itens = db.prepare(
    `${L.SELECT_FICHA} ${onde} ${ordem} LIMIT @limite OFFSET @deslocamento`
  ).all({ ...params, limite: porPagina, deslocamento: (pagina - 1) * porPagina });

  if (!ehAdmin(req)) itens = itens.map(L.ocultarDadosAdministrativos);
  res.json({ itens, total, pagina, por_pagina: porPagina, paginas: Math.max(1, Math.ceil(total / porPagina)) });
}));

// ------------------------------------------------------------------ Detalhe
router.get('/:id', rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  const admin = ehAdmin(req);
  if (!admin && ficha.status === 'rascunho' && ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Este rascunho pertence a outro mecânico.');
  }

  const detalhe = admin ? ficha : L.ocultarDadosAdministrativos(ficha);
  detalhe.problemas = L.listarProblemas(ficha.id).map((p) => ({ ...p, fotos: fotosLib.listar('problema', p.id) }));
  detalhe.pecas = L.listarPecas(ficha.id, admin).map((p) => ({ ...p, fotos: fotosLib.listar('peca', p.id) }));
  detalhe.fotos = fotosLib.listar('ficha', ficha.id);
  detalhe.comentarios = db.prepare(
    `SELECT co.id, co.mensagem, co.interno, co.criado_em, u.nome AS autor_nome, u.perfil AS autor_perfil
       FROM comentarios co JOIN usuarios u ON u.id = co.usuario_id
      WHERE co.ficha_id = ? ${admin ? '' : 'AND co.interno = 0'}
      ORDER BY co.criado_em`
  ).all(ficha.id);
  detalhe.historico = db.prepare(
    `SELECT acao, descricao, detalhes, usuario_nome, criado_em FROM historico
      WHERE entidade = 'ficha' AND entidade_id = ? ORDER BY id DESC LIMIT 100`
  ).all(ficha.id);
  detalhe.pode_editar = admin || (ficha.mecanico_id === req.usuario.id && D.FICHA_EDITAVEL_MECANICO.includes(ficha.status));

  if (admin) {
    detalhe.cotacoes = db.prepare(
      `SELECT id, numero, status, criado_em, aprovada_em FROM cotacoes WHERE ficha_id = ? ORDER BY id DESC`
    ).all(ficha.id);
    detalhe.ordens = db.prepare(
      `SELECT o.id, o.numero, o.status, o.total, o.data_emissao, o.previsao_entrega, fo.nome AS fornecedor_nome
         FROM ordens_compra o JOIN fornecedores fo ON fo.id = o.fornecedor_id
        WHERE o.ficha_id = ? ORDER BY o.id DESC`
    ).all(ficha.id);
    detalhe.total_aprovado = db.prepare(
      `SELECT IFNULL(SUM(p.valor_total), 0) AS t FROM propostas p
        JOIN pecas_solicitadas ps ON ps.id = p.peca_id
       WHERE ps.ficha_id = ? AND p.selecionada = 1`
    ).get(ficha.id).t;
  } else {
    // O mecanico acompanha o andamento das compras sem acessar valores.
    detalhe.ordens = db.prepare(
      `SELECT o.id, o.numero, o.status, o.previsao_entrega FROM ordens_compra o WHERE o.ficha_id = ? ORDER BY o.id DESC`
    ).all(ficha.id);
  }
  res.json(detalhe);
}));

// ------------------------------------------------------------------ Criacao / edicao
function dadosFicha(body) {
  return {
    km: v.numero(body.km, 'Quilometragem', { inteiro: true, min: 0, max: 9999999 }),
    motivo_entrada: v.texto(body.motivo_entrada, 'Motivo da entrada', { max: 1000 }),
    relato_motorista: v.texto(body.relato_motorista, 'Relato do motorista', { max: 4000 }),
    diagnostico: v.texto(body.diagnostico, 'Diagnóstico do mecânico', { max: 6000 }),
    servicos_recomendados: v.texto(body.servicos_recomendados, 'Serviços recomendados', { max: 4000 }),
    prioridade: v.opcao(body.prioridade, 'Prioridade', D.PRIORIDADES, { padrao: 'media' }),
    prazo_estimado: v.texto(body.prazo_estimado, 'Prazo estimado', { max: 120 }),
  };
}

router.post('/', upload.array('fotos', 12), rota((req, res) => {
  const caminhao_id = v.numero(req.body.caminhao_id, 'Caminhão', { obrigatorio: true, inteiro: true, min: 1 });
  const caminhao = db.prepare('SELECT * FROM caminhoes WHERE id = ? AND ativo = 1').get(caminhao_id);
  if (!caminhao) throw erro.requisicao('Selecione um caminhão válido para abrir a ficha.', { campo: 'caminhao_id' });

  let mecanico_id = req.usuario.id;
  if (ehAdmin(req) && req.body.mecanico_id) {
    mecanico_id = v.numero(req.body.mecanico_id, 'Mecânico responsável', { inteiro: true, min: 1 });
    const mec = db.prepare("SELECT id FROM usuarios WHERE id = ? AND ativo = 1").get(mecanico_id);
    if (!mec) throw erro.requisicao('Mecânico responsável inválido.', { campo: 'mecanico_id' });
  }

  const dados = dadosFicha(req.body);
  const numero = gerarNumero('FIC');

  const info = db.prepare(
    `INSERT INTO fichas (numero, caminhao_id, mecanico_id, km, motivo_entrada, relato_motorista,
       diagnostico, servicos_recomendados, prioridade, prazo_estimado, status)
     VALUES (@numero, @caminhao_id, @mecanico_id, @km, @motivo_entrada, @relato_motorista,
       @diagnostico, @servicos_recomendados, @prioridade, @prazo_estimado, 'rascunho')`
  ).run({ ...dados, numero, caminhao_id, mecanico_id });

  const id = info.lastInsertRowid;
  if (dados.km && dados.km > (caminhao.km_atual || 0)) {
    db.prepare("UPDATE caminhoes SET km_atual = ?, atualizado_em = datetime('now') WHERE id = ?").run(dados.km, caminhao_id);
  }
  db.prepare("UPDATE caminhoes SET status = 'em_manutencao', atualizado_em = datetime('now') WHERE id = ?").run(caminhao_id);

  registrar(req, { entidade: 'ficha', entidade_id: id, acao: 'criada', descricao: `Ficha ${numero} aberta para o caminhão ${caminhao.placa}` });
  fotosLib.salvar(req, 'ficha', id, req.files);

  res.status(201).json(L.buscarFicha(id));
}));

router.put('/:id', upload.array('fotos', 12), rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  L.exigirEdicaoMecanico(req, ficha);
  const dados = dadosFicha(req.body);

  if (ehAdmin(req) && req.body.observacoes_internas !== undefined) {
    dados.observacoes_internas = v.texto(req.body.observacoes_internas, 'Observações internas', { max: 4000 });
  }
  const campos = Object.keys(dados).map((k) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE fichas SET ${campos}, atualizado_em = datetime('now') WHERE id = @id`).run({ ...dados, id: ficha.id });

  if (dados.km && dados.km > (db.prepare('SELECT km_atual FROM caminhoes WHERE id = ?').get(ficha.caminhao_id).km_atual || 0)) {
    db.prepare("UPDATE caminhoes SET km_atual = ? WHERE id = ?").run(dados.km, ficha.caminhao_id);
  }
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'atualizada',
    descricao: `Ficha ${ficha.numero} atualizada`, detalhes: diferencas(ficha, dados),
  });
  fotosLib.salvar(req, 'ficha', ficha.id, req.files);
  res.json(L.buscarFicha(ficha.id));
}));

router.post('/:id/fotos', upload.array('fotos', 12), rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  L.exigirEdicaoMecanico(req, ficha);
  if (!req.files || !req.files.length) throw erro.requisicao('Selecione ao menos uma foto.');
  fotosLib.salvar(req, 'ficha', ficha.id, req.files, v.texto(req.body.legenda, 'Legenda', { max: 200 }));
  fotosLib.exigirAlgumaFotoValida(req);
  res.status(201).json({ ok: true, fotos: fotosLib.listar('ficha', ficha.id) });
}));

// ------------------------------------------------------------------ Fluxo
/** Envia a ficha para a administracao. */
router.post('/:id/enviar', rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  if (!ehAdmin(req) && ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Somente o mecânico responsável pode enviar esta ficha.');
  }
  if (!['rascunho', 'devolvida'].includes(ficha.status)) {
    throw erro.conflito('Esta ficha já foi enviada para a administração.');
  }

  const pendencias = [];
  if (!ficha.caminhao_id) pendencias.push('Selecione o caminhão.');
  if (!ficha.diagnostico || !ficha.diagnostico.trim()) pendencias.push('Preencha o diagnóstico do mecânico.');
  if (!ficha.mecanico_id) pendencias.push('Informe o mecânico responsável.');
  const problemas = L.listarProblemas(ficha.id);
  if (!problemas.length) pendencias.push('Registre ao menos um problema encontrado.');
  if (pendencias.length) throw erro.requisicao('A ficha não pode ser enviada:', { pendencias });

  const assinatura = v.texto(req.body.assinatura, 'Confirmação do mecânico', { obrigatorio: true, max: 120 });

  db.transaction(() => {
    db.prepare(
      `UPDATE fichas SET status='aguardando_analise', enviada_em=datetime('now'),
         assinatura_mecanico=?, assinado_em=datetime('now'), devolvida_motivo=NULL,
         atualizado_em=datetime('now') WHERE id=?`
    ).run(assinatura, ficha.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='aguardando_analise', atualizado_em=datetime('now')
        WHERE ficha_id=? AND status IN ('rascunho','devolvida')`
    ).run(ficha.id);
  })();

  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'enviada',
    descricao: `Ficha ${ficha.numero} enviada para a administração`,
  });
  notificarPerfil('admin', {
    titulo: 'Nova ficha para análise',
    mensagem: `${ficha.numero} — ${ficha.placa} (${req.usuario.nome})${ficha.pecas_criticas ? ' • contém peças críticas' : ''}`,
    tipo: ficha.prioridade === 'critica' ? 'alerta' : 'info',
    link: `/#/fichas/${ficha.id}`,
  });
  res.json(L.buscarFicha(ficha.id));
}));

/** A administracao devolve a ficha para correcao. */
router.post('/:id/devolver', exigirAdmin, rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  if (['rascunho', 'concluida', 'cancelada'].includes(ficha.status)) {
    throw erro.conflito('Esta ficha não pode ser devolvida na situação atual.');
  }
  const motivo = v.texto(req.body.motivo, 'Motivo da devolução', { obrigatorio: true, min: 5, max: 2000 });

  db.transaction(() => {
    db.prepare(
      `UPDATE fichas SET status='devolvida', devolvida_em=datetime('now'), devolvida_motivo=?,
         atualizado_em=datetime('now') WHERE id=?`
    ).run(motivo, ficha.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='devolvida', atualizado_em=datetime('now')
        WHERE ficha_id=? AND status IN ('aguardando_analise','aguardando_cotacao')`
    ).run(ficha.id);
    db.prepare(
      `INSERT INTO comentarios (ficha_id, usuario_id, mensagem, interno) VALUES (?, ?, ?, 0)`
    ).run(ficha.id, req.usuario.id, `Ficha devolvida para correção: ${motivo}`);
  })();

  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'devolvida',
    descricao: `Ficha ${ficha.numero} devolvida para correção`, detalhes: { motivo },
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Ficha devolvida para correção',
    mensagem: `${ficha.numero} — ${motivo}`,
    tipo: 'alerta',
    link: `/#/fichas/${ficha.id}`,
  });
  res.json(L.buscarFicha(ficha.id));
}));

/** Aceita a ficha e libera as pecas para cotacao. */
router.post('/:id/aceitar', exigirAdmin, rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  if (!['aguardando_analise', 'devolvida'].includes(ficha.status)) {
    throw erro.conflito('Somente fichas aguardando análise podem ser aceitas.');
  }
  db.transaction(() => {
    db.prepare("UPDATE fichas SET status='em_cotacao', atualizado_em=datetime('now') WHERE id=?").run(ficha.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='aguardando_cotacao', atualizado_em=datetime('now')
        WHERE ficha_id=? AND status IN ('aguardando_analise','devolvida','rascunho')`
    ).run(ficha.id);
  })();
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'aceita',
    descricao: `Ficha ${ficha.numero} aceita — peças liberadas para cotação`,
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Ficha aceita pela administração',
    mensagem: `${ficha.numero} — as peças entraram em cotação.`,
    tipo: 'sucesso', link: `/#/fichas/${ficha.id}`,
  });
  res.json(L.buscarFicha(ficha.id));
}));

/** O mecanico marca o servico mecanico como concluido. */
router.post('/:id/concluir-servico', rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  if (!ehAdmin(req) && ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Somente o mecânico responsável pode concluir o serviço.');
  }
  if (['rascunho', 'concluida', 'cancelada'].includes(ficha.status)) {
    throw erro.conflito('A ficha precisa estar em andamento para concluir o serviço.');
  }
  const pendentes = db.prepare(
    `SELECT COUNT(*) AS t FROM pecas_solicitadas
      WHERE ficha_id = ? AND status NOT IN ('instalada','cancelada')`
  ).get(ficha.id).t;
  if (pendentes > 0 && !req.body.confirmar) {
    throw erro.conflito(
      `Ainda há ${pendentes} peça(s) não instalada(s). Confirme para concluir mesmo assim.`,
      { requer_confirmacao: true, pendentes }
    );
  }
  const observacao = v.texto(req.body.observacao, 'Observação', { max: 2000 });
  db.prepare(
    `UPDATE fichas SET status='servico_concluido', servico_finalizado_em=datetime('now'),
       atualizado_em=datetime('now') WHERE id=?`
  ).run(ficha.id);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'servico_concluido',
    descricao: `Serviço mecânico concluído na ficha ${ficha.numero}`, detalhes: { observacao, pecas_pendentes: pendentes },
  });
  notificarPerfil('admin', {
    titulo: 'Serviço mecânico concluído',
    mensagem: `${ficha.numero} — ${ficha.placa}. Pronta para finalização.`,
    tipo: 'sucesso', link: `/#/fichas/${ficha.id}`,
  });
  res.json(L.buscarFicha(ficha.id));
}));

/** A administracao finaliza a ficha. */
router.post('/:id/finalizar', exigirAdmin, rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  if (ficha.status === 'concluida') throw erro.conflito('Esta ficha já está finalizada.');
  if (ficha.status === 'cancelada') throw erro.conflito('Esta ficha foi cancelada.');

  const abertas = db.prepare(
    `SELECT COUNT(*) AS t FROM ordens_compra WHERE ficha_id = ? AND status NOT IN ('recebida','cancelada')`
  ).get(ficha.id).t;
  if (abertas > 0 && !req.body.confirmar) {
    throw erro.conflito(
      `Existem ${abertas} ordem(ns) de compra em aberto para esta ficha. Confirme para finalizar mesmo assim.`,
      { requer_confirmacao: true, ordens_abertas: abertas }
    );
  }
  const observacao = v.texto(req.body.observacao, 'Observação de encerramento', { max: 2000 });

  db.transaction(() => {
    db.prepare(
      `UPDATE fichas SET status='concluida', finalizada_em=datetime('now'), atualizado_em=datetime('now') WHERE id=?`
    ).run(ficha.id);
    const outras = db.prepare(
      `SELECT COUNT(*) AS t FROM fichas WHERE caminhao_id = ? AND id <> ? AND status NOT IN ('concluida','cancelada')`
    ).get(ficha.caminhao_id, ficha.id).t;
    if (!outras) {
      db.prepare("UPDATE caminhoes SET status='disponivel', atualizado_em=datetime('now') WHERE id=?").run(ficha.caminhao_id);
    }
  })();

  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'finalizada',
    descricao: `Ficha ${ficha.numero} finalizada`, detalhes: { observacao },
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Ficha finalizada',
    mensagem: `${ficha.numero} — ${ficha.placa} foi encerrada pela administração.`,
    tipo: 'sucesso', link: `/#/fichas/${ficha.id}`,
  });
  res.json(L.buscarFicha(ficha.id));
}));

/** Cancelamento com confirmacao obrigatoria - o registro nunca e apagado. */
router.post('/:id/cancelar', exigirAdmin, rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  if (ficha.status === 'cancelada') throw erro.conflito('Esta ficha já está cancelada.');
  if (req.body.confirmar !== true && req.body.confirmar !== 'true') {
    throw erro.conflito('Confirme o cancelamento da ficha.', { requer_confirmacao: true });
  }
  const motivo = v.texto(req.body.motivo, 'Motivo do cancelamento', { obrigatorio: true, min: 5, max: 2000 });

  db.transaction(() => {
    db.prepare(
      `UPDATE fichas SET status='cancelada', cancelada_em=datetime('now'), cancelada_motivo=?,
         atualizado_em=datetime('now') WHERE id=?`
    ).run(motivo, ficha.id);
    db.prepare(
      `UPDATE pecas_solicitadas SET status='cancelada', cancelada_em=datetime('now'),
         cancelada_motivo='Ficha cancelada', atualizado_em=datetime('now')
        WHERE ficha_id=? AND status NOT IN ('instalada','cancelada')`
    ).run(ficha.id);
    const outras = db.prepare(
      `SELECT COUNT(*) AS t FROM fichas WHERE caminhao_id = ? AND id <> ? AND status NOT IN ('concluida','cancelada')`
    ).get(ficha.caminhao_id, ficha.id).t;
    if (!outras) db.prepare("UPDATE caminhoes SET status='disponivel' WHERE id=?").run(ficha.caminhao_id);
  })();

  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'cancelada',
    descricao: `Ficha ${ficha.numero} cancelada`, detalhes: { motivo },
  });
  notificarUsuario(ficha.mecanico_id, {
    titulo: 'Ficha cancelada', mensagem: `${ficha.numero} — ${motivo}`, tipo: 'alerta', link: `/#/fichas/${ficha.id}`,
  });
  res.json(L.buscarFicha(ficha.id));
}));

/** Reabre uma ficha finalizada (somente administracao). */
router.post('/:id/reabrir', exigirAdmin, rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  if (!['concluida', 'cancelada'].includes(ficha.status)) throw erro.conflito('Esta ficha já está em andamento.');
  const motivo = v.texto(req.body.motivo, 'Motivo da reabertura', { obrigatorio: true, min: 5, max: 1000 });
  db.prepare(
    `UPDATE fichas SET status='em_execucao', finalizada_em=NULL, cancelada_em=NULL,
       atualizado_em=datetime('now') WHERE id=?`
  ).run(ficha.id);
  db.prepare("UPDATE caminhoes SET status='em_manutencao' WHERE id=?").run(ficha.caminhao_id);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'reaberta',
    descricao: `Ficha ${ficha.numero} reaberta`, detalhes: { motivo },
  });
  res.json(L.buscarFicha(ficha.id));
}));

// ------------------------------------------------------------------ Comentarios
router.post('/:id/comentarios', rota((req, res) => {
  const ficha = L.buscarFicha(req.params.id);
  const mensagem = v.texto(req.body.mensagem, 'Mensagem', { obrigatorio: true, min: 1, max: 4000 });
  const interno = ehAdmin(req) ? v.booleano(req.body.interno) : 0;

  db.prepare('INSERT INTO comentarios (ficha_id, usuario_id, mensagem, interno) VALUES (?, ?, ?, ?)')
    .run(ficha.id, req.usuario.id, mensagem, interno);
  registrar(req, {
    entidade: 'ficha', entidade_id: ficha.id, acao: 'comentario',
    descricao: interno ? 'Anotação interna registrada' : 'Comentário adicionado à ficha',
  });

  if (!interno) {
    if (ehAdmin(req)) {
      notificarUsuario(ficha.mecanico_id, {
        titulo: `Nova mensagem na ficha ${ficha.numero}`,
        mensagem: mensagem.slice(0, 140), tipo: 'info', link: `/#/fichas/${ficha.id}`,
      });
    } else {
      notificarPerfil('admin', {
        titulo: `Mensagem do mecânico — ${ficha.numero}`,
        mensagem: `${req.usuario.nome}: ${mensagem.slice(0, 120)}`, tipo: 'info', link: `/#/fichas/${ficha.id}`,
      });
    }
  }
  res.status(201).json(
    db.prepare(
      `SELECT co.id, co.mensagem, co.interno, co.criado_em, u.nome AS autor_nome, u.perfil AS autor_perfil
         FROM comentarios co JOIN usuarios u ON u.id = co.usuario_id
        WHERE co.ficha_id = ? ${ehAdmin(req) ? '' : 'AND co.interno = 0'} ORDER BY co.criado_em`
    ).all(ficha.id)
  );
}));

router.get('/:id/pdf', rota(async (req, res) => {
  const { fichaPDF } = require('../lib/pdf');
  const { lerConfiguracoes } = require('../lib/config');
  const ficha = L.buscarFicha(req.params.id);
  const admin = ehAdmin(req);
  if (!admin && ficha.status === 'rascunho' && ficha.mecanico_id !== req.usuario.id) {
    throw erro.semPermissao('Este rascunho pertence a outro mecânico.');
  }
  const dados = {
    ficha,
    caminhao: db.prepare('SELECT * FROM caminhoes WHERE id = ?').get(ficha.caminhao_id),
    empresa: ficha.empresa_id ? db.prepare('SELECT * FROM empresas WHERE id = ?').get(ficha.empresa_id) : null,
    mecanico: db.prepare('SELECT nome, telefone FROM usuarios WHERE id = ?').get(ficha.mecanico_id),
    problemas: L.listarProblemas(ficha.id),
    pecas: L.listarPecas(ficha.id, admin),
    comentarios: db.prepare(
      `SELECT co.mensagem, co.criado_em, u.nome AS autor_nome FROM comentarios co
         JOIN usuarios u ON u.id = co.usuario_id
        WHERE co.ficha_id = ? ${admin ? '' : 'AND co.interno = 0'} ORDER BY co.criado_em`
    ).all(ficha.id),
    // Fotos da ficha, dos problemas e das pecas, para saírem impressas junto.
    fotos: db.prepare(
      `SELECT ft.entidade, ft.entidade_id, ft.arquivo, ft.mime, ft.nome_original, ft.legenda,
              ft.criado_em, u.nome AS enviado_por
         FROM fotos ft
         LEFT JOIN usuarios u ON u.id = ft.criado_por
        WHERE (ft.entidade = 'ficha'    AND ft.entidade_id = @ficha)
           OR (ft.entidade = 'problema' AND ft.entidade_id IN (SELECT id FROM problemas WHERE ficha_id = @ficha))
           OR (ft.entidade = 'peca'     AND ft.entidade_id IN (SELECT id FROM pecas_solicitadas WHERE ficha_id = @ficha))
        ORDER BY ft.id`
    ).all({ ficha: ficha.id }),
  };
  registrar(req, { entidade: 'ficha', entidade_id: ficha.id, acao: 'pdf_gerado', descricao: `PDF da ficha ${ficha.numero} gerado` });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download === '1' ? 'attachment' : 'inline'}; filename="${ficha.numero}.pdf"`);
  fichaPDF(dados, lerConfiguracoes(), { incluirValores: admin }).pipe(res);
}));

module.exports = router;
