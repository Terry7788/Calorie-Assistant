"use client";

import { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import { API } from "./api";

let socketInstance = null;

export function getSocket() {
  if (!socketInstance) {
    socketInstance = io(API, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });
    
    socketInstance.on("connect", () => {
      console.log("Socket.IO connected:", socketInstance.id);
    });
    
    socketInstance.on("disconnect", () => {
      console.log("Socket.IO disconnected");
    });
    
    socketInstance.on("connect_error", (error) => {
      console.error("Socket.IO connection error:", error);
    });
  }
  return socketInstance;
}

export function useSocket() {
  const socketRef = useRef(null);

  useEffect(() => {
    socketRef.current = getSocket();

    return () => {
      // Don't disconnect on unmount - keep connection alive
      // socketRef.current?.disconnect();
    };
  }, []);

  return socketRef.current;
}

