import WebSocket, { WebSocketServer } from "ws";
import { randomUUID } from "crypto";

/*
  Message formats:

  join:
  { type: "join", payload: { roomId: "room1", name: "Ayush" } }

  leave:
  { type: "leave" }

  chat:
  { type: "chat", payload: { message: "hello" } }
*/

type JoinMessage = {
  type: "join";
  payload: {
    roomId: string;
    name?: string;
  };
};

type LeaveMessage = {
  type: "leave";
};

type ChatMessage = {
  type: "chat";
  payload: {
    message: string;
  };
};

type ClientMessage = JoinMessage | LeaveMessage | ChatMessage;

type ServerMessage =
  | { type: "system"; payload: { message: string; time: number } }
  | { type: "joined"; payload: { roomId: string; userId: string; name: string; time: number } }
  | { type: "left"; payload: { roomId: string; userId: string; name: string; time: number } }
  | {
      type: "chat";
      payload: {
        roomId: string;
        userId: string;
        name: string;
        message: string;
        time: number;
      };
    };

type Client = {
  userId: string;
  name: string;
  socket: WebSocket;
  roomId: string | null;
};

// this array will store all connected clients
const clients: Client[] = [];

const wss = new WebSocketServer({ port: 8080 });
console.log("WebSocket server running on ws://localhost:8080");

// this function is just to avoid errors when sending messages
function safeSend(ws: WebSocket, data: ServerMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// this will send message to everyone who is inside the same room
function broadcastToRoom(roomId: string, data: ServerMessage, except?: WebSocket) {
  for (const c of clients) {
    if (c.roomId === roomId && c.socket !== except) {
      safeSend(c.socket, data);
    }
  }
}

// find the client object using socket
function getClient(ws: WebSocket) {
  return clients.find((c) => c.socket === ws);
}

// convert raw message to JSON safely
function parseMessage(raw: WebSocket.RawData): ClientMessage | null {
  try {
    const str = raw.toString();
    return JSON.parse(str);
  } catch {
    return null;
  }
}

wss.on("connection", (socket) => {
  // create a unique id for every new connection
  const userId = randomUUID();

  const client: Client = {
    userId,
    name: "Anonymous",
    socket,
    roomId: null,
  };

  clients.push(client);

  // send a small message to confirm connection
  safeSend(socket, {
    type: "system",
    payload: {
      message: `Connected. Your userId is ${userId}`,
      time: Date.now(),
    },
  });

  socket.on("message", (raw) => {
    const msg = parseMessage(raw);

    // if message is not valid JSON then ignore it
    if (!msg) {
      return safeSend(socket, {
        type: "system",
        payload: { message: "Invalid message format", time: Date.now() },
      });
    }

    // JOIN ROOM
    if (msg.type === "join") {
      const roomId = msg.payload.roomId?.trim();
      const name = msg.payload.name?.trim();

      if (!roomId) {
        return safeSend(socket, {
          type: "system",
          payload: { message: "roomId is required to join", time: Date.now() },
        });
      }

      // if user was already in some room then leave that room first
      const oldRoom = client.roomId;
      if (oldRoom) {
        broadcastToRoom(oldRoom, {
          type: "left",
          payload: {
            roomId: oldRoom,
            userId: client.userId,
            name: client.name,
            time: Date.now(),
          },
        });
      }

      client.roomId = roomId;

      // if user sends name then update it
      if (name) client.name = name;

      // confirm to the user that they joined
      safeSend(socket, {
        type: "joined",
        payload: {
          roomId,
          userId: client.userId,
          name: client.name,
          time: Date.now(),
        },
      });

      // tell other people in the room that someone joined
      broadcastToRoom(
        roomId,
        {
          type: "system",
          payload: { message: `${client.name} joined the room`, time: Date.now() },
        },
        socket,
      );

      return;
    }

    // LEAVE ROOM
    if (msg.type === "leave") {
      if (!client.roomId) {
        return safeSend(socket, {
          type: "system",
          payload: { message: "You are not in any room", time: Date.now() },
        });
      }

      const roomId = client.roomId;
      client.roomId = null;

      safeSend(socket, {
        type: "system",
        payload: { message: `You left room ${roomId}`, time: Date.now() },
      });

      broadcastToRoom(roomId, {
        type: "left",
        payload: {
          roomId,
          userId: client.userId,
          name: client.name,
          time: Date.now(),
        },
      });

      return;
    }

    // CHAT MESSAGE
    if (msg.type === "chat") {
      if (!client.roomId) {
        return safeSend(socket, {
          type: "system",
          payload: { message: "Join a room first to send messages", time: Date.now() },
        });
      }

      const text = msg.payload.message?.trim();
      if (!text) {
        return safeSend(socket, {
          type: "system",
          payload: { message: "Message cannot be empty", time: Date.now() },
        });
      }

      // send the chat to everyone in that room (including sender)
      broadcastToRoom(client.roomId, {
        type: "chat",
        payload: {
          roomId: client.roomId,
          userId: client.userId,
          name: client.name,
          message: text,
          time: Date.now(),
        },
      });

      return;
    }
  });

  socket.on("close", () => {
    const c = getClient(socket);
    if (!c) return;

    const oldRoom = c.roomId;

    // remove this client from list
    const idx = clients.findIndex((x) => x.socket === socket);
    if (idx !== -1) clients.splice(idx, 1);

    // if user was in a room then notify others
    if (oldRoom) {
      broadcastToRoom(oldRoom, {
        type: "system",
        payload: { message: `${c.name} disconnected`, time: Date.now() },
      });
    }

    console.log("Client disconnected:", c.userId);
  });

  socket.on("error", (err) => {
    console.log("Socket error:", err.message);
  });
});
