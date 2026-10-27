import { describe, it, expect } from 'vitest';
import { fieldsFor } from './properties';
import { typeIcon, typeWord } from './designer-model';
import { problemTitle } from '../problem-list';
import { ReportPage } from '../report-page';
import { ApprovalSigner, Problem } from '../report-studio.model';

/**
 * MIG-428 (ZT-I30): the Approver's signature -- whose own signature the approval places -- in the designer's palette words,
 * its settings (whose signature, a stamp beside it, never a picture of its own), the template check's title, and the
 * report page's words for what the approval placed.
 */
const definitions = {
  style: {},
  approverSignatureComponent: { properties: { id: {}, type: {}, approver: { enum: ['first', 'second'] }, name: { type: 'string', maxLength: 120 },
    stampRef: { type: 'string' }, width: { type: 'string' }, align: { enum: ['left', 'center', 'right'] }, caption: { type: 'string', maxLength: 120 },
    placement: { enum: ['inline', 'end'] }, style: { $ref: '#/definitions/style' } } },
  signatureComponent: { properties: { id: {}, type: {}, assetRef: { type: 'string' }, stampRef: { type: 'string' } } },
};

describe("MIG-428 the approver's signature", () => {
  it('is named for whoever approves, with a shield', () => {
    expect(typeWord('approverSignature')).toBe("Approver's signature");
    expect(typeIcon('approverSignature')).toBe('shield');
    expect(typeWord('signature')).toBe('Signature (fixed person)');
  });

  it('asks whose signature in words, offers a stamp beside it and no picture of its own', () => {
    const f = fieldsFor('approverSignature', definitions);
    const approver = f.find(x => x.key === 'approver')!;
    expect(approver.kind).toBe('enum');
    expect(approver.label).toBe('Whose signature');
    expect(approver.optionLabels).toEqual({ first: 'The approver (the first of two)', second: 'The second approver' });
    expect(approver.defaultLabel).toBe('Default (the approver)');
    expect(approver.hint).toContain('own latest approved signature');
    expect(approver.hint).toContain('Signed digitally');
    const stamp = f.find(x => x.key === 'stampRef')!;
    expect(stamp.kind).toBe('asset');
    expect(stamp.hint).toContain('workspace stamp');
    expect(f.some(x => x.key === 'assetRef')).toBe(false);
  });

  it("says a fixed signature is always that person's", () => {
    const sig = fieldsFor('signature', definitions).find(x => x.key === 'assetRef')!;
    expect(sig.label).toBe('Signature');
    expect(sig.hint).toContain("Approver's signature");
  });

  it("titles the template check's warning", () => {
    const p = { code: 'FIXED_SIGNATURE_NEAR_APPROVAL', severity: 'WARNING', message: 'x' } as unknown as Problem;
    expect(problemTitle(p)).toBe("One person's signature beside an approval");
  });

  it('says on the report page whose signature the approval placed, and how', () => {
    const words = (s: Partial<ApprovalSigner>) => ReportPage.prototype.signerWords.call({}, { slot: 1, userId: 1, signature: 'ASSET', ...s } as ApprovalSigner);
    expect(words({ assetVersion: 2 })).toBe("approver's own signature (v2)");
    expect(words({ signature: 'TYPED' })).toBe("approver's typed name, signed digitally (no signature of their own)");
    expect(words({ slot: 2 })).toBe("second approver's own signature");
  });
});
