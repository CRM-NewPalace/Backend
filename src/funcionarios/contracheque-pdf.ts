import PDFDocument from 'pdfkit';

type Lancamento = { descricao: string; valor: number };

export type ContrachequePdfInput = {
  empresa: string;
  nome: string;
  cargo: string;
  competenciaLabel: string;
  dataPagamentoLabel: string;
  salarioBruto: number;
  beneficios: Lancamento[];
  descontos: Lancamento[];
  salarioLiquido: number;
  observacoes?: string;
};

function brl(n: number) {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function buildContrachequePdf(
  input: ContrachequePdfInput,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: {
        Title: `Contracheque — ${input.nome}`,
        Author: input.empresa,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy: [number, number, number] = [2, 21, 45];
    const muted: [number, number, number] = [100, 116, 139];
    const pageW = doc.page.width;
    const left = 48;
    const width = pageW - 96;

    doc.rect(0, 0, pageW, 88).fill(navy);
    doc.fillColor('#ffffff').fontSize(18).font('Helvetica-Bold');
    doc.text(input.empresa || 'Contracheque', left, 28, { width });
    doc.fontSize(11).font('Helvetica').fillColor('#cbd5e1');
    doc.text('Recibo de pagamento de salário', left, 54, { width });

    let y = 116;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(12);
    doc.text('Dados do funcionário', left, y);
    y += 22;
    doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
    const rows: [string, string][] = [
      ['Nome', input.nome],
      ['Cargo', input.cargo],
      ['Competência', input.competenciaLabel],
      ['Data de pagamento', input.dataPagamentoLabel],
    ];
    for (const [label, value] of rows) {
      doc.fillColor(muted).text(label, left, y, { width: 160 });
      doc.fillColor('#0f172a').text(value, left + 170, y, { width: width - 170 });
      y += 18;
    }

    y += 16;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(12);
    doc.text('Proventos e descontos', left, y);
    y += 20;

    const line = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      doc.fillColor('#0f172a').text(label, left, y, { width: width - 120 });
      doc.text(value, left + width - 120, y, { width: 120, align: 'right' });
      y += 16;
    };

    line('Salário bruto', brl(input.salarioBruto), true);
    if (input.beneficios.length === 0) {
      line('Benefícios / adicionais', brl(0));
    } else {
      y += 4;
      doc.fillColor(muted).font('Helvetica-Bold').fontSize(9);
      doc.text('Benefícios / adicionais', left, y);
      y += 14;
      for (const item of input.beneficios) {
        line(`  ${item.descricao}`, brl(item.valor));
      }
    }

    if (input.descontos.length === 0) {
      line('Descontos', brl(0));
    } else {
      y += 4;
      doc.fillColor(muted).font('Helvetica-Bold').fontSize(9);
      doc.text('Descontos', left, y);
      y += 14;
      for (const item of input.descontos) {
        line(`  ${item.descricao}`, `- ${brl(item.valor)}`);
      }
    }

    y += 8;
    doc.moveTo(left, y).lineTo(left + width, y).strokeColor('#e2e8f0').stroke();
    y += 12;
    line('Salário líquido', brl(input.salarioLiquido), true);

    if (input.observacoes?.trim()) {
      y += 24;
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(12);
      doc.text('Observações', left, y);
      y += 18;
      doc.font('Helvetica').fontSize(10).fillColor('#334155');
      doc.text(input.observacoes.trim(), left, y, { width });
    }

    doc
      .fontSize(8)
      .fillColor(muted)
      .text(
        'Documento gerado pelo CRM com os dados cadastrados do funcionário.',
        left,
        doc.page.height - 56,
        { width },
      );

    doc.end();
  });
}
