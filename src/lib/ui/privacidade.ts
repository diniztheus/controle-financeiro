/**
 * Modo privacidade (o olho do menu): borra os valores em dinheiro da tela. Fica salvo só neste
 * navegador; o script inline de app.html aplica antes da primeira pintura, com a mesma chave.
 */
export const CHAVE_OCULTAR = 'ocultar-valores';

export function lerOcultar(): boolean {
  try {
    return localStorage.getItem(CHAVE_OCULTAR) === '1';
  } catch {
    return false;
  }
}

export function aplicarOcultar(ocultar: boolean): void {
  try {
    if (ocultar) localStorage.setItem(CHAVE_OCULTAR, '1');
    else localStorage.removeItem(CHAVE_OCULTAR);
  } catch {
    // Sem armazenamento a escolha vale só até a página recarregar.
  }
  document.documentElement.toggleAttribute('data-ocultar', ocultar);
}
