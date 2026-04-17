/**
 * Renderer-side device identity — proxies to the main process.
 *
 * The private key lives in the main process (encrypted by Electron's
 * safeStorage); the renderer only ever sees the deviceId and the public key.
 * Signing is delegated via IPC.
 *
 * Backwards-compat: the old v1 renderer stored the full keypair in
 * localStorage. On first launch of this binary we hand that blob to main via
 * `deviceEnsure({migration})` so the user's deviceId is preserved. After a
 * successful migration the legacy key is wiped from localStorage.
 */
import { safeGet, safeSet } from '@/utils/safe-storage'

export type DeviceIdentity = {
  deviceId: string
  publicKey: string
}

const LEGACY_STORAGE_KEY = 'hermes-device-identity-v1'
const MIGRATED_FLAG_KEY = 'hermes-device-identity-v1-migrated'

type LegacyStoredIdentity = {
  version: 1
  deviceId: string
  publicKey: string
  privateKey: string
  createdAtMs: number
}

function readLegacyIdentity(): { publicKey: string; privateKey: string } | null {
  if (safeGet(MIGRATED_FLAG_KEY)) return null
  try {
    const raw = safeGet(LEGACY_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as LegacyStoredIdentity
    if (
      parsed?.version === 1 &&
      typeof parsed.publicKey === 'string' &&
      typeof parsed.privateKey === 'string'
    ) {
      return { publicKey: parsed.publicKey, privateKey: parsed.privateKey }
    }
  } catch {
    // corrupt blob — leave as-is so the user can inspect later
  }
  return null
}

function wipeLegacyIdentity(): void {
  try {
    window.localStorage?.removeItem(LEGACY_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  try {
    safeSet(MIGRATED_FLAG_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

let cachedIdentity: DeviceIdentity | null = null

export async function loadOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  if (cachedIdentity) return cachedIdentity
  const bridge = window.api?.deviceEnsure
  if (!bridge) {
    throw new Error('device identity bridge unavailable')
  }
  const migration = readLegacyIdentity()
  const result = await bridge(migration)
  if (!result?.ok || !result.deviceId || !result.publicKey) {
    throw new Error(result?.error || 'device identity bootstrap failed')
  }
  // Only wipe the legacy blob after we confirm main has persisted an identity
  // (either by migrating ours or by generating a fresh one). If migration
  // actually succeeded the deviceId will equal the legacy one; if not, main
  // generated a fresh key — in either case the legacy copy is now redundant.
  if (migration) wipeLegacyIdentity()
  cachedIdentity = { deviceId: result.deviceId, publicKey: result.publicKey }
  return cachedIdentity
}

/**
 * Sign `payload` using the main-process private key. The renderer never sees
 * the key material.
 */
export async function signDevicePayload(payload: string): Promise<string> {
  const bridge = window.api?.deviceSign
  if (!bridge) throw new Error('device signing bridge unavailable')
  const result = await bridge(payload)
  if (!result?.ok || !result.signature) {
    throw new Error(result?.error || 'signing failed')
  }
  return result.signature
}
