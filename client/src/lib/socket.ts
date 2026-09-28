import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem("token") || "";
    socket = io(import.meta.env.VITE_WS_URL || "http://localhost:4000", {
      auth: { token },
      autoConnect: true,
    });
  }
  return socket;
}

export function reconnectSocket() {
  socket?.disconnect();
  socket = null;
  return getSocket();
}
