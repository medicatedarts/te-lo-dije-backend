# Te Lo Dije — Backend

Recibe el pedido desde el formulario, cobra con **Stripe**, y en cuanto el pago se confirma
manda la carta a imprimir y enviar por correo físico con **Lob** — sin que tú ni el cliente
tengan que hacer nada más.

## Flujo

```
Formulario (index.html)
      │  POST /api/checkout  { tema, consequences, nombre, remitente, address }
      ▼
server.js  →  crea el pedido (status: pending)  →  crea sesión de Stripe  →  devuelve checkoutUrl
      │
      ▼
Cliente paga en Stripe
      │
      ▼
Stripe llama a  POST /api/webhook/stripe
      │
      ▼
server.js marca el pedido "paid"  →  genera el HTML de la carta  →  lo manda a Lob
      │
      ▼
Lob imprime la carta y la envía por correo postal al destinatario
      │
      ▼
server.js marca el pedido "sent"
```

## 1. Instalar

```bash
cd backend
npm install
cp .env.example .env
```

Abre `.env` y llena lo que puedas (ver sección de llaves más abajo). Puedes empezar solo con
las de Stripe en modo *test* y dejar Lob para después — el checkout funcionará, solo el paso
de envío fallará (y el pedido queda marcado `status: "error"` en `orders.json`, sin perder el pedido).

## 2. Correr en desarrollo

```bash
npm run dev
```

El servidor queda escuchando en `http://localhost:4000` (o el `PORT` que pongas en `.env`).

Para probar los webhooks de Stripe localmente necesitas el [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:4000/api/webhook/stripe
```

Ese comando te da un `whsec_...` — pégalo en `STRIPE_WEBHOOK_SECRET` en tu `.env`.

## 3. Llaves que necesitas conseguir

| Variable | Dónde conseguirla |
|---|---|
| `STRIPE_SECRET_KEY` | [dashboard.stripe.com](https://dashboard.stripe.com) → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `stripe listen` (desarrollo) o Developers → Webhooks → tu endpoint (producción) |
| `LOB_API_KEY` | [dashboard.lob.com](https://dashboard.lob.com) → Settings → API Keys. Usa la **test key** mientras pruebas — simula el envío sin imprimir ni cobrar nada real |
| `LOB_FROM_ADDRESS_ID` *(o los campos `LOB_FROM_*`)* | Tu dirección de remitente. Puedes crearla una vez en el dashboard de Lob y copiar su ID, o llenar los campos sueltos en `.env` |
| `STAMP_IMAGE_URL` | Ya no necesitas subirla a ningún lado: el backend sirve `assets/sello-te-lo-dije.png` como archivo estático en `/assets`. Solo apunta esto a `${BACKEND_PUBLIC_URL}/assets/sello-te-lo-dije.png`. **Ojo:** Lob tiene que poder alcanzar esa URL desde internet — en `localhost` puro no va a funcionar; usa [ngrok](https://ngrok.com) mientras pruebas localmente, o la URL real una vez el backend esté desplegado. (Google Drive no es buena opción aquí: sus links no sirven la imagen directamente de forma confiable, muestran pantallas de confirmación o limitan las descargas.) |

## 4. Conectar el formulario (`index.html`)

En `index.html`, el botón "Continuar al pago" ya está preparado para llamar a este backend.
Solo asegúrate de que la constante `BACKEND_URL` al inicio del `<script>` apunte a donde
esté corriendo este servidor (`http://localhost:4000` en desarrollo, o tu dominio real en producción).

## 5. Desplegar a producción

- Sube este backend a cualquier hosting de Node (Render, Railway, Fly.io, un VPS, etc.)
- Configura las variables de entorno reales ahí (nunca subas tu `.env` a git)
- En Stripe, crea el webhook apuntando a `https://tu-dominio.com/api/webhook/stripe`
  y copia el signing secret real a `STRIPE_WEBHOOK_SECRET`
- Cambia `LOB_API_KEY` de la test key a la **live key** solo cuando estés listo para
  imprimir y enviar cartas reales — así evitas gastos mientras pruebas
- Reemplaza `store.js` (el archivo JSON) por una base de datos real antes de recibir
  tráfico de verdad — el archivo JSON no soporta escrituras simultáneas de forma segura

## Notas

- Si el envío a Lob falla después de un pago exitoso (ej. Lob caído, dirección inválida),
  el pedido queda marcado `status: "error"` en `orders.json` con el motivo en `error`,
  y el cliente ya pagó — conviene agregar una alerta (email/Slack) en el `catch` del
  webhook para que te enteres y puedas reenviar esa carta manualmente desde el
  dashboard de Lob si hace falta.
- Este servicio es de entretenimiento/broma, no un documento legal — el texto de la
  carta ya lo deja claro, pero vale la pena repetirlo en los términos de servicio del sitio.

## Cumplimiento legal / privacidad

El sitio (`index.html`) ahora incluye:
- Página de **Privacidad** (`privacy.html`), **Términos de Servicio** (`terms.html`) y
  **Reembolsos** (`refund.html`), enlazadas desde el footer y desde el checkbox de
  consentimiento antes de pagar.
- Un **checkbox obligatorio** de "soy mayor de 18 y tengo autorización para enviar esta
  carta" + aceptación de los términos, validado tanto en el navegador como en este backend
  (`/api/checkout` rechaza el pedido si `consent.ageAndAuthorized` o `consent.acceptedTerms`
  no vienen en `true`).
- El consentimiento queda guardado en `orders.json` junto con la fecha/hora y la IP, por si
  alguna vez necesitas demostrar que el cliente lo aceptó.
- Un endpoint `DELETE /api/order/:id` protegido con `ADMIN_TOKEN` para borrar los datos de
  un pedido cuando alguien lo solicite (ver `.env.example`). No está expuesto en el sitio
  público — lo usas tú manualmente cuando llegue una solicitud a tu correo de contacto.

**Pendiente de tu parte antes de lanzar:**
- Reemplazar los placeholders `[Nombre legal del negocio]` / `[dirección postal]` /
  `hola@telodije.com` en `privacy.html`, `terms.html`, `refund.html` y el footer de
  `index.html` por tus datos reales.
- Confirmar que tienes los derechos de uso comercial de la imagen del sello "TE LO DIJE"
  (si la diseñaste tú o la mandaste a hacer, estás cubierto; si la bajaste de internet,
  vale la pena verificarlo antes de usarla como marca de un producto que cobra dinero).
- Que un abogado revise las tres páginas legales — son una base razonable, no un documento
  final.
