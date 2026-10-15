/** Ajudas de formulário no navegador (use:enhance, foco, acessibilidade). */
import type { SubmitFunction } from '@sveltejs/kit';

/** Envia sem limpar os campos (para formulários de edição). */
export const manterCampos: SubmitFunction =
  () =>
  async ({ update }) =>
    update({ reset: false });

/** Leva o foco ao primeiro campo marcado com erro, depois que a página se atualizar. */
export function focarPrimeiroErro(form: HTMLFormElement): void {
  queueMicrotask(() => {
    const el = form.querySelector<HTMLElement>(
      '[aria-invalid="true"] input, input[aria-invalid="true"], select[aria-invalid="true"]',
    );
    el?.focus();
  });
}

/** Atributos de acessibilidade para um campo, ligando-o à mensagem de erro (id `${base}-erro`). */
export function ariaErro(
  erro: string | undefined,
  base: string,
): { 'aria-invalid'?: 'true'; 'aria-describedby'?: string } {
  return erro ? { 'aria-invalid': 'true', 'aria-describedby': `${base}-erro` } : {};
}
