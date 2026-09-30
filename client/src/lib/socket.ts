import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    const token = localStorage.getItem("token") || "";
    const wsUrl = import.meta.env.VITE_WS_URL;
    socket = io(wsUrl && wsUrl.length > 0 ? wsUrl : undefined, {
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
