import { clearAuthToken, getAuthToken } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

interface RequestOptions extends RequestInit {
  auth?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = false, headers, ...init } = options;
  const token = auth ? getAuthToken() : null;
  const isFormData = typeof FormData !== "undefined" && init.body instanceof FormData;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      clearAuthToken();
      const next = `${window.location.pathname}${window.location.search}`;
      const loginUrl = `/login?next=${encodeURIComponent(next)}`;
      if (window.location.pathname !== "/login") {
        window.location.replace(loginUrl);
      }
    }

    const message =
      payload && typeof payload === "object" && "message" in payload && typeof (payload as { message: unknown }).message === "string"
        ? (payload as { message: string }).message
        : `Request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload as T;
}

export function getDownloadFilename(response: Response): string | null {
  const disposition = response.headers.get("Content-Disposition");
  if (!disposition) return null;

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = disposition.match(/filename="([^"]+)"/i) ?? disposition.match(/filename=([^;]+)/i);
  if (!plainMatch?.[1]) return null;
  return plainMatch[1].trim();
}

export { API_BASE_URL };
