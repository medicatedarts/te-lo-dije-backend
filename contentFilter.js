// contentFilter.js
// Filtro de contenido para "Te Lo Dije".
//
// Por qué existe: esto no es texto que se queda en pantalla — es una carta
// física que se imprime y se envía por correo a la dirección de alguien que
// probablemente no dio consentimiento para recibirla. Si el servicio se usa
// para mandar amenazas, contenido sexual explícito, contenido sobre menores,
// u odio/discriminación, eso expone al negocio a riesgo legal real (acoso
// por correo, violación de los términos de Lob, daño reputacional).
//
// Las groserías comunes (insultos genéricos tipo "idiota", "pendejo", "cabrón",
// palabrotas sueltas) SÍ se permiten — el negocio tiene un tono de broma y
// no es el propósito de este filtro censurar lenguaje fuerte en general.
// Este filtro bloquea contenido que representa un riesgo real, no groserías.
//
// Limitaciones conocidas (léelas antes de confiar 100% en esto):
//  - Es un filtro basado en palabras/frases con normalización básica de
//    acentos y mayúsculas. No entiende contexto ni sarcasmo perfectamente.
//  - Alguien decidido puede evadirlo con errores ortográficos intencionales,
//    espaciado raro, símbolos, etc. No es infalible.
//  - Puede haber, en casos raros, falsos positivos. Si eso pasa seguido con
//    un patrón específico, ajusta la lista de abajo.
//  - Para negocios con más volumen, conviene además una cola de revisión
//    manual para casos límite (pedidos "sospechosos pero no bloqueados").
//
// Cómo añadir tus propios términos sin tocar el código: pon una lista
// separada por comas en la variable de entorno CUSTOM_BLOCKED_TERMS
// (ej. "termino uno,termino dos"). Útil para agregar insultos discriminatorios
// (slurs) específicos que prefieras mantener fuera del código fuente.

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(str = '') {
  return stripAccents(String(str).toLowerCase())
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Amenazas de violencia, daño físico, o intimidación seria.
const THREAT_PATTERNS = [
  /\bte voy a matar\b/, /\bvoy a matarte\b/, /\bte matare\b/, /\bte voy a asesinar\b/,
  /\bvoy a asesinarte\b/, /\bte voy a violar\b/, /\bvoy a violarte\b/,
  /\bmatate\b/, /\bmatarte\b/, /\basesinarte\b/, /\bhomicidio\b/,
  /\bdispararte\b/, /\bte voy a disparar\b/, /\bvoy a dispararte\b/,
  /\bapunalarte\b/, /\bte voy a apunalar\b/, /\bdecapitarte\b/,
  /\bte voy a quemar\b/, /\bvoy a quemar tu casa\b/, /\bvoy a incendiar\b/,
  /\bbomba\b/, /\bexplosivo\b/, /\bterrorista\b/, /\batentado\b/,
  /\bsecuestrarte\b/, /\bte voy a secuestrar\b/, /\bvoy a secuestrarte\b/,
  /\btiroteo\b/, /\bmasacre\b/,
  /\bkill you\b/, /\bgonna kill you\b/, /\bi will kill you\b/, /\bi ll kill you\b/,
  /\bshoot you\b/, /\bstab you\b/, /\bmurder you\b/, /\bbehead you\b/,
  /\bkill yourself\b/, /\bkys\b/, /\bhurt you\b/, /\bbomb threat\b/,
  /\bmass shooting\b/, /\bschool shooting\b/, /\bi ll shoot\b/,
];

// Contenido sexual explícito (no groserías comunes — esas se permiten).
const SEXUAL_EXPLICIT_PATTERNS = [
  /\bviolacion\b/, /\bviolar\b/, /\bviolarte\b/, /\bviolador\b/,
  /\bpedofilia\b/, /\bpedofilo\b/, /\bpedofila\b/,
  /\bpornografia infantil\b/, /\bchild porn\b/, /\bchild sexual\b/,
  /\bincesto\b/, /\bzoofilia\b/, /\bbestialismo\b/,
  /\brape\b/, /\braping\b/, /\brapist\b/, /\bmolest(ar|ed|ing|acion)?\b/,
  /\bpedophile\b/, /\bpedophilia\b/, /\bincest\b/, /\bbestiality\b/,
];

// Referencias a menores — se bloquea solo si aparecen junto a lenguaje
// sexual (para no bloquear cosas normales como "mi sobrino niño" en una
// carta que no tiene nada que ver con esto).
const MINOR_INDICATORS = [
  /\bnino\b/, /\bnina\b/, /\bninos\b/, /\bninas\b/, /\bmenor de edad\b/,
  /\bkid\b/, /\bchild\b/, /\bchildren\b/, /\bminor\b/, /\btoddler\b/,
];
const SEXUAL_INDICATORS = [
  /\bsexual\b/, /\bsexo\b/, /\bdesnud[oa]\b/, /\bsex\b/, /\bnude\b/,
  /\bnaked\b/, /\bporn\b/,
];

function loadCustomTerms() {
  const raw = process.env.CUSTOM_BLOCKED_TERMS || '';
  return raw
    .split(',')
    .map((t) => normalize(t.trim()))
    .filter(Boolean)
    .map((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`));
}

function testPatterns(text, patterns) {
  return patterns.some((re) => re.test(text));
}

/**
 * Revisa todos los campos de texto libre de un pedido.
 * @param {Object} fields - { tema, consequences: string[], nombre, remitente }
 * @returns {{ blocked: boolean, reason?: string }}
 */
function checkContent(fields) {
  const { tema, consequences = [], nombre, remitente } = fields;
  const combined = normalize(
    [tema, ...(consequences || []), nombre, remitente].filter(Boolean).join(' \n ')
  );

  if (testPatterns(combined, THREAT_PATTERNS)) {
    return {
      blocked: true,
      reason: 'El contenido de tu carta parece incluir una amenaza de violencia o daño, y no podemos procesar ese tipo de pedido. Ajusta el texto e inténtalo de nuevo.',
    };
  }

  if (testPatterns(combined, SEXUAL_EXPLICIT_PATTERNS)) {
    return {
      blocked: true,
      reason: 'El contenido de tu carta incluye lenguaje sexual explícito no permitido. Ajusta el texto e inténtalo de nuevo.',
    };
  }

  if (testPatterns(combined, MINOR_INDICATORS) && testPatterns(combined, SEXUAL_INDICATORS)) {
    return {
      blocked: true,
      reason: 'El contenido de tu carta no está permitido. No podemos procesar este pedido.',
    };
  }

  const customTerms = loadCustomTerms();
  if (customTerms.length && testPatterns(combined, customTerms)) {
    return {
      blocked: true,
      reason: 'El contenido de tu carta incluye lenguaje no permitido. Ajusta el texto e inténtalo de nuevo.',
    };
  }

  return { blocked: false };
}

module.exports = { checkContent };
