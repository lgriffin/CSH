export function decode(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
