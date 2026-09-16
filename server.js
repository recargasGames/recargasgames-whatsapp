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

const NUMERO_ADMIN = "584264696162@c.us";
// Cambia este número por el número real del administrador.

// ===============================
// PRECIOS
// ===============================

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
// ESTADO DEL BOT
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
// VERSIÓN INSTALADA
// ===============================

try {
  const packageInfo = require("whatsapp-web.js/package.json");
  console.log("Versión whatsapp-web.js:", packageInfo.version);
} catch (error) {
  console.log("No se pudo comprobar la versión de whatsapp-web.js");
}

// ===============================
// EVENTOS DE WHATSAPP
// ===============================

client.on("qr", (qr) => {
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
      referencia: null,
      idJugador: null,
    });
  }

  return usuarios.get(numero);
}

function enviarMensaje(numero, texto) {
  return client.sendMessage(numero, texto);
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

Responde con la cantidad.
Ejemplo: *110*
`;
}

function mensajePago(producto) {
  return `
💎 *RECARGA SELECCIONADA*

Cantidad: ${producto}
Total: ${precios[producto]} Bs

🏦 *Banco de Venezuela*
📱 Pago Móvil

Realiza el pago y envía los últimos 4 dígitos de la referencia bancaria.
`;
}

function referenciaValida(texto) {
  return /^\d{4}$/.test(texto);
}

function idJugadorValido(texto) {
  return /^\d{7,20}$/.test(texto);
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
    // MENÚ PRINCIPAL
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
      usuario.referencia = null;
      usuario.idJugador = null;

      await enviarMensaje(numero, menuPrincipal());
      return;
    }

    if (texto === "1" && usuario.estado !== "esperando_id") {
      usuario.estado = "seleccion_producto";

      await enviarMensaje(numero, menuFreeFire());
      return;
    }

    if (texto === "2" && usuario.estado === "inicio") {
      await enviarMensaje(
        numero,
        "👨‍💻 Un agente de RECARGASGAMES te atenderá pronto."
      );
      return;
    }

    // ===============================
    // SELECCIÓN DE PRODUCTO
    // ===============================

    if (usuario.estado === "seleccion_producto") {
      if (!precios[texto]) {
        await enviarMensaje(
          numero,
          "❌ Cantidad no válida.\n\n" + menuFreeFire()
        );
        return;
      }

      usuario.producto = texto;
      usuario.estado = "esperando_referencia";

      await enviarMensaje(numero, mensajePago(texto));
      return;
    }

    // ===============================
    // REFERENCIA BANCARIA
    // ===============================

    if (usuario.estado === "esperando_referencia") {
      if (!referenciaValida(texto)) {
        await enviarMensaje(
          numero,
          "❌ La referencia debe tener exactamente 4 dígitos.\n\nEnvía los últimos 4 dígitos."
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
      if (!idJugadorValido(texto)) {
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
📥 *SOLICITUD RECIBIDA*

💎 Producto: ${usuario.producto}
🆔 ID: ${usuario.idJugador}
🧾 Referencia: ${usuario.referencia}
💰 Total: ${precios[usuario.producto]} Bs

⏳ Estamos verificando el pago.
Te avisaremos cuando la recarga sea procesada.
`
      );

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
    // ESTADOS FINALES
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
        "✅ Tu solicitud ya fue recibida.\n\nEscribe *hola* para realizar otra recarga."
      );
      return;
    }

    await enviarMensaje(
      numero,
      "No entendí tu mensaje.\n\nEscribe *hola* para ver el menú."
    );
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }
});

// ===============================
// PÁGINA PRINCIPAL
// ===============================

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RECARGASGAMES WhatsApp</title>
  <style>
    body {
      margin: 0;
      padding: 30px;
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
      padding: 14px 25px;
      background: #25d366;
      color: white;
      text-decoration: none;
      border-radius: 10px;
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
// PÁGINA QR
// ===============================

app.get("/QR", async (req, res) => {
  try {
    if (whatsappListo) {
      res.send(`
        <html>
        <head>
          <title>WhatsApp conectado</title>
        </head>
        <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:30px;">
          <h1>🟢 WhatsApp conectado</h1>
          <p>El bot está funcionando correctamente.</p>
        </body>
        </html>
      `);

      return;
    }

    if (!qrActual) {
      res.send(`
        <html>
        <head>
          <meta http-equiv="refresh" content="5">
          <title>Generando QR</title>
        </head>
        <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:30px;">
          <h1>⏳ Generando código QR...</h1>
          <p>La página se actualizará automáticamente.</p>
        </body>
        </html>
      `);

      return;
    }

    const qrImagen = await qrcode.toDataURL(qrActual);

    res.send(`
      <html>
      <head>
        <title>QR WhatsApp</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="20">
      </head>
      <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:20px;">
        <h1 style="color:#ffd700;">Escanea el código QR</h1>
        <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
        <img
          src="${qrImagen}"
          style="width:300px;max-width:90%;background:white;padding:15px;border-radius:15px;"
        >
        <p>El código se actualizará automáticamente.</p>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error generando QR:", error);
    res.status(500).send("Error generando código QR.");
  }
});

// ===============================
// SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
  console.log(`Ruta QR: /QR`);
});

// ===============================
// INICIAR WHATSAPP
// ===============================

client.initialize();
