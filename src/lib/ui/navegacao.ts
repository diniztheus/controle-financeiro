/** Seções do site: o menu lateral (computador), as abas e o "Mais" (celular). */
import ArchiveRestore from '@lucide/svelte/icons/archive-restore';
import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
import Activity from '@lucide/svelte/icons/activity';
import Bitcoin from '@lucide/svelte/icons/bitcoin';
import ChartPie from '@lucide/svelte/icons/chart-pie';
import CreditCard from '@lucide/svelte/icons/credit-card';
import House from '@lucide/svelte/icons/house';
import Landmark from '@lucide/svelte/icons/landmark';
import Search from '@lucide/svelte/icons/search';
import Settings from '@lucide/svelte/icons/settings';
import Tags from '@lucide/svelte/icons/tags';
import Trash2 from '@lucide/svelte/icons/trash-2';
import type { Icone } from './icones';

export type Destino =
  | '/'
  | '/gastos'
  | '/receitas'
  | '/contas'
  | '/categorias'
  | '/cartoes'
  | '/bitcoin'
  | '/relatorios'
  | '/busca'
  | '/configuracoes'
  | '/backups'
  | '/lixeira'
  | '/sistema';

export interface ItemNav {
  rotulo: string;
  href: Destino;
  icone: Icone;
}

/** As seções principais, na ordem do menu. */
export const NAVEGACAO: readonly ItemNav[] = [
  { rotulo: 'Painel', href: '/', icone: House },
  { rotulo: 'Gastos', href: '/gastos', icone: ArrowDownRight },
  { rotulo: 'Receitas', href: '/receitas', icone: ArrowUpRight },
  { rotulo: 'Contas', href: '/contas', icone: Landmark },
  { rotulo: 'Cartões', href: '/cartoes', icone: CreditCard },
  { rotulo: 'Categorias', href: '/categorias', icone: Tags },
  { rotulo: 'Bitcoin', href: '/bitcoin', icone: Bitcoin },
  { rotulo: 'Relatórios', href: '/relatorios', icone: ChartPie },
];

/** Ferramentas: no pé do menu lateral e no "Mais" do celular. */
export const FERRAMENTAS: readonly ItemNav[] = [
  { rotulo: 'Buscar', href: '/busca', icone: Search },
  { rotulo: 'Configurações', href: '/configuracoes', icone: Settings },
  { rotulo: 'Backups', href: '/backups', icone: ArchiveRestore },
  { rotulo: 'Lixeira', href: '/lixeira', icone: Trash2 },
  { rotulo: 'Estado do sistema', href: '/sistema', icone: Activity },
];

/** Abas do celular (o "+" fica no meio, o resto vai para "Mais"). */
export const ABAS: readonly ItemNav[] = [NAVEGACAO[0]!, NAVEGACAO[1]!, NAVEGACAO[2]!];

/** A seção está ativa nesta URL? ("/gastos/abc" ativa "Gastos"). */
export function ativo(item: ItemNav, caminho: string): boolean {
  return item.href === '/'
    ? caminho === '/'
    : caminho === item.href || caminho.startsWith(item.href + '/');
}
