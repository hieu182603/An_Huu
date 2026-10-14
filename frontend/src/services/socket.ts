import { io, Socket } from "socket.io-client";
import { useEffect, useState, useCallback, useRef, useSyncExternalStore } from "react";
import { getAccessToken, authenticatedRequest } from "./api";
import { socketOrigin } from "./socketOrigin";

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

  const origin = socketOrigin();
  if (!origin) return null;
  socketInstance = io(origin, {
    path: "/socket.io",
    // Read the token on every handshake: access tokens rotate, and a captured
    // one would make every reconnect after a refresh fail authentication.
    auth: (cb) => cb({ token: getAccessToken() }),
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

// ---------------------------------------------------------------------------
// One notification store per tab: every component (header dropdown, admin
// shell, notifications page) shares a single fetch, one poll and one set of
// socket listeners instead of each polling on its own.
// ---------------------------------------------------------------------------
type NotificationState = { notifications: RealtimeNotification[]; unreadCount: number; isConnected: boolean; loading: boolean; error: string };
const EMPTY: NotificationState = { notifications: [], unreadCount: 0, isConnected: false, loading: false, error: "" };
export const NOTIFICATION_POLL_MS = 60_000;
let state = EMPTY;
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;
let fetchSeq = 0;
let stopShared: (() => void) | null = null;

function setState(patch: Partial<NotificationState>) {
  state = { ...state, ...patch };
  listeners.forEach(listener => listener());
}
export function refreshNotifications(): Promise<void> {
  if (inflight) return inflight;
  const seq = ++fetchSeq;
  setState({ loading: true });
  inflight = authenticatedRequest<{ items: RealtimeNotification[]; total: number; unread: number; limit: number }>("/me/notifications?page=1&limit=25", undefined, "GET", undefined, { skipCache: true })
    .then(res => {
      if (seq === fetchSeq && res && Array.isArray(res.items)) setState({ notifications: res.items, unreadCount: res.unread, error: "" });
    })
    .catch(error => { if (seq === fetchSeq) setState({ error: error instanceof Error ? error.message : String(error) }); })
    .finally(() => { inflight = null; if (seq === fetchSeq) setState({ loading: false }); });
  return inflight;
}
function startShared() {
  void refreshNotifications();
  const socket = getSocket();
  const pushing = () => Boolean(socket?.connected);
  // Poll only while the tab is visible and no socket is pushing updates.
  const poll = window.setInterval(() => {
    if (document.visibilityState === "visible" && !pushing()) void refreshNotifications();
  }, NOTIFICATION_POLL_MS);
  const onVisible = () => { if (document.visibilityState === "visible") void refreshNotifications(); };
  const onExternalUpdate = () => { void refreshNotifications(); };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("anhuu:notifications-updated", onExternalUpdate);

  const onConnect = () => setState({ isConnected: true });
  const onDisconnect = () => setState({ isConnected: false });
  const onNewNotification = (data: RealtimeNotification) => {
    const notifItem = { ...data, isNew: true };
    setState({ notifications: [notifItem, ...state.notifications.filter(n => n.id !== data.id)], unreadCount: state.unreadCount + 1 });
    window.dispatchEvent(new CustomEvent("anhuu:notification-received", { detail: notifItem }));
  };
  // A POST and its socket echo can both arrive; reload the authoritative total
  // instead of decrementing twice or counting only the visible first page.
  const onRead = () => { void refreshNotifications(); };
  const onBroadcast = (payload: { title: string; message: string; timestamp: string }) => {
    const syntheticNotif: RealtimeNotification = {
      id: `broadcast-${Date.now()}`, title: payload.title, message: payload.message, path: "/user/notifications",
      readAt: null, createdAt: payload.timestamp || new Date().toISOString(), isNew: true,
    };
    setState({ notifications: [syntheticNotif, ...state.notifications], unreadCount: state.unreadCount + 1 });
    window.dispatchEvent(new CustomEvent("anhuu:notification-received", { detail: syntheticNotif }));
  };
  if (socket) {
    setState({ isConnected: socket.connected });
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("notification:new", onNewNotification);
    socket.on("notification:read", onRead);
    socket.on("notification:read_all", onRead);
    socket.on("notification:broadcast", onBroadcast);
  }
  return () => {
    window.clearInterval(poll);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("anhuu:notifications-updated", onExternalUpdate);
    if (socket) {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("notification:new", onNewNotification);
      socket.off("notification:read", onRead);
      socket.off("notification:read_all", onRead);
      socket.off("notification:broadcast", onBroadcast);
    }
  };
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) stopShared = startShared();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopShared?.(); stopShared = null;
      // Last consumer gone (e.g. logout): never show these items to the next account.
      fetchSeq++; state = EMPTY;
    }
  };
}

export function useRealtimeNotifications() {
  const snapshot = useSyncExternalStore(subscribe, () => state, () => EMPTY);
  const [updating, setUpdating] = useState(false);
  const [writeError, setWriteError] = useState("");
  const writing = useRef(false);

  const saveRead = useCallback(async (path: string) => {
    if (writing.current) return false;
    writing.current = true;
    setUpdating(true);
    setWriteError("");
    try {
      await authenticatedRequest(path, {});
      // Other tabs/listeners refresh through this event; the shared fetch is deduplicated.
      window.dispatchEvent(new Event("anhuu:notifications-updated"));
      await refreshNotifications();
      return true;
    } catch (error) {
      setWriteError(error instanceof Error ? error.message : String(error));
      return false;
    } finally { writing.current = false; setUpdating(false); }
  }, []);
  const markAsRead = useCallback((id: string) => saveRead(`/me/notifications/${id}/read`), [saveRead]);
  const markAllAsRead = useCallback(() => saveRead("/me/notifications/read-all"), [saveRead]);

  // Opening a view (e.g. the notifications page) shows fresh data; concurrent calls share one request.
  useEffect(() => { void refreshNotifications(); }, []);

  return {
    notifications: snapshot.notifications,
    unreadCount: snapshot.unreadCount,
    isConnected: snapshot.isConnected,
    loading: snapshot.loading,
    error: writeError || snapshot.error,
    updating,
    refresh: refreshNotifications,
    markAsRead,
    markAllAsRead,
  };
}
