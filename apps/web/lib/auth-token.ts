export const AUTH_TOKEN_KEY = "skill-platform-auth-token";
export const AUTH_TOKEN_CHANGED_EVENT = "skill-platform-auth-token-changed";

export function getAuthToken(): string | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return window.localStorage.getItem(AUTH_TOKEN_KEY) ?? undefined;
}

export function setAuthToken(token: string): void {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  dispatchAuthTokenChanged();
}

export function clearAuthToken(): void {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
  dispatchAuthTokenChanged();
}

function dispatchAuthTokenChanged(): void {
  window.dispatchEvent(new Event(AUTH_TOKEN_CHANGED_EVENT));
}
