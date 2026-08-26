/**
 * The Expo push API, as much of it as section 18 needs.
 *
 * BUILD-SPEC 2.1 fixes the transport: "expo-notifications with FCM (Android)
 * and APNs (iOS). Tokens stored server side." So the academy holds no FCM
 * server key and no APNs certificate of its own — Expo holds those, and this
 * is the one HTTP surface between the database and a phone.
 *
 * Two calls, and the second is the reason `push_deliveries` exists:
 *
 *   send        → a ticket per message, immediately
 *   getReceipts → the delivery outcome per ticket, minutes later
 *
 * Both can report `DeviceNotRegistered`, which is the death section 18 tells
 * us to act on: "dead tokens returned by Expo's receipt API are deleted".
 *
 * Free of Deno APIs beyond `fetch`, which Node has too, so this file
 * typechecks with the rest of the repository.
 */

const SEND_URL = 'https://exp.host/--/api/v2/push/send';
const RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

/** Expo's documented limits: 100 messages per send, 1000 ids per receipt call. */
export const SEND_CHUNK_SIZE = 100;
export const RECEIPT_CHUNK_SIZE = 1000;

export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  /** What the tap handler reads. See `src/features/notifications/deepLinks.ts`. */
  data: Record<string, string>;
  sound: 'default';
  /** Android needs a channel; iOS ignores it. */
  channelId: string;
  priority: 'high';
}

export interface TicketResult {
  token: string;
  ticketId: string;
  status: 'ok' | 'error';
  error: string;
}

export interface ReceiptResult {
  ticketId: string;
  status: 'ok' | 'error';
  error: string;
}

interface ExpoTicket {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

/**
 * Sends every message and returns one ticket per message, in request order.
 *
 * Expo answers positionally, so a shorter response than the batch would
 * silently reattribute tickets to the wrong tokens. A batch that comes back
 * the wrong length is therefore treated as a transport failure and thrown,
 * which releases the job's claim rather than recording nonsense against real
 * phones.
 */
export async function sendExpoMessages(messages: readonly ExpoMessage[]): Promise<TicketResult[]> {
  const results: TicketResult[] = [];

  for (const batch of chunk(messages, SEND_CHUNK_SIZE)) {
    const response = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      throw new Error(`expo_send_failed_${String(response.status)}`);
    }

    const payload = (await response.json()) as { data?: ExpoTicket[] };
    const tickets = payload.data;
    if (!Array.isArray(tickets) || tickets.length !== batch.length) {
      throw new Error('expo_send_malformed_response');
    }

    tickets.forEach((ticket, index) => {
      const message = batch[index];
      if (message === undefined) return;
      results.push({
        token: message.to,
        ticketId: ticket.id ?? '',
        status: ticket.status === 'ok' ? 'ok' : 'error',
        error:
          ticket.details?.error ?? (ticket.status === 'ok' ? '' : (ticket.message ?? 'unknown')),
      });
    });
  }

  return results;
}

/**
 * Asks for the receipts of tickets already sent.
 *
 * Expo answers as a map keyed by ticket id and omits the ones it has no answer
 * for yet, which is exactly the shape `settle_push_receipts` wants: what is
 * absent stays unchecked and is asked about again next time.
 *
 * A failed receipt request is not fatal. The tickets stay unchecked and the
 * next invocation retries; losing a whole push over a cleanup call would be
 * the wrong trade.
 */
export async function fetchExpoReceipts(ticketIds: readonly string[]): Promise<ReceiptResult[]> {
  const results: ReceiptResult[] = [];

  for (const batch of chunk(ticketIds, RECEIPT_CHUNK_SIZE)) {
    const response = await fetch(RECEIPTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ids: batch }),
    });

    if (!response.ok) continue;

    const payload = (await response.json()) as { data?: Record<string, ExpoTicket> };
    const receipts = payload.data;
    if (receipts === undefined || receipts === null) continue;

    for (const [ticketId, receipt] of Object.entries(receipts)) {
      results.push({
        ticketId,
        status: receipt.status === 'ok' ? 'ok' : 'error',
        error:
          receipt.details?.error ?? (receipt.status === 'ok' ? '' : (receipt.message ?? 'unknown')),
      });
    }
  }

  return results;
}
