const express = require("express");
const app = express();
const server = require('http').createServer(app);

const fs = require("fs");
const os = require("os");

const hostname = "0.0.0.0";
const keys = "./keys";
const port = process.env.PORT || 8080;
const protocol = "https";
const root = "/dist";
const mimeTypes = {
  css: "text/css",
  html: "text/html",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript",
  png: "image/png",
  svg: "image/svg+xml",
};

const listeners = {};
const stations = {};

const localIp = os
  .networkInterfaces()
  ["lo"].filter((interface) => interface.family === "IPv4")
  .map((interface) => interface.address)[0];

function createServer(proto, handler) {
  if (proto === "https") {
    return require("https").createServer(
      {
        key: fs.readFileSync(`${keys}/client-key.pem`),
        cert: fs.readFileSync(`${keys}/client-cert.pem`),
      },
      handler
    );
  } else {
    return require("http").createServer(handler);
  }
}

function handleRequest(req, res) {
  if (req.url === "/") {
    req.url = "/index.html";
  }
  loadFile(__dirname + root + req.url, req, res);
}

function loadFile(path, req, res) {
  console.log(`server: ${path}`);
  fs.readFile(path, (err, data) => {
    const mimeType = mimeTypes[path.split(".").pop()];
    if (err) {
      if (mimeType) {
        res.writeHead(404);
        res.end(JSON.stringify(err));
      } else {
        loadFile(__dirname + root + "/index.html", req, res);
      }
      return;
    }
    res.writeHead(200, { "Content-Type": mimeType || "text/plain" });
    res.end(data);
  });
}

function exists(stationId) {
  return stations[stationId];
}

function isOwner(stationId, socket) {
  return stations[stationId] && stations[stationId].owner.id === socket.id;
}

function handleSockets(socket) {
  // connect to radio
  console.log("connect", socket.id);
  listeners[socket.id] = {
    id: socket.id,
    name: null,
    owns: null,
  };
  socket.emit("connected", socket.id, localIp);
  socket.emit("stations.updated", stations);
  io.emit("listeners.updated", listeners);

  // disconnect from radio
  socket.on("disconnect", () => {
    console.log("disconnect", socket.id);
    const myStationId = listeners[socket.id].owns;
    if (typeof myStationId === "string") {
      delete stations[myStationId];
      io.emit("stations.updated", stations);
    }
    if (listeners[socket.id]) {
      delete listeners[socket.id];
      io.emit("listeners.updated", listeners);
    }
    socket.emit("disconnected", socket.id);
  });

  // add a station
  socket.on("add", (stationId, stationName) => {
    if (!exists(stationId)) {
      console.log("add", stationId);
      listeners[socket.id].owns = stationId;
      stations[stationId] = {
        broadcasting: false,
        id: stationId,
        listeners: {},
        name: stationName,
        owner: listeners[socket.id],
        time: 0,
      };
      socket.emit("added", stationId);
      io.emit("stations.updated", stations);
    }
  });

  // remove a station
  socket.on("remove", (stationId) => {
    if (exists(stationId) && isOwner(stationId, socket)) {
      console.log("remove", stationId);
      listeners[socket.id].owns = null;
      delete stations[stationId];
      socket.emit("removed", stationId);
      io.emit("stations.updated", stations);
    }
  });

  // update a station
  socket.on("update", (stationId, stationName) => {
    if (exists(stationId) && isOwner(stationId, socket)) {
      console.log("update", stationId);
      stations[stationId].name = stationName;
      socket.emit("updated", stationId);
      io.emit("stations.updated", stations);
    }
  });

  // join a station
  socket.on("join", (stationId) => {
    if (exists(stationId)) {
      console.log("join", stationId);
      stations[stationId].listeners[socket.id] = listeners[socket.id];
      socket.join(stationId);
      socket.emit("joined", stationId);
      io.to(stationId).emit("listener.joined", socket.id);
      io.emit("stations.updated", stations);
    }
  });

  // leave a station
  socket.on("leave", (stationId) => {
    if (exists(stationId)) {
      console.log("leave", stationId);
      delete stations[stationId].listeners[socket.id];
      socket.leave(stationId);
      socket.emit("left", stationId);
      io.emit("listener.left", socket.id);
      io.emit("stations.updated", stations);
    }
  });

  // start a broadcast
  socket.on("start", (stationId) => {
    if (exists(stationId) && isOwner(stationId, socket)) {
      stations[stationId].broadcasting = true;
      stations[stationId].time = new Date().getTime();
      socket.emit("started", stationId);
      io.emit("stations.updated", stations);
    }
  });

  // stop a broadcast
  socket.on("stop", (stationId) => {
    if (exists(stationId) && isOwner(stationId, socket)) {
      stations[stationId].broadcasting = false;
      stations[stationId].time = 0;
      socket.emit("stopped", stationId);
      io.emit("stations.updated", stations);
    }
  });

  // update listener name
  socket.on("updateName", (listenerName) => {
    listeners[socket.id].name = listenerName;
    io.emit("listeners.updated", listeners);
  });

  // negotiate audio
  socket.on("offer", (offer, recipientId) => {
    io.to(recipientId).emit("offer", offer, socket.id);
  });

  socket.on("answer", (answer, recipientId) => {
    io.to(recipientId).emit("answer", answer, socket.id);
  });

  socket.on("candidate", (candidate, recipientId) => {
    io.to(recipientId).emit("candidate", candidate, socket.id);
  });
}

// setup http server
app.use(express.static(__dirname + root));

app.get("/*", (req, res) => {
  res.sendFile(__dirname + root + "/index.html");
});

server.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
// setup websockets
let io = require("socket.io")(server);
io.on("connection", handleSockets);
