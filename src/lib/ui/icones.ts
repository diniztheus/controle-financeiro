/**
 * Ícones das categorias e das contas. A categoria não guarda ícone no banco: ele sai do nome
 * (palavras como "mercado", "uber", "farmácia"), e o que não for reconhecido usa a etiqueta.
 */
import type { Component } from 'svelte';
import Baby from '@lucide/svelte/icons/baby';
import Banknote from '@lucide/svelte/icons/banknote';
import Briefcase from '@lucide/svelte/icons/briefcase';
import Car from '@lucide/svelte/icons/car';
import Coffee from '@lucide/svelte/icons/coffee';
import CreditCard from '@lucide/svelte/icons/credit-card';
import Dumbbell from '@lucide/svelte/icons/dumbbell';
import Fuel from '@lucide/svelte/icons/fuel';
import Gamepad2 from '@lucide/svelte/icons/gamepad-2';
import Gift from '@lucide/svelte/icons/gift';
import GraduationCap from '@lucide/svelte/icons/graduation-cap';
import HandCoins from '@lucide/svelte/icons/hand-coins';
import HeartPulse from '@lucide/svelte/icons/heart-pulse';
import House from '@lucide/svelte/icons/house';
import Landmark from '@lucide/svelte/icons/landmark';
import PawPrint from '@lucide/svelte/icons/paw-print';
import PiggyBank from '@lucide/svelte/icons/piggy-bank';
import Pill from '@lucide/svelte/icons/pill';
import Plane from '@lucide/svelte/icons/plane';
import Receipt from '@lucide/svelte/icons/receipt';
import Repeat from '@lucide/svelte/icons/repeat';
import Shirt from '@lucide/svelte/icons/shirt';
import ShoppingBag from '@lucide/svelte/icons/shopping-bag';
import ShoppingCart from '@lucide/svelte/icons/shopping-cart';
import Smartphone from '@lucide/svelte/icons/smartphone';
import Tag from '@lucide/svelte/icons/tag';
import TrendingUp from '@lucide/svelte/icons/trending-up';
import Utensils from '@lucide/svelte/icons/utensils';
import Wallet from '@lucide/svelte/icons/wallet';
import Wrench from '@lucide/svelte/icons/wrench';
import Zap from '@lucide/svelte/icons/zap';
import type { TipoConta } from '$lib/dominio/contas';

export type Icone = Component<{ size?: number | string; strokeWidth?: number | string }>;

/** Palavras (sem acento, minúsculas) → ícone. A primeira regra que casar vence. */
const REGRAS: [RegExp, Icone][] = [
  [/mercado|supermercado|feira|hortifruti|padaria|acougue/, ShoppingCart],
  [/aliment|comida|restaurante|refei|lanche|ifood|delivery|almoco|jantar/, Utensils],
  [/cafe|cafeteria|bar\b/, Coffee],
  [/combust|gasolina|posto|etanol/, Fuel],
  [/transporte|uber|taxi|onibus|metro|carro|estacion|pedagio|mobilidade/, Car],
  [/viage|passage|hotel|ferias|turismo/, Plane],
  [/moradia|aluguel|condominio|casa propria|iptu|financiamento/, House],
  [/contas da casa|luz|energia|agua|gas\b|internet|telefone/, Zap],
  [/farmac|remedio|medicamento/, Pill],
  [/saude|medic|dentist|hospital|plano de saude|exame|terapia/, HeartPulse],
  [/academia|esporte|ginastica|treino/, Dumbbell],
  [/lazer|diversao|cinema|jogo|game|show|entreten/, Gamepad2],
  [/educa|escola|faculdade|curso|livro|estudo/, GraduationCap],
  [/roupa|vestu|calcado|moda/, Shirt],
  [/compra|shopping|loja/, ShoppingBag],
  [/assinatura|streaming|netflix|spotify|recorrente/, Repeat],
  [/celular|eletronic|tecnologia|software/, Smartphone],
  [/pet|cachorro|gato|veterin|racao/, PawPrint],
  [/filho|crianca|bebe/, Baby],
  [/presente|doacao|doacoes/, Gift],
  [/manutencao|conserto|reforma|servico/, Wrench],
  [/imposto|taxa|tarifa|boleto|fatura/, Receipt],
  [/cartao/, CreditCard],
  [/salario|trabalho|freela|pro-labore|prolabore/, Briefcase],
  [/bolsa|auxilio|beneficio|renda/, HandCoins],
  [/investimento|rendimento|dividendo|juros/, TrendingUp],
];

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Ícone de uma categoria (ou da descrição de uma receita) pelo nome. */
export function iconeDoNome(nome: string | null | undefined): Icone {
  const texto = semAcento(nome ?? '');
  for (const [regra, icone] of REGRAS) if (regra.test(texto)) return icone;
  return Tag;
}

export const ICONE_CONTA: Record<TipoConta, Icone> = {
  corrente: Landmark,
  poupanca: PiggyBank,
  investimento: TrendingUp,
  dinheiro: Banknote,
  outro: Wallet,
};
