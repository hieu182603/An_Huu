import { io, Socket } from "socket.io-client";
import { useEffect, useState, useCallback } from "react";
import { getAccessToken, authenticatedRequest } from "./api";

export interface RealtimeNotification {
  id: string;
  title: string;
  message: string;
  path: string;
  readAt: string | null;
  createdAt: string;
  timestamp?: string;
  isNew?: boolean;
}

let socketInstance: Socket | null = null;

export function getSocket(): Socket | null {
  const token = getAccessToken();
  if (!token) {
    if (socketInstance) {
      socketInstance.disconnect();
      socketInstance = null;
    }
    return null;
  }

  if (socketInstance) {
    if (!socketInstance.connected && !socketInstance.active) {
      socketInstance.connect();
    }
    return socketInstance;
  }

  socketInstance = io("/", {
    path: "/socket.io",
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 2000,
  });

  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}

export function useRealtimeNotifications() {
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchLatest = useCallback(async () => {
    try {
      setLoading(true);
      const res = await authenticatedRequest<{ items: RealtimeNotification[]; total: number; unread: number; limit: number }>(
        "/me/notifications?page=1&limit=25"
      );
      if (res && Array.isArray(res.items)) {
        setNotifications(res.items);
        setUnreadCount(res.items.filter((n) => !n.readAt).length);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, []);

  const markAsRead = useCallback(async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((c) => Math.max(0, c - 1));
    window.dispatchEvent(new Event("anhuu:notifications-updated"));
    try {
      await authenticatedRequest(`/me/notifications/${id}/read`, {});
    } catch {}
  }, []);

  const markAllAsRead = useCallback(async () => {
    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || now })));
    setUnreadCount(0);
    window.dispatchEvent(new Event("anhuu:notifications-updated"));
    try {
      await authenticatedRequest("/me/notifications/read-all", {});
    } catch {}
  }, []);

  useEffect(() => {
    void fetchLatest();

    const socket = getSocket();
    if (!socket) return;

    setIsConnected(socket.connected);

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    const onNewNotification = (data: RealtimeNotification) => {
      const notifItem = { ...data, isNew: true };
      setNotifications((prev) => [notifItem, ...prev.filter((n) => n.id !== data.id)]);
      setUnreadCount((c) => c + 1);
      window.dispatchEvent(new CustomEvent("anhuu:notification-received", { detail: notifItem }));
    };

    const onRead = ({ id }: { id?: string }) => {
      const now = new Date().toISOString();
      setNotifications((prev) =>
        id
          ? prev.map((n) => (n.id === id ? { ...n, readAt: now } : n))
          : prev.map((n) => ({ ...n, readAt: n.readAt || now }))
      );
      if (id) {
        setUnreadCount((c) => Math.max(0, c - 1));
      } else {
        setUnreadCount(0);
      }
    };

    const onBroadcast = (payload: { title: string; message: string; timestamp: string }) => {
      const syntheticNotif: RealtimeNotification = {
        id: `broadcast-${Date.now()}`,
        title: payload.title,
        message: payload.message,
        path: "/user/notifications",
        readAt: null,
        createdAt: payload.timestamp || new Date().toISOString(),
        isNew: true,
      };
      setNotifications((prev) => [syntheticNotif, ...prev]);
      setUnreadCount((c) => c + 1);
      window.dispatchEvent(new CustomEvent("anhuu:notification-received", { detail: syntheticNotif }));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("notification:new", onNewNotification);
    socket.on("notification:read", onRead);
    socket.on("notification:read_all", onRead);
    socket.on("notification:broadcast", onBroadcast);

    const handleExternalUpdate = () => {
      void fetchLatest();
    };
    window.addEventListener("anhuu:notifications-updated", handleExternalUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("notification:new", onNewNotification);
      socket.off("notification:read", onRead);
      socket.off("notification:read_all", onRead);
      socket.off("notification:broadcast", onBroadcast);
      window.removeEventListener("anhuu:notifications-updated", handleExternalUpdate);
    };
  }, [fetchLatest]);

  return {
    notifications,
    unreadCount,
    isConnected,
    loading,
    refresh: fetchLatest,
    markAsRead,
    markAllAsRead,
  };
}
