require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const qrcodeTerminal = require("qrcode-terminal");
const QRCode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 3000;
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || "584228242411";
const WEB_API_KEY = process.env.WEB_API_KEY || "";
const WEB_URL = process.env.WEB_URL || "https://recargasgames.shop";

const ARCHIVO_PEDIDOS = path.join(__dirname, "pedidos.json");

const precios = {
  "110": 770,
  "220": 1540,
  "341": 2300,
  "572": 3850,
  "1166": 7150,
  "2398": 14100,
  "6160": 35900
};

const sesiones = new Map();

let ultimoQR = null;
let whatsappListo = false;

function cargarPedidos() {
  try {
    if (!fs.existsSync(ARCHIVO_PEDIDOS)) {
      fs.writeFileSync(ARCHIVO_PEDIDOS, "[]", "utf8");
    }

    const contenido = fs.readFileSync(ARCHIVO_PEDIDOS, "utf8");
    return JSON.parse(contenido || "[]");
  } catch (error) {
    console.error("Error cargando pedidos:", error);
    return [];
  }
}

function guardarPedidos(pedidos) {
  fs.writeFileSync(
    ARCHIVO_PEDIDOS,
    JSON.stringify(pedidos, null, 2),
    "utf8"
  );
}

function crearNumeroPedido() {
  const ahora = new Date();

  const fecha = ahora
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);

  const aleatorio = Math.floor(1000 + Math.random() * 9000);

  return `RG-${fecha}-${aleatorio}`;
}

function normalizarWhatsApp(numero) {
  if (!numero) return "";

  let limpio = String(numero)
    .trim()
    .replace("@c.us", "")
    .replace(/\s+/g, "")
    .replace(/-/g, "")
    .replace(/\(/g, "")
    .replace(/\)/g, "");

  if (limpio.startsWith("+")) {
    limpio = limpio.substring(1);
  }

  if (limpio.startsWith("00")) {
    limpio = limpio.substring(2);
  }

  if (limpio.startsWith("0")) {
    limpio = `58${limpio.substring(1)}`;
  }

  return limpio;
}

function numeroWhatsApp(numero) {
  return `${normalizarWhatsApp(numero)}@c.us`;
}

function esAdmin(numero) {
  return normalizarWhatsApp(numero) === normalizarWhatsApp(ADMIN_WHATSAPP);
}

function verificarApiKey(req, res, next) {
  if (!WEB_API_KEY) {
    return res.status(500).json({
      ok: false,
      error: "WEB_API_KEY no configurada en Railway"
    });
  }

  const recibida = req.headers["x-api-key"];

  if (!recibida || recibida !== WEB_API_KEY) {
    return res.status(401).json({
      ok: false,
      error: "API key inválida"
    });
  }

  next();
}

function formatoBs(cantidad) {
  return `${Number(cantidad).toLocaleString("es-VE")} Bs`;
}

function listaPrecios() {
  return [
    "🎮 *PRECIOS FREE FIRE*",
    "",
    `💎 110 diamantes: ${formatoBs(precios["110"])}`,
    `💎 220 diamantes: ${formatoBs(precios["220"])}`,
    `💎 341 diamantes: ${formatoBs(precios["341"])}`,
    `💎 572 diamantes: ${formatoBs(precios["572"])}`,
    `💎 1166 diamantes: ${formatoBs(precios["1166"])}`,
    `💎 2398 diamantes: ${formatoBs(precios["2398"])}`,
    `💎 6160 diamantes: ${formatoBs(precios["6160"])}`,
    "",
    `🌐 ${WEB_URL}`,
    "",
    "Escribe la cantidad de diamantes que deseas.",
    "Ejemplo: 110",
    "",
    "Escribe *0* para ver los datos de Pago Móvil."
  ].join("\n");
}

function datosPago() {
  return [
    "💳 *DATOS DE PAGO MÓVIL*",
    "",
    "🏦 Banco: Banco de Venezuela",
    "🔢 Código: 0102",
    "🪪 Cédula: V-32824869",
    "📱 Teléfono: 04228242411",
    "",
    "Realiza el pago y envía el número de referencia.",
    "Después te solicitaremos tu ID de Free Fire."
  ].join("\n");
}

function bienvenida() {
  return [
    "🎮 *Bienvenido a RECARGASGAMES*",
    "",
    "🕐 Horario de atención:",
    "7:00 AM a 11:00 PM",
    "",
    "¿Quieres consultar los precios de Free Fire?",
    "",
    "👉 Escribe *1*"
  ].join("\n");
}

function mensajePedidoCreado(pedido) {
  return [
    "✅ *PEDIDO RECIBIDO*",
    "",
    `🧾 Pedido: ${pedido.numero}`,
    `💎 Producto: ${pedido.producto} diamantes`,
    `💰 Total: ${formatoBs(pedido.precio)}`,
    `🎮 ID Free Fire: ${pedido.idFreeFire}`,
    `🔢 Referencia: ${pedido.referencia}`,
    "",
    "⏳ Tu pedido quedó pendiente de verificación.",
    "Te avisaremos por este medio cuando sea procesado.",
    "",
    "Gracias por comprar en RECARGASGAMES."
  ].join("\n");
}

async function enviarMensaje(numero, texto) {
  try {
    if (!whatsappListo) {
      console.log("WhatsApp todavía no está listo.");
      return false;
    }

    await client.sendMessage(numeroWhatsApp(numero), texto);
    return true;
  } catch (error) {
    console.error("Error enviando mensaje:", error);
    return false;
  }
}

async function notificarAdministrador(pedido) {
  const mensaje = [
    "📥 *NUEVO PEDIDO RECARGASGAMES*",
    "",
    `🧾 Pedido: ${pedido.numero}`,
    `👤 Cliente: ${pedido.cliente}`,
    `📱 WhatsApp: ${pedido.whatsapp}`,
    `💎 Producto: ${pedido.producto} diamantes`,
    `💰 Precio: ${formatoBs(pedido.precio)}`,
    `🔢 Referencia: ${pedido.referencia}`,
    `🎮 ID Free Fire: ${pedido.idFreeFire}`,
    "",
    "Estado: PENDIENTE"
  ].join("\n");

  await enviarMensaje(ADMIN_WHATSAPP, mensaje);
}

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

client.on("qr", async (qr) => {
  console.log("Nuevo código QR generado.");

  qrcodeTerminal.generate(qr, {
    small: true
  });

  try {
    ultimoQR = await QRCode.toDataURL(qr);
    console.log("QR disponible en la ruta /qr");
  } catch (error) {
    console.error("No se pudo convertir el QR en imagen:", error);
  }
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado correctamente.");
});

client.on("auth_failure", (mensaje) => {
  console.error("Falló la autenticación de WhatsApp:", mensaje);
});

client.on("ready", () => {
  whatsappListo = true;
  ultimoQR = null;
  console.log("✅ WhatsApp conectado y listo.");
});

client.on("disconnected", (razon) => {
  whatsappListo = false;
  console.log("WhatsApp desconectado:", razon);
});

client.on("loading_screen", (porcentaje, mensaje) => {
  console.log(`WhatsApp cargando: ${porcentaje}% - ${mensaje}`);
});

client.on("change_state", (estado) => {
  console.log("Estado de WhatsApp:", estado);
});

client.on("message", async (mensaje) => {
  try {
    if (!mensaje.from || mensaje.from.endsWith("@g.us")) {
      return;
    }

    const numero = mensaje.from.replace("@c.us", "");
    const texto = String(mensaje.body || "")
      .trim()
      .toLowerCase();

    if (!texto) return;

    if (esAdmin(numero)) {
      if (texto === "estado bot") {
        await mensaje.reply(
          whatsappListo
            ? "✅ El bot está conectado."
            : "⚠️ El bot todavía no está conectado."
        );
        return;
      }
    }

    let sesion = sesiones.get(numero);

    if (!sesion) {
      sesiones.set(numero, {
        estado: "menu",
        producto: null,
        precio: null,
        referencia: null
      });

      await mensaje.reply(bienvenida());
      return;
    }

    if (texto === "cancelar" || texto === "reiniciar" || texto === "menu") {
      sesiones.set(numero, {
        estado: "menu",
        producto: null,
        precio: null,
        referencia: null
      });

      await mensaje.reply(bienvenida());
      return;
    }

    if (sesion.estado === "menu") {
      if (texto === "1") {
        sesion.estado = "producto";
        sesiones.set(numero, sesion);
        await mensaje.reply(listaPrecios());
        return;
      }

      await mensaje.reply(
        "Escribe *1* para consultar los precios de Free Fire."
      );
      return;
    }

    if (sesion.estado === "producto") {
      if (texto === "0") {
        await mensaje.reply(datosPago());
        return;
      }

      if (!precios[texto]) {
        await mensaje.reply(
          "Cantidad no válida. Escribe una de estas cantidades: 110, 220, 341, 572, 1166, 2398 o 6160."
        );
        return;
      }

      sesion.producto = texto;
      sesion.precio = precios[texto];
      sesion.estado = "referencia";

      sesiones.set(numero, sesion);

      await mensaje.reply(
        [
          `💎 Seleccionaste ${texto} diamantes.`,
          `💰 Total: ${formatoBs(precios[texto])}`,
          "",
          datosPago(),
          "",
          "Cuando realices el pago, envía el número de referencia."
        ].join("\n")
      );

      return;
    }

    if (sesion.estado === "referencia") {
      if (texto === "0") {
        await mensaje.reply(datosPago());
        return;
      }

      if (texto.length < 4) {
        await mensaje.reply(
          "La referencia parece incompleta. Envíame el número de referencia del pago."
        );
        return;
      }

      sesion.referencia = mensaje.body.trim();
      sesion.estado = "id";
      sesiones.set(numero, sesion);

      await mensaje.reply(
        "🎮 Ahora envíame tu ID de jugador de Free Fire."
      );

      return;
    }

    if (sesion.estado === "id") {
      const idFreeFire = mensaje.body.trim();

      if (!/^\d{5,20}$/.test(idFreeFire)) {
        await mensaje.reply(
          "El ID de Free Fire debe contener solamente números. Inténtalo nuevamente."
        );
        return;
      }

      const pedidos = cargarPedidos();

      const pedido = {
        numero: crearNumeroPedido(),
        fecha: new Date().toISOString(),
        cliente: mensaje.pushname || "Cliente",
        whatsapp: numero,
        producto: sesion.producto,
        precio: sesion.precio,
        referencia: sesion.referencia,
        idFreeFire,
        estado: "pendiente",
        origen: "whatsapp"
      };

      pedidos.push(pedido);
      guardarPedidos(pedidos);

      await mensaje.reply(mensajePedidoCreado(pedido));
      await notificarAdministrador(pedido);

      sesiones.delete(numero);
      return;
    }
  } catch (error) {
    console.error("Error procesando mensaje:", error);

    try {
      await mensaje.reply(
        "⚠️ Ocurrió un error procesando tu solicitud. Escribe *menu* para comenzar nuevamente."
      );
    } catch (errorRespuesta) {
      console.error("No se pudo enviar el mensaje de error:", errorRespuesta);
    }
  }
});

app.get("/", (req, res) => {
  res.json({
    ok: true,
    servicio: "RECARGASGAMES WhatsApp Bot",
    whatsapp: whatsappListo ? "conectado" : "iniciando",
    qr: "/qr",
    hora: new Date().toISOString()
  });
});

app.get("/qr", (req, res) => {
  if (whatsappListo) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>WhatsApp conectado</title>
      </head>
      <body style="font-family:Arial;text-align:center;padding:40px;">
        <h1>✅ WhatsApp conectado</h1>
        <p>El bot de RECARGASGAMES ya está vinculado.</p>
      </body>
      </html>
    `);
  }

  if (!ultimoQR) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="5">
        <title>Esperando QR</title>
      </head>
      <body style="font-family:Arial;text-align:center;padding:40px;">
        <h1>⏳ Generando código QR</h1>
        <p>Espera unos segundos. Esta página se actualizará automáticamente.</p>
      </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta http-equiv="refresh" content="20">
      <title>QR WhatsApp - RECARGASGAMES</title>
      <style>
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 20px;
          background: #101010;
          color: white;
          font-family: Arial, sans-serif;
          text-align: center;
        }

        .card {
          width: 100%;
          max-width: 480px;
          padding: 25px;
          border-radius: 20px;
          background: #1b1b1b;
          box-shadow: 0 0 30px rgba(0, 0, 0, .4);
        }

        h1 {
          font-size: 24px;
          margin-top: 0;
        }

        img {
          display: block;
          width: 100%;
          max-width: 420px;
          height: auto;
          margin: 20px auto;
          padding: 14px;
          background: white;
          border-radius: 14px;
        }

        p {
          color: #cccccc;
          line-height: 1.5;
        }

        .warning {
          color: #ffcc66;
          font-size: 13px;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>🎮 RECARGASGAMES</h1>
        <p>Escanea este código QR con WhatsApp.</p>

        <img src="${ultimoQR}" alt="Código QR de WhatsApp">

        <p>
          WhatsApp → Ajustes → Dispositivos vinculados →
          Vincular un dispositivo
        </p>

        <p class="warning">
          No compartas esta página mientras el QR esté activo.
        </p>
      </div>
    </body>
    </html>
  `);
});

app.get("/api/estado", (req, res) => {
  res.json({
    ok: true,
    whatsapp: whatsappListo ? "conectado" : "desconectado",
    qrDisponible: Boolean(ultimoQR),
    hora: new Date().toISOString()
  });
});

app.get("/api/pedidos", verificarApiKey, (req, res) => {
  const pedidos = cargarPedidos();

  res.json({
    ok: true,
    total: pedidos.length,
    pedidos
  });
});

app.get("/api/pedido/:numero", verificarApiKey, (req, res) => {
  const pedidos = cargarPedidos();

  const pedido = pedidos.find(
    (item) => item.numero === req.params.numero
  );

  if (!pedido) {
    return res.status(404).json({
      ok: false,
      error: "Pedido no encontrado"
    });
  }

  res.json({
    ok: true,
    pedido
  });
});

app.post("/api/pedido-web", verificarApiKey, async (req, res) => {
  try {
    const {
      whatsapp,
      numeroPedido,
      producto,
      precio,
      idFreeFire,
      pin,
      codigos,
      estadoPago
    } = req.body;

    if (!whatsapp || !numeroPedido || !producto) {
      return res.status(400).json({
        ok: false,
        error: "Faltan datos del pedido web"
      });
    }

    const cliente = normalizarWhatsApp(whatsapp);

    const mensaje = [
      "🎮 *RECARGASGAMES - PEDIDO WEB*",
      "",
      `🧾 Pedido: ${numeroPedido}`,
      `💎 Producto: ${producto}`,
      precio ? `💰 Precio: ${precio}` : "",
      idFreeFire ? `🎮 ID Free Fire: ${idFreeFire}` : "",
      "",
      estadoPago ? `💳 Estado del pago: ${estadoPago}` : "",
      pin ? `🔐 PIN: ${pin}` : "",
      codigos ? `🎟️ Códigos: ${codigos}` : "",
      "",
      "Gracias por comprar en RECARGASGAMES."
    ]
      .filter(Boolean)
      .join("\n");

    const enviado = await enviarMensaje(cliente, mensaje);

    res.json({
      ok: enviado,
      enviado,
      numeroPedido
    });
  } catch (error) {
    console.error("Error en pedido web:", error);

    res.status(500).json({
      ok: false,
      error: "No se pudo enviar el pedido web"
    });
  }
});

app.post("/api/alerta-web", verificarApiKey, async (req, res) => {
  try {
    const {
      numeroPedido,
      whatsapp,
      producto,
      monto,
      referencia,
      motivo
    } = req.body;

    const mensaje = [
      "⚠️ *ALERTA DE PAGO WEB*",
      "",
      `🧾 Pedido: ${numeroPedido || "No indicado"}`,
      `📱 Cliente: ${whatsapp || "No indicado"}`,
      `💎 Producto: ${producto || "No indicado"}`,
      `💰 Monto: ${monto || "No indicado"}`,
      `🔢 Referencia: ${referencia || "No indicada"}`,
      `📌 Motivo: ${motivo || "Pago no confirmado"}`,
      "",
      "Revisar manualmente."
    ].join("\n");

    const enviado = await enviarMensaje(ADMIN_WHATSAPP, mensaje);

    res.json({
      ok: enviado,
      enviado
    });
  } catch (error) {
    console.error("Error enviando alerta web:", error);

    res.status(500).json({
      ok: false,
      error: "No se pudo enviar la alerta"
    });
  }
});

app.use((error, req, res, next) => {
  console.error("Error general:", error);

  res.status(500).json({
    ok: false,
    error: "Error interno del servidor"
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
});

process.on("uncaughtException", (error) => {
  console.error("Excepción no controlada:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Promesa rechazada:", error);
});

client.initialize().catch((error) => {
  console.error("No se pudo iniciar WhatsApp:", error);
});
