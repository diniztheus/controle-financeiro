/** Seções do site (plano, seção 4). As que ainda não existem aparecem como "em breve". */
export interface ItemNav {
  rotulo: string;
  href: string;
  /** Onda em que a seção chega; `null` = já existe. */
  onda: number | null;
}

export const NAVEGACAO: readonly ItemNav[] = [
  { rotulo: 'Painel', href: '/', onda: null },
  { rotulo: 'Gastos', href: '/gastos', onda: 1 },
  { rotulo: 'Contas', href: '/contas', onda: 1 },
  { rotulo: 'Cartões', href: '/cartoes', onda: 2 },
  { rotulo: 'Bitcoin', href: '/bitcoin', onda: 3 },
  { rotulo: 'Relatórios', href: '/relatorios', onda: 4 },
  { rotulo: 'Config', href: '/config', onda: 5 },
];
