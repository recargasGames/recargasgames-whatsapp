const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURACIÓN
// ===============================

const NUMERO_ADMIN = "584120000000@c.us";
// Cambia el número anterior por tu número real de WhatsApp.

const precios = {
  "110": 770,
  "220": 1540,
  "341": 2300,
  "572": 3850,
  "1166": 7150,
  "2398": 14100,
  "6160": 35900,
};

// ===============================
// VARIABLES
// ===============================

let qrActual = null;
let whatsappListo = false;

const usuarios = new Map();
const mensajesProcesados = new Set();

// ===============================
// CLIENTE DE WHATSAPP
// ===============================

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "recargasgames",
  }),

  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-zygote",
      "--single-process",
    ],
  },
});

// ===============================
// EVENTOS DE WHATSAPP
// ===============================

client.on("qr", async (qr) => {
  console.log("Nuevo código QR generado.");

  qrActual = qr;
  whatsappListo = false;

  qrcodeTerminal.generate(qr, {
    small: true,
  });
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado.");
});

client.on("ready", () => {
  whatsappListo = true;
  qrActual = null;

  console.log("WhatsApp conectado correctamente.");
});

client.on("auth_failure", (mensaje) => {
  whatsappListo = false;

  console.error("Error de autenticación:", mensaje);
});

client.on("disconnected", (motivo) => {
  whatsappListo = false;

  console.log("WhatsApp desconectado:", motivo);
});

// ===============================
// FUNCIONES
// ===============================

function obtenerUsuario(numero) {
  if (!usuarios.has(numero)) {
    usuarios.set(numero, {
      estado: "inicio",
      producto: null,
      idJugador: null,
      referencia: null,
    });
  }

  return usuarios.get(numero);
}

function menuPrincipal() {
  return `
🎮 *RECARGASGAMES* 🎮

Selecciona una opción:

1️⃣ Recargas Free Fire
2️⃣ Hablar con soporte

Responde con el número de la opción.
`;
}

function menuFreeFire() {
  return `
💎 *FREE FIRE*

Selecciona tu recarga:

💎 110 → 770 Bs
💎 220 → 1540 Bs
💎 341 → 2300 Bs
💎 572 → 3850 Bs
💎 1166 → 7150 Bs
💎 2398 → 14100 Bs
💎 6160 → 35900 Bs

Responde con la cantidad de diamantes.
Ejemplo: *110*
`;
}

function menuPago(producto) {
  const precio = precios[producto];

  return `
💎 *RECARGA SELECCIONADA*

Cantidad: ${producto}
Total: ${precio} Bs

🏦 *Banco de Venezuela*
📱 Pago Móvil

Realiza el pago y luego envía:

1. Los últimos 4 dígitos de la referencia bancaria.
2. Tu ID de jugador de Free Fire.

Primero envía los últimos 4 dígitos de la referencia.
`;
}

function esReferenciaValida(texto) {
  return /^\d{4}$/.test(texto);
}

function esIdJugadorValido(texto) {
  return /^\d{7,20}$/.test(texto);
}

async function enviarMensaje(numero, texto) {
  try {
    await client.sendMessage(numero, texto);
  } catch (error) {
    console.error("Error enviando mensaje:", error.message);
  }
}

// ===============================
// MENSAJES RECIBIDOS
// ===============================

client.on("message", async (message) => {
  try {
    if (message.fromMe) return;

    const idMensaje = message.id?.id;

    if (idMensaje && mensajesProcesados.has(idMensaje)) {
      console.log("Mensaje duplicado ignorado:", idMensaje);
      return;
    }

    if (idMensaje) {
      mensajesProcesados.add(idMensaje);

      setTimeout(() => {
        mensajesProcesados.delete(idMensaje);
      }, 10 * 60 * 1000);
    }

    const numero = message.from;
    const texto = message.body.trim();
    const textoNormalizado = texto.toLowerCase();

    const usuario = obtenerUsuario(numero);

    console.log(`Mensaje recibido de ${numero}: ${texto}`);

    // ===============================
    // COMANDOS GENERALES
    // ===============================

    if (
      textoNormalizado === "hola" ||
      textoNormalizado === "buenas" ||
      textoNormalizado === "inicio" ||
      textoNormalizado === "menu" ||
      textoNormalizado === "menú"
    ) {
      usuario.estado = "inicio";
      usuario.producto = null;
      usuario.idJugador = null;
      usuario.referencia = null;

      await enviarMensaje(numero, menuPrincipal());
      return;
    }

    if (textoNormalizado === "1") {
      usuario.estado = "seleccion_producto";

      await enviarMensaje(numero, menuFreeFire());
      return;
    }

    if (textoNormalizado === "2") {
      await enviarMensaje(
        numero,
        "👨‍💻 Un agente de RECARGASGAMES te atenderá pronto."
      );
      return;
    }

    // ===============================
    // SELECCIÓN DEL PRODUCTO
    // ===============================

    if (usuario.estado === "seleccion_producto") {
      if (precios[texto]) {
        usuario.producto = texto;
        usuario.estado = "esperando_referencia";

        await enviarMensaje(numero, menuPago(texto));
      } else {
        await enviarMensaje(
          numero,
          "❌ Cantidad no válida.\n\n" + menuFreeFire()
        );
      }

      return;
    }

    // ===============================
    // REFERENCIA BANCARIA
    // ===============================

    if (usuario.estado === "esperando_referencia") {
      if (!esReferenciaValida(texto)) {
        await enviarMensaje(
          numero,
          "❌ La referencia debe tener exactamente 4 dígitos.\n\n" +
            "Envía los últimos 4 dígitos de la referencia bancaria."
        );

        return;
      }

      usuario.referencia = texto;
      usuario.estado = "esperando_id";

      await enviarMensaje(
        numero,
        `
✅ Referencia recibida: *${texto}*

Ahora envía tu ID de jugador de Free Fire.
Debe tener más de 6 dígitos.
`
      );

      return;
    }

    // ===============================
    // ID DEL JUGADOR
    // ===============================

    if (usuario.estado === "esperando_id") {
      if (!esIdJugadorValido(texto)) {
        await enviarMensaje(
          numero,
          "❌ ID inválido.\n\nEnvía un ID de Free Fire con más de 6 dígitos."
        );

        return;
      }

      usuario.idJugador = texto;
      usuario.estado = "verificando_pago";

      await enviarMensaje(
        numero,
        `
⏳ *SOLICITUD RECIBIDA*

💎 Producto: ${usuario.producto}
🆔 ID: ${usuario.idJugador}
🧾 Referencia: ${usuario.referencia}
💰 Total: ${precios[usuario.producto]} Bs

Estamos verificando el pago.
Te avisaremos cuando la recarga sea procesada.
`
      );

      // Aviso al administrador
      await enviarMensaje(
        NUMERO_ADMIN,
        `
📥 *NUEVA SOLICITUD DE RECARGA*

👤 Cliente: ${numero}
💎 Producto: ${usuario.producto}
🆔 ID jugador: ${usuario.idJugador}
🧾 Referencia: ${usuario.referencia}
💰 Total: ${precios[usuario.producto]} Bs

Estado: ⏳ Verificando pago
`
      );

      usuario.estado = "finalizado";

      return;
    }

    // ===============================
    // ESTADO FINAL
    // ===============================

    if (usuario.estado === "verificando_pago") {
      await enviarMensaje(
        numero,
        "⏳ Tu solicitud continúa en proceso de verificación."
      );

      return;
    }

    if (usuario.estado === "finalizado") {
      await enviarMensaje(
        numero,
        "✅ Tu solicitud ya fue recibida.\n\nSi deseas realizar otra recarga, escribe *hola*."
      );

      return;
    }

    // ===============================
    // RESPUESTA POR DEFECTO
    // ===============================

    await enviarMensaje(
      numero,
      "No entendí tu mensaje.\n\nEscribe *hola* para ver el menú principal."
    );
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }
});

// ===============================
// RUTA PRINCIPAL
// ===============================

app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <title>RECARGASGAMES WhatsApp</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            margin: 0;
            padding: 20px;
            background: #0b0b0f;
            color: white;
            font-family: Arial, sans-serif;
            text-align: center;
          }

          h1 {
            color: #ffd700;
          }

          a {
            display: inline-block;
            margin-top: 20px;
            padding: 14px 24px;
            border-radius: 10px;
            background: #25d366;
            color: white;
            text-decoration: none;
            font-weight: bold;
          }
        </style>
      </head>

      <body>
        <h1>RECARGASGAMES</h1>
        <p>Bot de WhatsApp</p>
        <p>Estado: ${
          whatsappListo ? "🟢 Conectado" : "🟡 Esperando conexión"
        }</p>

        <a href="/QR">Ver código QR</a>
      </body>
    </html>
  `);
});

// ===============================
// RUTA DEL QR
// ===============================

app.get("/QR", async (req, res) => {
  try {
    if (whatsappListo) {
      return res.send(`
        <html>
          <head>
            <title>WhatsApp conectado</title>
          </head>

          <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:30px;">
            <h1>🟢 WhatsApp conectado</h1>
            <p>El bot de RECARGASGAMES está funcionando correctamente.</p>
          </body>
        </html>
      `);
    }

    if (!qrActual) {
      return res.send(`
        <html>
          <head>
            <meta http-equiv="refresh" content="5">
            <title>Esperando QR</title>
          </head>

          <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:30px;">
            <h1>⏳ Generando código QR...</h1>
            <p>Actualiza la página en unos segundos.</p>
          </body>
        </html>
      `);
    }

    const qrImagen = await qrcode.toDataURL(qrActual);

    res.send(`
      <html>
        <head>
          <title>QR WhatsApp - RECARGASGAMES</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <meta http-equiv="refresh" content="20">
        </head>

        <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:20px;">
          <h1 style="color:#ffd700;">Escanea el código QR</h1>

          <p>Abre WhatsApp en tu teléfono:</p>
          <p>Dispositivos vinculados → Vincular dispositivo</p>

          <img
            src="${qrImagen}"
            style="width:300px;max-width:90%;background:white;padding:15px;border-radius:15px;"
          >

          <p>La página se actualizará automáticamente.</p>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Error generando QR:", error);

    res.status(500).send("Error generando código QR.");
  }
});

// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
  console.log(`Ruta QR: /QR`);
});

// ===============================
// INICIAR WHATSAPP
// ===============================

client.initialize();
