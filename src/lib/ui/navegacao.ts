/** Seções do site (plano, seção 4). As que ainda não existem aparecem como "em breve". */
export interface ItemNav {
  rotulo: string;
  href:
    | '/'
    | '/gastos'
    | '/receitas'
    | '/contas'
    | '/categorias'
    | '/cartoes'
    | '/bitcoin'
    | '/relatorios';
  /** Onda do plano em que a seção chega; `null` = já existe. */
  onda: number | null;
}

export const NAVEGACAO: readonly ItemNav[] = [
  { rotulo: 'Painel', href: '/', onda: null },
  { rotulo: 'Gastos', href: '/gastos', onda: null },
  { rotulo: 'Receitas', href: '/receitas', onda: null },
  { rotulo: 'Contas', href: '/contas', onda: null },
  { rotulo: 'Categorias', href: '/categorias', onda: null },
  { rotulo: 'Cartões', href: '/cartoes', onda: null },
  { rotulo: 'Bitcoin', href: '/bitcoin', onda: null },
  { rotulo: 'Relatórios', href: '/relatorios', onda: null },
];

/** A seção está ativa nesta URL? ("/gastos/abc" ativa "Gastos"). */
export function ativo(item: ItemNav, caminho: string): boolean {
  return item.href === '/'
    ? caminho === '/'
    : caminho === item.href || caminho.startsWith(item.href + '/');
}
