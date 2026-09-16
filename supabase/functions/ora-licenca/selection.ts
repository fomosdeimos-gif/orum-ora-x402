// Public, signed selection; no payment authorization or private image access.
export type Selection = {
  schema: string; work_id: string; sha256: string; license: string;
  amount: string; network: string; asset: string; pay_to: string;
  issued_at: number; expires_at: number;
};
export const SELECTION_SCHEMA = 'orum-work-selection/v1';
const TTL = 1800;
const encoder = new TextEncoder();
function encode(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('selection_invalid');
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}
export function createSelectionCodec(deps: {
  sign: (bytes: Uint8Array) => Promise<Uint8Array>;
  verify: (signature: Uint8Array, bytes: Uint8Array) => Promise<boolean>;
  now?: () => number;
}) {
  const now = () => Math.floor((deps.now?.() ?? Date.now()) / 1000);
  return {
    async issue(fields: Omit<Selection, 'schema' | 'issued_at' | 'expires_at'>) {
      const issued = now();
      const selection: Selection = { schema: SELECTION_SCHEMA, ...fields, issued_at: issued, expires_at: issued + TTL };
      const bytes = encoder.encode(JSON.stringify(selection));
      return { selection, token: encode(bytes) + '.' + encode(await deps.sign(bytes)) };
    },
    async verify(token: string, expected: { license: string; amount: string; network: string; asset: string; pay_to: string }) {
      if (token.length > 2048) throw new Error('selection_invalid');
      const parts = token.split('.');
      if (parts.length !== 2) throw new Error('selection_invalid');
      try {
        const bytes = decode(parts[0]);
        if (!await deps.verify(decode(parts[1]), bytes)) throw new Error('selection_invalid');
        const s: Selection = JSON.parse(new TextDecoder().decode(bytes));
        if (s.schema !== SELECTION_SCHEMA || !/^[1-9][0-9]*$/.test(s.work_id) || !/^[a-f0-9]{64}$/.test(s.sha256)) throw new Error('selection_invalid');
        if (Object.entries(expected).some(([k, v]) => s[k as keyof Selection] !== v)) throw new Error('selection_mismatch');
        if (!Number.isInteger(s.issued_at) || !Number.isInteger(s.expires_at) || s.expires_at - s.issued_at !== TTL || s.issued_at > now() + 30 || s.expires_at <= now()) throw new Error('selection_expired');
        return s;
      } catch (error) {
        if (error instanceof Error && /^selection_(mismatch|expired)$/.test(error.message)) throw error;
        throw new Error('selection_invalid');
      }
    },
  };
}
