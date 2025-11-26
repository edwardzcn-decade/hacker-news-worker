const METADATA_LIMIT_BYTE_LENGTH = 1024;

export function getUtf8BytesLength(str: string):number {
  return new TextEncoder().encode(str).length;
}

export function checkMetaLimit(metadata: unknown): boolean {
  return getUtf8BytesLength(JSON.stringify(metadata)) <= METADATA_LIMIT_BYTE_LENGTH
}