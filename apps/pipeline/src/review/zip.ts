/** Minimal ZIP reader for Unihan.zip (W02-5 Q1 a): stored or deflated entries, read via the central directory. */
import { inflateRawSync } from 'node:zlib';

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

export class ZipError extends Error {}

/** Returns the bytes of the named entry; throws ZipError if the archive or entry is unusable. */
export function readZipEntry(zip: Uint8Array, name: string): Buffer {
  const b = Buffer.from(zip.buffer, zip.byteOffset, zip.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (b.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new ZipError('not a ZIP file (no end-of-directory record)');
  const count = b.readUInt16LE(eocd + 10);
  let p = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (b.readUInt32LE(p) !== CENTRAL) throw new ZipError('corrupt ZIP central directory');
    const method = b.readUInt16LE(p + 10);
    const size = b.readUInt32LE(p + 20);
    const nameLength = b.readUInt16LE(p + 28);
    const extraLength = b.readUInt16LE(p + 30);
    const commentLength = b.readUInt16LE(p + 32);
    const localOffset = b.readUInt32LE(p + 42);
    const entryName = b.toString('utf8', p + 46, p + 46 + nameLength);
    p += 46 + nameLength + extraLength + commentLength;
    if (entryName !== name) continue;
    if (b.readUInt32LE(localOffset) !== LOCAL) throw new ZipError(`corrupt ZIP entry ${name}`);
    const start =
      localOffset + 30 + b.readUInt16LE(localOffset + 26) + b.readUInt16LE(localOffset + 28);
    const data = b.subarray(start, start + size);
    if (method === 0) return Buffer.from(data);
    if (method === 8) return inflateRawSync(data);
    throw new ZipError(`ZIP entry ${name} uses unsupported method ${method}`);
  }
  throw new ZipError(`ZIP entry ${name} not found`);
}
