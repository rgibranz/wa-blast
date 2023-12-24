const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const express = require("express");
const qrcode = require("qrcode");
const socketIO = require("socket.io");
const http = require("http");
const bodyParser = require("body-parser");

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

// index routing and middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
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
    socket.emit("ready", true);

    client
      .sendMessage("6281295908062@c.us", "Berhasil Terkoneksi")
      .then((response) => {
        console.log(response.body + " " + response.to);
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

  client.on("message_create",function(){
    socket.emit("message",`${now} message was sent`);
  })
});

// send message routing
app.post("/send", (req, res) => {
  const phone = req.body.phone;
  const message = req.body.message;

  if (client.info === undefined) {
    console.log("the system is not ready yet");
    res.status(500);
  } else {

    phone.split(',').map((number)=>{
      setTimeout(() => {
        client
          .sendMessage(`${number}@c.us`, message)
          .then((response) => {
            console.log('sent message to ', response.to);
          })
          .catch((error) => {
            console.log("error => ", error);
          });
      }, 1000);
    });

    res.status(200);
  }
});

server.listen(PORT, () => {
  console.log("App listen on port ", PORT);
});
