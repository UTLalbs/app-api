import { computeDiff } from '../../../shared/utils/diff';

interface UserLike {
  displayName: string;
  status: string;
  rfc: string;
  phones: string[];
  updatedAt: Date;
}

describe('computeDiff', () => {
  it('returns null when no allowed field changed', () => {
    const before = { displayName: 'Juan', status: 'active' };
    const after = { displayName: 'Juan', status: 'active' };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['displayName', 'status'],
    });

    expect(result).toBeNull();
  });

  it('returns only fields that changed', () => {
    const before = { displayName: 'Juan', status: 'active' };
    const after = { displayName: 'Juan P.', status: 'active' };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['displayName', 'status'],
    });

    expect(result).toEqual({
      displayName: { old: 'Juan', new: 'Juan P.' },
    });
  });

  it('masks sensitive fields (default set)', () => {
    const before = { rfc: 'ABCD010101XXX', displayName: 'Juan' };
    const after = { rfc: 'XYZW010101YYY', displayName: 'Juan' };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['rfc', 'displayName'],
    });

    expect(result).toEqual({
      rfc: { old: '***', new: '***', isMasked: true },
    });
  });

  it('ignores fields not in allowedFields', () => {
    const before = { displayName: 'A', status: 'active' };
    const after = { displayName: 'B', status: 'inactive' };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['displayName'],
    });

    expect(result).toEqual({
      displayName: { old: 'A', new: 'B' },
    });
    expect(result).not.toHaveProperty('status');
  });

  it('detects array changes by value (same length, different items)', () => {
    const before = { phones: ['+521111'], displayName: 'Juan' };
    const after = { phones: ['+522222'], displayName: 'Juan' };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['phones'],
    });

    expect(result).toEqual({
      phones: { old: ['+521111'], new: ['+522222'] },
    });
  });

  it('treats equal arrays as unchanged', () => {
    const before = { phones: ['+521', '+522'] };
    const after = { phones: ['+521', '+522'] };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['phones'],
    });

    expect(result).toBeNull();
  });

  it('compares Date by timestamp', () => {
    const before = { updatedAt: new Date('2026-01-01T00:00:00Z') };
    const after = { updatedAt: new Date('2026-01-01T00:00:00Z') };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['updatedAt'],
    });

    expect(result).toBeNull();
  });

  it('handles field added (undefined → value)', () => {
    const before = {};
    const after = { displayName: 'Nuevo' };

    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['displayName'],
    });

    expect(result).toEqual({
      displayName: { old: undefined, new: 'Nuevo' },
    });
  });

  it('accepts custom sensitive fields set', () => {
    const before = { displayName: 'A', status: 'x' };
    const after = { displayName: 'B', status: 'y' };

    const custom = new Set(['status']);
    const result = computeDiff<UserLike>(before, after, {
      allowedFields: ['displayName', 'status'],
      sensitiveFields: custom,
    });

    expect(result?.displayName).toEqual({ old: 'A', new: 'B' });
    expect(result?.status).toEqual({ old: '***', new: '***', isMasked: true });
  });
});
