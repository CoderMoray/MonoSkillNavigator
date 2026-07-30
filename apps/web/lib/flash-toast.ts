const STORAGE_KEY = "skill-platform-flash-toast";

export function saveFlashToast(message: string): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.setItem(STORAGE_KEY, message);
}

export function readFlashToast(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const message = sessionStorage.getItem(STORAGE_KEY);
  if (!message) {
    return null;
  }

  sessionStorage.removeItem(STORAGE_KEY);
  return message;
}

export function clearFlashToast(): void {
  if (typeof window === "undefined") {
    return;
  }
  sessionStorage.removeItem(STORAGE_KEY);
}
