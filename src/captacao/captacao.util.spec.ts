import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pickFirstActiveEtapa, moneyEqual, toMoneyNumber, normalizeCpfCnpj } from './captacao.util';
import {
  textoCriacao,
  textoEtapa,
  textoExclusividade,
  textoResponsavel,
  textoValorPretendido,
} from './captacao-history.util';
import { imovelTitulo } from './captacao.constants';
import { CaptacaoImovelTipo, PessoaTipo } from '@prisma/client';

describe('funil de captação', () => {
  it('escolhe a primeira etapa ativa por sortOrder', () => {
    const first = pickFirstActiveEtapa([
      { id: 'b', sortOrder: 2, active: true },
      { id: 'a', sortOrder: 0, active: true },
      { id: 'c', sortOrder: 1, active: false },
    ]);
    assert.equal(first?.id, 'a');
  });

  it('ignora etapas inativas e devolve null se não houver ativa', () => {
    assert.equal(
      pickFirstActiveEtapa([{ id: 'x', sortOrder: 0, active: false }]),
      null,
    );
  });
});

describe('histórico da captação', () => {
  it('registra criação, etapa, responsável, valor e exclusividade', () => {
    assert.equal(textoCriacao('Eduardo'), 'Eduardo criou a captação.');
    assert.equal(
      textoEtapa('Eduardo', 'Novo proprietário', 'Primeiro contato'),
      'Eduardo alterou:\nNovo proprietário → Primeiro contato',
    );
    assert.equal(textoResponsavel('Maria'), 'Maria assumiu a captação.');
    assert.equal(textoValorPretendido(), 'Valor pretendido alterado.');
    assert.equal(textoExclusividade(true), 'Exclusividade alterada para Sim.');
    assert.equal(textoExclusividade(false), 'Exclusividade alterada para Não.');
  });
});

describe('valores e título do imóvel', () => {
  it('converte decimal e compara valores', () => {
    assert.equal(toMoneyNumber('150000.5'), 150000.5);
    assert.equal(moneyEqual(10, 10.001), true);
    assert.equal(moneyEqual(10, 11), false);
  });

  it('monta título sem exigir um nome próprio', () => {
    assert.equal(
      imovelTitulo({
        tipo: CaptacaoImovelTipo.apartamento,
        logradouro: 'Rua A',
        numero: '10',
        bairro: 'Centro',
        cidade: 'Recife',
      }),
      'Apartamento — Rua A, 10',
    );
  });
});

describe('CPF e CNPJ do proprietário', () => {
  it('corta CPF em 11 dígitos e CNPJ em 14', () => {
    assert.equal(
      normalizeCpfCnpj('000.000.000-000000', PessoaTipo.fisica),
      '00000000000',
    );
    assert.equal(
      normalizeCpfCnpj('00.000.000/0000-0000', PessoaTipo.juridica),
      '00000000000000',
    );
  });
});
