/**
 * Erro de regra de negócio: a mensagem é para o usuário (português, sem detalhes internos).
 * As páginas mostram a mensagem; qualquer outro erro vira "algo deu errado" e vai para o log.
 */
export class ErroDeNegocio extends Error {
  constructor(
    message: string,
    /** Campo do formulário ao qual o erro se refere, se houver. */
    readonly campo?: string,
  ) {
    super(message);
    this.name = 'ErroDeNegocio';
  }
}

export function naoEncontrado(oQue: string): ErroDeNegocio {
  return new ErroDeNegocio(`${oQue} não encontrado(a). Talvez tenha sido removido(a).`);
}

/** Momento atual em ISO UTC, no mesmo formato dos defaults do banco. */
export function agoraIso(agora: Date = new Date()): string {
  return agora.toISOString();
}
