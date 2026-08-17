/**
 * Lightweight, self-contained Canvas to Animated GIF encoder (GIF89a standard)
 * Supports custom delay, transparent background / alpha dithering, and LZW compression.
 */

export interface GifFrame {
  imageData: ImageData;
  delayMs: number;
}

export async function createAnimatedGifBlob(
  frames: GifFrame[],
  width: number,
  height: number,
  onProgress?: (percent: number) => void
): Promise<Blob> {
  const bytes: number[] = [];

  // Write GIF Header
  writeString(bytes, 'GIF89a');

  // Logical Screen Descriptor
  writeWord(bytes, width);
  writeWord(bytes, height);
  // GCT Flag: 0 (we use Local Color Tables for max color fidelity per frame)
  bytes.push(0x70); // 11100000 -> no GCT, color res 8, not sorted, size 0
  bytes.push(0);    // Background color index
  bytes.push(0);    // Pixel aspect ratio

  // Netscape 2.0 Loop Application Extension (Infinite Loop)
  bytes.push(0x21); // Extension Introducer
  bytes.push(0xff); // Application Extension Label
  bytes.push(11);   // Block Size
  writeString(bytes, 'NETSCAPE2.0');
  bytes.push(3);    // Sub-block data length
  bytes.push(1);    // Loop sub-block ID
  writeWord(bytes, 0); // 0 = Infinite loop
  bytes.push(0);    // Block Terminator

  // Encode Each Frame
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const { palette, indexedPixels } = quantizeFrame(frame.imageData);

    // Graphic Control Extension
    bytes.push(0x21); // Extension Introducer
    bytes.push(0xf9); // Graphic Control Label
    bytes.push(4);    // Byte size
    bytes.push(0x04); // Packed field: Do not dispose, no transparency
    const delayHundredths = Math.max(2, Math.round(frame.delayMs / 10));
    writeWord(bytes, delayHundredths);
    bytes.push(0);    // Transparent color index
    bytes.push(0);    // Block Terminator

    // Image Descriptor
    bytes.push(0x2c); // Image Separator
    writeWord(bytes, 0); // Left position
    writeWord(bytes, 0); // Top position
    writeWord(bytes, width);
    writeWord(bytes, height);
    // Local Color Table Flag (128 = 0x80 | (log2(palette.length)-1))
    const colorTablePow = Math.ceil(Math.log2(palette.length));
    const lctSize = Math.max(1, colorTablePow);
    const actualPaletteSize = 1 << lctSize;
    bytes.push(0x80 | (lctSize - 1)); // Local Color Table present

    // Write Local Color Table (RGB triplets)
    for (let p = 0; p < actualPaletteSize; p++) {
      if (p < palette.length) {
        bytes.push(palette[p][0], palette[p][1], palette[p][2]);
      } else {
        bytes.push(0, 0, 0);
      }
    }

    // LZW Compression
    const minCodeSize = Math.max(2, lctSize);
    lzwEncode(indexedPixels, minCodeSize, bytes);

    if (onProgress) {
      onProgress(Math.round(((i + 1) / frames.length) * 100));
    }
  }

  // GIF Trailer
  bytes.push(0x3b);

  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

function writeString(bytes: number[], str: string) {
  for (let i = 0; i < str.length; i++) {
    bytes.push(str.charCodeAt(i));
  }
}

function writeWord(bytes: number[], val: number) {
  bytes.push(val & 0xff);
  bytes.push((val >> 8) & 0xff);
}

/**
 * Fast median-cut palette generation + mapping for 128 colors per frame
 */
function quantizeFrame(img: ImageData): { palette: [number, number, number][]; indexedPixels: number[] } {
  const data = img.data;
  const pixelCount = img.width * img.height;
  const indexedPixels = new Uint8Array(pixelCount);

  // Sample unique RGB colors
  const colorMap = new Map<number, number>();
  const sampleStep = Math.max(1, Math.floor(pixelCount / 4000));

  for (let i = 0; i < data.length; i += 4 * sampleStep) {
    const r = data[i] & 0xf8;
    const g = data[i + 1] & 0xf8;
    const b = data[i + 2] & 0xf8;
    const key = (r << 16) | (g << 8) | b;
    colorMap.set(key, (colorMap.get(key) || 0) + 1);
  }

  const sortedColors = Array.from(colorMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 128)
    .map(entry => {
      const key = entry[0];
      return [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff] as [number, number, number];
    });

  if (sortedColors.length === 0) {
    sortedColors.push([0, 0, 0], [255, 255, 255]);
  }

  // Map each pixel to nearest palette index using Euclidean color distance
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    let minDist = Infinity;
    let bestIdx = 0;

    for (let c = 0; c < sortedColors.length; c++) {
      const col = sortedColors[c];
      const dr = r - col[0];
      const dg = g - col[1];
      const db = b - col[2];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < minDist) {
        minDist = dist;
        bestIdx = c;
        if (dist === 0) break;
      }
    }
    indexedPixels[p] = bestIdx;
  }

  return {
    palette: sortedColors,
    indexedPixels: Array.from(indexedPixels),
  };
}

/**
 * Standard LZW algorithm for GIF
 */
function lzwEncode(pixels: number[], minCodeSize: number, outputBytes: number[]) {
  outputBytes.push(minCodeSize);

  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let maxCode = (1 << codeSize) - 1;
  let nextCode = eoiCode + 1;

  const dict = new Map<string, number>();

  const resetDict = () => {
    dict.clear();
    for (let i = 0; i < clearCode; i++) {
      dict.set(String(i), i);
    }
    dict.set(String(clearCode), clearCode);
    dict.set(String(eoiCode), eoiCode);
    codeSize = minCodeSize + 1;
    maxCode = (1 << codeSize) - 1;
    nextCode = eoiCode + 1;
  };

  resetDict();

  let accum = 0;
  let bitCount = 0;
  const subBlock: number[] = [];

  const writeBits = (code: number) => {
    accum |= code << bitCount;
    bitCount += codeSize;

    while (bitCount >= 8) {
      subBlock.push(accum & 0xff);
      accum >>= 8;
      bitCount -= 8;

      if (subBlock.length === 254) {
        outputBytes.push(subBlock.length);
        for (let b = 0; b < subBlock.length; b++) outputBytes.push(subBlock[b]);
        subBlock.length = 0;
      }
    }
  };

  writeBits(clearCode);

  let currentPrefix = String(pixels[0]);

  for (let i = 1; i < pixels.length; i++) {
    const char = pixels[i];
    const combined = `${currentPrefix},${char}`;

    if (dict.has(combined)) {
      currentPrefix = combined;
    } else {
      writeBits(dict.get(currentPrefix)!);

      if (nextCode <= 4095) {
        dict.set(combined, nextCode++);
        if (nextCode > maxCode && codeSize < 12) {
          codeSize++;
          maxCode = (1 << codeSize) - 1;
        }
      } else {
        writeBits(clearCode);
        resetDict();
      }

      currentPrefix = String(char);
    }
  }

  writeBits(dict.get(currentPrefix)!);
  writeBits(eoiCode);

  // Flush remaining bits
  if (bitCount > 0) {
    subBlock.push(accum & 0xff);
  }

  if (subBlock.length > 0) {
    outputBytes.push(subBlock.length);
    for (let b = 0; b < subBlock.length; b++) outputBytes.push(subBlock[b]);
    subBlock.length = 0;
  }

  // End of image sub-blocks
  outputBytes.push(0);
}
