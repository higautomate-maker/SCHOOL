/** Small, user-owned profile images only; never external image URLs or SVG. */
export function validProfilePhoto(photo: unknown): photo is string | null {
  if (photo === null) return true;
  if (typeof photo !== 'string' || photo.length > 400000 ||
      !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(photo)) return false;
  const encoded = photo.split(',')[1];
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.toString('base64') !== encoded) return false;
  return (photo.startsWith('data:image/jpeg;') && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (photo.startsWith('data:image/png;') && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])));
}

export async function boundedPhotoBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError('Missing body');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 400100) { await reader.cancel(); throw new RangeError('Photo too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}
