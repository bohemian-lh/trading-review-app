import React from 'react';
import { pdf } from '@react-pdf/renderer';
import { JournalPdfDocument } from './JournalPdfDocument';
import type { JournalRow } from './JournalPdfDocument';

export async function exportJournalPdf(
  rows: JournalRow[],
  groupIds: string[],
  groupNames: string[],
): Promise<void> {
  const doc = React.createElement(JournalPdfDocument, { rows, groupIds, groupNames });
  // pdf() expects <Document> element; JournalPdfDocument renders one at runtime
  const blob = await pdf(doc as React.ReactElement).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `当前交易_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
