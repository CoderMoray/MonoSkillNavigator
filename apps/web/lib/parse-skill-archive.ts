import {
  parseSkillFrontmatterHints,
  resolveZipSkillEntryPath,
  type SkillFrontmatterHints
} from "@skill-platform/skill-spec/skill-format";

const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

interface ZipEntryRecord {
  name: string;
  compressionMethod: number;
  localHeaderOffset: number;
  compressedSize: number;
}

export async function readSkillFrontmatterFromZip(file: File): Promise<SkillFrontmatterHints | null> {
  const buffer = await file.arrayBuffer();
  const entries = listZipEntries(buffer);
  const paths = entries.map((entry) => entry.name);
  const entryPath = resolveZipSkillEntryPath(paths);
  if (!entryPath) {
    return null;
  }

  const entry = entries.find((item) => item.name === entryPath);
  if (!entry) {
    return null;
  }

  const content = await readZipEntryText(buffer, entry);
  return parseSkillFrontmatterHints(content);
}

function listZipEntries(buffer: ArrayBuffer): ZipEntryRecord[] {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocdOffset = findEndOfCentralDirectory(view, bytes.length);
  if (eocdOffset < 0) {
    return listZipEntriesFromLocalHeaders(view, bytes);
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const entries: ZipEntryRecord[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount && offset + 46 <= bytes.length; index += 1) {
    if (view.getUint32(offset, true) !== CENTRAL_DIRECTORY_SIGNATURE) {
      break;
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraFieldLength = view.getUint16(offset + 30, true);
    const fileCommentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const nameStart = offset + 46;
    const name = new TextDecoder()
      .decode(bytes.subarray(nameStart, nameStart + fileNameLength))
      .replace(/\\/g, "/");

    if (!name.endsWith("/")) {
      entries.push({
        name,
        compressionMethod,
        localHeaderOffset,
        compressedSize
      });
    }

    offset = nameStart + fileNameLength + extraFieldLength + fileCommentLength;
  }

  return entries.length > 0 ? entries : listZipEntriesFromLocalHeaders(view, bytes);
}

function findEndOfCentralDirectory(view: DataView, length: number): number {
  const minimumOffset = Math.max(0, length - 22 - 65_535);
  for (let offset = length - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  return -1;
}

function listZipEntriesFromLocalHeaders(view: DataView, bytes: Uint8Array): ZipEntryRecord[] {
  const entries: ZipEntryRecord[] = [];
  let offset = 0;

  while (offset + 30 <= bytes.length) {
    if (view.getUint32(offset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
      offset += 1;
      continue;
    }

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const fileNameLength = view.getUint16(offset + 26, true);
    const extraFieldLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;

    if (nameStart + fileNameLength > bytes.length) {
      break;
    }

    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + fileNameLength)).replace(/\\/g, "/");
    const dataStart = nameStart + fileNameLength + extraFieldLength;
    const dataEnd = dataStart + compressedSize;

    if (dataEnd > bytes.length) {
      break;
    }

    if (!name.endsWith("/")) {
      entries.push({
        name,
        compressionMethod,
        localHeaderOffset: offset,
        compressedSize
      });
    }

    offset = dataEnd;
  }

  return entries;
}

async function readZipEntryText(buffer: ArrayBuffer, entry: ZipEntryRecord): Promise<string> {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const localOffset = entry.localHeaderOffset;

  if (view.getUint32(localOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw new Error("Invalid zip local header");
  }

  const fileNameLength = view.getUint16(localOffset + 26, true);
  const extraFieldLength = view.getUint16(localOffset + 28, true);
  const dataStart = localOffset + 30 + fileNameLength + extraFieldLength;
  const dataEnd = dataStart + entry.compressedSize;
  const compressed = bytes.subarray(dataStart, dataEnd);
  return decodeZipPayload(compressed, entry.compressionMethod);
}

async function decodeZipPayload(data: Uint8Array, compressionMethod: number): Promise<string> {
  if (compressionMethod === 0) {
    return new TextDecoder().decode(data);
  }

  if (compressionMethod === 8) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("当前浏览器不支持 deflate 解压，请更换浏览器后重试");
    }

    const stream = new DecompressionStream("deflate-raw");
    const writer = stream.writable.getWriter();
    await writer.write(new Uint8Array(data));
    await writer.close();

    const chunks: Uint8Array[] = [];
    const reader = stream.readable.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (value) {
        chunks.push(value);
      }
    }

    const length = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const merged = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(merged);
  }

  throw new Error(`Unsupported zip compression method: ${compressionMethod}`);
}
