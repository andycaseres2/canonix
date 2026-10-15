/**
 * In-memory stand-in for Supabase Storage used by the tests, mirroring supabase/03_storage.sql:
 * "covers" is public (images up to 5 MB), "content" is private (signed URLs only).
 */

export type BucketName = 'covers' | 'content';
type StoredFile = { bytes: Uint8Array<ArrayBuffer>; contentType: string; size: number };
type Token = { bucket: BucketName; path: string; expires: number };

export const BUCKETS: Record<BucketName, { public: boolean; maxBytes: number | null; mime: RegExp | null }> = {
  covers: { public: true, maxBytes: 5 * 1024 * 1024, mime: /^image\// },
  content: { public: false, maxBytes: null, mime: null },
};

const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000; // Supabase signed upload URLs last two hours

/** Same shapes as Supabase Storage URLs, so app code needs no test-only branches. */
export const MOCK_STORAGE_ORIGIN = 'https://mock.supabase.co/storage/v1';
export const publicObjectUrl = (bucket: string, path: string) => `${MOCK_STORAGE_ORIGIN}/object/public/${bucket}/${path}`;
export const signedObjectUrl = (bucket: string, path: string, token: string) => `${MOCK_STORAGE_ORIGIN}/object/sign/${bucket}/${path}?token=${token}`;
export const signedUploadUrl = (bucket: string, path: string, token: string) => `${MOCK_STORAGE_ORIGIN}/object/upload/sign/${bucket}/${path}?token=${token}`;

export class MockStorage {
  private files = new Map<string, StoredFile>();
  private uploadTokens = new Map<string, Token>();
  private readTokens = new Map<string, Token>();
  /** Buckets whose remove() fails, to test how endpoints report storage errors. */
  failRemove = new Set<BucketName>();

  private key = (bucket: string, path: string) => `${bucket}/${path}`;

  issueUploadToken(bucket: BucketName, path: string) {
    const token = crypto.randomUUID();
    this.uploadTokens.set(token, { bucket, path, expires: Date.now() + UPLOAD_TTL_MS });
    return token;
  }

  /** Stores the body for a signed upload. Returns an error message, or null on success. */
  acceptUpload(token: string, bytes: Uint8Array<ArrayBuffer>, contentType: string): string | null {
    const t = this.uploadTokens.get(token);
    if (!t) return 'Invalid upload token';
    this.uploadTokens.delete(token); // single use
    if (t.expires < Date.now()) return 'Upload token expired';
    const rules = BUCKETS[t.bucket];
    if (rules.maxBytes !== null && bytes.byteLength > rules.maxBytes) return 'File too large for this bucket';
    if (rules.mime && !rules.mime.test(contentType)) return `File type ${contentType || 'unknown'} not allowed in this bucket`;
    this.files.set(this.key(t.bucket, t.path), { bytes, contentType, size: bytes.byteLength });
    return null;
  }

  issueReadToken(bucket: BucketName, path: string, seconds: number) {
    const token = crypto.randomUUID();
    this.readTokens.set(token, { bucket, path, expires: Date.now() + seconds * 1000 });
    return token;
  }

  canRead(bucket: string, path: string, token: string | null) {
    if (BUCKETS[bucket as BucketName]?.public) return true;
    const t = token ? this.readTokens.get(token) : undefined;
    return !!t && t.bucket === bucket && t.path === path && t.expires >= Date.now();
  }

  read(bucket: string, path: string) {
    return this.files.get(this.key(bucket, path)) ?? null;
  }

  /** Files directly inside a folder whose name contains `search`, like Storage's list(). */
  list(bucket: string, dir: string, search: string, limit: number, offset = 0) {
    const prefix = `${bucket}/${dir ? `${dir}/` : ''}`;
    return [...this.files.entries()]
      .map(([key, f]) => ({ name: key.slice(prefix.length), f, key }))
      .filter(({ key, name }) => key.startsWith(prefix) && !name.includes('/') && name.includes(search))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(offset, offset + limit)
      .map(({ name, f }) => ({ name, metadata: { size: f.size, mimetype: f.contentType } }));
  }

  remove(bucket: string, paths: string[]) {
    return paths.filter((p) => this.files.delete(this.key(bucket, p)));
  }

  expireTokensForTest() {
    for (const t of [...this.uploadTokens.values(), ...this.readTokens.values()]) t.expires = 0;
  }
}
