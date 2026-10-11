import { io, Socket } from "socket.io-client";
import { useEffect, useState, useCallback, useRef } from "react";
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
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState(false);
  const writing = useRef(false);
  const fetchSeq = useRef(0);

  const fetchLatest = useCallback(async () => {
    const seq = ++fetchSeq.current;
    try {
      setLoading(true);
      const res = await authenticatedRequest<{ items: RealtimeNotification[]; total: number; unread: number; limit: number }>(
        "/me/notifications?page=1&limit=25"
      );
      if (seq === fetchSeq.current && res && Array.isArray(res.items)) {
        setNotifications(res.items);
        setUnreadCount(res.unread);
        setError("");
      }
    } catch (error) {
      if (seq === fetchSeq.current) setError(error instanceof Error ? error.message : String(error));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, []);

  const saveRead = useCallback(async (path: string) => {
    if (writing.current) return false;
    writing.current = true;
    setUpdating(true);
    setError("");
    try {
      await authenticatedRequest(path, {});
      window.dispatchEvent(new Event("anhuu:notifications-updated"));
      await fetchLatest();
      return true;
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
      return false;
    } finally { writing.current = false; setUpdating(false); }
  }, [fetchLatest]);
  const markAsRead = useCallback((id: string) => saveRead(`/me/notifications/${id}/read`), [saveRead]);
  const markAllAsRead = useCallback(() => saveRead("/me/notifications/read-all"), [saveRead]);

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

    // A POST and its socket echo can both arrive; reload the authoritative total
    // instead of decrementing twice or counting only the visible first page.
    const onRead = () => { void fetchLatest(); };

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
    error,
    updating,
    refresh: fetchLatest,
    markAsRead,
    markAllAsRead,
  };
}
