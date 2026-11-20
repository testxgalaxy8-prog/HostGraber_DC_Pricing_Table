const TOKEN_STORAGE_KEY = 'hg_admin_session_token';

function readStoredToken(): string | null {
  try {
    return typeof window !== 'undefined'
      ? window.localStorage.getItem(TOKEN_STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
}

let sessionToken: string | null = readStoredToken();

export function setSessionToken(token: string | null): void {
  sessionToken = token;
  try {
    if (typeof window !== 'undefined') {
      if (token) {
        window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  } catch {
    // Ignore storage errors in restricted contexts
  }
}

export function getSessionToken(): string | null {
  return sessionToken;
}

export class ApiError extends Error {
  status: number;
  mustChangePassword?: boolean;

  constructor(message: string, status: number, mustChangePassword?: boolean) {
    super(message);
    this.status = status;
    this.mustChangePassword = mustChangePassword;
  }
}

function getAuthHeader(): Record<string, string> {
  if (!sessionToken) {
    return {};
  }
  return {
    Authorization: `Bearer ${sessionToken}`,
  };
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...getAuthHeader(),
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await fetch(url, {
    ...options,
    credentials: 'same-origin',
    headers,
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    let mustChangePassword: boolean | undefined;
    try {
      const errBody = (await response.json()) as {
        error?: string;
        mustChangePassword?: boolean;
      };
      if (errBody?.error) {
        errorMessage = errBody.error;
      }
      if (typeof errBody?.mustChangePassword === 'boolean') {
        mustChangePassword = errBody.mustChangePassword;
      }
    } catch {
      // Ignore JSON parse error
    }
    throw new ApiError(errorMessage, response.status, mustChangePassword);
  }

  return (await response.json()) as T;
}

export async function apiDownloadBlob(url: string, filename: string): Promise<void> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: getAuthHeader(),
  });
  if (!response.ok) {
    throw new Error('Failed to download template file.');
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}
