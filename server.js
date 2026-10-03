// ============================================================
// RECARGAS GAMES - BOT SIMPLE DE WHATSAPP
// ============================================================

const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");

const { Client, LocalAuth } = require("whatsapp-web.js");
const packageInfo = require("whatsapp-web.js/package.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;

// ✅ Número admin (código país + número, sin + ni espacios)
const ADMIN = "584228242411";

if (!API_TOKEN) {
  console.error("⚠️ Configura API_TOKEN en las variables de entorno.");
}

// ============================================================
// MENSAJE DE BIENVENIDA
// ============================================================

const MENSAJE_BIENVENIDA = `¡Hola! 👋

Bienvenido a *RECARGAS GAMES* 🎮

Un asesor te atenderá lo más pronto posible. Por favor espera un momento. 🙏

🌐 https://recargasgames.shop`;

// ============================================================
// ESTADO
// ============================================================

const clientesBienvenidos = new Set();
const clientesEnAtencion = new Set();
const pausasActivas = new Map();
const PAUSA_HUMANA_MS = 24 * 60 * 60 * 1000;

// ============================================================
// WHATSAPP CLIENT
// ============================================================

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "recargasgames" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
});

const enviosAutomaticos = [];

function registrarEnvioAutomatico(chatId, texto) {
  enviosAutomaticos.push({ chatId, texto, tiempo: Date.now() });
  while (enviosAutomaticos.length > 200) enviosAutomaticos.shift();
}

function esEnvioDelBot(chatId, texto) {
  const ahora = Date.now();
  for (let i = enviosAutomaticos.length - 1; i >= 0; i--) {
    const item = enviosAutomaticos[i];
    if (ahora - item.tiempo > 30000) {
      enviosAutomaticos.splice(i, 1);
      continue;
    }
    if (item.chatId === chatId && item.texto === texto) {
      enviosAutomaticos.splice(i, 1);
      return true;
    }
  }
  return false;
}

app.locals.qr = null;
app.locals.conectado = false;
app.locals.iniciadoEn = Date.now();

// ============================================================
// ENVÍO DE MENSAJES
// ============================================================

async function enviarMensaje(numero, texto) {
  try {
    if (!client.info) {
      return { ok: false, error: "WhatsApp no está conectado" };
    }
    const chatId = numero.includes("@") ? numero : `${numero}@c.us`;
    registrarEnvioAutomatico(chatId, texto);
    await client.sendMessage(chatId, texto);
    return { ok: true };
  } catch (error) {
    console.error("Error enviando mensaje:", error.message);
    return { ok: false, error: error.message };
  }
}

// ============================================================
// EVENTOS DE CONEXIÓN
// ============================================================

client.on("qr", (qr) => {
  app.locals.qr = qr;
  console.log("📱 Escanea el QR en /qr");
  qrcodeTerminal.generate(qr, { small: true });
});

client.on("authenticated", () => console.log("🔐 Autenticado."));

client.on("ready", () => {
  app.locals.conectado = true;
  app.locals.qr = null;
  console.log("✅ Bot conectado.");
  console.log("📱 Número:", client.info?.wid?.user || "desconocido");
});

client.on("auth_failure", (m) => console.error("❌ Auth failure:", m));

client.on("disconnected", (r) => {
  app.locals.conectado = false;
  app.locals.qr = null;
  console.error("⚠️ Desconectado:", r);
});

// ============================================================
// DETECTAR RESPUESTAS MANUALES DEL ADMIN
// ============================================================

client.on("message_create", async (message) => {
  try {
    if (!message.fromMe) return;
    const chatId = message.to;
    if (!chatId || !chatId.endsWith("@c.us")) return;

    const texto = (message.body || "").trim();
    if (esEnvioDelBot(chatId, texto)) return;

    pausasActivas.set(chatId, Date.now());
    clientesEnAtencion.add(chatId);
    console.log("🧑‍💻 Admin atendiendo:", chatId);
  } catch (error) {
    console.error("Error en message_create:", error.message);
  }
});

// ============================================================
// RECIBIR MENSAJES DE CLIENTES
// ============================================================

client.on("message", async (message) => {
  try {
    if (message.fromMe) return;
    if (message.isStatus) return;
    if (message.from.endsWith("@g.us")) return;

    const chatId = message.from;
    const texto = (message.body || "").trim();
    if (!texto) return;

    console.log(`📩 ${chatId}: ${texto}`);

    // Verificar pausa
    const inicioPausa = pausasActivas.get(chatId);
    if (inicioPausa) {
      const transcurrido = Date.now() - inicioPausa;
      if (transcurrido >= PAUSA_HUMANA_MS) {
        pausasActivas.delete(chatId);
        clientesEnAtencion.delete(chatId);
      } else {
        console.log(`⏸️ Pausa activa para ${chatId}`);
        return;
      }
    }

    // Ya recibió bienvenida
    if (clientesBienvenidos.has(chatId)) {
      console.log(`👋 ${chatId} ya saludado`);
      return;
    }

    // Enviar bienvenida
    console.log(`✨ Bienvenida a ${chatId}`);
    const res = await enviarMensaje(chatId, MENSAJE_BIENVENIDA);
    if (res.ok) clientesBienvenidos.add(chatId);
  } catch (error) {
    console.error("❌ Error procesando mensaje:", error);
  }
});

// ============================================================
// API
// ============================================================

function autenticarToken(req, res, next) {
  if (!API_TOKEN) {
    return res.status(503).json({ ok: false, error: "API_TOKEN no configurado" });
  }
  const token = req.headers["x-api-token"] || req.body?.token;
  if (token !== API_TOKEN) {
    return res.status(401).json({ ok: false, error: "No autorizado" });
  }
  next();
}

function normalizarTelefono(telefono) {
  return String(telefono || "").replace(/\D/g, "");
}

// POST /api/enviar
app.post("/api/enviar", autenticarToken, async (req, res) => {
  try {
    const { telefono, mensaje } = req.body;

    if (!telefono || typeof mensaje !== "string" || !mensaje.trim()) {
      return res.status(400).json({ ok: false, error: "Falta telefono o mensaje" });
    }

    if (!client.info) {
      return res.status(503).json({ ok: false, error: "Bot no conectado" });
    }

    const numero = normalizarTelefono(telefono);
    if (numero.length < 10 || numero.length > 15) {
      return res.status(400).json({ ok: false, error: "Teléfono inválido" });
    }

    const resultado = await enviarMensaje(`${numero}@c.us`, mensaje.trim());
    return res.status(resultado.ok ? 200 : 500).json(resultado);
  } catch (error) {
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
});

// POST /api/notificar-pedido
app.post("/api/notificar-pedido", autenticarToken, async (req, res) => {
  try {
    const { telefono, mensajeCliente, mensajeAdmin } = req.body;

    console.log(`📤 Notificando pedido a ${telefono}`);

    if (!telefono || !mensajeCliente) {
      return res.status(400).json({ ok: false, error: "Falta telefono o mensajeCliente" });
    }

    if (!client.info) {
      return res.status(503).json({ ok: false, error: "Bot no conectado" });
    }

    const numero = normalizarTelefono(telefono);
    if (numero.length < 10 || numero.length > 15) {
      return res.status(400).json({ ok: false, error: "Teléfono inválido" });
    }

    const resultadoCliente = await enviarMensaje(`${numero}@c.us`, mensajeCliente);
    console.log(`   ✅ Cliente: ${resultadoCliente.ok ? "OK" : "FALLÓ"}`);

    let resultadoAdmin = { ok: true };
    if (mensajeAdmin) {
      resultadoAdmin = await enviarMensaje(`${ADMIN}@c.us`, mensajeAdmin);
      console.log(`   ✅ Admin: ${resultadoAdmin.ok ? "OK" : "FALLÓ"}`);
    }

    return res.json({
      ok: resultadoCliente.ok && resultadoAdmin.ok,
      enviadoCliente: resultadoCliente.ok,
      enviadoAdmin: resultadoAdmin.ok,
      errores: {
        cliente: resultadoCliente.error || null,
        admin: resultadoAdmin.error || null,
      },
    });
  } catch (error) {
    console.error("Error en /api/notificar-pedido:", error.message);
    return res.status(500).json({ ok: false, error: "Error interno" });
  }
});

// GET /api/status
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    conectado: !!client.info,
    numero: client.info?.wid?.user || null,
    qrDisponible: !!app.locals.qr,
    clientesBienvenidos: clientesBienvenidos.size,
    clientesEnAtencion: clientesEnAtencion.size,
    version: packageInfo.version,
    uptimeSegundos: Math.floor((Date.now() - app.locals.iniciadoEn) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// GET /api/diagnostico
app.get("/api/diagnostico", (req, res) => {
  res.json({
    ok: true,
    conectado: !!client.info,
    numero: client.info?.wid?.user || null,
    qrDisponible: !!app.locals.qr,
    tieneApiToken: !!API_TOKEN,
    admin: ADMIN,
    clientesBienvenidos: clientesBienvenidos.size,
    clientesEnAtencion: clientesEnAtencion.size,
    uptimeSegundos: Math.floor((Date.now() - app.locals.iniciadoEn) / 1000),
    memoriaMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    nodeVersion: process.version,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/reset-cliente
app.post("/api/reset-cliente", autenticarToken, (req, res) => {
  const numero = normalizarTelefono(req.body?.telefono);
  if (numero.length < 10 || numero.length > 15) {
    return res.status(400).json({ ok: false, error: "Teléfono inválido" });
  }
  const chatId = `${numero}@c.us`;
  clientesBienvenidos.delete(chatId);
  clientesEnAtencion.delete(chatId);
  pausasActivas.delete(chatId);
  return res.json({ ok: true, mensaje: "Cliente reiniciado" });
});

// ============================================================
// PANEL PRINCIPAL
// ============================================================

app.get("/", (req, res) => {
  const conectado = !!client.info;
  const color = conectado ? "#22c55e" : "#f59e0b";

  res.send(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RECARGAS GAMES - Bot</title>
<style>
body{margin:0;background:#080808;color:white;font-family:Arial,sans-serif;
display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center}
main{padding:30px;max-width:420px}
h1{color:#ffd700}
.estado{display:inline-block;padding:10px 18px;border:1px solid ${color};
color:${color};border-radius:30px;margin:15px 0}
a{display:inline-block;background:#ffd700;color:#000;padding:14px 22px;
border-radius:9px;text-decoration:none;font-weight:bold;margin:8px}
p{line-height:1.6;color:#ddd}
</style></head>
<body><main>
<h1>🎮 RECARGAS GAMES</h1>
<p>Bot de WhatsApp.</p>
<div class="estado">${conectado ? "Conectado ✅" : "Esperando conexión ⚠️"}</div>
<br>
<a href="/qr">Ver QR</a>
<a href="/api/diagnostico">Diagnóstico</a>
</main></body></html>`);
});

// ============================================================
// PÁGINA QR
// ============================================================

async function mostrarQR(req, res) {
  try {
    if (client.info) {
      return res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Conectado</title></head>
<body style="background:#080808;color:white;text-align:center;font-family:Arial;padding:30px">
<h2 style="color:#22c55e">✅ WhatsApp ya está conectado</h2>
<p>Número: ${client.info?.wid?.user || "desconocido"}</p>
<a href="/" style="color:#ffd700">Volver al panel</a>
</body></html>`);
    }

    if (!app.locals.qr) {
      return res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Esperando QR</title></head>
<body style="background:#080808;color:white;text-align:center;font-family:Arial;padding:30px">
<h2>⏳ Esperando código QR...</h2>
<p>Esta página se actualizará automáticamente.</p>
</body></html>`);
    }

    const imagen = await qrcode.toDataURL(app.locals.qr);

    res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR - RECARGAS GAMES</title></head>
<body style="background:#080808;color:white;text-align:center;font-family:Arial;padding:20px">
<h2>📱 Conectar WhatsApp</h2>
<p>Escanea el código desde Dispositivos vinculados.</p>
<img src="${imagen}" alt="QR"
style="max-width:90%;width:350px;background:white;padding:10px;border-radius:12px">
<p>Se actualizará cada 20 segundos.</p>
<meta http-equiv="refresh" content="20">
</body></html>`);
  } catch (error) {
    console.error("Error generando QR:", error.message);
    res.status(500).send("No se pudo generar el QR.");
  }
}

app.get("/QR", mostrarQR);
app.get("/qr", mostrarQR);
app.get("/qrcode", mostrarQR);

// ============================================================
// INICIAR
// ============================================================

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor en puerto ${PORT}`);
  console.log("📱 QR: /qr");
});

server.requestTimeout = 30000;
server.headersTimeout = 35000;

client.initialize().catch((error) => {
  console.error("Error inicializando WhatsApp:", error.message);
});

async function cerrarServidor() {
  server.close();
  try { await client.destroy(); } catch (e) {}
  process.exit(0);
}

process.on("SIGINT", cerrarServidor);
process.on("SIGTERM", cerrarServidor);
