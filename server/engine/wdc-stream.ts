import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';

export async function readGzipLines(source: Readable, onLine: (line: string) => void): Promise<number> {
  const gunzip = createGunzip();
  const lines = createInterface({ input: gunzip, crlfDelay: Infinity });
  let lineCount = 0;
  const consume = (async () => {
    for await (const line of lines) {
      onLine(line);
      lineCount += 1;
    }
  })();
  try {
    await Promise.all([pipeline(source, gunzip), consume]);
    return lineCount;
  } finally {
    lines.close();
  }
}
