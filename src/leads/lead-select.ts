import { Prisma } from '@prisma/client';

/** Campos de lead retornados pela API, incluindo o corretor dono (id + nome). */
export const leadSelect = {
  id: true,
  tipo: true,
  nome: true,
  telefone: true,
  email: true,
  origem: true,
  interesse: true,
  cidade: true,
  bairro: true,
  stage: true,
  prioridade: true,
  renda: true,
  tags: true,
  corretorId: true,
  corretor: { select: { id: true, name: true } },
  analise: { select: { status: true, parecer: true } },
  perdidoAt: true,
  motivoPerda: true,
  perdidoPorId: true,
  perdidoPor: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

export type LeadEntity = Prisma.LeadGetPayload<{ select: typeof leadSelect }>;
