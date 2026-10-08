import {
  setAuthTokenGetter,
  type AuthTokenGetter,
} from '@workspace/api-client-react';

let authTokenGetter: AuthTokenGetter | null = null;

export function setApiAuthTokenGetter(getter: AuthTokenGetter | null): void {
  authTokenGetter = getter;
  setAuthTokenGetter(getter);
}

function isApiRequest(input: RequestInfo | URL): boolean {
  const requestUrl =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

  try {
    const url = new URL(requestUrl, window.location.href);
    return (
      url.origin === window.location.origin &&
      (url.pathname === '/api' || url.pathname.startsWith('/api/'))
    );
  } catch {
    return false;
  }
}

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
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
