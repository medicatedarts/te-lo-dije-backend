// letterTemplate.js
// Genera el HTML de la carta que se envía a Lob para imprimir.
// Es un HTML simplificado (sin JS, sin fuentes externas pesadas) pensado para impresión en papel carta.
// Lob necesita que la imagen del sello sea una URL pública (STAMP_IMAGE_URL), no un archivo local ni base64.

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateEs(date = new Date()) {
  const months = ['enero','febrero','marzo','abril','mayo','junio','julio',
                   'agosto','septiembre','octubre','noviembre','diciembre'];
  return `${date.getDate()} de ${months[date.getMonth()]} de ${date.getFullYear()}`;
}

/**
 * @param {Object} order - objeto de pedido tal como lo guarda store.js
 * @param {string} stampImageUrl - URL pública de la imagen del sello (STAMP_IMAGE_URL)
 */
function buildLetterHtml(order, stampImageUrl) {
  const { letter, expNumber, createdAt } = order;
  const consequencesHtml = (letter.consequences || [])
    .filter(Boolean)
    .map(c => `<li>${escapeHtml(c)}</li>`)
    .join('');

  const addr = letter.address || {};
  const addressLines = [
    addr.line1,
    addr.line2,
    [addr.city, addr.state].filter(Boolean).join(', ') + (addr.zip ? ' ' + addr.zip : ''),
  ].filter(Boolean).map(escapeHtml).join('<br/>');

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<style>
  @page { size: letter; margin: 0.85in; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #2A1830;
    font-size: 12.5pt;
    line-height: 1.5;
  }
  .meta {
    display: flex;
    justify-content: space-between;
    font-size: 9.5pt;
    color: #5A4A5F;
    margin-bottom: 26px;
  }
  h1 {
    text-align: center;
    font-family: Georgia, serif;
    font-size: 19pt;
    letter-spacing: 0.03em;
    color: #3A1140;
    margin: 0;
  }
  .sub {
    text-align: center;
    font-size: 9.5pt;
    font-style: italic;
    color: #5A4A5F;
    margin-top: 6px;
  }
  .divider {
    width: 60px; height: 2px; background: #C99A2E;
    margin: 20px auto 26px;
  }
  ol { padding-left: 20px; }
  ol li { margin-bottom: 6px; }
  .sign-line {
    border-top: 1px solid #5A4A5F;
    width: 220px;
    margin-top: 46px;
    padding-top: 6px;
    font-size: 10.5pt;
    color: #5A4A5F;
  }
  .stamp {
    width: 130px;
    margin-top: 10px;
    margin-left: auto;
    transform: rotate(-10deg);
  }
</style>
</head>
<body>
  <div class="meta">
    <span>Exp. Núm. ${escapeHtml(expNumber)}</span>
    <span>${formatDateEs(new Date(createdAt))}</span>
  </div>

  <h1>Notificación de Advertencia Cumplida</h1>
  <p class="sub">(según lo prometido)</p>
  <div class="divider"></div>

  <p>Estimado/a ${escapeHtml(letter.nombre) || '[nombre del destinatario]'}:</p>

  <p>Por la presente se hace constar que, en cuanto al asunto de
     <strong>${escapeHtml(letter.tema) || '[el tema]'}</strong>,
     esta parte le advirtió formal y repetidamente sobre las siguientes consecuencias:</p>

  <ol>${consequencesHtml || '<li>[sin consecuencias especificadas]</li>'}</ol>

  <p>A pesar de dicha advertencia, usted decidió proceder por su cuenta. Hoy, las consecuencias
     antes mencionadas han dejado de ser una posibilidad y son, oficialmente, su realidad.</p>

  <p>Por lo tanto, y en estricto cumplimiento con lo prometido, se le hace entrega del sello
     correspondiente.</p>

  <div class="sign-line">Atentamente, ${escapeHtml(letter.remitente) || '[remitente]'}</div>

  ${stampImageUrl ? `<img class="stamp" src="${escapeHtml(stampImageUrl)}" alt="Sello Te Lo Dije" />` : ''}
</body>
</html>`;
}

module.exports = { buildLetterHtml, formatDateEs };
