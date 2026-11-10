import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransportFuture,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { readSetting, writeSetting } from "@/lib/push";
import { safeEqual, sign } from "@/lib/auth";

// Passkeys: unlock with the phone's fingerprint, face or PIN instead of typing the password
// (WebAuthn, verified with @simplewebauthn/server). A passkey is added from Settings while
// signed in; the password keeps working, and is the way back in if a device is lost.
// The public keys live in the `passkeys` Setting (they're not secrets); the challenge each
// ceremony needs travels in a short-lived signed cookie, so nothing is kept between requests.

const KEY = "passkeys";
export const CHALLENGE_COOKIE = "rss_passkey";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_PASSKEYS = 10;

export interface Passkey {
  id: string;
  /** base64url */
  publicKey: string;
  counter: number;
  transports?: string[];
  name: string;
  addedAt: number;
}

export class PasskeyError extends Error {}

async function all(): Promise<Passkey[]> {
  return (await readSetting<{ list: Passkey[] }>(KEY, { list: [] })).list ?? [];
}

export async function listPasskeys() {
  return (await all()).map(({ id, name, addedAt }) => ({ id, name, addedAt }));
}

export async function hasPasskeys() {
  return (await all()).length > 0;
}

export async function removePasskey(id: string) {
  await writeSetting(KEY, { list: (await all()).filter((p) => p.id !== id) });
}

/** Where the request came from, as the browser sees it: the site's address and its host. */
export function relyingParty(request: Request) {
  const forwarded = request.headers.get("x-forwarded-host");
  const host = forwarded ?? request.headers.get("host") ?? new URL(request.url).host;
  const local = /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host);
  const proto = request.headers.get("x-forwarded-proto") ?? (local ? "http" : "https");
  return { origin: `${proto}://${host}`, rpID: host.replace(/:\d+$/, "") };
}

/** The challenge as a cookie value: what was asked, until when, signed. */
export async function sealChallenge(challenge: string) {
  const body = `${challenge}.${Date.now() + CHALLENGE_TTL_MS}`;
  return `${body}.${await sign(`passkey:${body}`)}`;
}

/** The challenge a ceremony was started with, if its cookie is ours and still fresh. */
export async function openChallenge(cookie: string | undefined) {
  const [challenge, expires, signature] = (cookie ?? "").split(".");
  if (!challenge || !expires || !signature || Number(expires) < Date.now()) return null;
  const ok = await safeEqual(signature, await sign(`passkey:${challenge}.${expires}`));
  return ok ? challenge : null;
}

export async function registrationOptions(request: Request) {
  const { rpID } = relyingParty(request);
  const existing = await all();
  if (existing.length >= MAX_PASSKEYS) throw new PasskeyError("Remove a passkey first.");
  return generateRegistrationOptions({
    rpName: "Reader",
    rpID,
    userName: "Reader",
    userDisplayName: "Reader",
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({
      id: p.id,
      transports: p.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
  });
}

export async function register(
  request: Request,
  response: RegistrationResponseJSON,
  challenge: string,
  name: string
) {
  const { origin, rpID } = relyingParty(request);
  const result = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
  }).catch((error: Error) => {
    throw new PasskeyError(error.message);
  });
  if (!result.verified || !result.registrationInfo) {
    throw new PasskeyError("That passkey couldn't be verified.");
  }
  const { credential } = result.registrationInfo;
  const list = (await all()).filter((p) => p.id !== credential.id);
  list.push({
    id: credential.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: response.response.transports,
    name: name.slice(0, 60) || "This device",
    addedAt: Date.now(),
  });
  await writeSetting(KEY, { list });
}

export async function authenticationOptions(request: Request) {
  const { rpID } = relyingParty(request);
  return generateAuthenticationOptions({
    rpID,
    userVerification: "required",
    allowCredentials: (await all()).map((p) => ({
      id: p.id,
      transports: p.transports as AuthenticatorTransportFuture[] | undefined,
    })),
  });
}

/** True when the response is a valid unlock by one of the saved passkeys. */
export async function authenticate(
  request: Request,
  response: AuthenticationResponseJSON,
  challenge: string
) {
  const list = await all();
  const passkey = list.find((p) => p.id === response.id);
  if (!passkey) return false;
  const { origin, rpID } = relyingParty(request);
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    requireUserVerification: true,
    credential: {
      id: passkey.id,
      publicKey: new Uint8Array(Buffer.from(passkey.publicKey, "base64url")),
      counter: passkey.counter,
      transports: passkey.transports as AuthenticatorTransportFuture[] | undefined,
    },
  }).catch(() => null);
  if (!result?.verified) return false;
  passkey.counter = result.authenticationInfo.newCounter;
  await writeSetting(KEY, { list });
  return true;
}
