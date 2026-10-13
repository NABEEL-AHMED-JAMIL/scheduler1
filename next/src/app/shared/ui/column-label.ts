/**
 * UX review B5 (B1, 2.5): a column's raw name as a heading people read -- "RISK_LEVEL" is "Risk level",
 * "patient_id" is "Patient ID", "lastVisitDate" is "Last visit date". A name that already reads as words (it has a
 * space, or mixes cases like a title) is kept as written. The raw name stays the heading's tooltip.
 */
const ACRONYMS: Record<string, string> = {
  id: 'ID', ids: 'IDs', bmi: 'BMI', sbp: 'SBP', dbp: 'DBP', mrn: 'MRN', dob: 'DOB', icd: 'ICD', icd10: 'ICD-10', hba1c: 'HbA1c',
  ldl: 'LDL', hdl: 'HDL', ssn: 'SSN', npi: 'NPI', url: 'URL', zip: 'ZIP', usd: 'USD', pct: '%', avg: 'average', qty: 'quantity',
};

export function columnLabel(raw: string | null | undefined): string {
  const name = (raw ?? '').trim();
  if (!name) return '';
  // Already words: "Patients", "Risk level", "Age (years)".
  if (/\s/.test(name) || !/[_.]|^[A-Z0-9]+$|[a-z][A-Z]/.test(name)) return name;
  // camelCase splits at its capitals; an all-caps name (HBA1C, RISK_LEVEL) only at its underscores.
  const words = (/[a-z]/.test(name) ? name.replace(/([a-z0-9])([A-Z])/g, '$1 $2') : name)
    .split(/[_.\s]+/)
    .filter(Boolean)
    .map(w => ACRONYMS[w.toLowerCase()] ?? w.toLowerCase());
  if (!words.length) return name;
  const first = words[0];
  words[0] = /^[a-z]/.test(first) ? first[0].toUpperCase() + first.slice(1) : first;
  return words.join(' ');
}
