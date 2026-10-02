const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/** ULID-style id: 10 chars of time + 16 chars of randomness. Sorts by creation time. */
export function newId(now: number = Date.now(), rand: () => number = Math.random): string {
  let time = '';
  let t = Math.max(0, Math.floor(now));
  for (let i = 0; i < 10; i++) {
    time = ALPHABET[t % 32] + time;
    t = Math.floor(t / 32);
  }
  let random = '';
  for (let i = 0; i < 16; i++) random += ALPHABET[Math.floor(rand() * 32) % 32];
  return time + random;
}
