'use strict';
/** Utilitarios HTTP: erros de aplicacao e wrapper async. */

class AppError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes || null;
  }
}

const erro = {
  requisicao: (msg, det) => new AppError(400, msg, det),
  naoAutenticado: (msg = 'Sessão expirada. Faça login novamente.') => new AppError(401, msg),
  semPermissao: (msg = 'Você não tem permissão para esta ação.') => new AppError(403, msg),
  naoEncontrado: (msg = 'Registro não encontrado.') => new AppError(404, msg),
  conflito: (msg, det) => new AppError(409, msg, det),
};

/** Envolve handlers async encaminhando rejeicoes ao middleware de erro. */
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, erro, rota };
