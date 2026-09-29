import { ExtractedField, TypeDefinition } from './documents.model';

/**
 * MIG-272: answers the Document Intelligence specs share. The shapes are the services' as they answered on
 * 2026-09-29 for workspace 2924: the purchase order's type (v1) and extraction 1000, whose line item a reviewer added.
 */
export const PO_DEFINITION: TypeDefinition = {
  description: 'A buyer\'s order to a supplier.',
  keywords: ['purchase order'],
  autoApproveThreshold: 0.9,
  fields: [
    { key: 'po_number', label: 'PO number', type: 'text', required: true, aliases: ['PO #'] },
    { key: 'order_date', label: 'Order date', type: 'date', required: true },
    { key: 'supplier_name', label: 'Supplier', type: 'text', required: true },
    { key: 'delivery_date', label: 'Delivery date', type: 'date', required: false },
    { key: 'total', label: 'Order total', type: 'money', required: true },
  ],
  tables: [{ key: 'line_items', label: 'Ordered items', required: true, columns: [
    { key: 'description', label: 'Description', type: 'text', required: true },
    { key: 'quantity', label: 'Quantity', type: 'number', required: true },
    { key: 'amount', label: 'Amount', type: 'money', required: false },
  ] }],
  rules: [
    { rule: 'sumEquals', table: 'line_items', column: 'amount', field: 'total', tolerance: 0.01, message: 'The ordered items do not add up to the order total.' },
    { rule: 'notAfter', before: 'order_date', after: 'delivery_date' },
  ],
};

export const PO_FIELDS: ExtractedField[] = [
  { fieldId: 1005, fieldKey: 'total', value: '9820.00', confidence: 0.867, page: 1, box: { left: 410, top: 569, width: 102, height: 35 }, problems: [], corrected: false, label: 'Order total', type: 'money', required: true },
  { fieldId: 1000, fieldKey: 'po_number', value: '77104', confidence: 0.95, page: 1, box: { left: 464, top: 289, width: 128, height: 35 }, problems: [], corrected: false, label: 'PO number', type: 'text', required: true },
  { fieldId: 1003, fieldKey: 'supplier_name', value: null, confidence: 0, page: null, problems: ['Required, and not found on the document.'], corrected: false, label: 'Supplier', type: 'text', required: true },
  { fieldId: 1004, fieldKey: 'delivery_date', value: '2026-10-05', confidence: 0.25, page: 1, box: { left: 284, top: 429, width: 49, height: 35 }, problems: [], corrected: true, label: 'Delivery date', type: 'date', required: false },
  { fieldId: 1008, fieldKey: 'quantity', tableKey: 'line_items', rowIndex: 0, value: '40', confidence: 1, page: null, problems: [], corrected: true, label: 'Quantity', type: 'number', required: true },
  { fieldId: 1007, fieldKey: 'description', tableKey: 'line_items', rowIndex: 0, value: 'Pallets', confidence: 1, page: null, problems: [], corrected: true, label: 'Description', type: 'text', required: true },
];
