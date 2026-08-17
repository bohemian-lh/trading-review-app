import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { JournalPdfDocument } from './JournalPdfDocument';
import { ensurePdfFontsRegistered } from './pdfFonts';
import type { JournalRow } from './JournalPdfDocument';

export async function generateJournalPdfBlob(
  rows: JournalRow[],
  groupIds: string[],
  groupNames: string[],
  colWidths?: number[],
  rowSpacing?: number,
): Promise<Blob> {
  await ensurePdfFontsRegistered();
  const doc = React.createElement(JournalPdfDocument, { rows, groupIds, groupNames, colWidths, rowSpacing });
  // pdf() expects <Document> element; JournalPdfDocument renders one at runtime
  return await pdf(doc as React.ReactElement).toBlob();
}

export async function exportJournalPdf(
  rows: JournalRow[],
  groupIds: string[],
  groupNames: string[],
  colWidths?: number[],
  rowSpacing?: number,
): Promise<void> {
  const blob = await generateJournalPdfBlob(rows, groupIds, groupNames, colWidths, rowSpacing);

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `当前交易_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
