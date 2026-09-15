// server.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// CONFIGURACIÓN
// ===============================

const ADMIN_WHATSAPP =
  process.env.ADMIN_WHATSAPP || "584228242411@c.us";

const WEB_URL =
  process.env.WEB_URL || "recargasgames.shop";

// ===============================
// PRECIOS FREE FIRE
// ===============================

const PRECIOS_FREE_FIRE = {
  "110": 770,
  "220": 1540,
  "341": 2300,
  "572": 3850,
  "1166": 7150,
  "2398": 14100,
  "6160": 35900,
};

// ===============================
// ARCHIVO DE PEDIDOS
// ===============================

const ARCHIVO_PEDIDOS = path.join(__dirname, "pedidos.json");

function cargarPedidos() {
  try {
    if (!fs.existsSync(ARCHIVO_PEDIDOS)) {
      fs.writeFileSync(ARCHIVO_PEDIDOS, "[]", "utf8");
      return [];
    }

    return JSON.parse(
      fs.readFileSync(ARCHIVO_PEDIDOS, "utf8")
    );
  } catch (error) {
    console.error("Error cargando pedidos:", error);
    return [];
  }
}

let pedidos = cargarPedidos();

function guardarPedidos() {
  try {
    fs.writeFileSync(
      ARCHIVO_PEDIDOS,
      JSON.stringify(pedidos, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Error guardando pedidos:", error);
  }
}

// ===============================
// SESIONES DE CLIENTES
// ===============================

const sesiones = new Map();

/*
Estados:

MENU
PRECIOS
ESPERANDO_REFERENCIA
ESPERANDO_ID
*/

function obtenerSesion(numero) {
  if (!sesiones.has(numero)) {
    sesiones.set(numero, {
      estado: "MENU",
      referencia: null,
      idJugador: null,
      fechaInicio: new Date().toISOString(),
    });
  }

  return sesiones.get(numero);
}

function reiniciarSesion(numero) {
  sesiones.set(numero, {
    estado: "MENU",
    referencia: null,
    idJugador: null,
    fechaInicio: new Date().toISOString(),
  });
}

// ===============================
// MENSAJES
// ===============================

function mensajeBienvenida() {
  return `🎮 *Bienvenido a RECARGASGAMES*

🕐 Horario de atención:
7:00 AM a 11:00 PM

¿Quieres consultar los precios de Free Fire?

👉 Escribe *1*`;
}

function mensajePrecios() {
  return `🔥 *FREE FIRE*

💎 110 diamantes — *770 Bs*
💎 220 diamantes — *1.540 Bs*
💎 341 diamantes — *2.300 Bs*
💎 572 diamantes — *3.850 Bs*
💎 1166 diamantes — *7.150 Bs*
💎 2398 diamantes — *14.100 Bs*
💎 6160 diamantes — *35.900 Bs*

🌐 Para recargar otros juegos:
👉 ${WEB_URL}

💳 Para realizar el pago:
👉 Escribe *0*`;
}

function mensajePagoMovil() {
  return `💳 *PAGO MÓVIL*

🏦 Banco de Venezuela
🔢 Código: 0102
🪪 Cédula: V-32824869
📱 Teléfono: 04228242411

Realiza tu pago y envía la *referencia de pago*.`;
}

// ===============================
// GENERAR NÚMERO DE PEDIDO
// ===============================

function generarNumeroPedido() {
  const ahora = new Date();

  const fecha =
    ahora.getFullYear().toString() +
    String(ahora.getMonth() + 1).padStart(2, "0") +
    String(ahora.getDate()).padStart(2, "0");

  const numero = String(pedidos.length + 1).padStart(4, "0");

  return `RG-${fecha}-${numero}`;
}

// ===============================
// NOTIFICACIÓN AL ADMIN
// ===============================

async function notificarAdministrador(pedido) {
  try {
    const mensaje = `🚨 *NUEVO PEDIDO - RECARGASGAMES*

🧾 Pedido: *${pedido.numeroPedido}*

🎮 Juego: Free Fire
💎 Recarga: *${pedido.recarga} diamantes*
💰 Precio: *${pedido.precio} Bs*

👤 ID Free Fire:
*${pedido.idJugador}*

💳 Referencia:
*${pedido.referencia}*

📱 Cliente:
${pedido.telefono}

📅 Fecha:
${pedido.fecha}

📌 Estado:
*PENDIENTE DE RECARGA*

⚠️ Verificar el pago y realizar la recarga.`;

    await whatsappClient.sendMessage(
      ADMIN_WHATSAPP,
      mensaje
    );

    console.log(
      `📨 Pedido ${pedido.numeroPedido} enviado al administrador.`
    );
  } catch (error) {
    console.error(
      "❌ Error enviando pedido al administrador:",
      error
    );
  }
}

// ===============================
// WHATSAPP
// ===============================

const whatsappClient = new Client({
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
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  },
});

// ===============================
// QR
// ===============================

whatsappClient.on("qr", (qr) => {
  console.log("\n================================");
  console.log("📱 ESCANEA ESTE QR CON WHATSAPP");
  console.log("================================\n");

  qrcode.generate(qr, {
    small: true,
  });
});

// ===============================
// LISTO
// ===============================

whatsappClient.on("ready", () => {
  console.log("\n================================");
  console.log("✅ RECARGASGAMES WHATSAPP LISTO");
  console.log("================================\n");
});

// ===============================
// AUTENTICADO
// ===============================

whatsappClient.on("authenticated", () => {
  console.log("🔐 WhatsApp autenticado correctamente.");
});

// ===============================
// ERROR DE AUTENTICACIÓN
// ===============================

whatsappClient.on("auth_failure", (mensaje) => {
  console.error(
    "❌ Error de autenticación de WhatsApp:",
    mensaje
  );
});

// ===============================
// DESCONECTADO
// ===============================

whatsappClient.on("disconnected", (reason) => {
  console.log(
    "⚠️ WhatsApp desconectado:",
    reason
  );
});

// ===============================
// RECIBIR MENSAJES
// ===============================

whatsappClient.on("message", async (message) => {
  try {
    // Ignorar grupos
    if (message.from.endsWith("@g.us")) {
      return;
    }

    // Ignorar estados
    if (message.from === "status@broadcast") {
      return;
    }

    const numero = message.from;

    const texto = (message.body || "")
      .trim()
      .toLowerCase();

    if (!texto) {
      return;
    }

    const sesion = obtenerSesion(numero);

    console.log(
      `📩 ${numero}: ${message.body}`
    );

    // ===========================
    // COMANDO CANCELAR
    // ===========================

    if (
      texto === "cancelar" ||
      texto === "cancel" ||
      texto === "salir"
    ) {
      reiniciarSesion(numero);

      await message.reply(
        "❌ Operación cancelada.\n\n" +
        mensajeBienvenida()
      );

      return;
    }

    // ===========================
    // VOLVER AL INICIO
    // ===========================

    if (
      texto === "menu" ||
      texto === "inicio"
    ) {
      reiniciarSesion(numero);

      await message.reply(
        mensajeBienvenida()
      );

      return;
    }

    // ===========================
    // ESTADO MENU
    // ===========================

    if (sesion.estado === "MENU") {
      if (texto === "1") {
        sesion.estado = "PRECIOS";

        await message.reply(
          mensajePrecios()
        );

        return;
      }

      // Cualquier otro mensaje
      // vuelve a mostrar bienvenida

      await message.reply(
        mensajeBienvenida()
      );

      return;
    }

    // ===========================
    // ESTADO PRECIOS
    // ===========================

    if (sesion.estado === "PRECIOS") {
      // 0 = Pago Móvil

      if (texto === "0") {
        await message.reply(
          mensajePagoMovil()
        );

        return;
      }

      /*
       * IMPORTANTE:
       *
       * El cliente NO selecciona 110,
       * 220, 341, etc. con números.
       *
       * Debe escribir directamente la
       * cantidad de diamantes que quiere.
       *
       * Ejemplo:
       * 110
       * 220
       * 341
       */

      const cantidad = texto.replace(
        /[^0-9]/g,
        ""
      );

      if (
        Object.prototype.hasOwnProperty.call(
          PRECIOS_FREE_FIRE,
          cantidad
        )
      ) {
        sesion.recarga = cantidad;
        sesion.precio =
          PRECIOS_FREE_FIRE[cantidad];

        sesion.estado =
          "ESPERANDO_REFERENCIA";

        await message.reply(
          `💳 *PAGO MÓVIL*

🏦 Banco de Venezuela
🔢 Código: 0102
🪪 Cédula: V-32824869
📱 Teléfono: 04228242411
💰 Monto: *${sesion.precio.toLocaleString(
            "es-VE"
          )} Bs*

Realiza el pago y envía la *referencia de pago*.`
        );

        return;
      }

      await message.reply(
        `⚠️ No reconocí esa opción.

Escribe *0* para ver los datos de Pago Móvil o escribe la cantidad de diamantes que deseas.

Ejemplo: *110*`
      );

      return;
    }

    // ===========================
    // ESPERANDO REFERENCIA
    // ===========================

    if (
      sesion.estado ===
      "ESPERANDO_REFERENCIA"
    ) {
      /*
       * Extraemos números del mensaje.
       *
       * Esto permite que el cliente escriba:
       *
       * "12345678"
       *
       * o:
       *
       * "Mi referencia es 12345678"
       */

      const numeros = texto.match(
        /\d{4,20}/g
      );

      if (!numeros || numeros.length === 0) {
        await message.reply(
          `⚠️ No pude identificar la referencia.

Por favor envía únicamente la *referencia de pago* o un mensaje que contenga la referencia.`
        );

        return;
      }

      sesion.referencia =
        numeros[numeros.length - 1];

      sesion.estado =
        "ESPERANDO_ID";

      await message.reply(
        `✅ Referencia recibida.

🎮 Ahora envía tu *ID de Free Fire*.`
      );

      return;
    }

    // ===========================
    // ESPERANDO ID
    // ===========================

    if (
      sesion.estado ===
      "ESPERANDO_ID"
    ) {
      const idJugador = texto.replace(
        /\s/g,
        ""
      );

      if (
        !/^\d{5,15}$/.test(
          idJugador
        )
      ) {
        await message.reply(
          `⚠️ El ID de Free Fire no parece válido.

Envía únicamente tu *ID numérico de Free Fire*.`
        );

        return;
      }

      sesion.idJugador =
        idJugador;

      // =========================
      // CREAR PEDIDO
      // =========================

      const pedido = {
        numeroPedido:
          generarNumeroPedido(),

        juego: "Free Fire",

        recarga:
          sesion.recarga,

        precio:
          sesion.precio,

        idJugador:
          sesion.idJugador,

        referencia:
          sesion.referencia,

        telefono:
          numero.replace("@c.us", ""),

        fecha:
          new Date().toLocaleString(
            "es-VE",
            {
              timeZone:
                "America/Caracas",
            }
          ),

        estado:
          "PENDIENTE DE RECARGA",

        origen: "WhatsApp",
      };

      pedidos.push(pedido);

      guardarPedidos();

      console.log(
        "================================"
      );

      console.log(
        "🧾 NUEVO PEDIDO"
      );

      console.log(pedido);

      console.log(
        "================================"
      );

      // =========================
      // AVISAR AL ADMIN
      // =========================

      await notificarAdministrador(
        pedido
      );

      // =========================
      // CONFIRMACIÓN AL CLIENTE
      // =========================

      await message.reply(
        `✅ *PEDIDO REGISTRADO*

🧾 Número de pedido:
*${pedido.numeroPedido}*

💎 Recarga:
*${pedido.recarga} diamantes*

🎮 ID:
*${pedido.idJugador}*

⏳ Tu pago será verificado y posteriormente se realizará la recarga.

Gracias por comprar en *RECARGASGAMES* ❤️`
      );

      // Reiniciar sesión
      reiniciarSesion(numero);

      return;
    }

  } catch (error) {
    console.error(
      "❌ Error procesando mensaje:",
      error
    );

    try {
      await message.reply(
        "⚠️ Ocurrió un error procesando tu solicitud. Por favor intenta nuevamente."
      );
    } catch (e) {
      console.error(
        "No se pudo enviar mensaje de error:",
        e
      );
    }
  }
});

// ===============================
// EXPRESS
// ===============================

app.use(cors());

app.use(
  express.json({
    limit: "2mb",
  })
);

// ===============================
// ESTADO DEL BOT
// ===============================

app.get("/api/estado", (req, res) => {
  res.json({
    ok: true,
    servicio: "RECARGASGAMES WhatsApp",
    whatsapp:
      whatsappClient.info
        ? "conectado"
        : "iniciando",
    pedidos: pedidos.length,
  });
});

// ===============================
// VER PEDIDOS
// ===============================

app.get("/api/pedidos", (req, res) => {
  res.json({
    ok: true,
    total: pedidos.length,
    pedidos,
  });
});

// ===============================
// BUSCAR PEDIDO
// ===============================

app.get(
  "/api/pedido/:numero",
  (req, res) => {
    const pedido =
      pedidos.find(
        (p) =>
          p.numeroPedido.toLowerCase() ===
          req.params.numero.toLowerCase()
      );

    if (!pedido) {
      return res.status(404).json({
        ok: false,
        mensaje: "Pedido no encontrado",
      });
    }

    res.json({
      ok: true,
      pedido,
    });
  }
);

// ===============================
// ENVIAR MENSAJE DESDE API
// ===============================

app.post(
  "/api/enviar-mensaje",
  async (req, res) => {
    try {
      const {
        telefono,
        mensaje,
      } = req.body;

      if (!telefono || !mensaje) {
        return res.status(400).json({
          ok: false,
          mensaje:
            "Faltan telefono o mensaje",
        });
      }

      let numero =
        telefono
          .toString()
          .replace(/\D/g, "");

      if (
        numero.startsWith("0")
      ) {
        numero =
          "58" +
          numero.substring(1);
      }

      if (
        !numero.endsWith("@c.us")
      ) {
        numero += "@c.us";
      }

      await whatsappClient.sendMessage(
        numero,
        mensaje
      );

      res.json({
        ok: true,
        mensaje:
          "Mensaje enviado",
      });

    } catch (error) {
      console.error(error);

      res.status(500).json({
        ok: false,
        error:
          error.message,
      });
    }
  }
);

// ===============================
// HEALTH CHECK
// ===============================

app.get("/", (req, res) => {
  res.send(
    "RECARGASGAMES WhatsApp Bot funcionando ✅"
  );
});

// ===============================
// INICIAR SERVIDOR
// ===============================

app.listen(PORT, () => {
  console.log(
    `🚀 Servidor iniciado en puerto ${PORT}`
  );

  console.log(
    `🌐 ${WEB_URL}`
  );
});

// ===============================
// INICIAR WHATSAPP
// ===============================

console.log(
  "🚀 Iniciando WhatsApp..."
);

whatsappClient.initialize();