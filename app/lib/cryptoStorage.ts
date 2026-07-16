const DB_NAME = "PCHCryptoDb";
const STORE_NAME = "keys";
const KEY_ID = "encryption_key";

function getCryptoKey(): Promise<CryptoKey> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(KEY_ID);

      getReq.onsuccess = async () => {
        let key = getReq.result as CryptoKey | undefined;
        if (key) {
          resolve(key);
        } else {
          try {
            // Generate non-extractable 256-bit AES-GCM key bound to IndexedDB scope
            key = await window.crypto.subtle.generateKey(
              {
                name: "AES-GCM",
                length: 256,
              },
              false, // extractable = false (prevents extraction)
              ["encrypt", "decrypt"]
            );
            const putTx = db.transaction(STORE_NAME, "readwrite");
            const putStore = putTx.objectStore(STORE_NAME);
            putStore.put(key, KEY_ID);
            resolve(key);
          } catch (e) {
            reject(e);
          }
        }
      };

      getReq.onerror = () => {
        reject(getReq.error);
      };
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function bufToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export async function encryptAndSave(keyName: string, data: unknown): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const key = await getCryptoKey();
    const payload = {
      data,
      timestamp: Date.now(),
    };
    const encoder = new TextEncoder();
    const encoded = encoder.encode(JSON.stringify(payload));

    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encoded
    );

    const storageObj = {
      iv: bufToHex(iv.buffer),
      ciphertext: bufToHex(encrypted),
    };

    localStorage.setItem(keyName, JSON.stringify(storageObj));
  } catch (error) {
    console.error("Autosave encryption failed:", error);
  }
}

export async function getAndDecrypt(keyName: string): Promise<unknown | null> {
  if (typeof window === "undefined") return null;

  try {
    const raw = localStorage.getItem(keyName);
    if (!raw) return null;

    const { iv: ivHex, ciphertext: cipherHex } = JSON.parse(raw);
    if (!ivHex || !cipherHex) return null;

    const key = await getCryptoKey();
    const iv = new Uint8Array(hexToBuf(ivHex));
    const ciphertext = hexToBuf(cipherHex);

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    const decoded = decoder.decode(decrypted);
    const parsed = JSON.parse(decoded);

    // TTL check (24 hours data minimization)
    const TTL = 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.timestamp > TTL) {
      console.warn(`Autosave data for key ${keyName} has expired.`);
      localStorage.removeItem(keyName);
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.error("Autosave decryption failed:", error);
    // Gracefully purge corrupt data
    try {
      localStorage.removeItem(keyName);
    } catch {}
    return null;
  }
}
