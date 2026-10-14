import { describe, expect, it } from 'vitest';
import { ADMIN, PREMIUM, READER, as, fixture } from './fixture';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('mock storage', () => {
  it('admins get a signed upload url; the token accepts one upload', async () => {
    const db = fixture();
    const { data, error } = await as(db, ADMIN).storage.from('content').createSignedUploadUrl('asm/1.cbz');
    expect(error).toBeNull();
    expect(data!.signedUrl).toBe(`https://mock.supabase.co/storage/v1/object/upload/sign/content/asm/1.cbz?token=${data!.token}`);
    
    expect(db.storage.acceptUpload(data!.token, bytes('PK..'), 'application/zip')).toBeNull();
    expect(db.storage.read('content', 'asm/1.cbz')).toMatchObject({ contentType: 'application/zip', size: 4 });
    expect(db.storage.acceptUpload(data!.token, bytes('again'), 'application/zip')).toMatch(/token/i);
  });

  it('non admins cannot get upload urls', async () => {
    const { data, error } = await as(fixture(), READER).storage.from('covers').createSignedUploadUrl('x.png');
    expect(data).toBeNull();
    expect(error?.message).toMatch(/row-level security/);
  });

  it('rejects unknown and expired tokens', async () => {
    const db = fixture();
    expect(db.storage.acceptUpload('nope', bytes('x'), 'image/png')).toMatch(/token/i);
    const { data } = await as(db, ADMIN).storage.from('covers').createSignedUploadUrl('a.png');
    db.storage.expireTokensForTest();
    expect(db.storage.acceptUpload(data!.token, bytes('x'), 'image/png')).toMatch(/expired/i);
  });

  it('covers have public urls; content needs a signed url', async () => {
    const db = fixture();
    const sb = as(db, ADMIN);
    expect(sb.storage.from('covers').getPublicUrl('asm/cover.webp').data.publicUrl)
      .toBe('https://mock.supabase.co/storage/v1/object/public/covers/asm/cover.webp');
    const { data } = await sb.storage.from('content').createSignedUrl('asm/1.cbz', 60);
    expect(data!.signedUrl).toMatch(/^https:\/\/mock\.supabase\.co\/storage\/v1\/object\/sign\/content\/asm\/1\.cbz\?token=/);
    const token = new URL(data!.signedUrl, 'http://x').searchParams.get('token')!;
    expect(db.storage.canRead('content', 'asm/1.cbz', token)).toBe(true);
    expect(db.storage.canRead('content', 'asm/1.cbz', null)).toBe(false);
    expect(db.storage.canRead('covers', 'asm/cover.webp', null)).toBe(true);
  });

  it('only admins can remove files', async () => {
    const db = fixture();
    const { data } = await as(db, ADMIN).storage.from('covers').createSignedUploadUrl('a.png');
    db.storage.acceptUpload(data!.token, bytes('img'), 'image/png');
    await as(db, READER).storage.from('covers').remove(['a.png']);
    expect(db.storage.read('covers', 'a.png')).not.toBeNull();
    await as(db, ADMIN).storage.from('covers').remove(['a.png']);
    expect(db.storage.read('covers', 'a.png')).toBeNull();
  });

  it('rejects files over the bucket size limit', async () => {
    const db = fixture();
    const { data } = await as(db, ADMIN).storage.from('covers').createSignedUploadUrl('big.png');
    expect(db.storage.acceptUpload(data!.token, new Uint8Array(6 * 1024 * 1024), 'image/png')).toMatch(/too large/i);
  });

  it('rejects covers that are not images', async () => {
    const db = fixture();
    const { data } = await as(db, ADMIN).storage.from('covers').createSignedUploadUrl('x.pdf');
    expect(db.storage.acceptUpload(data!.token, bytes('%PDF'), 'application/pdf')).toMatch(/not allowed/i);
  });

  it('readers sign content files only within the plan of a title that has them (rutas_content_read)', async () => {
    const db = fixture();
    db.tables.units.find((u) => u.id === 'u1')!.file_path = 'asm/00001-1.cbz';
    db.tables.units.find((u) => u.id === 'u4')!.file_path = 'naruto/00001-1.mp4';
    const sign = async (uid: string | null, path: string) => (await as(db, uid).storage.from('content').createSignedUrl(path, 60)).error === null;
    expect(await sign(READER, 'asm/00001-1.cbz')).toBe(true);
    expect(await sign(READER, 'naruto/00001-1.mp4')).toBe(false);
    expect(await sign(PREMIUM, 'naruto/00001-1.mp4')).toBe(true);
    expect(await sign(null, 'asm/00001-1.cbz')).toBe(false);
    expect(await sign(PREMIUM, 'orphan/x.cbz')).toBe(false);
    expect(await sign(ADMIN, 'orphan/x.cbz')).toBe(true);
  });
});
