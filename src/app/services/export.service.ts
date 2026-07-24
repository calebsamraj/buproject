import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';

@Injectable({
  providedIn: 'root'
})
export class ExportService {

  private escapeCsvCell(v: any): string {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[\n\r\t,\"]/g.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  private toCsv(rows: any[]): string {
    if (!Array.isArray(rows) || rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push(headers.map((h) => this.escapeCsvCell(r[h])).join(','));
    }
    return lines.join('\n');
  }

  private downloadBlob(filename: string, blob: Blob): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  formatTimestamp(d = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  }

  exportPdfFromText(filename: string, title: string, sections: [string, any[] | string][]): void {
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text(title, 40, 45);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);

    let y = 65;
    const pageHeight = 560; // approximate for A4 in points

    const addLine = (line: string) => {
      const maxChars = 95;
      for (let i = 0; i < line.length; i += maxChars) {
        const chunk = line.slice(i, i + maxChars);
        if (y > pageHeight) {
          doc.addPage();
          y = 40;
        }
        doc.text(chunk, 40, y);
        y += 14;
      }
    };

    for (const [sectionTitle, content] of sections) {
      if (y > pageHeight) {
        doc.addPage();
        y = 40;
      }
      doc.setFont('helvetica', 'bold');
      doc.text(sectionTitle, 40, y);
      y += 14;
      doc.setFont('helvetica', 'normal');

      if (!content || (Array.isArray(content) && content.length === 0)) {
        addLine('(empty)');
        y += 8;
        continue;
      }

      if (Array.isArray(content)) {
        const headers = Object.keys(content[0] || {});
        addLine(headers.join(' | '));
        for (const row of content.slice(0, 200)) {
          const line = headers.map((h) => String(row[h] ?? '')).join(' | ');
          addLine(line);
        }
        if (content.length > 200) addLine(`...(truncated ${content.length - 200} rows)`);
      } else {
        addLine(String(content));
      }

      y += 12;
    }

    doc.save(filename);
  }

  exportChartsToCsv(filenameBase: string, buRows: any[], ageingRows: any[]): void {
    const parts: string[] = [];

    parts.push('# BU Wise Total Count');
    parts.push(this.toCsv(buRows) || '');
    parts.push('');

    parts.push('# Request Ageing Days');
    parts.push(this.toCsv(ageingRows) || '');
    parts.push('');

    this.downloadBlob(
      `${filenameBase}.csv`,
      new Blob([parts.join('\n')], { type: 'text/csv;charset=utf-8' })
    );
  }

  exportChartsToJson(filenameBase: string, buRows: any[], ageingRows: any[], filters: any): void {
    const payload = {
      generatedAt: new Date().toISOString(),
      filters,
      charts: {
        bu_wise_total_count: buRows,
        request_ageing_days: ageingRows,
      },
    };
    this.downloadBlob(
      `${filenameBase}.json`,
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
    );
  }
}
