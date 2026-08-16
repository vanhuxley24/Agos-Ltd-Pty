import fs from 'fs';
import path from 'path';

// Pure JavaScript Markdown to HTML Converter optimized for Microsoft Word and Print-to-PDF
function markdownToHtml(mdText, title, isWordDoc = false) {
  const lines = mdText.split(/\r?\n/);
  let htmlResult = '';
  let inList = false;
  let inTable = false;
  let tableHeaders = [];
  let tableRows = [];

  const styleHeader = isWordDoc ? `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
    <meta charset="utf-8">
    <title>${title}</title>
    <!--[if gte mso 9]>
    <xml>
    <w:WordDocument>
    <w:View>Print</w:View>
    <w:Zoom>100</w:Zoom>
    <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
      @page {
        size: letter;
        margin: 1.0in;
      }
      body {
        font-family: 'Segoe UI', Arial, sans-serif;
        line-height: 1.6;
        color: #1A2B4B;
        font-size: 11pt;
      }
      h1 {
        font-family: 'Segoe UI Semibold', Arial, sans-serif;
        color: #1A2B4B;
        font-size: 24pt;
        border-bottom: 2px solid #D4AF37;
        padding-bottom: 6px;
        margin-top: 0;
        margin-bottom: 16pt;
      }
      h2 {
        font-family: 'Segoe UI Semibold', Arial, sans-serif;
        color: #1A2B4B;
        font-size: 16pt;
        border-bottom: 1px solid #E2E8F0;
        padding-bottom: 4px;
        margin-top: 24pt;
        margin-bottom: 12pt;
      }
      h3 {
        font-family: 'Segoe UI Semibold', Arial, sans-serif;
        color: #D4AF37;
        font-size: 12pt;
        margin-top: 18pt;
        margin-bottom: 6pt;
      }
      p {
        margin-top: 0;
        margin-bottom: 10pt;
        font-size: 11pt;
      }
      ul, ol {
        margin-top: 0;
        margin-bottom: 12pt;
        padding-left: 20pt;
      }
      li {
        margin-bottom: 4pt;
        font-size: 11pt;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 12pt;
        margin-bottom: 16pt;
      }
      th {
        background-color: #1A2B4B;
        color: #FFFFFF;
        font-weight: bold;
        text-align: left;
        border: 1px solid #CBD5E1;
        padding: 8pt 10pt;
        font-size: 10pt;
      }
      td {
        border: 1px solid #CBD5E1;
        padding: 8pt 10pt;
        text-align: left;
        font-size: 10pt;
      }
      tr:nth-child(even) td {
        background-color: #F8FAFC;
      }
      hr {
        border: 0;
        border-top: 1px dashed #D4AF37;
        margin-top: 20pt;
        margin-bottom: 20pt;
      }
      strong {
        font-weight: bold;
        color: #1A2B4B;
      }
      .badge {
        background-color: #E2E8F0;
        color: #1A2B4B;
        padding: 2px 6px;
        font-size: 9pt;
        font-weight: bold;
        border-radius: 4px;
      }
    </style>
    </head>
    <body>
  ` : `
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
      @media print {
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .no-print {
          display: none !important;
        }
        .page-break {
          page-break-before: always;
        }
      }
      body {
        font-family: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        line-height: 1.6;
        color: #1e293b;
        max-width: 800px;
        margin: 40px auto;
        padding: 0 24px;
        background-color: #fff;
      }
      .print-btn-container {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 30px;
      }
      .print-btn {
        background-color: #1A2B4B;
        color: white;
        border: none;
        padding: 10px 20px;
        font-size: 14px;
        font-weight: bold;
        border-radius: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        transition: all 0.2s;
      }
      .print-btn:hover {
        background-color: #121f37;
        transform: translateY(-1px);
      }
      h1 {
        color: #1A2B4B;
        font-size: 2.2rem;
        border-bottom: 3px solid #D4AF37;
        padding-bottom: 10px;
        margin-top: 0;
        margin-bottom: 24px;
        font-weight: 800;
        letter-spacing: -0.025em;
      }
      h2 {
        color: #1A2B4B;
        font-size: 1.5rem;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 6px;
        margin-top: 40px;
        margin-bottom: 16px;
        font-weight: 700;
        letter-spacing: -0.02em;
      }
      h3 {
        color: #D4AF37;
        font-size: 1.15rem;
        margin-top: 24px;
        margin-bottom: 8px;
        font-weight: 700;
      }
      p {
        margin-top: 0;
        margin-bottom: 16px;
        font-size: 16px;
      }
      ul, ol {
        margin-top: 0;
        margin-bottom: 20px;
        padding-left: 24px;
      }
      li {
        margin-bottom: 6px;
        font-size: 15px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 24px 0;
        box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
        border-radius: 8px;
        overflow: hidden;
      }
      th {
        background-color: #1A2B4B;
        color: white;
        font-weight: 600;
        text-align: left;
        border: 1px solid #e2e8f0;
        padding: 12px 16px;
        font-size: 14px;
      }
      td {
        border: 1px solid #e2e8f0;
        padding: 12px 16px;
        text-align: left;
        font-size: 14px;
      }
      tr:nth-child(even) td {
        background-color: #f8fafc;
      }
      hr {
        border: 0;
        border-top: 1px dashed #D4AF37;
        margin: 32px 0;
      }
      strong {
        font-weight: 600;
        color: #0f172a;
      }
      .signature-block-row {
        display: flex;
        justify-content: space-between;
        margin-top: 50px;
        gap: 40px;
      }
      .signature-space {
        flex: 1;
        border-top: 1px solid #94a3b8;
        padding-top: 8px;
        margin-top: 60px;
        font-size: 13px;
        color: #475569;
      }
    </style>
    </head>
    <body>
      <div class="print-btn-container no-print">
        <button class="print-btn" onclick="window.print()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print Document / Save to PDF
        </button>
      </div>
  `;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // Table detection and parsing
    if (line.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableHeaders = [];
        tableRows = [];
        // Parse header columns
        const cols = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableHeaders = cols;
        continue;
      } else {
        // Skip table separator line (e.g. | :--- | :--- |)
        if (line.includes('---')) {
          continue;
        }
        // Parse standard row
        const cols = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(cols);
        continue;
      }
    } else if (inTable) {
      // Close table
      inTable = false;
      htmlResult += '<table><thead><tr>';
      tableHeaders.forEach(h => {
        htmlResult += `<th>${inlineFormats(h)}</th>`;
      });
      htmlResult += '</tr></thead><tbody>';
      tableRows.forEach(row => {
        htmlResult += '<tr>';
        row.forEach(cell => {
          htmlResult += `<td>${inlineFormats(cell)}</td>`;
        });
        htmlResult += '</tr>';
      });
      htmlResult += '</tbody></table>';
    }

    // List detection
    if (line.startsWith('* ') || line.startsWith('- ')) {
      if (!inList) {
        inList = true;
        htmlResult += '<ul>';
      }
      const itemText = line.substring(2);
      htmlResult += `<li>${inlineFormats(itemText)}</li>`;
      continue;
    } else if (inList) {
      inList = false;
      htmlResult += '</ul>';
    }

    // Empty lines
    if (line === '') {
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      htmlResult += `<h1>${inlineFormats(line.substring(2))}</h1>`;
    } else if (line.startsWith('## ')) {
      htmlResult += `<h2>${inlineFormats(line.substring(3))}</h2>`;
    } else if (line.startsWith('### ')) {
      htmlResult += `<h3>${inlineFormats(line.substring(4))}</h3>`;
    } else if (line.startsWith('---')) {
      htmlResult += `<hr />`;
    } else {
      htmlResult += `<p>${inlineFormats(line)}</p>`;
    }
  }

  // Handle remaining open list or table at the end
  if (inList) {
    htmlResult += '</ul>';
  }
  if (inTable) {
    htmlResult += '<table><thead><tr>';
    tableHeaders.forEach(h => {
      htmlResult += `<th>${inlineFormats(h)}</th>`;
    });
    htmlResult += '</tr></thead><tbody>';
    tableRows.forEach(row => {
      htmlResult += '<tr>';
      row.forEach(cell => {
        htmlResult += `<td>${inlineFormats(cell)}</td>`;
      });
      htmlResult += '</tr>';
    });
    htmlResult += '</tbody></table>';
  }

  htmlResult += `
    </body>
    </html>
  `;

  return htmlResult;
}

function inlineFormats(text) {
  let result = text;
  // Replace bold formats
  result = result.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Replace italic formats
  result = result.replace(/\*(.*?)\*/g, '<em>$1</em>');
  result = result.replace(/_(.*?)_/g, '<em>$1</em>');
  // Handle code markers (e.g. `Admin`)
  result = result.replace(/`(.*?)`/g, '<span class="badge">$1</span>');
  // Handle line breaks
  result = result.replace(/<br>/gi, '<br />');
  return result;
}

// Convert core project files
const filesToConvert = [
  { md: 'DOCUMENTATION.md', doc: 'DOCUMENTATION.doc', html: 'DOCUMENTATION.html', title: 'System Documentation - Agos Retail POS & Inventory Suite' },
  { md: 'SCOPE_OF_WORK.md', doc: 'SCOPE_OF_WORK.doc', html: 'SCOPE_OF_WORK.html', title: 'Scope of Work (SOW) - Agos Retail POS & Inventory Suite' },
  { md: 'INVOICE.md', doc: 'INVOICE.doc', html: 'INVOICE.html', title: 'Invoice INV-2026-0703 - Agos Retail POS & Inventory Suite' }
];

filesToConvert.forEach(item => {
  const mdPath = path.resolve(item.md);
  if (fs.existsSync(mdPath)) {
    const mdContent = fs.readFileSync(mdPath, 'utf8');
    
    // Generate .doc (Microsoft Word HTML)
    const docHtml = markdownToHtml(mdContent, item.title, true);
    fs.writeFileSync(path.resolve(item.doc), docHtml, 'utf8');
    console.log(`Successfully generated Word Document: ${item.doc}`);

    // Generate printable .html
    const printHtml = markdownToHtml(mdContent, item.title, false);
    fs.writeFileSync(path.resolve(item.html), printHtml, 'utf8');
    console.log(`Successfully generated Standalone HTML (Save as PDF): ${item.html}`);
  } else {
    console.warn(`File not found: ${item.md}`);
  }
});
