const { Client, LocalAuth } = require("whatsapp-web.js");
const express = require("express");
const qrcode = require("qrcode");
const socketIO = require("socket.io");
const http = require("http");
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
  const now = new Date().toLocaleString("en-US", {
    timeZone: "Asia/Jakarta",
  });
  return now;
}

client.initialize();

io.on("connection", (socket) => {
  console.log(now(), "socket connected");
  socket.emit("message", `${now()} Connected`);

  if (socket.info === undefined) {
    socket.emit("ready", false);
  } else {
    socket.emit("ready", true);
  }

  client.on("qr", (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
      console.log(now(), "qrcode ready");
      socket.emit("qr", url);
      socket.emit("message", `${now()} QR Code received`);
    });
  });

  client.on("ready", () => {
    socket.emit("message", `${now()} WhatsApp is ready!`);
    socket.emit("ready", true);

    console.log(`${now()} Client is Ready`);
  });

  client.on("message", (msg) => {
    if (msg.body == "p" || msg.body == "P") {
      msg.reply("Oitt,, Kenapa....");
    }
    socket.emit("message", `${now()} Message from ${msg.from}`);
  });

  client.on("authenticated", (session) => {
    console.log(now(), "Whatsapp authenticated");
    socket.emit("message", `${now()} Whatsapp is authenticated!`);
  });

  client.on("auth_failure", function (session) {
    console.log(now(), "Whatsapp failure auth");
    socket.emit("message", `${now()} Auth failure, restarting...`);
  });

  client.on("disconnected", function () {
    console.log(now(), "Whatsapp Disconnected");

    socket.emit("message", `${now()} Disconnected`);
    socket.emit("ready", false);

    client.destroy();
    client.initialize();
  });

  client.on("message_create", function (res) {
    console.log(now(), "Message was sent to ", res.to);
    socket.emit("message", `${now()} message was sent to ${res.to}`);
  });
});

// send message routing
app.post("/send", upload.single("excelFile"), (req, res) => {
  console.log(now(), "!!!New blast request!!!");

  if (!req.file || !req.file.buffer) {
    console.log(now(), "no file found when send message");
    return res.status(400).send("Tidak ada file yang diunggah");
  }

  const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0]; // Mengambil nama sheet pertama
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);

  const message = req.body.message;

  console.log(now(), "Numbers =>", data);
  console.log(now(), "Message =>", message);

  if (client.info === undefined) {
    console.log(now(), "The system is not ready yet");
    return res.status(500);
  } else {
    let message_data = [];
    let index = 0;

    const sendMessages = () => {
      if (index < data.length) {
        const item = data[index];

        let number;
        if (typeof item.nomor !== "string") {
          number = item.nomor.toString();
        } else {
          number = item.nomor;
        }

        const name = item.nama;
        const msg = message.replaceAll("{{nama}}", name);

        client
          .sendMessage(
            `${number
              .replaceAll("+", "")
              .replaceAll(" ", "")
              .replaceAll("-", "")}@c.us`,
            msg
          )
          .then((response) => {
            message_data.push({
              name: name,
              number: number,
              message: msg,
              status: true,
            });
            index++;
            setTimeout(sendMessages, 10000); // Memanggil sendMessages setiap 10 detik
          })
          .catch((error) => {
            message_data.push({
              name: name,
              number: number,
              message: msg,
              status: false,
            });
            console.log(now(), "error => ", error);
            index++;
            setTimeout(sendMessages, 10000); // Memanggil sendMessages setiap 10 detik
          });
      } else {
        return res.status(200).json(message_data);
      }
    };

    sendMessages(); // Memulai proses pengiriman pesan
  }
});

// logout whatsapp routing
app.post("/logout", (req, res) => {
  client.logout();
  return res.status(200);
});

server.listen(PORT, () => {
  console.log(now(), "App listen on port ", PORT);
});
