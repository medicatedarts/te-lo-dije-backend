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

// Los tres "tonos" de carta que el cliente puede escoger en el formulario.
// "elocuente" es el estándar (el texto original). Los otros dos son variaciones
// de registro sobre las mismas partes fijas de la carta: saludo, introducción
// (antes de la lista de consecuencias) y los dos párrafos de cierre.
// nombreEsc y temaEsc deben venir ya escapados con escapeHtml() antes de llamar esto.
function getLetterCopy(tone, { nombreEsc, temaEsc }) {
  const safeNombre = nombreEsc || '[nombre del destinatario]';
  const safeTema = temaEsc || '[el tema]';

  switch (tone) {
    case 'libre':
      return {
        greeting: `Oye, ${safeNombre}:`,
        intro: `Esto es pa' que quede constancia: sobre <strong>${safeTema}</strong>, yo te avisé bien clarito de esto:`,
        closing1: `Y mira por dónde... pasó exactamente lo que te dije que iba a pasar.`,
        closing2: `Así que nada, aquí tienes tu sello, bien merecido.`,
      };
    case 'super':
      return {
        greeting: `Muy distinguido/a ${safeNombre}:`,
        intro: `Por medio de la presente comunicación, y en pleno ejercicio de mi derecho a la razón históricamente comprobada, hago constar formalmente que, en relación con el asunto de <strong>${safeTema}</strong>, le fueron advertidas de manera fehaciente, reiterada y con la debida diligencia las consecuencias que a continuación se detallan:`,
        closing1: `No obstante la claridad meridiana de dicha advertencia, usted optó, en el pleno uso de su libre albedrío, por desestimarla y proceder de manera contraria a lo aconsejado. Es así como las consecuencias, en su día meramente hipotéticas, han devenido hoy en su ineludible e incontrovertible realidad.`,
        closing2: `En virtud de lo anterior, y en fiel y solemne cumplimiento de lo prometido, procedo a hacerle entrega oficial y protocolar del sello que legítimamente le corresponde.`,
      };
    case 'elocuente':
    default:
      return {
        greeting: `Estimado/a ${safeNombre}:`,
        intro: `Por la presente se hace constar que, en cuanto al asunto de <strong>${safeTema}</strong>, esta parte le advirtió formal y repetidamente sobre las siguientes consecuencias:`,
        closing1: `A pesar de dicha advertencia, usted decidió proceder por su cuenta. Hoy, las consecuencias antes mencionadas han dejado de ser una posibilidad y son, oficialmente, su realidad.`,
        closing2: `Por lo tanto, y en estricto cumplimiento con lo prometido, se le hace entrega del sello correspondiente.`,
      };
  }
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

  const nombreEsc = escapeHtml(letter.nombre);
  const temaEsc = escapeHtml(letter.tema);
  const remitenteEsc = escapeHtml(letter.remitente) || '[remitente]';
  const copy = getLetterCopy(letter.tone, { nombreEsc, temaEsc });

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
  .sign-off {
    font-size: 10.5pt;
    color: #5A4A5F;
    margin: 46px 0 4px;
  }
  .signature-name {
    font-family: Georgia, serif;
    font-style: italic;
    font-weight: bold;
    font-size: 17pt;
    color: #3A1140;
    margin: 0;
    overflow-wrap: break-word;
  }
  .stamp {
    width: 130px;
    margin-top: 18px;
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

  <p>${copy.greeting}</p>

  <p>${copy.intro}</p>

  <ol>${consequencesHtml || '<li>[sin consecuencias especificadas]</li>'}</ol>

  <p>${copy.closing1}</p>

  <p>${copy.closing2}</p>

  <p class="sign-off">Atentamente,</p>
  <p class="signature-name">${remitenteEsc}</p>

  ${stampImageUrl ? `<img class="stamp" src="${escapeHtml(stampImageUrl)}" alt="Sello Te Lo Dije" />` : ''}
</body>
</html>`;
}

module.exports = { buildLetterHtml, formatDateEs, getLetterCopy };
