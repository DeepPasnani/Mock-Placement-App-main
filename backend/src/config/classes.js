// Only these class clusters / years are eligible to use this placement
// platform. Every batch row, student assignment and targeting control is
// restricted to this list — the single source of truth that the seed
// script, backend validation and the /api/meta/options endpoint all share.
const ALLOWED_BATCHES = ['Batch 1', 'Batch 2', 'Batch 3', 'Batch 4'];

const ALLOWED_YEARS = [1, 2, 3, 4];

const ALLOWED_BATCH_SET = new Set(ALLOWED_BATCHES);

const ALLOWED_YEAR_SET = new Set(ALLOWED_YEARS);

function isAllowedBatch(value) {
  return typeof value === 'string' && ALLOWED_BATCH_SET.has(value.trim());
}

function isAllowedYear(value) {
  const num = Number(value);
  return Number.isInteger(num) && ALLOWED_YEAR_SET.has(num);
}

module.exports = {
  ALLOWED_BATCHES,
  ALLOWED_YEARS,
  ALLOWED_BATCH_SET,
  ALLOWED_YEAR_SET,
  isAllowedBatch,
  isAllowedYear,
};
