import WebSocket, { WebSocketServer } from "ws";

type Client = {
  socket: WebSocket;
  roomId: string | null;
};

const clients: Client[] = [];

const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server running on ws://localhost:8080");

function safeSend(ws: WebSocket, data: any) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToRoom(roomId: string, data: any) {
  for (const c of clients) {
    if (c.roomId === roomId) {
      safeSend(c.socket, data);
    }
  }
}

wss.on("connection", (socket) => {
  const client: Client = { socket, roomId: null };
  clients.push(client);

  safeSend(socket, { type: "system", payload: { message: "Connected" } });

  socket.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());

    // join room
    if (msg.type === "join") {
      client.roomId = msg.payload.roomId;
      safeSend(socket, {
        type: "system",
        payload: { message: `Joined room ${client.roomId}` },
      });
      return;
    }

    // leave room
    if (msg.type === "leave") {
      client.roomId = null;
      safeSend(socket, {
        type: "system",
        payload: { message: "Left room" },
      });
      return;
    }

    // chat
    if (msg.type === "chat") {
      if (!client.roomId) return;

      broadcastToRoom(client.roomId, {
        type: "chat",
        payload: { message: msg.payload.message },
      });
      return;
    }
  });

  socket.on("close", () => {
    const index = clients.findIndex((c) => c.socket === socket);
    if (index !== -1) clients.splice(index, 1);
  });
});
