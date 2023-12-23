const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const express = require("express");
const qrcode = require("qrcode");
const socketIO = require("socket.io");
const http = require("http");

// initial instance
const PORT = process.env.PORT || 8000;
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const client = new Client({
  restartOnAuthFail: true,
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox"],
  },
});

// index routing and middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.get("/", (req, res) => {
  res.sendFile("index.html", { root: __dirname });
});

client.initialize();

// socket connection
var today = new Date();
var now = today.toLocaleString();

io.on("connection", (socket) => {
  socket.emit("message", `${now} Connected`);

  client.on("qr", (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      socket.emit("qr", url);
      socket.emit("message", `${now} QR Code received`);
    });
  });

  client.on("ready", () => {
    socket.emit("message", `${now} WhatsApp is ready!`);

    client
      .sendMessage("6281295908062@c.us", "Berhasil Terkoneksi")
      .then((response) => {
        console.log(response.body + response.to);
        socket.emit("message", `${now} Connection message sent`);
      })
      .catch((error) => {
        console.log(error);
      });
  });

  client.on("message", (msg) => {
    if (msg.body == "p" || msg.body == "P") {
      msg.reply("Iyaa");
    }
    socket.emit("message", `${now} Message from ${msg.from}`);
  });

  client.on("authenticated", (session) => {
    socket.emit("message", `${now} Whatsapp is authenticated!`);
  });

  client.on("auth_failure", function (session) {
    socket.emit("message", `${now} Auth failure, restarting...`);
  });

  client.on("disconnected", function () {
    socket.emit("message", `${now} Disconnected`);
    client.destroy();
    client.initialize();
  });
});

server.listen(PORT, () => {
  console.log("App listen on port ", PORT);
});
