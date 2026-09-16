const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");

const { Client, LocalAuth } = require("whatsapp-web.js");
const packageInfo = require("whatsapp-web.js/package.json");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===============================
// 🔐 TOKEN SECRETO (para la web)
// ===============================
// Este token lo usará Vercel para autenticarse con el bot
const API_TOKEN = process.env.API_TOKEN || "recargasgames-secreto-2026-cambiar";

console.log("Versión whatsapp-web.js:", packageInfo.version);
console.log("🔐 Token API:", API_TOKEN.substring(0, 15) + "...");

// ===============================
// CONFIGURACIÓN
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
// DATOS DE PAGO
// ===============================

const datosPago = {
  banco: "Banco de Venezuela",
  codigo: "0102",
  telefono: "0422-8242411",
  cedula: "32824869",
};

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
// DATOS TEMPORALES DE USUARIOS
// ===============================

const usuarios = new Map();
const mensajesProcesados = new Set();

function obtenerUsuario(numero) {
  if (!usuarios.has(numero)) {
    usuarios.set(numero, {
      estado: "inicio",
      producto: null,
      precio: null,
      referencia: null,
      idJugador: null,
    });
  }

  return usuarios.get(numero);
}

// ===============================
// FUNCIONES DE MENSAJES
// ===============================

async function enviarMensaje(numero, texto) {
  try {
    // Si el número no tiene @c.us, agregarlo
    const chatId = numero.includes("@") ? numero : `${numero}@c.us`;
    await client.sendMessage(chatId, texto);
    return { ok: true };
  } catch (error) {
    console.error("Error enviando mensaje:", error.message);
    return { ok: false, error: error.message };
  }
}

function menuPrincipal() {
  return `🎮 *RECARGAS GAMES*

Bienvenido a nuestra tienda de recargas y productos digitales.

¿Qué deseas hacer?

1️⃣ Recargas
2️⃣ Consultar por este usuario
3️⃣ Hablar con soporte

Responde con el número de la opción.`;
}

function menuRecargas() {
  return `💎 *RECARGAS FREE FIRE*

Selecciona el paquete que deseas comprar:

💎 110 ➜ 770 Bs
💎 220 ➜ 1.540 Bs
💎 341 ➜ 2.300 Bs
💎 572 ➜ 3.850 Bs
💎 1166 ➜ 7.150 Bs
💎 2398 ➜ 14.100 Bs
💎 6160 ➜ 35.900 Bs

Escribe solamente el número del paquete.`;
}

function mensajePago() {
  return `💳 *DATOS PARA EL PAGO*

🏦 Banco: ${datosPago.banco}
🔢 Código: ${datosPago.codigo}
📱 Teléfono: ${datosPago.telefono}
🪪 Cédula: ${datosPago.cedula}

Después de realizar el pago, envía los últimos 4 dígitos de la referencia bancaria.

Ejemplo: 1234`;
}

function esReferenciaValida(texto) {
  return /^\d{4}$/.test(texto);
}

function esIdJugadorValido(texto) {
  return /^\d{7,20}$/.test(texto);
}

// ===============================
// EVENTOS DE WHATSAPP
// ===============================

client.on("qr", (qr) => {
  console.log("Escanea este código QR para conectar WhatsApp:");
  qrcodeTerminal.generate(qr, { small: true });

  app.locals.qr = qr;
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado correctamente.");
});

client.on("ready", () => {
  console.log("✅ RECARGAS GAMES conectado correctamente.");
  console.log("📱 Número:", client.info?.wid?.user || "desconocido");
});

client.on("auth_failure", (mensaje) => {
  console.error("Error de autenticación:", mensaje);
});

client.on("disconnected", (razon) => {
  console.log("WhatsApp desconectado:", razon);
  app.locals.qr = null;
});

// ===============================
// MENSAJES RECIBIDOS
// ===============================

client.on("message", async (message) => {
  try {
    if (message.fromMe) return;

    const idMensaje = message.id?.id;

    if (idMensaje && mensajesProcesados.has(idMensaje)) {
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
    // VOLVER AL MENÚ PRINCIPAL
    // ===============================

    if (
      textoNormalizado === "hola" ||
      textoNormalizado === "inicio" ||
      textoNormalizado === "menu" ||
      textoNormalizado === "menú"
    ) {
      usuario.estado = "inicio";
      usuario.producto = null;
      usuario.precio = null;
      usuario.referencia = null;
      usuario.idJugador = null;

      await enviarMensaje(numero, menuPrincipal());
      return;
    }

    // ===============================
    // ESPERANDO ID DEL JUGADOR
    // ===============================

    if (usuario.estado === "esperando_id") {
      if (!esIdJugadorValido(texto)) {
        await enviarMensaje(
          numero,
          "❌ El ID del jugador no es válido.\n\nEnvía un ID numérico de 7 a 20 dígitos."
        );
        return;
      }

      usuario.idJugador = texto;

      const resumen = `✅ *DATOS RECIBIDOS*

🎮 Producto: ${usuario.producto} diamantes
💰 Precio: ${usuario.precio.toLocaleString("es-VE")} Bs
🧾 Referencia: ${usuario.referencia}
🆔 ID del jugador: ${usuario.idJugador}

⏳ Tu solicitud será revisada y procesada.

Gracias por comprar en *RECARGAS GAMES*.`;

      await enviarMensaje(numero, resumen);

      const mensajeAdmin = `🛒 *NUEVA SOLICITUD DE RECARGA*

👤 Cliente: ${numero}

💎 Producto: ${usuario.producto} diamantes
💰 Precio: ${usuario.precio.toLocaleString("es-VE")} Bs
🧾 Referencia: ${usuario.referencia}
🆔 ID del jugador: ${usuario.idJugador}

📌 Revisar pago y realizar recarga.`;

      await enviarMensaje("584228242411@c.us", mensajeAdmin);

      usuario.estado = "finalizado";
      return;
    }

    // ===============================
    // ESPERANDO REFERENCIA
    // ===============================

    if (usuario.estado === "esperando_referencia") {
      if (!esReferenciaValida(texto)) {
        await enviarMensaje(
          numero,
          "❌ La referencia debe tener exactamente 4 dígitos.\n\nEjemplo: 1234"
        );
        return;
      }

      usuario.referencia = texto;
      usuario.estado = "esperando_id";

      await enviarMensaje(
        numero,
        `✅ Referencia recibida: ${texto}

Ahora envía tu ID de jugador de Free Fire.

Debe tener entre 7 y 20 dígitos.`
      );

      return;
    }

    // ===============================
    // MENÚ PRINCIPAL
    // ===============================

    if (usuario.estado === "inicio") {
      if (texto === "1") {
        usuario.estado = "seleccion_producto";
        await enviarMensaje(numero, menuRecargas());
        return;
      }

      if (texto === "2") {
        await enviarMensaje(
          numero,
          `🔎 *CONSULTAR POR ESTE USUARIO*

Envíanos el número de teléfono o el usuario que deseas consultar.

Un agente revisará tu solicitud.`
        );
        return;
      }

      if (texto === "3") {
        await enviarMensaje(
          numero,
          `🧑‍💻 *SOPORTE RECARGAS GAMES*

Un agente de soporte te atenderá lo antes posible.

También puedes escribir directamente tu consulta por este medio.`
        );
        return;
      }

      await enviarMensaje(
        numero,
        `❌ Opción no válida.

${menuPrincipal()}`
      );

      return;
    }

    // ===============================
    // SELECCIÓN DEL PRODUCTO
    // ===============================

    if (usuario.estado === "seleccion_producto") {
      if (!Object.prototype.hasOwnProperty.call(precios, texto)) {
        await enviarMensaje(
          numero,
          `❌ Paquete no válido.

${menuRecargas()}`
        );
        return;
      }

      usuario.producto = texto;
      usuario.precio = precios[texto];
      usuario.estado = "esperando_referencia";

      await enviarMensaje(
        numero,
        `💎 *RECARGA SELECCIONADA*

Paquete: ${texto} diamantes
Precio: ${precios[texto].toLocaleString("es-VE")} Bs

${mensajePago()}`
      );

      return;
    }

    // ===============================
    // SOLICITUD FINALIZADA
    // ===============================

    if (usuario.estado === "finalizado") {
      await enviarMensaje(
        numero,
        `✅ Ya recibimos tu solicitud.

Si deseas realizar otra operación, escribe *hola* para volver al menú principal.`
      );
      return;
    }

    // ===============================
    // RESPUESTA POR DEFECTO
    // ===============================

    await enviarMensaje(numero, menuPrincipal());
  } catch (error) {
    console.error("Error procesando mensaje:", error.message);
  }
});

// ===============================
// 🌐 API PARA LA WEB (NUEVO)
// ===============================

// Middleware de autenticación
function autenticarToken(req, res, next) {
  const token = req.headers["x-api-token"] || req.body?.token;
  if (token !== API_TOKEN) {
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }
  next();
}

// ─────────────────────────────────────────
// POST /api/enviar → Enviar mensaje
// ─────────────────────────────────────────
app.post("/api/enviar", autenticarToken, async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;

    if (!telefono || !mensaje) {
      return res.status(400).json({
        ok: false,
        error: "Falta telefono o mensaje",
      });
    }

    // Verificar que el cliente esté listo
    if (!client.info) {
      return res.status(503).json({
        ok: false,
        error: "Bot no conectado a WhatsApp",
      });
    }

    // Limpiar el número (solo dígitos)
    const numeroLimpio = String(telefono).replace(/\D/g, "");

    if (numeroLimpio.length < 10) {
      return res.status(400).json({
        ok: false,
        error: "Número de teléfono inválido",
      });
    }

    const chatId = `${numeroLimpio}@c.us`;
    const resultado = await enviarMensaje(chatId, mensaje);

    if (resultado.ok) {
      console.log(`✅ Mensaje enviado a ${numeroLimpio}`);
      return res.json({ ok: true, enviado: true });
    } else {
      return res.status(500).json({
        ok: false,
        error: resultado.error,
      });
    }
  } catch (error) {
    console.error("Error en /api/enviar:", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ─────────────────────────────────────────
// POST /api/notificar-pedido → Enviar mensaje al cliente Y al admin
// ─────────────────────────────────────────
app.post("/api/notificar-pedido", autenticarToken, async (req, res) => {
  try {
    const { telefono, mensajeCliente, mensajeAdmin } = req.body;

    if (!telefono || !mensajeCliente) {
      return res.status(400).json({
        ok: false,
        error: "Falta telefono o mensajeCliente",
      });
    }

    if (!client.info) {
      return res.status(503).json({
        ok: false,
        error: "Bot no conectado a WhatsApp",
      });
    }

    const numeroLimpio = String(telefono).replace(/\D/g, "");
    const chatCliente = `${numeroLimpio}@c.us`;

    // Enviar al cliente
    const resultadoCliente = await enviarMensaje(chatCliente, mensajeCliente);

    // Enviar al admin (si hay mensaje)
    let resultadoAdmin = { ok: true };
    if (mensajeAdmin) {
      resultadoAdmin = await enviarMensaje("584228242411@c.us", mensajeAdmin);
    }

    return res.json({
      ok: resultadoCliente.ok,
      enviadoCliente: resultadoCliente.ok,
      enviadoAdmin: resultadoAdmin.ok,
      errores: {
        cliente: resultadoCliente.error || null,
        admin: resultadoAdmin.error || null,
      },
    });
  } catch (error) {
    console.error("Error en /api/notificar-pedido:", error.message);
    return res.status(500).json({ ok: false, error: error.message });
  }
});

// ─────────────────────────────────────────
// GET /api/status → Estado del bot
// ─────────────────────────────────────────
app.get("/api/status", (req, res) => {
  const conectado = !!client.info;
  res.json({
    ok: true,
    conectado: conectado,
    numero: client.info?.wid?.user || null,
    version: packageInfo.version,
    timestamp: new Date().toISOString(),
  });
});

// ===============================
// PÁGINA PRINCIPAL
// ===============================

app.get("/", (req, res) => {
  const conectado = !!client.info;
  const colorEstado = conectado ? "#22c55e" : "#f59e0b";
  const textoEstado = conectado ? "Conectado ✅" : "Esperando QR";

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RECARGAS GAMES - WhatsApp</title>
      <style>
        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #080808;
          color: white;
          font-family: Arial, sans-serif;
          text-align: center;
        }

        .contenedor {
          padding: 30px;
        }

        h1 {
          color: #ffd700;
        }

        .estado {
          display: inline-block;
          padding: 8px 16px;
          border-radius: 20px;
          background: ${colorEstado}20;
          border: 1px solid ${colorEstado};
          color: ${colorEstado};
          font-weight: bold;
          margin: 15px 0;
        }

        a {
          display: inline-block;
          margin-top: 20px;
          padding: 14px 25px;
          border-radius: 8px;
          background: #ffd700;
          color: #000;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="contenedor">
        <h1>🎮 RECARGAS GAMES</h1>
        <p>Servidor de WhatsApp activo.</p>
        <div class="estado">${textoEstado}</div>
        <br>
        <a href="/QR">Ver código QR</a>
      </div>
    </body>
    </html>
  `);
});

// ===============================
// PÁGINA DEL QR
// ===============================

app.get("/QR", async (req, res) => {
  try {
    if (!app.locals.qr) {
      return res.send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>QR WhatsApp</title>
        </head>
        <body style="background:#080808;color:white;text-align:center;font-family:Arial;padding:30px;">
          <h2>Esperando código QR...</h2>
          <p>Actualiza esta página en unos segundos.</p>
          <meta http-equiv="refresh" content="5">
        </body>
        </html>
      `);
    }

    const qrImagen = await qrcode.toDataURL(app.locals.qr);

    res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Escanear QR - RECARGAS GAMES</title>
      </head>
      <body style="background:#080808;color:white;text-align:center;font-family:Arial;padding:20px;">
        <h2>📱 Escanea el código QR</h2>
        <p>Abre WhatsApp en tu teléfono y escanea este código.</p>
        <img src="${qrImagen}" style="max-width:100%;width:350px;background:white;padding:10px;border-radius:10px;">
        <p>La página se actualizará automáticamente.</p>
        <meta http-equiv="refresh" content="10">
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send("Error generando el código QR.");
  }
});

// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor activo en el puerto ${PORT}`);
  console.log(`QR disponible en /QR`);
  console.log(`API disponible en /api/enviar, /api/notificar-pedido, /api/status`);
});

client.initialize();
