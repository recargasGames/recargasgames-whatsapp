require("dotenv").config();

const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode-terminal");
const fs = require("fs");
const path = require("path");

const {
  Client,
  LocalAuth
} = require("whatsapp-web.js");

/* =========================================================
   CONFIGURACIÓN GENERAL
========================================================= */

const app = express();

const PORT = process.env.PORT || 3000;

const ADMIN_WHATSAPP =
  process.env.ADMIN_WHATSAPP || "";

const WEB_API_KEY =
  process.env.WEB_API_KEY || "";

const WEB_URL =
  process.env.WEB_URL || "https://recargasgames.shop";

app.use(cors());

app.use(
  express.json({
    limit: "2mb"
  })
);

app.use(
  express.urlencoded({
    extended: true
  })
);

/* =========================================================
   PRECIOS DE FREE FIRE
========================================================= */

const preciosFreeFire = {
  "110": {
    producto: "110 diamantes",
    precio: 770
  },

  "220": {
    producto: "220 diamantes",
    precio: 1540
  },

  "341": {
    producto: "341 diamantes",
    precio: 2300
  },

  "572": {
    producto: "572 diamantes",
    precio: 3850
  },

  "1166": {
    producto: "1166 diamantes",
    precio: 7150
  },

  "2398": {
    producto: "2398 diamantes",
    precio: 14100
  },

  "6160": {
    producto: "6160 diamantes",
    precio: 35900
  }
};

/* =========================================================
   ESTADOS DE LOS CLIENTES
========================================================= */

const estados = {
  MENU: "MENU",
  PRECIOS: "PRECIOS",
  ESPERANDO_REFERENCIA: "ESPERANDO_REFERENCIA",
  ESPERANDO_ID: "ESPERANDO_ID"
};

const sesiones = new Map();

/* =========================================================
   ARCHIVO DE PEDIDOS
========================================================= */

const archivoPedidos = path.join(
  __dirname,
  "pedidos.json"
);

function cargarPedidos() {
  try {
    if (!fs.existsSync(archivoPedidos)) {
      fs.writeFileSync(
        archivoPedidos,
        JSON.stringify([], null, 2)
      );

      return [];
    }

    const contenido = fs.readFileSync(
      archivoPedidos,
      "utf8"
    );

    if (!contenido.trim()) {
      return [];
    }

    return JSON.parse(contenido);
  } catch (error) {
    console.error(
      "Error cargando pedidos:",
      error.message
    );

    return [];
  }
}

function guardarPedidos(pedidos) {
  try {
    fs.writeFileSync(
      archivoPedidos,
      JSON.stringify(pedidos, null, 2)
    );
  } catch (error) {
    console.error(
      "Error guardando pedidos:",
      error.message
    );
  }
}

/* =========================================================
   FUNCIONES GENERALES
========================================================= */

function generarNumeroPedido() {
  const ahora = new Date();

  const fecha = ahora
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  const aleatorio = Math.floor(
    1000 + Math.random() * 9000
  );

  return `RG-${fecha}-${aleatorio}`;
}

function formatearMonto(monto) {
  return Number(monto).toLocaleString("es-VE");
}

function obtenerFecha() {
  return new Date().toLocaleString(
    "es-VE",
    {
      timeZone: "America/Caracas"
    }
  );
}

function limpiarTexto(texto) {
  return String(texto || "")
    .trim()
    .replace(/\s+/g, " ");
}

/* =========================================================
   NORMALIZAR WHATSAPP
========================================================= */

function normalizarWhatsApp(numero) {
  if (!numero) {
    return null;
  }

  let telefono = String(numero)
    .trim()
    .replace(/\s/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");

  if (telefono.endsWith("@c.us")) {
    return telefono;
  }

  if (telefono.startsWith("+")) {
    telefono = telefono.substring(1);
  }

  if (telefono.startsWith("00")) {
    telefono = telefono.substring(2);
  }

  if (telefono.startsWith("0")) {
    telefono = "58" + telefono.substring(1);
  }

  if (!telefono.endsWith("@c.us")) {
    telefono += "@c.us";
  }

  return telefono;
}

function numeroValido(numero) {
  if (!numero) {
    return false;
  }

  const limpio = String(numero)
    .replace(/\D/g, "");

  return (
    limpio.length >= 10 &&
    limpio.length <= 15
  );
}

/* =========================================================
   MENSAJES
========================================================= */

function mensajeBienvenida() {
  return `
🎮 *Bienvenido a RECARGASGAMES*

🕐 *Horario de atención:*
7:00 AM a 11:00 PM

¿Quieres consultar los precios de Free Fire?

👉 Escribe *1*
`;
}

function mensajePrecios() {
  return `
🔥 *FREE FIRE*

💎 110 diamantes — 770 Bs
💎 220 diamantes — 1.540 Bs
💎 341 diamantes — 2.300 Bs
💎 572 diamantes — 3.850 Bs
💎 1166 diamantes — 7.150 Bs
💎 2398 diamantes — 14.100 Bs
💎 6160 diamantes — 35.900 Bs

🌐 Para recargar otros juegos:
👉 ${WEB_URL}

💳 Para consultar los datos de Pago Móvil:
👉 Escribe *0*

📌 Para comprar una recarga,
escribe directamente la cantidad de diamantes.

Ejemplo: *110*
`;
}

function mensajePagoMovil(monto = null) {
  return `
💳 *PAGO MÓVIL*

🏦 Banco: Banco de Venezuela
🔢 Código: 0102
🪪 Cédula: V-32824869
📱 Teléfono: 04228242411
${
  monto
    ? `💰 Monto: ${formatearMonto(monto)} Bs`
    : ""
}

Realiza el pago y envía la referencia de pago.

Para volver al menú escribe:
👉 *menu*
`;
}

function mensajeReferencia() {
  return `
🧾 *Envía la referencia de pago*

Escribe solamente el número de referencia que aparece en tu comprobante.

Si deseas cancelar, escribe:
👉 *cancelar*
`;
}

function mensajeSolicitarId() {
  return `
✅ *Referencia recibida correctamente.*

🎮 Ahora envía tu *ID de Free Fire*.

Ejemplo:
4664719056

Si deseas cancelar, escribe:
👉 *cancelar*
`;
}

/* =========================================================
   CLIENTE DE WHATSAPP
========================================================= */

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "recargasgames"
  }),

  puppeteer: {
    headless: true,

    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--disable-extensions",
      "--disable-background-networking",
      "--disable-default-apps",
      "--disable-sync",
      "--no-first-run",
      "--no-zygote"
    ]
  }
});

/* =========================================================
   EVENTOS DE WHATSAPP
========================================================= */

client.on("qr", qr => {
  console.log("");
  console.log("=================================");
  console.log("ESCANEA ESTE CÓDIGO QR");
  console.log("=================================");

  qrcode.generate(qr, {
    small: true
  });
});

client.on("authenticated", () => {
  console.log(
    "WhatsApp autenticado correctamente."
  );
});

client.on("auth_failure", error => {
  console.error(
    "Falló la autenticación de WhatsApp:",
    error
  );
});

client.on("ready", () => {
  console.log("");
  console.log("=================================");
  console.log("RECARGASGAMES WHATSAPP CONECTADO");
  console.log("=================================");
});

client.on("disconnected", reason => {
  console.log(
    "WhatsApp desconectado:",
    reason
  );
});

client.on("error", error => {
  console.error(
    "ERROR INTERNO DE WHATSAPP:",
    error
  );
});

client.on(
  "loading_screen",
  (porcentaje, mensaje) => {
    console.log(
      `WhatsApp cargando: ${porcentaje}% - ${mensaje}`
    );
  }
);

/* =========================================================
   NOTIFICAR AL ADMINISTRADOR
========================================================= */

async function notificarAdministrador(pedido) {
  try {
    if (!client.info) {
      console.log(
        "WhatsApp no está conectado. No se notificó al administrador."
      );

      return;
    }

    const adminChatId =
      normalizarWhatsApp(ADMIN_WHATSAPP);

    if (!adminChatId) {
      console.error(
        "ADMIN_WHATSAPP no está configurado."
      );

      return;
    }

    const mensaje = `
📦 *NUEVO PEDIDO RECARGASGAMES*

🔢 Pedido: ${pedido.numeroPedido}
🎮 Juego: ${pedido.juego}
💎 Producto: ${pedido.producto}
💰 Monto: ${formatearMonto(pedido.monto)} Bs

🆔 ID del jugador:
${pedido.jugadorId}

🧾 Referencia:
${pedido.referencia}

📱 Cliente:
${pedido.telefono}

📅 Fecha:
${pedido.fecha}

⏳ Estado:
PENDIENTE

🌐 Origen:
${pedido.origen}
`;

    await client.sendMessage(
      adminChatId,
      mensaje
    );

    console.log(
      "Administrador notificado:",
      pedido.numeroPedido
    );
  } catch (error) {
    console.error(
      "Error notificando al administrador:",
      error.message
    );
  }
}

/* =========================================================
   PROCESAR MENSAJES DE CLIENTES
========================================================= */

client.on("message", async message => {
  try {
    if (!message || !message.body) {
      return;
    }

    if (
      message.from.endsWith("@g.us") ||
      message.from === "status@broadcast"
    ) {
      return;
    }

    const telefono = message.from;

    const textoOriginal = limpiarTexto(
      message.body
    );

    const texto = textoOriginal.toLowerCase();

    let sesion = sesiones.get(telefono);

    if (!sesion) {
      sesion = {
        estado: estados.MENU,
        producto: null,
        monto: null,
        referencia: null
      };

      sesiones.set(telefono, sesion);
    }

    /* COMANDOS GENERALES */

    if (
      texto === "menu" ||
      texto === "inicio" ||
      texto === "hola" ||
      texto === "buenas"
    ) {
      sesiones.set(telefono, {
        estado: estados.MENU,
        producto: null,
        monto: null,
        referencia: null
      });

      await message.reply(
        mensajeBienvenida()
      );

      return;
    }

    if (
      texto === "cancelar" ||
      texto === "cancelado"
    ) {
      sesiones.set(telefono, {
        estado: estados.MENU,
        producto: null,
        monto: null,
        referencia: null
      });

      await message.reply(
        "❌ Operación cancelada.\n\n" +
        mensajeBienvenida()
      );

      return;
    }

    /* MENÚ INICIAL */

    if (sesion.estado === estados.MENU) {
      if (texto === "1") {
        sesion.estado = estados.PRECIOS;

        await message.reply(
          mensajePrecios()
        );

        return;
      }

      await message.reply(
        mensajeBienvenida()
      );

      return;
    }

    /* PANTALLA DE PRECIOS */

    if (sesion.estado === estados.PRECIOS) {
      if (texto === "0") {
        await message.reply(
          mensajePagoMovil()
        );

        return;
      }

      const producto =
        preciosFreeFire[texto];

      if (!producto) {
        await message.reply(`
❌ Producto no válido.

Escribe la cantidad de diamantes directamente.

Ejemplo:
110
`);

        return;
      }

      sesion.producto =
        producto.producto;

      sesion.monto =
        producto.precio;

      sesion.estado =
        estados.ESPERANDO_REFERENCIA;

      await message.reply(`
🔥 *RECARGA SELECCIONADA*

💎 Producto: ${producto.producto}
💰 Precio: ${formatearMonto(producto.precio)} Bs

${mensajePagoMovil(producto.precio)}

${mensajeReferencia()}
`);

      return;
    }

    /* ESPERANDO REFERENCIA */

    if (
      sesion.estado ===
      estados.ESPERANDO_REFERENCIA
    ) {
      const referencia =
        textoOriginal.replace(/\D/g, "");

      if (
        !referencia ||
        referencia.length < 4
      ) {
        await message.reply(`
❌ La referencia no parece válida.

Envía solamente el número de referencia de tu pago.
`);

        return;
      }

      sesion.referencia = referencia;

      sesion.estado =
        estados.ESPERANDO_ID;

      await message.reply(
        mensajeSolicitarId()
      );

      return;
    }

    /* ESPERANDO ID DE FREE FIRE */

    if (
      sesion.estado ===
      estados.ESPERANDO_ID
    ) {
      const jugadorId =
        textoOriginal.replace(/\D/g, "");

      if (
        !jugadorId ||
        jugadorId.length < 5 ||
        jugadorId.length > 15
      ) {
        await message.reply(`
❌ El ID de Free Fire no parece válido.

Envía solamente tu ID numérico.
`);

        return;
      }

      const pedido = {
        numeroPedido: generarNumeroPedido(),
        juego: "Free Fire",
        producto: sesion.producto,
        monto: sesion.monto,
        jugadorId,
        referencia: sesion.referencia,
        telefono,
        fecha: obtenerFecha(),
        estado: "PENDIENTE",
        origen: "WhatsApp"
      };

      const pedidos = cargarPedidos();

      pedidos.push(pedido);

      guardarPedidos(pedidos);

      await notificarAdministrador(
        pedido
      );

      await message.reply(`
✅ *PEDIDO REGISTRADO*

🔢 Número de pedido:
${pedido.numeroPedido}

🎮 Juego: Free Fire
💎 Producto: ${pedido.producto}
🆔 ID: ${pedido.jugadorId}
💰 Monto: ${formatearMonto(pedido.monto)} Bs

⏳ Tu pedido está pendiente de revisión.

Te avisaremos cuando la recarga sea procesada.

🌐 ${WEB_URL}
`);

      sesiones.set(telefono, {
        estado: estados.MENU,
        producto: null,
        monto: null,
        referencia: null
      });

      return;
    }
  } catch (error) {
    console.error(
      "Error procesando mensaje:",
      error
    );
  }
});

/* =========================================================
   SEGURIDAD PARA LA WEB
========================================================= */

function verificarApiWeb(req, res, next) {
  const claveRecibida =
    req.headers["x-api-key"];

  if (
    !WEB_API_KEY ||
    !claveRecibida ||
    claveRecibida !== WEB_API_KEY
  ) {
    return res.status(401).json({
      ok: false,
      mensaje: "No autorizado"
    });
  }

  next();
}

/* =========================================================
   RUTA PRINCIPAL
========================================================= */

app.get("/", (req, res) => {
  res.json({
    ok: true,
    servicio: "RECARGASGAMES WhatsApp API",
    estado: "activo"
  });
});

/* =========================================================
   ESTADO DEL SERVIDOR
========================================================= */

app.get("/api/estado", (req, res) => {
  res.json({
    ok: true,
    whatsapp: Boolean(client.info),
    servidor: "activo",
    fecha: obtenerFecha()
  });
});

/* =========================================================
   LISTAR PEDIDOS
========================================================= */

app.get(
  "/api/pedidos",
  verificarApiWeb,
  (req, res) => {
    const pedidos = cargarPedidos();

    res.json({
      ok: true,
      total: pedidos.length,
      pedidos
    });
  }
);

/* =========================================================
   BUSCAR PEDIDO
========================================================= */

app.get(
  "/api/pedido/:numero",
  verificarApiWeb,
  (req, res) => {
    const pedidos = cargarPedidos();

    const pedido = pedidos.find(
      item =>
        item.numeroPedido ===
        req.params.numero
    );

    if (!pedido) {
      return res.status(404).json({
        ok: false,
        mensaje: "Pedido no encontrado"
      });
    }

    res.json({
      ok: true,
      pedido
    });
  }
);

/* =========================================================
   PEDIDO CONFIRMADO DESDE LA WEB
========================================================= */

app.post(
  "/api/pedido-web",
  verificarApiWeb,
  async (req, res) => {
    try {
      const {
        whatsapp,
        numeroPedido,
        juego,
        producto,
        jugadorId,
        monto,
        referencia,
        pin,
        codigos
      } = req.body;

      if (!whatsapp) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "Falta el WhatsApp del cliente"
        });
      }

      if (!numeroPedido) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "Falta el número de pedido"
        });
      }

      if (!client.info) {
        return res.status(503).json({
          ok: false,
          mensaje:
            "WhatsApp todavía no está conectado"
        });
      }

      const chatId =
        normalizarWhatsApp(whatsapp);

      if (!chatId) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "Número de WhatsApp inválido"
        });
      }

      const contenidoCodigo =
        pin
          ? `🔐 *PIN DE TU RECARGA:*\n${pin}`
          : Array.isArray(codigos) &&
            codigos.length > 0
            ? `🔐 *CÓDIGOS DE TU RECARGA:*\n${codigos.join("\n")}`
            : codigos
              ? `🔐 *CÓDIGOS DE TU RECARGA:*\n${codigos}`
              : "⏳ Tu pedido está siendo procesado.";

      const mensaje = `
🎮 *RECARGASGAMES*

✅ *¡Pago confirmado!*

📦 Pedido: ${numeroPedido}
🎮 Juego: ${juego || "No indicado"}
💎 Producto: ${producto || "No indicado"}
🆔 ID del jugador: ${jugadorId || "No indicado"}
💰 Monto: ${monto || "No indicado"} Bs
🧾 Referencia: ${referencia || "No indicada"}

${contenidoCodigo}

🌐 ${WEB_URL}

Gracias por comprar en RECARGASGAMES.
`;

      await client.sendMessage(
        chatId,
        mensaje
      );

      res.json({
        ok: true,
        mensaje:
          "Pedido enviado por WhatsApp"
      });
    } catch (error) {
      console.error(
        "Error enviando pedido web:",
        error
      );

      res.status(500).json({
        ok: false,
        mensaje:
          "No se pudo enviar el pedido por WhatsApp"
      });
    }
  }
);

/* =========================================================
   ALERTA DE PAGO NO CONFIRMADO
========================================================= */

app.post(
  "/api/alerta-web",
  verificarApiWeb,
  async (req, res) => {
    try {
      const {
        whatsapp,
        numeroPedido,
        juego,
        producto,
        jugadorId,
        monto,
        referencia,
        motivo
      } = req.body;

      if (!client.info) {
        return res.status(503).json({
          ok: false,
          mensaje:
            "WhatsApp todavía no está conectado"
        });
      }

      const adminChatId =
        normalizarWhatsApp(
          ADMIN_WHATSAPP
        );

      if (!adminChatId) {
        return res.status(500).json({
          ok: false,
          mensaje:
            "ADMIN_WHATSAPP no está configurado"
        });
      }

      const mensaje = `
⚠️ *ALERTA DE PAGO NO CONFIRMADO*

🌐 Origen: Página web

📦 Pedido: ${numeroPedido || "No generado"}
🎮 Juego: ${juego || "No indicado"}
💎 Producto: ${producto || "No indicado"}
🆔 ID del jugador: ${jugadorId || "No indicado"}
💰 Monto: ${monto || "No indicado"} Bs
📱 WhatsApp: ${whatsapp || "No indicado"}
🧾 Referencia: ${referencia || "No indicada"}

❌ Motivo:
${motivo || "El pago no fue confirmado."}

Revisar el pago manualmente.
`;

      await client.sendMessage(
        adminChatId,
        mensaje
      );

      res.json({
        ok: true,
        mensaje:
          "Alerta enviada al administrador"
      });
    } catch (error) {
      console.error(
        "Error enviando alerta:",
        error
      );

      res.status(500).json({
        ok: false,
        mensaje:
          "No se pudo enviar la alerta"
      });
    }
  }
);

/* =========================================================
   MANEJO DE ERRORES
========================================================= */

app.use(
  (error, req, res, next) => {
    console.error(
      "Error general:",
      error
    );

    res.status(500).json({
      ok: false,
      mensaje: "Error interno del servidor"
    });
  }
);

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Servidor ejecutándose en el puerto ${PORT}`
    );
  }
);

/* =========================================================
   MANEJO DE ERRORES DEL PROCESO
========================================================= */

process.on(
  "uncaughtException",
  error => {
    console.error(
      "ERROR NO CONTROLADO:",
      error
    );
  }
);

process.on(
  "unhandledRejection",
  error => {
    console.error(
      "PROMESA RECHAZADA:",
      error
    );
  }
);

/* =========================================================
   INICIAR WHATSAPP
========================================================= */

client.initialize();
