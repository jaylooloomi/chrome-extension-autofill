// Typed message contracts between content script, options/popup pages, and the
// service worker (spec §4). Using a discriminated union keeps both ends honest.
//
// Note: the profile lives in the background/storage (single source of truth),
// so the content script sends only the detected fields — never the profile.

import type { FieldSchema, MappingResponse, Profile } from './types';

export type Msg =
  | { kind: 'MAP_FIELDS'; fields: FieldSchema[]; formSignature: string; url: string }
  | { kind: 'PARSE_RESUME'; text: string }
  | {
      kind: 'RECORD_CORRECTIONS';
      domain: string;
      formSignature: string;
      /** field.signature -> final confirmed value (or null if left blank). */
      values: Record<string, string | null>;
    };

export type Resp =
  | { ok: true; kind: 'MAP_FIELDS'; map: MappingResponse; fromCache: boolean }
  | { ok: true; kind: 'PARSE_RESUME'; profile: Profile }
  | { ok: true; kind: 'RECORD_CORRECTIONS' }
  | { ok: false; code: string; message: string };

/** Send a typed message to the service worker and await its typed reply. */
export async function sendToBackground(msg: Msg): Promise<Resp> {
  try {
    return (await chrome.runtime.sendMessage(msg)) as Resp;
  } catch (err) {
    return { ok: false, code: 'CHANNEL', message: String(err) };
  }
}
