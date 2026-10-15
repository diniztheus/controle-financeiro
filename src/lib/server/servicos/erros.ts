/**
 * Erro de regra de negócio: a mensagem é para o usuário (português, sem detalhes internos).
 * As páginas mostram a mensagem; qualquer outro erro vira "algo deu errado" e vai para o log.
 */
export class ErroDeNegocio extends Error {
  /** Campo do formulário ao qual o erro se refere, se houver. */
  readonly campo: string | undefined;
  // Sem "parameter properties": os scripts rodam no Node com remoção simples de tipos.
  constructor(message: string, campo?: string) {
    super(message);
    this.campo = campo;
    this.name = 'ErroDeNegocio';
  }
}

/** Ex.: naoEncontrado('Esta conta não existe mais'). */
export function naoEncontrado(frase: string): ErroDeNegocio {
  return new ErroDeNegocio(`${frase}. Atualize a página e tente de novo.`);
}

/** Momento atual em ISO UTC, no mesmo formato dos defaults do banco. */
export function agoraIso(agora: Date = new Date()): string {
  return agora.toISOString();
}
