export function pdfHtmlWrapper(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, sans-serif; color: #111827; line-height: 1.7; font-size: 12pt; max-width: 210mm; margin: 0 auto; padding: 20mm 15mm; }
  h1 { font-size: 22pt; font-weight: 700; color: #0a0e18; margin-bottom: 4mm; border-bottom: 2pt solid #CCFF00; padding-bottom: 3mm; }
  h2 { font-size: 14pt; font-weight: 700; color: #0a0e18; margin-top: 8mm; margin-bottom: 3mm; }
  h3 { font-size: 11pt; font-weight: 600; color: #374151; margin-top: 5mm; margin-bottom: 2mm; }
  p, li { font-size: 9.5pt; color: #4b5563; margin-bottom: 2mm; }
  ul { padding-left: 6mm; margin-bottom: 3mm; }
  li { margin-bottom: 1.5mm; }
  strong { color: #1f2937; }
  .header { display: flex; align-items: center; gap: 5mm; margin-bottom: 10mm; padding-bottom: 5mm; border-bottom: 1pt solid #e5e7eb; }
  .logo { font-size: 20pt; font-weight: 800; color: #0a0e18; }
  .logo span { color: #CCFF00; background: #0a0e18; padding: 1mm 3mm; border-radius: 2mm; }
  .date { font-size: 8pt; color: #9ca3af; margin-bottom: 6mm; }
  .footer { margin-top: 15mm; padding-top: 4mm; border-top: 1pt solid #e5e7eb; font-size: 7.5pt; color: #9ca3af; text-align: center; }
  a { color: #2563eb; text-decoration: none; }
  @media print { body { padding: 15mm; } }
</style>
</head>
<body>
  <div class="header">
    <div class="logo">Platz<span>Go</span></div>
    <div style="font-size:9pt;color:#6b7280;">plataforma de agendamento de quadras esportivas</div>
  </div>
  ${body}
  <div class="footer">PlatzGo &copy; ${new Date().getFullYear()} &bull; Todos os direitos reservados &bull; www.platzgo.com.br</div>
</body>
</html>`;
}