export interface GoogleUserPayload {
  sub: string;
  email: string;
  email_verified?: boolean;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (momentListener?: (notification: {
            isNotDisplayed: () => boolean;
            isSkippedMoment: () => boolean;
            isDismissedMoment: () => boolean;
            getNotDisplayedReason: () => string;
            getSkippedReason: () => string;
            getDismissedReason: () => string;
          }) => void) => void;
          renderButton: (parent: HTMLElement, options: {
            type?: "standard" | "icon";
            theme?: "outline" | "filled_blue" | "filled_black";
            size?: "large" | "medium" | "small";
            text?: "signin_with" | "signup_with" | "continue_with" | "signin";
            shape?: "rectangular" | "pill" | "circle" | "square";
            logo_alignment?: "left" | "center";
            width?: number | string;
            locale?: string;
          }) => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

/**
 * Kiểm tra xem Google Client ID đã được cấu hình trong .env chưa.
 */
export function isGoogleAuthConfigured(): boolean {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return Boolean(clientId && clientId.trim() && !clientId.includes("your-google-client-id"));
}

/**
 * Lấy Google Client ID đã cấu hình.
 */
export function getGoogleClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
}

/**
 * Giải mã JWT ID Token trả về từ Google Identity Services.
 */
export function parseGoogleCredential(credential: string): GoogleUserPayload | null {
  try {
    const parts = credential.split(".");
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(jsonPayload) as GoogleUserPayload;
  } catch (err) {
    console.error("Lỗi giải mã Google Credential:", err);
    return null;
  }
}

let scriptLoadingPromise: Promise<void> | null = null;

/**
 * Tải động SDK Google Identity Services (GSI).
 */
export function loadGoogleGsiScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptLoadingPromise) return scriptLoadingPromise;

  scriptLoadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Không thể tải Google Identity Services")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Không thể tải Google Identity Services"));
    document.head.appendChild(script);
  });

  return scriptLoadingPromise;
}

/**
 * Khởi tạo Google Sign-In và kích hoạt prompt xác thực tài khoản thật từ Google.
 */
export async function triggerGoogleSignIn(
  onSuccess: (payload: GoogleUserPayload, rawCredential: string) => void | Promise<void>,
  onError?: (error: Error) => void
): Promise<void> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    const err = new Error("MISSING_CLIENT_ID");
    onError?.(err);
    throw err;
  }

  await loadGoogleGsiScript();

  if (!window.google?.accounts?.id) {
    const err = new Error("GOOGLE_SDK_FAILED");
    onError?.(err);
    throw err;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response: { credential: string }) => {
      const payload = parseGoogleCredential(response.credential);
      if (payload) {
        Promise.resolve(onSuccess(payload, response.credential)).catch(error => onError?.(error instanceof Error ? error : new Error("GOOGLE_LOGIN_FAILED")));
      } else {
        onError?.(new Error("INVALID_PAYLOAD"));
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  window.google.accounts.id.prompt((notification) => {
    if (notification.isNotDisplayed()) {
      console.warn("Google One Tap không hiển thị:", notification.getNotDisplayedReason());
    } else if (notification.isSkippedMoment()) {
      console.warn("Google One Tap bị bỏ qua:", notification.getSkippedReason());
    }
  });
}
