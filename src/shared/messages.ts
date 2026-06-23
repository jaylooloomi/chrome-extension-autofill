// Typed message contracts between content script, options/popup pages, and the
// service worker (spec §4). Using a discriminated union keeps both ends honest.
//
// Note: the profile lives in the background/storage (single source of truth),
// so the content script sends only the detected fields — never the profile.

import type { FieldSchema, MappingResponse, Profile } from './types';

export type Msg =
  | { kind: 'MAP_FIELDS'; fields: FieldSchema[]; formSignature: string; url: string; pageLang: string }
  | { kind: 'PARSE_RESUME'; text: string }
  | {
      kind: 'RECORD_CORRECTIONS';
      domain: string;
      formSignature: string;
      /** field.signature -> final confirmed value (or null if left blank). */
      values: Record<string, string | null>;
    };

export type Resp =
  | { ok: true; kind: 'MAP_FIELDS'; map: MappingResponse; fromCache: boolean; fake: boolean }
  | { ok: true; kind: 'PARSE_RESUME'; profile: Profile }
  | { ok: true; kind: 'RECORD_CORRECTIONS' }
  | { ok: false; code: string; message: string };

/** Send a typed message to the service worker and await its typed reply.
 *  Handles the common "extension was reloaded while this page stayed open"
 *  case with a clear, actionable message. */
export async function sendToBackground(msg: Msg): Promise<Resp> {
  // If the extension was reloaded/updated, this stale content script loses its
  // runtime context. chrome.runtime.id becomes undefined.
  if (!chrome.runtime?.id) {
    return { ok: false, code: 'CONTEXT_INVALIDATED', message: 'Autofy was updated — reload this page (F5) and try again.' };
  }
  try {
    return (await chrome.runtime.sendMessage(msg)) as Resp;
  } catch (err) {
    const m = String(err);
    if (m.includes('context invalidated') || m.includes('Receiving end does not exist')) {
      return { ok: false, code: 'CONTEXT_INVALIDATED', message: 'Autofy was updated — reload this page (F5) and try again.' };
    }
    return { ok: false, code: 'CHANNEL', message: m };
  }
}
