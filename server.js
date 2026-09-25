// server.js
// Backend de "Te Lo Dije": recibe el pedido -> cobra con Stripe -> al confirmarse el pago,
// manda la carta a imprimir y enviar por correo con Lob. Sin intervención humana en el medio.
//
// Cómo correrlo (ver README.md para más detalle):
//   1. cp .env.example .env   y llena las llaves
//   2. npm install
//   3. npm start
//   4. en otra terminal, para probar webhooks localmente: stripe listen --forward-to localhost:4000/api/webhook/stripe

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Stripe = require('stripe');
const { createOrder, getOrder, updateOrder, deleteOrder } = require('./store');
const { buildLetterHtml } = require('./letterTemplate');

const PORT = process.env.PORT || 4000;
const BACKEND_PUBLIC_URL = process.env.BACKEND_PUBLIC_URL || `http://localhost:${PORT}`;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5500';

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY no está configurada todavía — el checkout va a fallar hasta que la pongas en .env');
}
if (!process.env.LOB_API_KEY) {
  console.warn('⚠️  LOB_API_KEY no está configurada todavía — el envío postal va a fallar hasta que la pongas en .env');
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const app = express();
app.use(cors());

// Sirve los archivos de /assets (incluyendo el sello) como URLs públicas simples,
// ej. http://localhost:4000/assets/sello-te-lo-dije.png
// Así no necesitas subir la imagen a ningún hosting aparte (Drive, S3, etc.) —
// el mismo backend se la sirve a Lob cuando arma la carta.
app.use('/assets', express.static(require('path').join(__dirname, 'assets')));

// -----------------------------------------------------------------------
// 1) Crear el pedido + la sesión de pago de Stripe
// -----------------------------------------------------------------------
// OJO: esta ruta usa express.json() normal. La ruta del webhook (más abajo)
// necesita el body "crudo" para verificar la firma de Stripe, así que va
// registrada por separado, ANTES de app.use(express.json()) global.
app.post('/api/webhook/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;

  try {
    const signature = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Firma de webhook inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata && session.metadata.orderId;

    if (!orderId) {
      console.error('checkout.session.completed sin orderId en metadata');
      return res.status(200).send('ok (sin orderId)');
    }

    const order = getOrder(orderId);
    if (!order) {
      console.error('Pedido no encontrado:', orderId);
      return res.status(200).send('ok (pedido no encontrado)');
    }

    updateOrder(orderId, { status: 'paid', stripeSessionId: session.id });

    try {
      const lobLetterId = await sendLetterViaLob(order);
      updateOrder(orderId, { status: 'sent', lobLetterId, error: null });
      console.log(`✅ Carta enviada a imprimir/correo. Pedido ${orderId} -> Lob letter ${lobLetterId}`);
    } catch (err) {
      console.error(`❌ Falló el envío a Lob para el pedido ${orderId}:`, err.message);
      updateOrder(orderId, { status: 'error', error: err.message });
      // Aquí conviene además notificarte a ti mismo (email/Slack) de que algo falló,
      // para poder reintentar manualmente ese pedido puntual.
    }
  }

  res.status(200).send('ok');
});

// A partir de aquí sí usamos JSON parseado normal para el resto de las rutas.
app.use(express.json());

app.post('/api/checkout', async (req, res) => {
  try {
    const { tema, consequences, nombre, remitente, address, consent } = req.body || {};

    // Validación mínima — que no llegue un pedido vacío o sin dirección.
    if (!tema || !nombre || !address || !address.line1 || !address.city || !address.zip) {
      return res.status(400).json({ error: 'Faltan campos requeridos (tema, nombre, dirección).' });
    }
    if (!Array.isArray(consequences) || consequences.filter(Boolean).length === 0) {
      return res.status(400).json({ error: 'Añade al menos una consecuencia.' });
    }
    // El consentimiento se valida también aquí, en el servidor — no basta con que
    // el checkbox esté marcado en el navegador, porque cualquiera puede saltarse
    // el frontend y llamar a esta ruta directamente.
    if (!consent || !consent.ageAndAuthorized || !consent.acceptedTerms) {
      return res.status(400).json({ error: 'Falta confirmar la edad, autorización y aceptación de los términos.' });
    }

    const order = createOrder({
      tema,
      consequences,
      nombre,
      remitente,
      address,
      consent: {
        ageAndAuthorized: true,
        acceptedTerms: true,
        consentedAt: new Date().toISOString(),
        consentIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress || null,
      },
    });

    const priceCents = parseInt(process.env.LETTER_PRICE_CENTS || '1499', 10);
    const currency = process.env.STRIPE_CURRENCY || 'usd';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency,
            unit_amount: priceCents,
            product_data: {
              name: 'Carta "Te Lo Dije" — impresa y enviada por correo',
              description: `Para: ${nombre}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: { orderId: order.id },
      success_url: `${FRONTEND_URL}/gracias.html?order=${order.id}`,
      cancel_url: `${FRONTEND_URL}/index.html?cancelled=1`,
    });

    updateOrder(order.id, { stripeSessionId: session.id });

    res.json({ checkoutUrl: session.url, orderId: order.id });
  } catch (err) {
    console.error('Error creando el checkout:', err.message);
    res.status(500).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo en un momento.' });
  }
});

// -----------------------------------------------------------------------
// 2) Consultar el estado de un pedido (para una página de "gracias" que
//    quiera mostrar "tu carta va en camino" una vez Lob confirme el envío)
// -----------------------------------------------------------------------
app.get('/api/order/:id', (req, res) => {
  const order = getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido no encontrado' });
  res.json({
    id: order.id,
    status: order.status,
    expNumber: order.expNumber,
    lobLetterId: order.lobLetterId,
  });
});

// -----------------------------------------------------------------------
// 2b) Solicitud de eliminación de datos (derecho al borrado)
// -----------------------------------------------------------------------
// Uso manual por ahora: cuando alguien pida por correo que borres su pedido,
// tú (el dueño del sitio) llamas esta ruta con el token de administrador.
// No está expuesta al público — no hay botón en el sitio que la dispare directo,
// justamente para que un extraño no pueda borrar el pedido de otra persona.
//
// Ejemplo:
//   curl -X DELETE http://localhost:4000/api/order/<id> \
//     -H "x-admin-token: TU_ADMIN_TOKEN"
app.delete('/api/order/:id', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const deleted = deleteOrder(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Pedido no encontrado' });

  res.json({ ok: true, message: `Pedido ${req.params.id} eliminado.` });
});

// -----------------------------------------------------------------------
// 3) Envío a Lob (impresión + correo físico, sin intervención humana)
// -----------------------------------------------------------------------
async function sendLetterViaLob(order) {
  const apiKey = process.env.LOB_API_KEY;
  if (!apiKey) throw new Error('LOB_API_KEY no configurada');

  const html = buildLetterHtml(order, process.env.STAMP_IMAGE_URL);
  const addr = order.letter.address;

  const from = process.env.LOB_FROM_ADDRESS_ID
    ? process.env.LOB_FROM_ADDRESS_ID
    : {
        name: process.env.LOB_FROM_NAME || 'Te Lo Dije',
        address_line1: process.env.LOB_FROM_ADDRESS_LINE1,
        address_line2: process.env.LOB_FROM_ADDRESS_LINE2 || undefined,
        address_city: process.env.LOB_FROM_ADDRESS_CITY,
        address_state: process.env.LOB_FROM_ADDRESS_STATE,
        address_zip: process.env.LOB_FROM_ADDRESS_ZIP,
        address_country: process.env.LOB_FROM_ADDRESS_COUNTRY || 'US',
      };

  const body = {
    description: `Te Lo Dije - ${order.letter.nombre} - ${order.expNumber}`,
    to: {
      name: order.letter.nombre,
      address_line1: addr.line1,
      address_line2: addr.line2 || undefined,
      address_city: addr.city,
      address_state: addr.state,
      address_zip: addr.zip,
      address_country: addr.country || 'US',
    },
    from,
    file: html,
    color: true,
    double_sided: false,
    address_placement: 'insert_blank_page',
    size: 'us_letter',
  };

  const response = await fetch('https://api.lob.com/v1/letters', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + Buffer.from(apiKey + ':').toString('base64'),
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `Lob respondió ${response.status}`);
  }

  return data.id; // id de la carta en Lob, útil para rastrear el envío
}

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Te Lo Dije backend corriendo en ${BACKEND_PUBLIC_URL}`);
});
