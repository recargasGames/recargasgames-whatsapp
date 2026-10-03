# RECARGAS GAMES - Bot de WhatsApp

Bot simple de WhatsApp con 3 funciones:

1. **Enviar mensajes desde la pasarela** — Cuando un cliente compra, la pasarela llama a `/api/notificar-pedido` y el bot envía los datos al cliente.
2. **Responder UNA vez a clientes nuevos** — Cuando alguien escribe por primera vez, el bot responde con un saludo y NO vuelve a responder.
3. **NO responder si el admin está atendiendo** — Cuando tú escribes a un cliente, el bot deja de responder en ese chat por 24 horas.

## Endpoints

- `GET /` — Panel principal
- `GET /qr` — Código QR para conectar WhatsApp
- `GET /api/status` — Estado del bot
- `GET /api/diagnostico` — Diagnóstico completo (sin auth)
- `POST /api/enviar` — Enviar mensaje (requiere `x-api-token`)
- `POST /api/notificar-pedido` — Notificar pedido al cliente (requiere `x-api-token`)
- `POST /api/reset-cliente` — Resetear bienvenida de un cliente

## Variables de entorno

- `API_TOKEN` — Token para autenticar las peticiones desde Vercel
- `PORT` — Puerto (Railway lo asigna automáticamente)

## Deployment en Railway

1. Subir el código a GitHub
2. En Railway: **New Project** → **Deploy from GitHub**
3. Agregar variable `API_TOKEN`
4. Esperar a que compile
5. Abrir `/qr` y escanear con WhatsApp
6. Listo ✅
