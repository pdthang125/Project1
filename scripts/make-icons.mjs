import { PNG } from 'pngjs';
import { createWriteStream } from 'node:fs';
for (const size of [192, 512]) {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (size * y + x) << 2; const border = x < size * .08 || y < size * .08 || x > size * .92 || y > size * .92;
    png.data[i] = border ? 23 : 2; png.data[i + 1] = border ? 33 : 132; png.data[i + 2] = border ? 43 : 199; png.data[i + 3] = 255;
  }
  png.pack().pipe(createWriteStream(`frontend/public/icons/icon-${size}.png`));
}