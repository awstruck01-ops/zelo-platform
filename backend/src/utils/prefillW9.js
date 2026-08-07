const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

// The real, unmodified IRS Form W-9 (Rev. March 2024), stored at backend/fw9.pdf.
const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'fw9.pdf');

// Field names below were pulled directly from the actual template's AcroForm
// fields (it's an IRS Adobe-LiveCycle/XFA-hybrid PDF, so names are opaque
// codes rather than readable labels). Mapping, confirmed against each
// field's on-page position:
//
//   f1_01           Line 1: Name
//   f1_02           Line 2: Business name / disregarded entity name
//   c1_1[0..6]      Line 3 checkboxes (federal tax classification):
//                     0 Individual/sole proprietor or single-member LLC
//                     1 C Corporation
//                     2 S Corporation
//                     3 Partnership
//                     4 Trust/estate
//                     5 Limited liability company
//                     6 Other
//   f1_03           LLC tax classification letter (only used if [5] LLC checked)
//   f1_04           "Other" description (only used if [6] Other checked)
//   f1_07           Line 5: Address (number, street, apt.)
//   f1_08           Line 6: City, state, ZIP
//   f1_11 - f1_13   Part I: SSN (3 boxes) — intentionally left blank
//   f1_14 - f1_15   Part I: EIN (2 boxes) — intentionally left blank
//
// We never touch f1_11–f1_15: the seller/driver fills their SSN or EIN in
// themselves on the downloaded PDF, and it never passes through our server
// or database as a stored field.

const CHECKBOX_FIELD = 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[{i}]';

// Accepts common variants of how the frontend might send tax classification
// so this doesn't break if the exact string casing/format differs.
function classificationIndex(taxClassification) {
  const v = String(taxClassification || '').trim().toLowerCase().replace(/[\s_-]+/g, '_');
  const map = {
    individual: 0,
    sole_proprietor: 0,
    individual_sole_proprietor: 0,
    single_member_llc: 0,
    c_corp: 1,
    c_corporation: 1,
    s_corp: 2,
    s_corporation: 2,
    partnership: 3,
    trust: 4,
    estate: 4,
    trust_estate: 4,
    llc: 5,
    limited_liability_company: 5,
    other: 6,
  };
  return Object.prototype.hasOwnProperty.call(map, v) ? map[v] : 6; // default to "Other" if unrecognized
}

/**
 * Fills the real W-9 template with the seller/driver's non-sensitive tax
 * form fields and returns the filled PDF as a Buffer. Never writes an SSN
 * or EIN — those fields are left blank for the person to fill in by hand
 * after downloading.
 *
 * @param {Object} submission
 * @param {string} submission.legal_name
 * @param {string} [submission.business_name]
 * @param {string} submission.tax_classification
 * @param {string} submission.address
 * @param {string} submission.city
 * @param {string} submission.state
 * @param {string} submission.zip
 * @returns {Promise<Buffer>}
 */
async function prefillW9(submission) {
  const {
    legal_name,
    business_name,
    tax_classification,
    address,
    city,
    state,
    zip,
  } = submission;

  const templateBytes = fs.readFileSync(TEMPLATE_PATH);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form = pdfDoc.getForm();

  const setText = (fullyQualifiedName, value) => {
    if (value === undefined || value === null || value === '') return;
    try {
      form.getTextField(fullyQualifiedName).setText(String(value));
    } catch (err) {
      console.error(`prefillW9: could not set field ${fullyQualifiedName}:`, err.message);
    }
  };

  setText('topmostSubform[0].Page1[0].f1_01[0]', legal_name);
  setText('topmostSubform[0].Page1[0].f1_02[0]', business_name);
  setText('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_07[0]', address);
  const cityStateZip = [city, [state, zip].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  setText('topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_08[0]', cityStateZip);

  const idx = classificationIndex(tax_classification);
  const checkboxName = CHECKBOX_FIELD.replace('{i}', idx);
  try {
    const checkbox = form.getCheckBox(checkboxName);
    checkbox.check();
  } catch (err) {
    console.error(`prefillW9: could not check classification box ${checkboxName}:`, err.message);
  }

  try {
    form.updateFieldAppearances();
  } catch (err) {
    console.error('prefillW9: updateFieldAppearances failed:', err.message);
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { prefillW9 };
