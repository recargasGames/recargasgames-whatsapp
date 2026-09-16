const express = require("express");
const cors = require("cors");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const ADMIN = process.env.ADMIN_NUMBER || "584120000000@c.us";

let qrActual = null;
let whatsappConectado = false;

// Precios en bolívares
const precios = {
  "110": 770,
  "220": 1540,
  "341": 2300,
  "572": 3850,
  "1166": 7150,
  "2398": 14100,
  "6160": 35900
};

// Sesiones por usuario
const sesiones = {};

function obtenerSesion(telefono) {
  if (!sesiones[telefono]) {
    sesiones[telefono] = {
      paso: "inicio",
      producto: null,
      monto: null,
      referencia: null
    };
  }
  return sesiones[telefono];
}

function formatoBs(monto) {
  return Number(monto).toLocaleString("es-VE") + " Bs";
}

function menuPrincipal() {
  return `🎮 *RECARGASGAMES*

¡Hola! Bienvenido a RecargasGames.

Selecciona una opción:

1️⃣ Comprar diamantes Free Fire
2️⃣ Ver precios
3️⃣ Hablar con soporte

Escribe el número de la opción.`;
}

function menuPrecios() {
  return `💎 *PRECIOS FREE FIRE*

💎 110
💎 220
💎 341
💎 572
💎 1166
💎 2398
💎 6160

Escribe la cantidad que deseas comprar.`;
}

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "recargasgames" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run"
    ]
  }
});

client.on("qr", async (qr) => {
  qrActual = qr;
  whatsappConectado = false;
  qrcodeTerminal.generate(qr, { small: true });
  console.log("Escanea el código QR desde WhatsApp.");
});

client.on("ready", () => {
  whatsappConectado = true;
  qrActual = null;
  console.log("WhatsApp conectado correctamente.");
});

client.on("authenticated", () => console.log("WhatsApp autenticado."));
client.on("auth_failure", (m) => console.log("Error de autenticación:", m));
client.on("disconnected", (m) => {
  whatsappConectado = false;
  console.log("WhatsApp desconectado:", m);
});

client.on("message", async (message) => {
  try {
    if (message.fromMe) return;
    if (message.type !== "chat") {
      await message.reply("⚠️ Solo entiendo mensajes de texto. Escribe *hola* para ver el menú.");
      return;
    }

    const telefono = message.from;
    const texto = message.body.trim();
    const textoMinuscula = texto.toLowerCase();

    const sesion = obtenerSesion(telefono);

    // === COMANDOS GENERALES (siempre primero) ===
    if (["hola", "buenas", "menu", "menú", "inicio"].includes(textoMinuscula)) {
      sesion.paso = "inicio";
      sesion.producto = null;
      sesion.monto = null;
      sesion.referencia = null;
      await message.reply(menuPrincipal());
      return;
    }

    if (["cancelar", "cancelar compra", "salir"].includes(textoMinuscula)) {
      delete sesiones[telefono];
      await message.reply("❌ Compra cancelada.\n\nEscribe *hola* para comenzar nuevamente.");
      return;
    }

    // === FLUJO POR PASO (bloqueo estricto) ===

    // PASO 1: Esperando referencia (4 dígitos)
    if (sesion.paso === "esperando_referencia") {
      if (!/^\d{4}$/.test(texto)) {
        await message.reply(
          "❌ Referencia inválida.\n\n" +
          "Envía solamente los *últimos 4 dígitos* de tu referencia bancaria.\n\n" +
          "Ejemplo: *1234*"
        );
        return;
      }

      sesion.referencia = texto;
      sesion.paso = "esperando_id";

      await message.reply(
        `🧾 *Referencia recibida:* ${texto}\n\n` +
        `Ahora envía tu *ID de jugador* de Free Fire.\n\n` +
        `Puedes encontrarla en tu perfil del juego.\n` +
        `⚠️ Solo números, mínimo 7 dígitos.`
      );
      return;
    }

    // PASO 2: Esperando ID (7-20 dígitos)
    if (sesion.paso === "esperando_id") {
      if (!/^\d{7,20}$/.test(texto)) {
        await message.reply(
          "❌ ID inválida.\n\n" +
          "Envía solamente números (mínimo 7 dígitos).\n\n" +
          "Ejemplo: *123456789*"
        );
        return;
      }

      const idJugador = texto;

      const pedido = {
        telefono,
        producto: sesion.producto,
        monto: sesion.monto,
        referencia: sesion.referencia,
        idJugador,
        fecha: new Date().toISOString()
      };

      console.log("Nuevo pedido:", pedido);

      await message.reply(
        `✅ *DATOS RECIBIDOS*\n\n` +
        `🛒 Producto: ${sesion.producto}\n` +
        `💰 Total: ${formatoBs(sesion.monto)}\n` +
        `🧾 Referencia: ${sesion.referencia}\n` +
        `🎮 ID de jugador: ${idJugador}\n\n` +
        `⏳ Estamos verificando tu pago.\n\n` +
        `Cuando el pago sea confirmado, se realizará la recarga automáticamente.\n\n` +
        `Gracias por comprar en *RECARGASGAMES*.`
      );

      try {
        await client.sendMessage(
          ADMIN,
          `🛒 *NUEVO PEDIDO RECARGASGAMES*\n\n` +
          `👤 Cliente: ${telefono}\n` +
          `🎮 Producto: ${sesion.producto}\n` +
          `💰 Monto: ${formatoBs(sesion.monto)}\n` +
          `🧾 Referencia: ${sesion.referencia}\n` +
          `🆔 ID de jugador: ${idJugador}\n\n` +
          `⏳ Estado: Pago pendiente de verificación.`
        );
      } catch (e) {
        console.error("No se pudo notificar al admin:", e.message);
      }

      delete sesiones[telefono];
      return;
    }

    // PASO 3: Selección de producto (solo en inicio o seleccionando_producto)
    if (sesion.paso === "inicio" || sesion.paso === "seleccionando_producto") {
      // Opciones del menú
      if (texto === "1") {
        sesion.paso = "seleccionando_producto";
        await message.reply(menuPrecios());
        return;
      }
      if (texto === "2") {
        await message.reply(menuPrecios());
        return;
      }
      if (texto === "3") {
        await message.reply(
          "🛠️ *SOPORTE RECARGASGAMES*\n\n" +
          "Escribe tu consulta y nuestro equipo te atenderá lo antes posible."
        );
        return;
      }

      // Selección de paquete
      if (Object.prototype.hasOwnProperty.call(precios, texto)) {
        sesion.producto = `Free Fire ${texto}`;
        sesion.monto = precios[texto];
        sesion.referencia = null;
        sesion.paso = "esperando_referencia";

        await message.reply(
          `💎 *Producto seleccionado:* ${texto}\n` +
          `💰 Precio: ${formatoBs(sesion.monto)}\n\n` +
          `Ahora realiza el pago móvil y envía los *últimos 4 dígitos* de la referencia bancaria.\n\n` +
          `Ejemplo: *1234*`
        );
        return;
      }
    }

    // Respuesta por defecto
    await message.reply(
      "No entendí tu mensaje.\n\n" +
      "Escribe *hola* para ver el menú principal."
    );
  } catch (error) {
    console.error("Error procesando mensaje:", error);
    try {
      await message.reply("⚠️ Ocurrió un error procesando tu solicitud. Intenta nuevamente.");
    } catch (_) {}
  }
});

// === API para integración con tu página web ===

// Enviar mensaje desde tu web a un número
app.post("/api/enviar", async (req, res) => {
  try {
    const { numero, mensaje } = req.body;
    if (!numero || !mensaje) {
      return res.status(400).json({ ok: false, error: "Faltan numero o mensaje" });
    }
    if (!whatsappConectado) {
      return res.status(503).json({ ok: false, error: "WhatsApp no conectado" });
    }
    const chatId = numero.includes("@c.us") ? numero : `${numero}@c.us`;
    await client.sendMessage(chatId, mensaje);
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Estado de conexión (para tu web)
app.get("/api/estado", (req, res) => {
  res.json({ conectado: whatsappConectado, qrDisponible: !!qrActual });
});

// Página principal
app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RecargasGames WhatsApp</title>
<style>
  body{margin:0;min-height:100vh;display:flex;justify-content:center;align-items:center;background:#080808;color:#fff;font-family:Arial,sans-serif;text-align:center}
  .contenedor{width:90%;max-width:500px;padding:30px;border-radius:20px;background:#151515;box-shadow:0 0 30px rgba(255,193,7,.2)}
  h1{color:#ffc107}
  a{display:inline-block;margin-top:20px;padding:14px 25px;border-radius:10px;background:#ffc107;color:#000;text-decoration:none;font-weight:bold}
</style>
</head>
<body>
  <div class="contenedor">
    <h1>RECARGASGAMES</h1>
    <p>Bot de WhatsApp para recargas automáticas.</p>
    <p>Estado: ${whatsappConectado ? "🟢 Conectado" : "🟡 Esperando conexión"}</p>
    <a href="/QR">Ver código QR</a>
  </div>
</body>
</html>`);
});

// Ruta QR
app.get("/QR", async (req, res) => {
  try {
    if (!qrActual) {
      return res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>QR WhatsApp</title><style>body{background:#080808;color:#fff;font-family:Arial,sans-serif;text-align:center;padding:40px 20px}h1{color:#ffc107}</style></head><body><h1>RECARGASGAMES</h1><p>${whatsappConectado ? "WhatsApp ya está conectado." : "El código QR todavía no está disponible. Recarga esta página."}</p></body></html>`);
    }

    const qrImagen = await QRCode.toDataURL(qrActual);
    res.send(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Escanear QR</title><style>body{margin:0;min-height:100vh;display:flex;justify-content:center;align-items:center;background:#080808;color:#fff;font-family:Arial,sans-serif;text-align:center}.contenedor{width:90%;max-width:420px;padding:25px;border-radius:20px;background:#151515;box-shadow:0 0 30px rgba(255,193,7,.2)}h1{color:#ffc107}img{width:100%;max-width:350px;background:#fff;padding:10px;border-radius:12px}p{line-height:1.5}</style></head><body><div class="contenedor"><h1>Escanea el código QR</h1><img src="${qrImagen}" alt="Código QR de WhatsApp"><p>Abre WhatsApp en tu teléfono y escanea este código.</p></div></body></html>`);
  } catch (error) {
    console.error("Error generando QR:", error);
    res.status(500).send("No se pudo generar el código QR.");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
  console.log(`Ruta QR: /QR`);
});

client.initialize();
