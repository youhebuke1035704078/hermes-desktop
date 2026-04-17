/**
 * Main-process Ed25519 device identity.
 *
 * The private key never leaves this process: renderer code obtains the public
 * half + deviceId via IPC and delegates signing back to main. Storage uses
 * Electron's safeStorage (OS-keychain-backed encryption) when available,
 * falling back to plain JSON in userData when the OS has no keychain.
 *
 * Migration: the old v1 client stored the raw 32-byte Ed25519 seed in
 * renderer-side localStorage (plaintext). `ensureDeviceIdentity()` accepts an
 * optional v1 blob so the renderer can hand over the existing key on first
 * launch of the new binary; successful import preserves the user's deviceId.
 */
import { app, safeStorage } from 'electron'
import { generateKeyPairSync, createPrivateKey, sign as cryptoSign, createHash, KeyObject } from 'crypto'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

interface Jwk {
  kty: 'OKP'
  crv: 'Ed25519'
  x: string
  d: string
}

interface StoredIdentity {
  version: 2
  jwk: Jwk
  /** SHA-256 hex of the raw 32-byte public key — stable across reboots. */
  deviceId: string
  createdAtMs: number
}

let cached: StoredIdentity | null = null
let cachedPrivateKey: KeyObject | null = null

function b64uDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function b64uEncode(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fingerprint(rawPublicKey: Buffer): string {
  return createHash('sha256').update(rawPublicKey).digest('hex')
}

function identityFilePath(): string {
  return join(app.getPath('userData'), 'device-identity.enc')
}

async function loadFromDisk(): Promise<StoredIdentity | null> {
  try {
    const raw = await readFile(identityFilePath())
    const decrypted = safeStorage.isEncryptionAvailable()
      ? safeStorage.decryptString(raw)
      : raw.toString('utf-8')
    const parsed = JSON.parse(decrypted) as StoredIdentity
    if (
      parsed?.version === 2 &&
      parsed.jwk?.kty === 'OKP' &&
      parsed.jwk.crv === 'Ed25519' &&
      typeof parsed.jwk.d === 'string' &&
      typeof parsed.jwk.x === 'string' &&
      typeof parsed.deviceId === 'string'
    ) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

async function saveToDisk(identity: StoredIdentity): Promise<void> {
  const json = JSON.stringify(identity)
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(json)
    : Buffer.from(json, 'utf-8')
  const file = identityFilePath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, payload, { mode: 0o600 })
}

function jwkToPrivateKey(jwk: Jwk): KeyObject {
  return createPrivateKey({ key: jwk as unknown as Record<string, unknown>, format: 'jwk' })
}

function generateIdentity(): StoredIdentity {
  const kp = generateKeyPairSync('ed25519')
  const priv = kp.privateKey.export({ format: 'jwk' }) as Jwk
  if (!priv.d || !priv.x) throw new Error('generateKeyPair did not yield JWK d/x')
  return {
    version: 2,
    jwk: { kty: 'OKP', crv: 'Ed25519', x: priv.x, d: priv.d },
    deviceId: fingerprint(b64uDecode(priv.x)),
    createdAtMs: Date.now(),
  }
}

function validateMigration(publicKey: string, privateKey: string): Jwk | null {
  try {
    const pubRaw = b64uDecode(publicKey)
    const privRaw = b64uDecode(privateKey)
    if (pubRaw.length !== 32 || privRaw.length !== 32) return null
    const jwk: Jwk = { kty: 'OKP', crv: 'Ed25519', x: publicKey, d: privateKey }
    // Test-sign to confirm the key is usable AND the public/private halves match.
    const key = jwkToPrivateKey(jwk)
    cryptoSign(null, Buffer.from('migration-test'), key)
    return jwk
  } catch {
    return null
  }
}

/**
 * Ensure a device identity exists. On first launch of a new binary the caller
 * may supply `migration` (from renderer-side v1 storage) to preserve the
 * user's existing deviceId across the storage-location change.
 */
export async function ensureDeviceIdentity(
  migration?: { publicKey: string; privateKey: string } | null,
): Promise<{ deviceId: string; publicKey: string; encrypted: boolean }> {
  if (cached) {
    return {
      deviceId: cached.deviceId,
      publicKey: cached.jwk.x,
      encrypted: safeStorage.isEncryptionAvailable(),
    }
  }
  const existing = await loadFromDisk()
  if (existing) {
    cached = existing
    return {
      deviceId: existing.deviceId,
      publicKey: existing.jwk.x,
      encrypted: safeStorage.isEncryptionAvailable(),
    }
  }
  if (migration) {
    const validated = validateMigration(migration.publicKey, migration.privateKey)
    if (validated) {
      const imported: StoredIdentity = {
        version: 2,
        jwk: validated,
        deviceId: fingerprint(b64uDecode(validated.x)),
        createdAtMs: Date.now(),
      }
      await saveToDisk(imported)
      cached = imported
      return {
        deviceId: imported.deviceId,
        publicKey: imported.jwk.x,
        encrypted: safeStorage.isEncryptionAvailable(),
      }
    }
  }
  const fresh = generateIdentity()
  await saveToDisk(fresh)
  cached = fresh
  return {
    deviceId: fresh.deviceId,
    publicKey: fresh.jwk.x,
    encrypted: safeStorage.isEncryptionAvailable(),
  }
}

export async function signDevicePayload(payload: string): Promise<string> {
  if (!cached) await ensureDeviceIdentity()
  if (!cached) throw new Error('device identity unavailable')
  if (!cachedPrivateKey) cachedPrivateKey = jwkToPrivateKey(cached.jwk)
  const sig = cryptoSign(null, Buffer.from(payload, 'utf-8'), cachedPrivateKey)
  return b64uEncode(sig)
}
