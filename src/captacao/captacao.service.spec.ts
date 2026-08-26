import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FunilTipo, Role } from '@prisma/client';
import { CaptacaoService } from './captacao.service';
import type { AuthenticatedUser } from '../common/types/authenticated-user';

function user(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'u1',
    email: 'a@t.com',
    role: Role.admin,
    name: 'Eduardo',
    tenantId: 't1',
    ...overrides,
  };
}

function prismaMock(extra: Record<string, unknown> = {}) {
  return {
    proprietario: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async (args: { data: unknown }) => args.data,
      update: async (args: { data: unknown }) => args.data,
      count: async () => 0,
    },
    imovel: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async (args: { data: unknown }) => ({
        ...(args.data as object),
        proprietario: { id: 'p1', nome: 'João' },
        captacoes: [],
      }),
      count: async () => 0,
    },
    captacao: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => ({}),
      count: async () => 0,
      groupBy: async () => [],
    },
    captacaoHistorico: { create: async () => ({}), createMany: async () => ({}) },
    funil: { findFirst: async () => null },
    funilEtapa: { findMany: async () => [] },
    user: { findFirst: async () => null, findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(prismaMock(extra)),
    ...extra,
  };
}

describe('CaptacaoService — isolamento e validações', () => {
  it('não devolve proprietário de outro tenant', async () => {
    const service = new CaptacaoService(prismaMock() as never);
    await assert.rejects(
      () => service.getProprietario('p-other', user()),
      NotFoundException,
    );
  });

  it('recusa imóvel cujo proprietário é de outro tenant', async () => {
    const service = new CaptacaoService(
      prismaMock({
        proprietario: {
          findFirst: async () => null,
        },
      }) as never,
    );
    await assert.rejects(
      () =>
        service.createImovel(
          {
            proprietarioId: 'p2',
            tipo: 'casa',
          },
          user(),
        ),
      BadRequestException,
    );
  });

  it('recusa captação sem funil ativo de captação', async () => {
    const service = new CaptacaoService(
      prismaMock({
        proprietario: { findFirst: async () => ({ id: 'p1', tenantId: 't1' }) },
        imovel: {
          findFirst: async () => ({
            id: 'i1',
            tenantId: 't1',
            proprietarioId: 'p1',
          }),
        },
        user: {
          findFirst: async () => ({ id: 'u1', tenantId: 't1' }),
        },
        funil: { findFirst: async () => null },
      }) as never,
    );
    await assert.rejects(
      async () => {
        try {
          await service.createCaptacao(
            {
              proprietarioId: 'p1',
              imovelId: 'i1',
              responsavelId: 'u1',
            },
            user(),
          );
        } catch (err) {
          assert.match(
            (err as Error).message,
            /Não existe um funil de Captação ativo/,
          );
          throw err;
        }
      },
      BadRequestException,
    );
  });

  it('recusa funil comercial', async () => {
    const service = new CaptacaoService(
      prismaMock({
        proprietario: { findFirst: async () => ({ id: 'p1', tenantId: 't1' }) },
        imovel: {
          findFirst: async () => ({
            id: 'i1',
            tenantId: 't1',
            proprietarioId: 'p1',
          }),
        },
        user: { findFirst: async () => ({ id: 'u1', tenantId: 't1' }) },
        funil: {
          findFirst: async () => ({
            id: 'f-com',
            tenantId: 't1',
            tipo: FunilTipo.comercial,
            etapas: [{ id: 'e1', sortOrder: 0, active: true, label: 'Novo' }],
          }),
        },
      }) as never,
    );
    await assert.rejects(
      () =>
        service.createCaptacao(
          {
            proprietarioId: 'p1',
            imovelId: 'i1',
            responsavelId: 'u1',
            funilId: 'f-com',
          },
          user(),
        ),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match(
          (err as Error).message,
          /tipo Captação/,
        );
        return true;
      },
    );
  });

  it('usa a primeira etapa do funil ativo de captação', async () => {
    let createdEtapa: string | undefined;
    const etapas = [
      { id: 'e-late', sortOrder: 3, active: true, label: 'Avaliação' },
      { id: 'e-first', sortOrder: 0, active: true, label: 'Novo proprietário' },
    ];
    const service = new CaptacaoService(
      prismaMock({
        proprietario: { findFirst: async () => ({ id: 'p1', tenantId: 't1' }) },
        imovel: {
          findFirst: async () => ({
            id: 'i1',
            tenantId: 't1',
            proprietarioId: 'p1',
          }),
        },
        user: { findFirst: async () => ({ id: 'u1', tenantId: 't1', name: 'Eduardo' }) },
        funil: {
          findFirst: async () => ({
            id: 'f-cap',
            tenantId: 't1',
            tipo: FunilTipo.captacao,
            ativo: true,
            etapas,
          }),
        },
        captacao: {
          create: async (args: { data: { funilEtapaId: string; funilId: string } }) => {
            createdEtapa = args.data.funilEtapaId;
            assert.equal(args.data.funilId, 'f-cap');
            return {
              id: 'c1',
              ...args.data,
              proprietario: { id: 'p1', nome: 'João' },
              imovel: {
                tipo: 'casa',
                logradouro: '',
                numero: '',
                bairro: '',
                cidade: '',
                area: null,
                areaConstruida: null,
              },
              responsavel: { id: 'u1', name: 'Eduardo' },
              funil: { id: 'f-cap', tipo: FunilTipo.captacao },
              funilEtapa: etapas[1],
            };
          },
          findFirst: async () => ({
            id: 'c1',
            valorPretendido: null,
            valorAvaliacao: null,
            historicos: [],
            proprietario: { id: 'p1', nome: 'João' },
            imovel: {
              tipo: 'casa',
              logradouro: '',
              numero: '',
              bairro: '',
              cidade: '',
              area: null,
              areaConstruida: null,
            },
            responsavel: { id: 'u1', name: 'Eduardo' },
            funil: { id: 'f-cap', tipo: FunilTipo.captacao },
            funilEtapa: etapas[1],
          }),
        },
      }) as never,
    );
    await service.createCaptacao(
      { proprietarioId: 'p1', imovelId: 'i1', responsavelId: 'u1' },
      user(),
    );
    assert.equal(createdEtapa, 'e-first');
  });

  it('recusa imóvel que não pertence ao proprietário', async () => {
    const service = new CaptacaoService(
      prismaMock({
        proprietario: { findFirst: async () => ({ id: 'p1', tenantId: 't1' }) },
        imovel: {
          findFirst: async () => ({
            id: 'i1',
            tenantId: 't1',
            proprietarioId: 'p-outro',
          }),
        },
        user: { findFirst: async () => ({ id: 'u1', tenantId: 't1' }) },
      }) as never,
    );
    await assert.rejects(
      () =>
        service.createCaptacao(
          { proprietarioId: 'p1', imovelId: 'i1', responsavelId: 'u1' },
          user(),
        ),
      (err: unknown) => {
        assert.ok(err instanceof BadRequestException);
        assert.match((err as Error).message, /não pertence ao proprietário/);
        return true;
      },
    );
  });
});
