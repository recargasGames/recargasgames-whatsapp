require("dotenv").config();

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const PORT = process.env.PORT || 3000;
const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP || "";
const WEB_API_KEY = process.env.WEB_API_KEY || "";
const WEB_URL =
  process.env.WEB_URL || "https://recargasgames.shop";

const PEDIDOS_FILE = path.join(__dirname, "pedidos.json");

let ultimoQR = null;
let whatsappListo = false;

const precios = {
  "110": 770,
  "220": 1540,
  "341": 2300,
  "572": 3850,
  "1166": 7150,
  "2398": 14100,
  "6160": 35900,
};

const estados = {
  pendientes: "pendientes",
  pagado: "pagado",
  procesando: "procesando",
  completado: "completado",
  cancelado: "cancelado",
};

function cargarPedidos() {
  try {
    if (!fs.existsSync(PEDIDOS_FILE)) {
      fs.writeFileSync(PEDIDOS_FILE, "[]");
      return [];
    }

    return JSON.parse(fs.readFileSync(PEDIDOS_FILE, "utf8"));
  } catch (error) {
    console.error("Error leyendo pedidos:", error.message);
    return [];
  }
}

function guardarPedidos(pedidos) {
  fs.writeFileSync(
    PEDIDOS_FILE,
    JSON.stringify(pedidos, null, 2),
    "utf8"
  );
}

function crearNumeroPedido() {
  const fecha = new Date();
  const parteFecha =
    fecha.getFullYear().toString() +
    String(fecha.getMonth() + 1).padStart(2, "0") +
    String(fecha.getDate()).padStart(2, "0");

  const parteAleatoria = Math.floor(1000 + Math.random() * 9000);

  return `RG-${parteFecha}-${parteAleatoria}`;
}

function limpiarNumeroWhatsApp(numero) {
  return numero.replace(/\D/g, "");
}

function formatoWhatsApp(numero) {
  const limpio = limpiarNumeroWhatsApp(numero);

  if (limpio.startsWith("58")) {
    return `${limpio}@c.us`;
  }

  if (limpio.startsWith("0")) {
    return `58${limpio.substring(1)}@c.us`;
  }

  return `${limpio}@c.us`;
}

function esApiAutorizada(req) {
  if (!WEB_API_KEY) {
    return true;
  }

  return req.headers["x-api-key"] === WEB_API_KEY;
}

function responderNoAutorizado(res) {
  return res.status(401).json({
    ok: false,
    error: "API key inválida o ausente",
  });
}

async function enviarWhatsApp(numero, mensaje) {
  try {
    if (!whatsappListo) {
      console.log("WhatsApp todavía no está conectado.");
      return false;
    }

    await client.sendMessage(formatoWhatsApp(numero), mensaje);
    return true;
  } catch (error) {
    console.error("Error enviando WhatsApp:", error.message);
    return false;
  }
}

async function notificarAdministrador(mensaje) {
  if (!ADMIN_WHATSAPP) {
    console.log("ADMIN_WHATSAPP no está configurado.");
    return;
  }

  await enviarWhatsApp(ADMIN_WHATSAPP, mensaje);
}

/*
|--------------------------------------------------------------------------
| RUTAS WEB
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RECARGASGAMES - Bot WhatsApp</title>
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

        .card {
          width: 90%;
          max-width: 500px;
          padding: 30px;
          border-radius: 20px;
          background: #151515;
          box-shadow: 0 0 30px rgba(255, 190, 0, .15);
        }

        h1 {
          color: #ffc400;
        }

        a {
          display: inline-block;
          margin-top: 20px;
          padding: 14px 22px;
          border-radius: 10px;
          background: #ffc400;
          color: #000;
          text-decoration: none;
          font-weight: bold;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>RECARGASGAMES</h1>
        <p>Servidor del bot de WhatsApp funcionando.</p>
        <a href="/qr">Abrir código QR</a>
      </div>
    </body>
    </html>
  `);
});

app.get("/qr", (req, res) => {
  if (!ultimoQR) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="5">
        <title>QR WhatsApp - RECARGASGAMES</title>
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

          .card {
            width: 90%;
            max-width: 450px;
            padding: 30px;
            border-radius: 20px;
            background: #151515;
          }

          h2 {
            color: #ffc400;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Esperando código QR...</h2>
          <p>El bot está generando el código.</p>
          <p>Esta página se actualizará automáticamente.</p>
        </div>
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
      <title>Vincular WhatsApp</title>
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

        .card {
          width: 90%;
          max-width: 450px;
          padding: 25px;
          border-radius: 20px;
          background: #151515;
        }

        h2 {
          color: #ffc400;
        }

        img {
          display: block;
          width: 100%;
          max-width: 350px;
          margin: 20px auto;
          background: white;
          border-radius: 12px;
        }

        p {
          line-height: 1.5;
        }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Vincular WhatsApp</h2>
        <p>Escanea este código desde tu teléfono.</p>

        <img src="${ultimoQR}" alt="Código QR de WhatsApp">

        <p>
          WhatsApp → Ajustes → Dispositivos vinculados →
          Vincular un dispositivo
        </p>

        <small>El código se actualiza automáticamente.</small>
      </div>
    </body>
    </html>
  `);
});

app.get("/api/estado", (req, res) => {
  res.json({
    ok: true,
    whatsappListo,
    qrDisponible: Boolean(ultimoQR),
    servidor: "activo",
    web: WEB_URL,
  });
});

app.get("/api/pedidos", (req, res) => {
  if (!esApiAutorizada(req)) {
    return responderNoAutorizado(res);
  }

  res.json({
    ok: true,
    pedidos: cargarPedidos(),
  });
});

app.get("/api/pedido/:numero", (req, res) => {
  const pedidos = cargarPedidos();

  const pedido = pedidos.find(
    (item) => item.numero === req.params.numero
  );

  if (!pedido) {
    return res.status(404).json({
      ok: false,
      error: "Pedido no encontrado",
    });
  }

  res.json({
    ok: true,
    pedido,
  });
});

app.post("/api/pedido-web", async (req, res) => {
  if (!esApiAutorizada(req)) {
    return responderNoAutorizado(res);
  }

  try {
    const {
      cliente,
      telefono,
      producto,
      monto,
      referencia,
      idJugador,
      origen = "web",
    } = req.body;

    if (
      !telefono ||
      !producto ||
      !monto ||
      !referencia ||
      !idJugador
    ) {
      return res.status(400).json({
        ok: false,
        error:
          "Faltan datos: teléfono, producto, monto, referencia o ID de jugador",
      });
    }

    const pedido = {
      numero: crearNumeroPedido(),
      cliente: cliente || "Cliente web",
      telefono,
      producto,
      monto,
      referencia,
      idJugador,
      origen,
      estado: estados.pendientes,
      fecha: new Date().toISOString(),
    };

    const pedidos = cargarPedidos();
    pedidos.push(pedido);
    guardarPedidos(pedidos);

    await notificarAdministrador(`
🟡 NUEVO PEDIDO WEB

📦 Pedido: ${pedido.numero}
👤 Cliente: ${pedido.cliente}
📱 Teléfono: ${pedido.telefono}
🎮 Producto: ${pedido.producto}
💰 Monto: ${pedido.monto} Bs
🧾 Referencia: ${pedido.referencia}
🆔 ID Free Fire: ${pedido.idJugador}

Estado: PENDIENTE
`);

    return res.json({
      ok: true,
      mensaje: "Pedido creado correctamente",
      pedido,
    });
  } catch (error) {
    console.error("Error creando pedido web:", error.message);

    return res.status(500).json({
      ok: false,
      error: "No se pudo crear el pedido",
    });
  }
});

app.post("/api/alerta-web", async (req, res) => {
  if (!esApiAutorizada(req)) {
    return responderNoAutorizado(res);
  }

  const { mensaje } = req.body;

  if (!mensaje) {
    return res.status(400).json({
      ok: false,
      error: "Falta el mensaje",
    });
  }

  await notificarAdministrador(`🔔 ALERTA WEB\n\n${mensaje}`);

  res.json({
    ok: true,
    mensaje: "Alerta enviada",
  });
});

/*
|--------------------------------------------------------------------------
| BOT DE WHATSAPP
|--------------------------------------------------------------------------
*/

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
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
    ],
  },
});

client.on("qr", async (qr) => {
  try {
    ultimoQR = await QRCode.toDataURL(qr);

    console.log("QR generado.");
    console.log("Abre la ruta /qr para escanearlo.");

    qrcodeTerminal.generate(qr, {
      small: true,
    });
  } catch (error) {
    console.error("Error generando QR:", error.message);
  }
});

client.on("ready", () => {
  whatsappListo = true;
  ultimoQR = null;

  console.log("WhatsApp conectado correctamente.");
});

client.on("authenticated", () => {
  console.log("WhatsApp autenticado.");
});

client.on("auth_failure", (mensaje) => {
  whatsappListo = false;
  console.error("Error de autenticación:", mensaje);
});

client.on("disconnected", (motivo) => {
  whatsappListo = false;
  console.log("WhatsApp desconectado:", motivo);
});

client.on("message", async (message) => {
  try {
    if (message.fromMe) return;

    const texto = message.body.trim();
    const textoMinuscula = texto.toLowerCase();
    const telefono = message.from.replace("@c.us", "");

    if (
      textoMinuscula === "hola" ||
      textoMinuscula === "buenas" ||
      textoMinuscula === "buenos dias" ||
      textoMinuscula === "buenas tardes" ||
      textoMinuscula === "buenas noches"
    ) {
      await message.reply(`
🎮 ¡Hola! Bienvenido a RECARGASGAMES.

Realizamos recargas de Free Fire y otros productos digitales.

Escribe:

1️⃣ Ver precios
0️⃣ Ver datos de Pago Móvil
`);
      return;
    }

    if (texto === "1") {
      await message.reply(`
🔥 PRECIOS FREE FIRE 🔥

💎 110 diamantes: 770 Bs
💎 220 diamantes: 1.540 Bs
💎 341 diamantes: 2.300 Bs
💎 572 diamantes: 3.850 Bs
💎 1166 diamantes: 7.150 Bs
💎 2398 diamantes: 14.100 Bs
💎 6160 diamantes: 35.900 Bs

Escribe directamente la cantidad que deseas comprar.

Ejemplo: 110
`);
      return;
    }

    if (texto === "0") {
      await message.reply(`
💳 DATOS DE PAGO MÓVIL

Banco: Banco de Venezuela
Código: 0102
Cédula: V-32824869
Teléfono: 04228242411

Después de pagar, envía:

1. Número de referencia
2. ID de jugador de Free Fire
3. Cantidad de diamantes
`);
      return;
    }

    if (precios[texto]) {
      await message.reply(`
💎 Seleccionaste ${texto} diamantes.

💰 Total: ${precios[texto].toLocaleString("es-VE")} Bs

Realiza el Pago Móvil con estos datos:

Banco: Banco de Venezuela
Código: 0102
Cédula: V-32824869
Teléfono: 04228242411

Después envía el número de referencia del pago.
`);
      return;
    }

    if (/^\d{6,20}$/.test(texto)) {
      await message.reply(`
🧾 Referencia recibida.

Ahora envía tu ID de jugador de Free Fire.

Puedes encontrarlo dentro del juego, en tu perfil.
`);

      await notificarAdministrador(`
🧾 POSIBLE REFERENCIA DE PAGO

📱 Cliente: ${telefono}
🧾 Referencia: ${texto}

El cliente debe enviar ahora su ID de jugador.
`);

      return;
    }

    if (/^\d{7,15}$/.test(texto)) {
      const pedido = {
        numero: crearNumeroPedido(),
        cliente: "Cliente WhatsApp",
        telefono,
        producto: "Free Fire",
        monto: "Por confirmar",
        referencia: "Por confirmar",
        idJugador: texto,
        origen: "whatsapp",
        estado: estados.pendientes,
        fecha: new Date().toISOString(),
      };

      const pedidos = cargarPedidos();
      pedidos.push(pedido);
      guardarPedidos(pedidos);

      await message.reply(`
✅ Datos recibidos.

📦 Número de pedido: ${pedido.numero}

Tu pedido quedó registrado y será revisado por nuestro equipo.

Estado: PENDIENTE
`);

      await notificarAdministrador(`
🟡 NUEVO PEDIDO POR WHATSAPP

📦 Pedido: ${pedido.numero}
📱 Cliente: ${telefono}
🆔 ID Free Fire: ${pedido.idJugador}

El pedido requiere revisión del pago.
`);

      return;
    }

    if (
      textoMinuscula.includes("precio") ||
      textoMinuscula.includes("precios") ||
      textoMinuscula.includes("diamantes")
    ) {
      await message.reply(`
🔥 PRECIOS FREE FIRE 🔥

110 diamantes: 770 Bs
220 diamantes: 1.540 Bs
341 diamantes: 2.300 Bs
572 diamantes: 3.850 Bs
1166 diamantes: 7.150 Bs
2398 diamantes: 14.100 Bs
6160 diamantes: 35.900 Bs

Escribe la cantidad que deseas.
`);
      return;
    }

    await message.reply(`
No entendí tu mensaje.

Escribe:

1️⃣ Para ver los precios
0️⃣ Para ver los datos de Pago Móvil
`);
  } catch (error) {
    console.error("Error procesando mensaje:", error.message);
  }
});

/*
|--------------------------------------------------------------------------
| INICIO
|--------------------------------------------------------------------------
*/

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor ejecutándose en el puerto ${PORT}`);
  console.log(`Ruta QR: /qr`);
});

client.initialize().catch((error) => {
  console.error("Error iniciando WhatsApp:", error);
});
