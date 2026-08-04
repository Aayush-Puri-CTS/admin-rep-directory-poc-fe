import { describe, expect, it } from 'vitest';
import { allow, deny } from '../src/policy.js';

describe('policy responses', () => {
  it('allow() returns isAuthorized true with the given context', () => {
    expect(allow({ tenantId: 'corenroll', role: 'admin', partyId: 'party-1' })).toEqual({
      isAuthorized: true,
      context: { tenantId: 'corenroll', role: 'admin', partyId: 'party-1' },
    });
  });

  it('deny() returns isAuthorized false with an empty, non-leaking context', () => {
    expect(deny()).toEqual({
      isAuthorized: false,
      context: { tenantId: '', role: '', partyId: '' },
    });
  });
});
