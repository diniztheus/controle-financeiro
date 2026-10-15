import { describe, expect, it } from 'vitest';
import {
  dia,
  diaDoMes,
  mes,
  numeroParcelas,
  textoObrigatorio,
  valorEmReais,
  valorPositivo,
} from '../../src/lib/validacao/comum';

describe('esquemas compartilhados', () => {
  it('valorEmReais converte para centavos', () => {
    expect(valorEmReais.parse('1.234,56')).toBe(123456);
    expect(valorEmReais.safeParse('abc').success).toBe(false);
  });

  it('valorPositivo recusa zero e negativo', () => {
    expect(valorPositivo.parse('0,01')).toBe(1);
    expect(valorPositivo.safeParse('0').success).toBe(false);
    expect(valorPositivo.safeParse('-3').success).toBe(false);
  });

  it('dia, mês, dia do mês e parcelas', () => {
    expect(dia.safeParse('2026-02-29').success).toBe(false);
    expect(dia.parse('2028-02-29')).toBe('2028-02-29');
    expect(mes.safeParse('2026-13').success).toBe(false);
    expect(diaDoMes.parse('31')).toBe(31);
    expect(diaDoMes.safeParse('32').success).toBe(false);
    expect(numeroParcelas.parse('24')).toBe(24);
    expect(numeroParcelas.safeParse('25').success).toBe(false);
    expect(numeroParcelas.safeParse('0').success).toBe(false);
  });

  it('texto obrigatório apara espaços', () => {
    const nome = textoObrigatorio('Nome', 5);
    expect(nome.parse('  Nu  ')).toBe('Nu');
    const r = nome.safeParse('   ');
    expect(r.success).toBe(false);
    expect(nome.safeParse('123456').success).toBe(false);
  });
});

describe('formulários do núcleo', () => {
  it('conta: saldo negativo aceito, tipo inválido recusado', async () => {
    const { contaForm } = await import('../../src/lib/validacao/nucleo');
    expect(contaForm.parse({ nome: ' Nubank ', tipo: 'corrente', saldo: '-1.234,56' })).toEqual({
      nome: 'Nubank',
      tipo: 'corrente',
      saldo: -123456,
    });
    expect(contaForm.safeParse({ nome: 'x', tipo: 'pix', saldo: '1' }).success).toBe(false);
    expect(contaForm.safeParse({ nome: '  ', tipo: 'corrente', saldo: '1' }).success).toBe(false);
  });

  it('gasto: descrição e conta opcionais; valor positivo; data real', async () => {
    const { gastoForm, errosPorCampo } = await import('../../src/lib/validacao/nucleo');
    expect(
      gastoForm.parse({
        valor: '42,90',
        descricao: '  ',
        categoriaId: 'c',
        data: '2026-10-15',
        contaId: '',
      }),
    ).toEqual({
      valor: 4290,
      descricao: null,
      categoriaId: 'c',
      data: '2026-10-15',
      contaId: null,
      meio: 'conta',
      cartaoId: null,
      numParcelas: 1,
    });
    expect(gastoForm.parse({ valor: '1', categoriaId: 'c', data: '2026-10-15' })).toMatchObject({
      descricao: null,
      contaId: null,
    });
    const r = gastoForm.safeParse({ valor: '0', categoriaId: '', data: '2026-02-30' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(Object.keys(errosPorCampo(r.error)).sort()).toEqual(['categoriaId', 'data', 'valor']);
    }
  });

  it('categoria: cor da paleta ou vazia', async () => {
    const { categoriaForm } = await import('../../src/lib/validacao/nucleo');
    expect(categoriaForm.parse({ nome: 'Pets', cor: 'c3' })).toEqual({ nome: 'Pets', cor: 'c3' });
    expect(categoriaForm.parse({ nome: 'Pets', cor: '' })).toEqual({ nome: 'Pets', cor: null });
    expect(categoriaForm.safeParse({ nome: 'Pets', cor: 'red' }).success).toBe(false);
  });

  it('limite: vazio vira zero; negativo recusado', async () => {
    const { limiteForm } = await import('../../src/lib/validacao/nucleo');
    expect(limiteForm.parse({ valor: '' })).toEqual({ valor: 0 });
    expect(limiteForm.parse({ valor: '3.000' })).toEqual({ valor: 300000 });
    expect(limiteForm.safeParse({ valor: '-1' }).success).toBe(false);
  });
});
