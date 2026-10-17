/**
 * Tema do site: automático (segue o sistema), claro ou escuro. A escolha fica salva só neste
 * navegador (localStorage). O CSS já reage ao atributo `data-theme` em <html>; o script
 * inline de app.html aplica o tema salvo antes da primeira pintura, com a mesma regra daqui.
 */
export type Tema = 'auto' | 'claro' | 'escuro';

export const CHAVE_TEMA = 'tema';

/** Qualquer valor desconhecido (ou ausente) vira 'auto'. */
export function normalizarTema(valor: unknown): Tema {
  return valor === 'claro' || valor === 'escuro' ? valor : 'auto';
}

/** Valor de `data-theme` para cada tema; `null` remove o atributo (segue o sistema). */
export function atributoDoTema(tema: Tema): 'light' | 'dark' | null {
  if (tema === 'claro') return 'light';
  if (tema === 'escuro') return 'dark';
  return null;
}

/** Lê o tema salvo. Sem localStorage (privado, bloqueado, servidor) usa 'auto'. */
export function lerTema(): Tema {
  try {
    return normalizarTema(localStorage.getItem(CHAVE_TEMA));
  } catch {
    return 'auto';
  }
}

/** Salva a escolha e aplica no <html> agora, sem recarregar a página. */
export function aplicarTema(tema: Tema): void {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Sem armazenamento a escolha vale só até a página recarregar.
  }
  const html = document.documentElement;
  const atributo = atributoDoTema(tema);
  if (atributo) html.setAttribute('data-theme', atributo);
  else html.removeAttribute('data-theme');
}
