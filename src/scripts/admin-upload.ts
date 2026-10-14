/** Browser helpers for admin uploads: JSON calls to our API and a direct PUT to Storage with progress. */

export type UploadTarget = { uploadUrl: string; headers: Record<string, string>; path: string };

type AppDialog = {
  confirm(o: { title?: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean>;
  alert(o: { title?: string; message: string }): Promise<void>;
};
export const appDialog = () => (window as unknown as { appDialog: AppDialog }).appDialog;

export async function postJson<T = any>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
  return data as T;
}

/** PUTs the file to the signed URL. XMLHttpRequest because fetch cannot report upload progress. */
export function putFile(target: UploadTarget, file: File, onProgress: (fraction: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', target.uploadUrl);
    Object.entries(target.headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `El servidor de archivos respondió ${xhr.status}.`;
      try { message = JSON.parse(xhr.responseText).error ?? JSON.parse(xhr.responseText).message ?? message; } catch {}
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new Error('Se cortó la conexión durante la subida.'));
    xhr.send(file);
  });
}

export const formatBytes = (n: number) =>
  n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : n < 1024 ** 3 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;

/** Reloads the page showing a flash message, like the form endpoints do. */
export function reloadWith(kind: 'ok' | 'error', message: string, hash = '') {
  const u = new URL(location.href);
  u.searchParams.delete('ok');
  u.searchParams.delete('error');
  u.searchParams.set(kind, message);
  u.hash = hash;
  location.assign(u.toString());
}
