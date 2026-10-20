import { fieldLabel, imageKeyOf, reviewFields } from './run-review-card';

describe('Run review card (owner 2026-10-20)', () => {
  const row = {
    image_id: 'breast-us-011', key: 'intake/2026/10/19/x-breast-us-011.png', image_key: 'datasets/breast-ultrasound/images/breast-us-011.png',
    mask_key: 'datasets/breast-ultrasound/masks/breast-us-011-mask.png', true_label: 'benign', finding: 'suspicious for malignancy',
    match: 'no', urgency: 'review first', confidence: 'medium', description: 'An irregular hypoechoic mass.', status: 'DRAFT', lesion_area_pct: '8.61',
  };

  it('names fields the way a person reads them', () => {
    expect(fieldLabel('predicted_label')).toBe('Predicted label');
    expect(fieldLabel('imageQuality')).toBe('Image quality');
  });

  it('shows the image a field names, not its mask nor the inbox copy when there is a better one', () => {
    expect(imageKeyOf(row)).toBe('datasets/breast-ultrasound/images/breast-us-011.png');
    expect(imageKeyOf({ scan: 'a/b/xray-001.jpg', mask_key: 'a/m.png' })).toBe('a/b/xray-001.jpg');
    expect(imageKeyOf({ key: 'intake/x.png' })).toBe('intake/x.png');
    expect(imageKeyOf({ finding: 'normal' })).toBeNull();
  });

  it('puts the finding, the truth, the match and the urgency first, and the description apart', () => {
    const f = reviewFields(row);
    expect(f.first.map(x => x.label)).toEqual(['Finding', 'True label', 'Match', 'Urgency', 'Confidence', 'Status']);
    expect(f.text).toEqual({ label: 'Description', value: 'An irregular hypoechoic mass.' });
    expect(f.rest.map(x => x.label)).toContain('Lesion area pct');
    expect(f.rest.map(x => x.label)).not.toContain('Finding');
  });
});
