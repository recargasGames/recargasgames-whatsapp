const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const {
  Client,
  LocalAuth,
  List,
  Buttons,
} = require("whatsapp-web.js");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// =====================================
// CONFIGURACIÓN
// =====================================

const NOMBRE_BOT = "RECARGAS GAMES";
const NUMERO_ADMIN = "584228242411@c.us";

const datosPago = {
  banco: "Banco de Venezuela",
  codigo: "0102",
  telefono: "0422-8242411",
  cedula: "32824869",
};

// =====================================
// PRECIOS FREE FIRE
// =====================================

const precios = {
  "110": 770,
  "220": 1540,
  "341": 2300,
  "572": 3850,
  "1166": 7150,
  "2398": 14100,
  "6160": 35900,
};

// =====================================
// HOTPACKS MÓVILES
// =====================================
// Sustituye estos ejemplos por tus hotpacks reales.

const hotpacks = {
  movistar: [
    {
      id: "movistar_1",
      title: "Hotpack Movistar 1",
      description: "Consultar precio",
    },
  ],

  digitel: [
    {
      id: "digitel_1",
      title: "Hotpack Digitel 1",
      description: "Consultar precio",
    },
  ],

  movilnet: [
    {
      id: "movilnet_1",
      title: "Hotpack Movilnet 1",
      description: "Consultar precio",
    },
  ],
};

// =====================================
// ESTADOS
// =====================================

let qrActual = null;
let whatsappListo = false;

const usuarios = new Map();
const mensajesProcesados = new Set();

// =====================================
// CLIENTE DE WHATSAPP
// =====================================

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

// =====================================
// VERSIÓN INSTALADA
// =====================================

try {
  const packageInfo = require("whatsapp-web.js/package.json");
  console.log("Versión whatsapp-web.js:", packageInfo.version);
} catch (error) {
  console.log("No se pudo comprobar la versión instalada.");
}

// =====================================
// EVENTOS WHATSAPP
// =====================================

client.on("qr", (qr) => {
  qrActual = qr;
  whatsappListo = false;

  console.log("Nuevo código QR generado.");

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

client.on("auth_failure", (error) => {
  whatsappListo = false;
  console.error("Error de autenticación:", error);
});

client.on("disconnected", (motivo) => {
  whatsappListo = false;
  console.log("WhatsApp desconectado:", motivo);
});

// =====================================
// FUNCIONES GENERALES
// =====================================

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

async function enviarMensaje(numero, texto) {
  try {
    await client.sendMessage(numero, texto);
  } catch (error) {
    console.error("Error enviando mensaje:", error.message);
  }
}

async function enviarLista(numero, texto, filas) {
  try {
    const lista = new List(
      texto,
      "Abrir RECARGAS",
      [
        {
          title: "Opciones disponibles",
          rows: filas,
        },
      ],
      NOMBRE_BOT,
      "Selecciona una opción"
    );

    await client.sendMessage(numero, lista);
  } catch (error) {
    console.error("Error enviando lista:", error.message);

    const respaldo = filas
      .map((fila, indice) => `${indice + 1}️⃣ ${fila.title}`)
      .join("\n");

    await enviarMensaje(numero, `${texto}\n\n${respaldo}`);
  }
}

async function enviarBotones(numero, texto, botones) {
  try {
    const mensaje = new Buttons(
      texto,
      botones,
      NOMBRE_BOT,
      "Selecciona una opción"
    );

    await client.sendMessage(numero, mensaje);
  } catch (error) {
    console.error("Error enviando botones:", error.message);

    const respaldo = botones
      .map((boton, indice) => `${indice + 1}️⃣ ${boton}`)
      .join("\n");

    await enviarMensaje(numero, `${texto}\n\n${respaldo}`);
  }
}

// =====================================
// MENÚ PRINCIPAL
// =====================================

async function mostrarMenuPrincipal(numero) {
  await enviarLista(
    numero,
    `
🎮 *RECARGAS GAMES*

Bienvenido a nuestra tienda de recargas y productos digitales.

¿Qué deseas consultar?
`,
    [
      {
        id: "freefire",
        title: "💎 Precios de Free Fire",
        description: "Consulta diamantes y pases",
      },
      {
        id: "hotpacks",
        title: "📱 Hotpacks móviles",
        description: "Consulta paquetes móviles",
      },
      {
        id: "soporte",
        title: "👨‍💻 Hablar con soporte",
        description: "Contacta con un agente",
      },
    ]
  );
}

// =====================================
// MENÚ FREE FIRE
// =====================================

async function mostrarMenuFreeFire(numero) {
  await enviarLista(
    numero,
    `
💎 *PRECIOS FREE FIRE*

Selecciona la cantidad que deseas consultar.
`,
    Object.keys(precios).map((cantidad) => ({
      id: `ff_${cantidad}`,
      title: `💎 ${cantidad} → ${precios[cantidad]} Bs`,
      description: "Consultar esta recarga",
    }))
  );
}

// =====================================
// MENÚ HOTPACKS
// =====================================

async function mostrarMenuHotpacks(numero) {
  await enviarLista(
    numero,
    `
📱 *HOTPACKS MÓVILES*

Selecciona tu operadora.
`,
    [
      {
        id: "movistar",
        title: "📱 Movistar",
        description: "Consultar hotpacks Movistar",
      },
      {
        id: "digitel",
        title: "📱 Digitel",
        description: "Consultar hotpacks Digitel",
      },
      {
        id: "movilnet",
        title: "📱 Movilnet",
        description: "Consultar hotpacks Movilnet",
      },
    ]
  );
}

async function mostrarHotpacksOperadora(numero, operadora) {
  const lista = hotpacks[operadora] || [];

  if (lista.length === 0) {
    await enviarMensaje(
      numero,
      `📱 No hay hotpacks disponibles para ${operadora.toUpperCase()}.`
    );
    return;
  }

  await enviarLista(
    numero,
    `
📱 *HOTPACKS ${operadora.toUpperCase()}*

Selecciona un paquete.
`,
    lista
  );
}

// =====================================
// DATOS DE PAGO
// =====================================

function mensajePago(producto) {
  return `
💎 *RECARGA SELECCIONADA*

Cantidad: ${producto}
Total: ${precios[producto]} Bs

🏦 *Datos para el pago móvil*

Banco: ${datosPago.banco}
Código: ${datosPago.codigo}
Teléfono: ${datosPago.telefono}
Cédula: ${datosPago.cedula}

Realiza el pago y envía los últimos 4 dígitos de la referencia bancaria.
`;
}

function referenciaValida(texto) {
  return /^\d{4}$/.test(texto);
}

function idJugadorValido(texto) {
  return /^\d{7,20}$/.test(texto);
}

// =====================================
// PROCESAR OPCIONES
// =====================================

async function procesarOpcion(numero, opcion, usuario) {
  if (opcion === "freefire") {
    usuario.estado = "seleccion_producto";
    await mostrarMenuFreeFire(numero);
    return;
  }

  if (opcion === "hotpacks") {
    await mostrarMenuHotpacks(numero);
    return;
  }

  if (opcion === "soporte") {
    await enviarMensaje(
      numero,
      "👨‍💻 Un agente de RECARGAS GAMES te atenderá pronto."
    );
    return;
  }

  if (
    opcion === "movistar" ||
    opcion === "digitel" ||
    opcion === "movilnet"
  ) {
    await mostrarHotpacksOperadora(numero, opcion);
    return;
  }

  if (opcion.startsWith("ff_")) {
    const producto = opcion.replace("ff_", "");

    if (!precios[producto]) {
      await enviarMensaje(numero, "❌ Producto no disponible.");
      return;
    }

    usuario.producto = producto;
    usuario.estado = "esperando_referencia";

    await enviarMensaje(numero, mensajePago(producto));
    return;
  }

  if (
    opcion.startsWith("movistar_") ||
    opcion.startsWith("digitel_") ||
    opcion.startsWith("movilnet_")
  ) {
    await enviarMensaje(
      numero,
      `📱 Has seleccionado: ${opcion}\n\nUn agente te enviará el precio y los detalles del paquete.`
    );
  }
}

// =====================================
// MENSAJES RECIBIDOS
// =====================================

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

    if (
      textoNormalizado === "hola" ||
      textoNormalizado === "inicio" ||
      textoNormalizado === "menu" ||
      textoNormalizado === "menú"
    ) {
      usuario.estado = "inicio";
      usuario.producto = null;
      usuario.referencia = null;
      usuario.idJugador = null;

      await mostrarMenuPrincipal(numero);
      return;
    }

    if (message.selectedRowId) {
      await procesarOpcion(numero, message.selectedRowId, usuario);
      return;
    }

    if (message.selectedButtonId) {
      await procesarOpcion(numero, message.selectedButtonId, usuario);
      return;
    }

    if (usuario.estado === "inicio" && texto === "1") {
      await mostrarMenuFreeFire(numero);
      return;
    }

    if (usuario.estado === "inicio" && texto === "2") {
      await mostrarMenuHotpacks(numero);
      return;
    }

    if (usuario.estado === "inicio" && texto === "3") {
      await enviarMensaje(
        numero,
        "👨‍💻 Un agente de RECARGAS GAMES te atenderá pronto."
      );
      return;
    }

    if (usuario.estado === "seleccion_producto") {
      if (!precios[texto]) {
        await mostrarMenuFreeFire(numero);
        return;
      }

      usuario.producto = texto;
      usuario.estado = "esperando_referencia";

      await enviarMensaje(numero, mensajePago(texto));
      return;
    }

    if (usuario.estado === "esperando_referencia") {
      if (!referenciaValida(texto)) {
        await enviarMensaje(
          numero,
          "❌ La referencia debe tener exactamente 4 dígitos."
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

    if (usuario.estado === "esperando_id") {
      if (!idJugadorValido(texto)) {
        await enviarMensaje(
          numero,
          "❌ ID inválido. Envía un ID de Free Fire con más de 6 dígitos."
        );
        return;
      }

      usuario.idJugador = texto;
      usuario.estado = "finalizado";

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

      return;
    }

    if (usuario.estado === "finalizado") {
      await enviarMensaje(
        numero,
        "✅ Tu solicitud ya fue recibida.\n\nEscribe *hola* para realizar otra recarga."
      );
      return;
    }

    await mostrarMenuPrincipal(numero);
  } catch (error) {
    console.error("Error procesando mensaje:", error);
  }
});

// =====================================
// PÁGINA PRINCIPAL
// =====================================

app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RECARGAS GAMES</title>
</head>
<body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:30px;">
  <h1 style="color:#ffd700;">RECARGAS GAMES</h1>
  <p>Bot de WhatsApp</p>
  <p>Estado: ${
    whatsappListo ? "🟢 Conectado" : "🟡 Esperando conexión"
  }</p>
  <a href="/QR" style="color:white;background:#25d366;padding:15px;border-radius:10px;text-decoration:none;">
    Ver código QR
  </a>
</body>
</html>
  `);
});

// =====================================
// RUTA QR
// =====================================

app.get("/QR", async (req, res) => {
  try {
    if (whatsappListo) {
      return res.send(`
        <html>
        <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:30px;">
          <h1>🟢 WhatsApp conectado</h1>
          <p>RECARGAS GAMES está funcionando correctamente.</p>
        </body>
        </html>
      `);
    }

    if (!qrActual) {
      return res.send(`
        <html>
        <head>
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:30px;">
          <h1>⏳ Generando código QR...</h1>
        </body>
        </html>
      `);
    }

    const qrImagen = await qrcode.toDataURL(qrActual);

    res.send(`
      <html>
      <head>
        <title>QR RECARGAS GAMES</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta http-equiv="refresh" content="20">
      </head>
      <body style="background:#0b0b0f;color:white;text-align:center;font-family:Arial;padding:20px;">
        <h1 style="color:#ffd700;">Escanea el código QR</h1>
        <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
        <img src="${qrImagen}" style="width:300px;max-width:90%;background:white;padding:15px;border-radius:15px;">
        <p>El código se actualizará automáticamente.</p>
      </body>
      </html>
    `);
  } catch (error) {
    console.error("Error generando QR:", error);
    res.status(500).send("Error generando código QR.");
  }
});

// =====================================
// SERVIDOR
// =====================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor iniciado en el puerto ${PORT}`);
  console.log(`Ruta QR: /QR`);
});

// =====================================
// INICIAR WHATSAPP
// =====================================

client.initialize();
