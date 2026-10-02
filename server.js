// ============================================================
// RECARGAS GAMES - BOT PROFESIONAL DE WHATSAPP
// Archivo: server.js
// ============================================================

const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

const { Client, LocalAuth, List, Buttons } = require("whatsapp-web.js");
const packageInfo = require("whatsapp-web.js/package.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "100kb" }));

const PORT = process.env.PORT || 3000;
const API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN) {
  console.error("⚠️ Configura API_TOKEN en las variables de entorno.");
}

// Número administrador en formato internacional, sin + ni espacios.
const ADMIN = "584228242411";

// Reinicio de conversación por inactividad.
const INACTIVIDAD_MS = 24 * 60 * 60 * 1000;

// Tiempo durante el que el bot no interrumpe una conversación humana.
const PAUSA_HUMANA_MS = 24 * 60 * 60 * 1000;

// ============================================================
// ESTADO Y ALMACENAMIENTO
// ============================================================

const DATA_DIR = path.join(__dirname, "data");
const STATE_FILE = path.join(DATA_DIR, "usuarios.json");

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function cargarUsuarios() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const datos = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      return new Map(Object.entries(datos));
    }
  } catch (error) {
    console.error("Error cargando usuarios:", error.message);
  }
  return new Map();
}

const usuarios = cargarUsuarios();

// Guardado sencillo con escritura temporal para reducir corrupción.
let guardadoPendiente = false;

function guardarUsuarios() {
  if (guardadoPendiente) return;
  guardadoPendiente = true;

  setTimeout(() => {
    try {
      const temporal = STATE_FILE + ".tmp";
      fs.writeFileSync(
        temporal,
        JSON.stringify(Object.fromEntries(usuarios), null, 2),
        "utf8"
      );
      fs.renameSync(temporal, STATE_FILE);
    } catch (error) {
      console.error("Error guardando usuarios:", error.message);
    } finally {
      guardadoPendiente = false;
    }
  }, 300);
}

function nuevoUsuario() {
  return {
    estado: "inicio",
    producto: null,
    precio: null,
    referencia: null,
    idJugador: null,
    ultimaActividad: Date.now(),
    pausaHumanaHasta: 0,
  };
}

function obtenerUsuario(numero) {
  if (!usuarios.has(numero)) {
    usuarios.set(numero, nuevoUsuario());
    guardarUsuarios();
  }

  const usuario = usuarios.get(numero);

  // Si pasaron 24 horas sin actividad, reiniciar el flujo.
  if (
    Date.now() - (usuario.ultimaActividad || 0) >= INACTIVIDAD_MS
  ) {
    const pausa = usuario.pausaHumanaHasta || 0;
    Object.assign(usuario, nuevoUsuario());

    // No cancelar una pausa humana que siga vigente.
    usuario.pausaHumanaHasta = Math.max(pausa, 0);
  }

  usuario.ultimaActividad = Date.now();
  guardarUsuarios();

  return usuario;
}

// ============================================================
// CONFIGURACIÓN DE WHATSAPP
// ============================================================

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
    ],
  },
});

// Mensajes automáticos pendientes de identificar.
// Evita confundir mensajes enviados por el bot con respuestas
// manuales del administrador.
const enviosAutomaticos = [];

function registrarEnvioAutomatico(chatId, texto) {
  enviosAutomaticos.push({
    chatId,
    texto,
    tiempo: Date.now(),
  });

  while (enviosAutomaticos.length > 200) {
    enviosAutomaticos.shift();
  }
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

// ============================================================
// DATOS DE PAGO
// ============================================================

const datosPago = {
  banco: "Banco de Venezuela",
  codigo: "0102",
  telefono: "0422-8242411",
  cedula: "32824869",
};

// ============================================================
// PRECIOS DE FREE FIRE
// ============================================================

const precios = {
  "110": 770,
  "220": 1540,
  "341": 2300,
  "572": 3850,
  "1166": 7150,
  "2398": 14100,
  "6160": 35900,
};

function formatoBs(cantidad) {
  return cantidad.toLocaleString("es-VE");
}

// ============================================================
// ENVÍO DE MENSAJES
// ============================================================

async function enviarMensaje(numero, texto) {
  try {
    if (!client.info) {
      return { ok: false, error: "WhatsApp no está conectado" };
    }

    const chatId = numero.includes("@")
      ? numero
      : `${numero}@c.us`;

    registrarEnvioAutomatico(chatId, texto);

    await client.sendMessage(chatId, texto);

    return { ok: true };
  } catch (error) {
    console.error("Error enviando mensaje:", error.message);
    return { ok: false, error: error.message };
  }
}

// ============================================================
// MENÚS
// ============================================================

function menuPrincipal() {
  return `🎮 *RECARGAS GAMES*

¡Bienvenido a nuestra tienda digital!

Selecciona una opción:

1️⃣ 💎 Recargas Free Fire
2️⃣ 🔎 Consultas
3️⃣ 🧑‍💻 Atención al cliente

Escribe el número de la opción.

🌐 https://recargasgames.shop`;
}

function menuRecargas() {
  return `💎 *RECARGAS FREE FIRE*

Selecciona tu paquete:

1️⃣ 110 diamantes — 770 Bs
2️⃣ 220 diamantes — 1.540 Bs
3️⃣ 341 diamantes — 2.300 Bs
4️⃣ 572 diamantes — 3.850 Bs
5️⃣ 1166 diamantes — 7.150 Bs
6️⃣ 2398 diamantes — 14.100 Bs
7️⃣ 6160 diamantes — 35.900 Bs

Escribe el número de la opción.

También puedes escribir *menu* para volver.`;
}

function mensajePago() {
  return `💳 *DATOS PARA EL PAGO*

🏦 Banco: ${datosPago.banco}
🔢 Código: ${datosPago.codigo}
📱 Teléfono: ${datosPago.telefono}
🪪 Cédula: ${datosPago.cedula}

Realiza el pago por Pago Móvil.

Después envía los últimos 4 dígitos de la referencia bancaria.

Ejemplo: 1234`;
}

function menuOpciones(texto, opciones) {
  return new List(
    texto,
    "Ver opciones",
    opciones,
    "RECARGAS GAMES",
    "Selecciona una opción"
  );
}

function validarReferencia(texto) {
  return /^\d{4}$/.test(texto);
}

function validarIdJugador(texto) {
  return /^\d{7,20}$/.test(texto);
}

function reiniciarFlujo(usuario) {
  usuario.estado = "inicio";
  usuario.producto = null;
  usuario.precio = null;
  usuario.referencia = null;
  usuario.idJugador = null;
  usuario.ultimaActividad = Date.now();
  guardarUsuarios();
}

// ============================================================
// EVENTOS DE CONEXIÓN
// ============================================================

client.on("qr", (qr) => {
  app.locals.qr = qr;

  console.log("📱 Escanea el código QR:");
  qrcodeTerminal.generate(qr, { small: true });
});

client.on("authenticated", () => {
  console.log("🔐 WhatsApp autenticado.");
});

client.on("ready", () => {
  app.locals.conectado = true;
  app.locals.qr = null;

  console.log("✅ RECARGAS GAMES conectado.");
  console.log("📱 Número:", client.info?.wid?.user || "desconocido");
});

client.on("auth_failure", (mensaje) => {
  console.error("❌ Error de autenticación:", mensaje);
});

client.on("disconnected", (razon) => {
  app.locals.conectado = false;
  app.locals.qr = null;

  console.error("⚠️ WhatsApp desconectado:", razon);
});

// ============================================================
// DETECTAR RESPUESTAS MANUALES DEL ADMINISTRADOR
// ============================================================

client.on("message_create", async (message) => {
  try {
    if (!message.fromMe) return;

    const chatId = message.to;
    const texto = (message.body || "").trim();

    if (!chatId || !chatId.endsWith("@c.us")) return;

    // Ignorar mensajes que el propio bot acaba de enviar.
    if (esEnvioDelBot(chatId, texto)) return;

    const numeroAdmin = client.info?.wid?.user;

    // No interpretar mensajes enviados a otros destinos
    // como respuestas a clientes.
    if (!numeroAdmin) return;

    // Comando manual para reactivar el bot en ese chat.
    if (texto.toLowerCase() === "!bot") {
      const usuario = usuarios.get(chatId);

      if (usuario) {
        usuario.pausaHumanaHasta = 0;
        usuario.estado = "inicio";
        usuario.ultimaActividad = Date.now();
        guardarUsuarios();
      }

      await enviarMensaje(
        chatId,
        "🤖 Atención automática reactivada.\n\n" + menuPrincipal()
      );

      console.log("🤖 Bot reactivado en:", chatId);
      return;
    }

    // Cualquier otra respuesta manual pausa la automatización
    // para ese cliente, sin afectar a los demás.
    const usuario = obtenerUsuario(chatId);
    usuario.pausaHumanaHasta = Date.now() + PAUSA_HUMANA_MS;
    usuario.ultimaActividad = Date.now();
    guardarUsuarios();

    console.log("🧑‍💻 Atención manual activada para:", chatId);
  } catch (error) {
    console.error("Error detectando respuesta manual:", error.message);
  }
});

// ============================================================
// PROCESAMIENTO DE MENSAJES DE CLIENTES
// ============================================================

client.on("message", async (message) => {
  try {
    if (message.fromMe) return;
    if (message.isStatus) return;
    if (message.from.endsWith("@g.us")) return;

    const numero = message.from;
    const texto = (message.body || "").trim();
    const normalizado = texto.toLowerCase();

    if (!texto) return;

    const usuario = obtenerUsuario(numero);

    console.log(`📩 Mensaje de ${numero}: ${texto}`);

    // No responder automáticamente mientras el administrador
    // esté atendiendo manualmente a este cliente.
    if (Date.now() < (usuario.pausaHumanaHasta || 0)) {
      return;
    }

    // Si la pausa ya venció, liberar la atención automática.
    if (usuario.pausaHumanaHasta) {
      usuario.pausaHumanaHasta = 0;
      guardarUsuarios();
    }

    // Volver al menú.
    if (["hola", "inicio", "menu", "menú"].includes(normalizado)) {
      reiniciarFlujo(usuario);
      await enviarMensaje(numero, menuPrincipal());
      return;
    }

    // --------------------------------------------------------
    // ESPERANDO ID DEL JUGADOR
    // --------------------------------------------------------

    if (usuario.estado === "esperando_id") {
      if (!validarIdJugador(texto)) {
        await enviarMensaje(
          numero,
          "❌ El ID no parece válido.\n\n" +
          "Envía el ID numérico de tu cuenta de Free Fire, " +
          "de 7 a 20 dígitos."
        );
        return;
      }

      usuario.idJugador = texto;
      usuario.estado = "finalizado";
      usuario.ultimaActividad = Date.now();
      guardarUsuarios();

      const resumen = `✅ *SOLICITUD RECIBIDA*

🎮 Producto: ${usuario.producto} diamantes
💰 Total: ${formatoBs(usuario.precio)} Bs
🧾 Referencia: ${usuario.referencia}
🆔 ID del jugador: ${usuario.idJugador}

⏳ Tu pago y solicitud deben verificarse antes de completar la recarga.

Gracias por comprar en *RECARGAS GAMES*.`;

      const mensajeAdmin = `🛒 *NUEVA SOLICITUD DE RECARGA*

👤 Cliente: ${numero}
💎 Paquete: ${usuario.producto} diamantes
💰 Total: ${formatoBs(usuario.precio)} Bs
🧾 Referencia: ${usuario.referencia}
🆔 ID: ${usuario.idJugador}

📌 Verificar el pago y procesar el pedido.`;

      await enviarMensaje(numero, resumen);
      await enviarMensaje(`${ADMIN}@c.us`, mensajeAdmin);
      return;
    }

    // --------------------------------------------------------
    // ESPERANDO REFERENCIA
    // --------------------------------------------------------

    if (usuario.estado === "esperando_referencia") {
      if (!validarReferencia(texto)) {
        await enviarMensaje(
          numero,
          "❌ La referencia debe tener exactamente 4 dígitos.\n\n" +
          "Ejemplo: 1234"
        );
        return;
      }

      usuario.referencia = texto;
      usuario.estado = "esperando_id";
      guardarUsuarios();

      await enviarMensaje(
        numero,
        `✅ Referencia recibida.

Ahora envía tu *ID de jugador de Free Fire*.

Debe tener entre 7 y 20 dígitos.`
      );

      return;
    }

    // --------------------------------------------------------
    // MENÚ PRINCIPAL
    // --------------------------------------------------------

    if (usuario.estado === "inicio") {
      if (texto === "1") {
        usuario.estado = "seleccion_producto";
        guardarUsuarios();

        // Intentar mostrar una lista interactiva.
        // Si WhatsApp no la admite, usar el menú numerado.
        try {
          const lista = menuOpciones(
            "💎 Selecciona el paquete que deseas comprar.",
            [
              { id: "110", title: "110 diamantes", description: "770 Bs" },
              { id: "220", title: "220 diamantes", description: "1.540 Bs" },
              { id: "341", title: "341 diamantes", description: "2.300 Bs" },
              { id: "572", title: "572 diamantes", description: "3.850 Bs" },
              { id: "1166", title: "1166 diamantes", description: "7.150 Bs" },
              { id: "2398", title: "2398 diamantes", description: "14.100 Bs" },
              { id: "6160", title: "6160 diamantes", description: "35.900 Bs" },
            ]
          );

          registrarEnvioAutomatico(numero, lista);
          await client.sendMessage(numero, lista);
        } catch (error) {
          await enviarMensaje(numero, menuRecargas());
        }

        return;
      }

      if (texto === "2") {
        usuario.estado = "consulta";
        guardarUsuarios();

        await enviarMensaje(
          numero,
          "🔎 *CONSULTAS*\n\n" +
          "Escribe tu número de pedido o explica qué deseas consultar.\n\n" +
          "Si necesitas atención humana, escribe *soporte*."
        );
        return;
      }

      if (texto === "3" || normalizado === "soporte") {
        usuario.estado = "soporte";
        guardarUsuarios();

        await enviarMensaje(
          numero,
          "🧑‍💻 *ATENCIÓN AL CLIENTE*\n\n" +
          "Tu solicitud será comunicada al administrador.\n\n" +
          "También puedes escribir tu consulta aquí."
        );

        await enviarMensaje(
          `${ADMIN}@c.us`,
          `🧑‍💻 *SOLICITUD DE SOPORTE*\n\nCliente: ${numero}\nMensaje: solicita atención humana.`
        );

        // La atención manual debe detener las respuestas automáticas.
        usuario.pausaHumanaHasta = Date.now() + PAUSA_HUMANA_MS;
        guardarUsuarios();
        return;
      }

      await enviarMensaje(numero, menuPrincipal());
      return;
    }

    // --------------------------------------------------------
    // SELECCIÓN DEL PAQUETE
    // --------------------------------------------------------

    if (usuario.estado === "seleccion_producto") {
      let producto = texto;

      // Admitir número de opción o ID del paquete.
      const opciones = {
        "1": "110",
        "2": "220",
        "3": "341",
        "4": "572",
        "5": "1166",
        "6": "2398",
        "7": "6160",
      };

      if (opciones[texto]) {
        producto = opciones[texto];
      }

      // Las respuestas de listas interactivas pueden llegar
      // como el ID seleccionado.
      if (!Object.prototype.hasOwnProperty.call(precios, producto)) {
        await enviarMensaje(numero, menuRecargas());
        return;
      }

      usuario.producto = producto;
      usuario.precio = precios[producto];
      usuario.estado = "esperando_referencia";
      guardarUsuarios();

      await enviarMensaje(
        numero,
        `💎 *PAQUETE SELECCIONADO*

Diamantes: ${producto}
Precio: ${formatoBs(precios[producto])} Bs

${mensajePago()}`
      );

      return;
    }

    // --------------------------------------------------------
    // CONSULTAS Y SOPORTE
    // --------------------------------------------------------

    if (usuario.estado === "consulta") {
      await enviarMensaje(
        `${ADMIN}@c.us`,
        `🔎 *CONSULTA DE CLIENTE*\n\nCliente: ${numero}\nMensaje: ${texto}`
      );

      await enviarMensaje(
        numero,
        "✅ Tu consulta fue enviada al administrador."
      );

      usuario.pausaHumanaHasta = Date.now() + PAUSA_HUMANA_MS;
      guardarUsuarios();
      return;
    }

    if (usuario.estado === "soporte") {
      await enviarMensaje(
        `${ADMIN}@c.us`,
        `🧑‍💻 *MENSAJE DE SOPORTE*\n\nCliente: ${numero}\nMensaje: ${texto}`
      );

      await enviarMensaje(
        numero,
        "✅ Tu mensaje fue enviado al administrador. " +
        "No recibirás respuestas automáticas mientras se atiende tu caso."
      );

      usuario.pausaHumanaHasta = Date.now() + PAUSA_HUMANA_MS;
      guardarUsuarios();
      return;
    }

    // --------------------------------------------------------
    // SOLICITUD FINALIZADA
    // --------------------------------------------------------

    if (usuario.estado === "finalizado") {
      await enviarMensaje(
        numero,
        "✅ Ya recibimos tu solicitud.\n\n" +
        "Para realizar otra compra, escribe *menu*."
      );
      return;
    }

    await enviarMensaje(numero, menuPrincipal());
  } catch (error) {
    console.error("❌ Error procesando mensaje:", error);
  }
});

// ============================================================
// API PARA LA PÁGINA WEB
// ============================================================

function autenticarToken(req, res, next) {
  if (!API_TOKEN) {
    return res.status(503).json({
      ok: false,
      error: "API_TOKEN no está configurado",
    });
  }

  const token = req.headers["x-api-token"] || req.body?.token;

  if (token !== API_TOKEN) {
    return res.status(401).json({
      ok: false,
      error: "No autorizado",
    });
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
      return res.status(400).json({
        ok: false,
        error: "Falta telefono o mensaje",
      });
    }

    if (!client.info) {
      return res.status(503).json({
        ok: false,
        error: "Bot no conectado a WhatsApp",
      });
    }

    const numero = normalizarTelefono(telefono);

    if (numero.length < 10 || numero.length > 15) {
      return res.status(400).json({
        ok: false,
        error: "Número de teléfono inválido",
      });
    }

    const resultado = await enviarMensaje(
      `${numero}@c.us`,
      mensaje.trim()
    );

    return res.status(resultado.ok ? 200 : 500).json(resultado);
  } catch (error) {
    console.error("Error en /api/enviar:", error.message);
    return res.status(500).json({
      ok: false,
      error: "Error interno al enviar mensaje",
    });
  }
});

// POST /api/notificar-pedido
app.post(
  "/api/notificar-pedido",
  autenticarToken,
  async (req, res) => {
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

      const numero = normalizarTelefono(telefono);

      if (numero.length < 10 || numero.length > 15) {
        return res.status(400).json({
          ok: false,
          error: "Número de teléfono inválido",
        });
      }

      const resultadoCliente = await enviarMensaje(
        `${numero}@c.us`,
        mensajeCliente
      );

      let resultadoAdmin = { ok: true };

      if (mensajeAdmin) {
        resultadoAdmin = await enviarMensaje(
          `${ADMIN}@c.us`,
          mensajeAdmin
        );
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

      return res.status(500).json({
        ok: false,
        error: "Error interno al notificar el pedido",
      });
    }
  }
);

// POST /api/reactivar
// Permite que la web reactive la atención automática de un cliente.
app.post("/api/reactivar", autenticarToken, (req, res) => {
  const numero = normalizarTelefono(req.body?.telefono);

  if (numero.length < 10 || numero.length > 15) {
    return res.status(400).json({
      ok: false,
      error: "Número de teléfono inválido",
    });
  }

  const chatId = `${numero}@c.us`;
  const usuario = usuarios.get(chatId);

  if (usuario) {
    usuario.pausaHumanaHasta = 0;
    usuario.estado = "inicio";
    usuario.ultimaActividad = Date.now();
    guardarUsuarios();
  }

  return res.json({
    ok: true,
    mensaje: "Atención automática reactivada",
  });
});

// GET /api/status
app.get("/api/status", (req, res) => {
  res.json({
    ok: true,
    conectado: !!client.info,
    numero: client.info?.wid?.user || null,
    version: packageInfo.version,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// PANEL PRINCIPAL
// ============================================================

app.get("/", (req, res) => {
  const conectado = !!client.info;
  const color = conectado ? "#22c55e" : "#f59e0b";

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
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
</style>
</head>
<body><main>
<h1>🎮 RECARGAS GAMES</h1>
<p>Panel de atención automática de WhatsApp.</p>
<div class="estado">${conectado ? "Conectado ✅" : "Esperando conexión ⚠️"}</div>
<br><a href="/QR">Ver código QR</a>
</main></body></html>`);
});

// ============================================================
// PÁGINA QR
// ============================================================

app.get("/QR", async (req, res) => {
  try {
    if (client.info) {
      return res.send(
        "<h2 style='font-family:Arial;text-align:center'>" +
        "WhatsApp ya está conectado ✅</h2>"
      );
    }

    if (!app.locals.qr) {
      return res.send(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="5">
<title>Esperando QR</title></head>
<body style="background:#080808;color:white;text-align:center;font-family:Arial;padding:30px">
<h2>Esperando código QR...</h2>
<p>Esta página se actualizará automáticamente.</p>
</body></html>`);
    }

    const imagen = await qrcode.toDataURL(app.locals.qr);

    res.send(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>QR - RECARGAS GAMES</title>
</head>
<body style="background:#080808;color:white;text-align:center;font-family:Arial;padding:20px">
<h2>📱 Conectar WhatsApp</h2>
<p>Escanea el código desde Dispositivos vinculados en WhatsApp.</p>
<img src="${imagen}" alt="Código QR de WhatsApp"
style="max-width:90%;width:350px;background:white;padding:10px;border-radius:12px">
<p>La página se actualizará automáticamente.</p>
<meta http-equiv="refresh" content="20">
</body></html>`);
  } catch (error) {
    console.error("Error generando QR:", error.message);
    res.status(500).send("No se pudo generar el código QR.");
  }
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================

const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`🌐 Servidor activo en puerto ${PORT}`);
  console.log("🔗 Panel: /");
  console.log("📱 QR: /QR");
  console.log("🔌 API: /api/enviar");
  console.log("🔌 API: /api/notificar-pedido");
  console.log("🔌 API: /api/reactivar");
  console.log("🔌 API: /api/status");
});

server.requestTimeout = 30000;
server.headersTimeout = 35000;

client.initialize().catch((error) => {
  console.error("Error inicializando WhatsApp:", error.message);
});

// Cierre ordenado del proceso.
async function cerrarServidor() {
  console.log("Cerrando servidor y cliente de WhatsApp...");

  server.close();

  try {
    await client.destroy();
  } catch (error) {
    console.error("Error cerrando WhatsApp:", error.message);
  }

  process.exit(0);
}

process.on("SIGINT", cerrarServidor);
process.on("SIGTERM", cerrarServidor);
