const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const express = require("express");
const qrcode = require("qrcode");
const socketIO = require("socket.io");
const http = require("http");
const ExcelJS = require("exceljs");
const multer = require("multer");
const xlsx = require("xlsx");

// initial instance
const PORT = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const client = new Client({
  restartOnAuthFail: true,
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process", // <- this one doesn't works in Windows
      "--disable-gpu",
    ],
  },
});

const upload = multer();
app.use(express.static("public"));

// index routing and middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.get("/", (req, res) => {
  res.sendFile("public/index.html", { root: __dirname });
});

function now() {
  // socket connection
  let today = new Date();
  let now = today.toLocaleString();
  return now;
}

io.on("connection", (socket) => {
  socket.emit("message", `${now()} Connected`);
  socket.emit("ready", false);

  client.initialize();

  client.on("qr", (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", `${now()} QR Code received`);
    });
  });

  client.on("ready", () => {
    socket.emit("message", `${now()} WhatsApp is ready!`);
    socket.emit("ready", true);

    client
      .sendMessage("6281295908062@c.us", "Berhasil Terkoneksi")
      .then((response) => {
        console.log(response.body + " " + response.to);
      })
      .catch((error) => {
        console.log(error);
      });

    console.log(`${now()} Client is Ready`);
  });

  client.on("message", (msg) => {
    if (msg.body == "p" || msg.body == "P") {
      msg.reply("Iyaa");
    }
    socket.emit("message", `${now()} Message from ${msg.from}`);
  });

  client.on("authenticated", (session) => {
    socket.emit("message", `${now()} Whatsapp is authenticated!`);
  });

  client.on("auth_failure", function (session) {
    socket.emit("message", `${now()} Auth failure, restarting...`);
  });

  client.on("disconnected", function () {
    socket.emit("message", `${now()} Disconnected`);
    socket.emit("ready", false);
    client.destroy();
    client.initialize();
  });

  client.on("message_create", function (res) {
    socket.emit("message", `${now()} message was sent to ${msg.to}`);
  });

  // send message routing
  app.post("/send", upload.single("excelFile"), (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).send("Tidak ada file yang diunggah");
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0]; // Mengambil nama sheet pertama
    const sheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(sheet);

    const message = req.body.message;

    console.log("data =>", data);
    console.log("message =>", message);

    res.status(200);
    if (client.info === undefined) {
      console.log("the system is not ready yet");
      res.status(500);
    } else {
      data.forEach((item) => {
        const number = item.nomor;
        const nama = item.nama;
        const msg = message.replace("{{nama}}", nama);

        setTimeout(() => {
          client
            .sendMessage(`${number}@c.us`, msg)
            .then((response) => {
              console.log("sent message to ", response.to);
            })
            .catch((error) => {
              console.log("error => ", error);
            });
        }, 1000);
      });

      res.status(200).send("Data sudah dikirim");
    }
  });

  // logout whatsapp routing
  app.post("/logout", (req, res) => {
    client.logout();
    client.destroy();
    client.initialize();
    res.status(200);
  });
});

server.listen(PORT, () => {
  console.log("App listen on port ", PORT);
});
