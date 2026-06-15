import {
  createHash,
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  scryptSync
} from 'node:crypto'
import { BIP39_WORDLIST } from './wordlist'

// The cryptographic core of the sensitive folder (Part 11). Pure and
// self-tested, like the ICS builder — no database, no I/O. The design is
// envelope encryption: a random 256-bit Data Encryption Key (DEK) encrypts
// every file with AES-256-GCM; the DEK itself is stored wrapped by a
// passcode-derived key and (separately) a recovery-phrase-derived key, so
// changing the passcode or recovering only re-wraps the DEK — files are
// never re-encrypted.

export const KEY_BYTES = 32 // AES-256
export const SALT_BYTES = 16
const IV_BYTES = 12 // 96-bit GCM nonce
const TAG_BYTES = 16

// scrypt parameters for the passcode KDF: memory-hard (~128 MiB at N=2^17),
// materially stronger against GPU/ASIC cracking than PBKDF2. maxmem must be
// raised above Node's 32 MiB default or scrypt refuses to run.
const SCRYPT = { N: 2 ** 17, r: 8, p: 1, maxmem: 300 * 1024 * 1024 } as const

// --- key derivation ---

// Passcode → key. Low-entropy input, so this is deliberately slow and
// memory-hard. The salt is stored per-vault.
export function deriveKeyFromPasscode(passcode: string, salt: Buffer): Buffer {
  return scryptSync(passcode.normalize('NFKC'), salt, KEY_BYTES, SCRYPT)
}

// Recovery entropy → key. The mnemonic's 256 bits are already uniform, so a
// fast HKDF (not a slow password KDF) is the right tool; the salt domain-
// separates it from any other use of the same entropy.
export function deriveKeyFromEntropy(entropy: Buffer, salt: Buffer): Buffer {
  return Buffer.from(
    hkdfSync('sha256', entropy, salt, Buffer.from('kaseki-vault-recovery'), KEY_BYTES)
  )
}

export function randomKey(): Buffer {
  return randomBytes(KEY_BYTES)
}

export function randomSalt(): Buffer {
  return randomBytes(SALT_BYTES)
}

// --- AES-256-GCM ---

// Encrypts and returns a single self-describing buffer: iv || tag || ciphertext.
// A fresh random IV is generated per call; never reuse a (key, IV) pair.
export function seal(key: Buffer, plaintext: Buffer, aad?: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  if (aad) cipher.setAAD(aad)
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ct])
}

// Decrypts a buffer produced by seal(). Throws if the key is wrong or the
// data was tampered with (the GCM tag fails) — this is also how a wrong
// passcode is detected on unlock.
export function open(key: Buffer, packed: Buffer, aad?: Buffer): Buffer {
  const iv = packed.subarray(0, IV_BYTES)
  const tag = packed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES)
  const ct = packed.subarray(IV_BYTES + TAG_BYTES)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  if (aad) decipher.setAAD(aad)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(ct), decipher.final()])
}

// open() that returns null instead of throwing — for the unlock path, where a
// failure means "wrong passcode" rather than an error to surface.
export function tryOpen(key: Buffer, packed: Buffer, aad?: Buffer): Buffer | null {
  try {
    return open(key, packed, aad)
  } catch {
    return null
  }
}

// --- BIP-39 mnemonic (24 words / 256-bit entropy) ---

function bytesToBits(bytes: Buffer): string {
  let bits = ''
  for (const b of bytes) bits += b.toString(2).padStart(8, '0')
  return bits
}

export function entropyToMnemonic(entropy: Buffer): string {
  const csLen = (entropy.length * 8) / 32
  const csBits = bytesToBits(createHash('sha256').update(entropy).digest()).slice(0, csLen)
  const bits = bytesToBits(entropy) + csBits
  const words: string[] = []
  for (let i = 0; i < bits.length; i += 11) {
    words.push(BIP39_WORDLIST[parseInt(bits.slice(i, i + 11), 2)])
  }
  return words.join(' ')
}

// Parses a mnemonic back to its entropy, throwing if a word is unknown or the
// checksum doesn't match. Whitespace and case are normalised.
export function mnemonicToEntropy(mnemonic: string): Buffer {
  const words = mnemonic.trim().toLowerCase().split(/\s+/)
  if (words.length < 12 || words.length % 3 !== 0) throw new Error('invalid mnemonic length')
  let bits = ''
  for (const w of words) {
    const idx = BIP39_WORDLIST.indexOf(w)
    if (idx === -1) throw new Error(`invalid mnemonic word: ${w}`)
    bits += idx.toString(2).padStart(11, '0')
  }
  const csLen = bits.length / 33
  const entBits = bits.slice(0, bits.length - csLen)
  const csBits = bits.slice(bits.length - csLen)
  const entropy = Buffer.alloc(entBits.length / 8)
  for (let i = 0; i < entropy.length; i++) {
    entropy[i] = parseInt(entBits.slice(i * 8, i * 8 + 8), 2)
  }
  const expected = bytesToBits(createHash('sha256').update(entropy).digest()).slice(0, csLen)
  if (csBits !== expected) throw new Error('invalid mnemonic checksum')
  return entropy
}

export function validateMnemonic(mnemonic: string): boolean {
  try {
    mnemonicToEntropy(mnemonic)
    return true
  } catch {
    return false
  }
}

// A fresh 24-word recovery phrase from 256 bits of entropy.
export function generateMnemonic(): string {
  return entropyToMnemonic(randomBytes(32))
}
