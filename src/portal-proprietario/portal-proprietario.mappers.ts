import { CaptacaoHistoricoTipo, VendaUsadoHistoricoTipo } from '@prisma/client';
import { imovelTitulo } from '../captacao/captacao.constants';
import { toMoneyNumber } from '../captacao/captacao.util';

export const CAPTACAO_HISTORICO_PORTAL: CaptacaoHistoricoTipo[] = [
  CaptacaoHistoricoTipo.criacao,
  CaptacaoHistoricoTipo.etapa,
  CaptacaoHistoricoTipo.valor,
  CaptacaoHistoricoTipo.exclusividade,
];

export const VENDA_HISTORICO_PORTAL: VendaUsadoHistoricoTipo[] = [
  VendaUsadoHistoricoTipo.disponibilizacao,
  VendaUsadoHistoricoTipo.responsavel,
  VendaUsadoHistoricoTipo.status,
  VendaUsadoHistoricoTipo.preco,
  VendaUsadoHistoricoTipo.etapa,
  VendaUsadoHistoricoTipo.interessado_vinculo,
  VendaUsadoHistoricoTipo.interessado_remocao,
  VendaUsadoHistoricoTipo.visita,
  VendaUsadoHistoricoTipo.visita_feedback,
  VendaUsadoHistoricoTipo.proposta,
  VendaUsadoHistoricoTipo.negociacao,
  VendaUsadoHistoricoTipo.fechamento,
  VendaUsadoHistoricoTipo.documentacao,
  VendaUsadoHistoricoTipo.contrato,
  VendaUsadoHistoricoTipo.chave,
  VendaUsadoHistoricoTipo.pos_venda,
];

export type SituacaoPortal =
  | 'sem_operacao'
  | 'captacao'
  | 'disponivel'
  | 'negociacao'
  | 'vendido'
  | 'indisponivel';

export function money(value: unknown): number | null {
  return toMoneyNumber(value as never);
}

export function tituloImovel(imovel: {
  tipo: Parameters<typeof imovelTitulo>[0]['tipo'];
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
}): string {
  return imovelTitulo(imovel);
}

export function situacaoImovel(opts: {
  temCaptacao: boolean;
  vendaStatus?: string | null;
  propostasAbertas?: number;
}): SituacaoPortal {
  if (opts.vendaStatus === 'vendido') return 'vendido';
  if (opts.vendaStatus === 'indisponivel') return 'indisponivel';
  if (opts.vendaStatus === 'reservado') return 'negociacao';
  if (opts.vendaStatus === 'disponivel') {
    return (opts.propostasAbertas ?? 0) > 0 ? 'negociacao' : 'disponivel';
  }
  if (opts.temCaptacao) return 'captacao';
  return 'sem_operacao';
}
