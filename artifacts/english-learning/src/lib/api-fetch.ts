import {
  setBaseUrl,
  setAuthTokenGetter,
  type AuthTokenGetter,
} from '@workspace/api-client-react';

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const normalizedApiBaseUrl = API_BASE_URL.replace(/\/+$/, '');

setBaseUrl(API_BASE_URL || null);

let authTokenGetter: AuthTokenGetter | null = null;

export function setApiAuthTokenGetter(getter: AuthTokenGetter | null): void {
  authTokenGetter = getter;
  setAuthTokenGetter(getter);
}

function getRequestUrl(input: RequestInfo | URL): string {
  return (
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url
  );
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

function applyApiBaseUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (!normalizedApiBaseUrl) return input;

  try {
    const url = new URL(getRequestUrl(input), window.location.href);
    if (url.origin !== window.location.origin || !isApiPath(url.pathname)) {
      return input;
    }

    const targetUrl = `${normalizedApiBaseUrl}${url.pathname}${url.search}${url.hash}`;
    if (typeof input === 'string') return targetUrl;
    if (input instanceof URL) return new URL(targetUrl);
    return new Request(targetUrl, input);
  } catch {
    return input;
  }
}

function isApiRequest(input: RequestInfo | URL): boolean {
  try {
    const url = new URL(getRequestUrl(input), window.location.href);
    const apiOrigin = normalizedApiBaseUrl
      ? new URL(normalizedApiBaseUrl, window.location.href).origin
      : window.location.origin;
    return url.origin === apiOrigin && isApiPath(url.pathname);
  } catch {
    return false;
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  input = applyApiBaseUrl(input);
  const headers = new Headers(
    typeof Request !== 'undefined' && input instanceof Request
      ? input.headers
      : undefined,
  );
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));

  if (isApiRequest(input) && authTokenGetter && !headers.has('authorization')) {
    const token = await authTokenGetter();
    if (token) headers.set('authorization', `Bearer ${token}`);
  }

  return fetch(input, {
    ...init,
    credentials: init.credentials ?? 'include',
    headers,
  });
}

export async function openApiFile(path: string): Promise<void> {
  const tab = window.open('about:blank', '_blank');
  if (!tab) throw new Error('파일을 열려면 팝업을 허용해 주세요.');
  tab.opener = null;

  try {
    const response = await apiFetch(path);
    if (!response.ok) throw new Error('첨부 파일을 불러오지 못했습니다.');

    const objectUrl = URL.createObjectURL(await response.blob());
    tab.location.replace(objectUrl);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  } catch (error) {
    tab.close();
    throw error;
  }
}
