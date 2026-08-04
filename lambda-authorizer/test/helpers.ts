/** Builds a syntactically-valid, unsigned-looking JWT string for tests that only decode claims
 * (peekIssuer) rather than verify a signature. Never use this to test verifyAgainstTenant. */
export function fakeJwt(payload: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT' }): string {
  const encode = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.fake-signature`;
}
