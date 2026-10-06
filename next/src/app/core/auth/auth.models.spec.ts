import { roleLabel } from './auth.models';

describe('roleLabel', () => {
  it('names each role in words, sentence case, never by its enum', () => {
    expect(roleLabel('PLATFORM_ADMIN')).toBe('Platform administrator');
    expect(roleLabel('TENANT_ADMIN')).toBe('Tenant administrator');
    expect(roleLabel('TENANT_USER')).toBe('Tenant user');
  });

  it('says so when there is no role rather than printing nothing', () => {
    expect(roleLabel(undefined)).toBe('Unknown role');
    expect(roleLabel('')).toBe('Unknown role');
  });

  it('turns a role it does not know into words instead of showing the raw name', () => {
    expect(roleLabel('BILLING_CLERK')).toBe('Billing clerk');
  });
});
