import { CaptacaoImovelTipo } from '@prisma/client';

export const CAPTACAO_ORIGENS_PADRAO = [
  'indicação',
  'site',
  'instagram',
  'facebook',
  'portal',
  'telefone',
  'whatsapp',
  'prospecção',
  'cliente existente',
  'outro',
] as const;

export const CAPTACAO_IMOVEL_TIPO_LABEL: Record<CaptacaoImovelTipo, string> = {
  apartamento: 'Apartamento',
  casa: 'Casa',
  terreno: 'Terreno',
  sala_comercial: 'Sala comercial',
  loja: 'Loja',
  galpao: 'Galpão',
  fazenda: 'Fazenda',
  chacara: 'Chácara',
  outro: 'Outro',
};

export function imovelTitulo(imovel: {
  tipo: CaptacaoImovelTipo;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
}): string {
  const tipo = CAPTACAO_IMOVEL_TIPO_LABEL[imovel.tipo] ?? imovel.tipo;
  const rua = [imovel.logradouro, imovel.numero].filter(Boolean).join(', ');
  const local = [imovel.bairro, imovel.cidade].filter(Boolean).join(', ');
  return [tipo, rua || local].filter(Boolean).join(' — ');
}
