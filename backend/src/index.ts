import WebSocket, { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

type JoinMessage = {
  type: "join";
  payload: {
    roomId: string;
    name?: string;
  };
};

type LeaveMessage = {
  type: "leave";
  payload?: {
    roomId?: string;
  };
};

type ChatMessage = {
  type: "chat";
  payload: {
    message: string;
  };
};

type WhoMessage = {
  type: "who";
};

type RoomsMessage = {
  type: "rooms";
};

type PingMessage = {
  type: "ping";
};

type ClientMessage =
  | JoinMessage
  | LeaveMessage
  | ChatMessage
  | WhoMessage
  | RoomsMessage
  | PingMessage;

type ServerMessage =
  | { type: "system"; payload: { message: string } }
  | { type: "joined"; payload: { roomId: string; userId: string; name: string } }
  | { type: "left"; payload: { roomId: string; userId: string } }
  | {
      type: "chat";
      payload: { roomId: string; userId: string; name: string; message: string; time: number };
    }
  | { type: "who"; payload: { roomId: string; members: Array<{ userId: string; name: string }> } }
  | { type: "rooms"; payload: { rooms: Array<{ roomId: string; count: number }> } }
  | { type: "pong" };

type Client = {
  userId: string;
  name: string;
  socket: WebSocket;
  roomId: string | null;
  isAlive: boolean;
};

const clients: Client[] = [];

const wss = new WebSocketServer({ port: 8080 });

function safeSend(ws: WebSocket, data: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastToRoom(roomId: string, data: ServerMessage, except?: WebSocket) {
  for (const c of clients) {
    if (c.roomId === roomId && c.socket !== except) {
      safeSend(c.socket, data);
    }
  }
}

function getClient(ws: WebSocket) {
  return clients.find((c) => c.socket === ws);
}

function getRoomMembers(roomId: string) {
  return clients
    .filter((c) => c.roomId === roomId)
    .map((c) => ({ userId: c.userId, name: c.name }));
}

function getRoomsSummary() {
  const map = new Map<string, number>();
  for (const c of clients) {
    if (!c.roomId) continue;
    map.set(c.roomId, (map.get(c.roomId) || 0) + 1);
  }
  return Array.from(map.entries()).map(([roomId, count]) => ({ roomId, count }));
}

function parseMessage(raw: WebSocket.RawData): ClientMessage | null {
  try {
    const str = raw.toString();
    const data = JSON.parse(str);
    return data;
  } catch {
    return null;
  }
}

wss.on("connection", function (socket) {
  const userId = randomUUID();
  const client: Client = {
    userId,
    name: "Anonymous",
    socket,
    roomId: null,
    isAlive: true,
  };

  clients.push(client);

  safeSend(socket, {
    type: "system",
    payload: { message: `Connected ✅ your userId = ${userId}` },
  });

  socket.on("pong", () => {
    const c = getClient(socket);
    if (c) c.isAlive = true;
  });

  socket.on("message", function (raw) {
    const msg = parseMessage(raw);

    if (!msg) {
      return safeSend(socket, {
        type: "system",
        payload: { message: " Invalid JSON message" },
      });
    }

    // Handle ping from frontend
    if (msg.type === "ping") {
      return safeSend(socket, { type: "pong" });
    }

    // JOIN
    if (msg.type === "join") {
      const roomId = msg.payload?.roomId?.trim();
      const name = msg.payload?.name?.trim();

      if (!roomId) {
        return safeSend(socket, {
          type: "system",
          payload: { message: "❌ roomId is required" },
        });
      }

      client.roomId = roomId;
      if (name) client.name = name;

      safeSend(socket, {
        type: "joined",
        payload: { roomId, userId: client.userId, name: client.name },
      });

      broadcastToRoom(
        roomId,
        {
          type: "system",
          payload: { message: `👋 ${client.name} joined room ${roomId}` },
        },
        socket,
      );

      return;
    }

    // LEAVE
    if (msg.type === "leave") {
      const currentRoom = client.roomId;
      if (!currentRoom) {
        return safeSend(socket, {
          type: "system",
          payload: { message: "⚠️ You are not in any room" },
        });
      }

      client.roomId = null;

      safeSend(socket, {
        type: "left",
        payload: { roomId: currentRoom, userId: client.userId },
      });

      broadcastToRoom(currentRoom, {
        type: "system",
        payload: { message: `👋 ${client.name} left room ${currentRoom}` },
      });

      return;
    }

    // WHO (list members)
    if (msg.type === "who") {
      if (!client.roomId) {
        return safeSend(socket, {
          type: "system",
          payload: { message: " Join a room first" },
        });
      }

      return safeSend(socket, {
        type: "who",
        payload: { roomId: client.roomId, members: getRoomMembers(client.roomId) },
      });
    }

    // ROOMS (list rooms)
    if (msg.type === "rooms") {
      return safeSend(socket, {
        type: "rooms",
        payload: { rooms: getRoomsSummary() },
      });
    }

    // CHAT
    if (msg.type === "chat") {
      if (!client.roomId) {
        return safeSend(socket, {
          type: "system",
          payload: { message: " Join a room first to chat" },
        });
      }

      const text = msg.payload?.message?.trim();
      if (!text) {
        return safeSend(socket, {
          type: "system",
          payload: { message: " Empty message not allowed" },
        });
      }

      const chatPayload: ServerMessage = {
        type: "chat",
        payload: {
          roomId: client.roomId,
          userId: client.userId,
          name: client.name,
          message: text,
          time: Date.now(),
        },
      };

      // Send to everyone in room (including sender)
      broadcastToRoom(client.roomId, chatPayload);
      return;
    }

    // fallback
    safeSend(socket, {
      type: "system",
      payload: { message: " Unknown message type" },
    });
  });

  socket.on("close", function () {
    const idx = clients.findIndex((c) => c.socket === socket);
    if (idx === -1) return;

    const old = clients[idx];
    //@ts-ignore
    const oldRoom = old.roomId;

    clients.splice(idx, 1);

    if (oldRoom) {
      broadcastToRoom(oldRoom, {
        type: "system",
        payload: { message: ` ${old?.name} disconnected` },
      });
    }

    console.log("Client disconnected:", old?.userId);
  });

  socket.on("error", (err) => {
    console.log("Socket error:", err.message);
  });
});

// Heartbeat to kill dead sockets
setInterval(() => {
  for (const c of clients) {
    if (!c.isAlive) {
      try {
        c.socket.terminate();
      } catch {}
      continue;
    }

    c.isAlive = false;
    try {
      c.socket.ping();
    } catch {}
  }
}, 15000);
