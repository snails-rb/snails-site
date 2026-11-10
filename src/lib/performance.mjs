// The landing page's benchmark figures are read from the manual's comparison
// table (manual/01-welcome-to-snails.md), which is refreshed from the snails
// repository on a schedule. A second hard-coded copy would keep serving the old
// values after such a refresh; a table this loader cannot read fails the build,
// so drift breaks the build instead of the page.

import { loadChapters } from './manual.mjs';

const TABLE_CHAPTER = 'welcome-to-snails';

// Column in the manual → label the landing page shows. "Cluster mode" is
// Puma's own name for one worker process per core, so it stays; the other
// Rails column is what `rails new` produces untouched.
const TARGETS = [
  { column: 'Snails', label: 'Snails' },
  { column: 'Rails Cluster Mode', label: 'Rails (cluster mode)' },
  { column: 'Rails', label: 'Rails (default)' },
];

const THROUGHPUT_ROW = 'Requests per second';

function cells(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

// Reads the manual's comparison table as rows keyed by their first cell, one
// value per target. The page asks for the rows it prints by name, so a row the
// manual renames or drops fails the build rather than silently vanishing.
function comparisonTable(markdown) {
  const lines = markdown.split('\n');
  const headerIndex = lines.findIndex((line) => {
    const row = cells(line);
    return TARGETS.every((target) => row.includes(target.column));
  });
  if (headerIndex === -1) {
    const expected = TARGETS.map((target) => `"${target.column}"`).join(', ');
    throw new Error(`manual/${TABLE_CHAPTER}.md: no comparison table with columns ${expected}`);
  }

  const header = cells(lines[headerIndex]);
  const positions = TARGETS.map((target) => {
    const index = header.indexOf(target.column);
    if (index === -1) {
      throw new Error(`manual/${TABLE_CHAPTER}.md: comparison table has no "${target.column}" column`);
    }
    return index;
  });

  const rows = new Map();
  // The line after the header is the alignment row (`|---:|---:|`).
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) break;
    const row = cells(line);
    const values = positions.map((index, position) => {
      const value = row[index];
      if (!value) {
        throw new Error(
          `manual/${TABLE_CHAPTER}.md: "${row[0]}" has no value for ${TARGETS[position].column}`,
        );
      }
      return value;
    });
    rows.set(row[0], values);
  }

  if (rows.size === 0) {
    throw new Error(`manual/${TABLE_CHAPTER}.md: the comparison table has no rows`);
  }

  return rows;
}

// The manual writes request counts with thousands separators; the page needs a
// number for the bars and ratios. A cell that is not a count fails the build
// rather than drawing a bar from NaN.
function requestCount(value) {
  const parsed = Number(value.replace(/,/g, ''));
  if (!Number.isInteger(parsed)) {
    throw new Error(`manual/${TABLE_CHAPTER}.md: "${value}" is not a request count`);
  }
  return parsed;
}

export function performanceFigures(chapters = loadChapters()) {
  const chapter = chapters.find((candidate) => candidate.slug === TABLE_CHAPTER);
  if (!chapter) {
    throw new Error(`manual/${TABLE_CHAPTER}.md is missing — the landing page reads its figures from it`);
  }

  const table = comparisonTable(chapter.body);
  const throughput = table.get(THROUGHPUT_ROW);
  if (!throughput) {
    throw new Error(`manual/${TABLE_CHAPTER}.md: comparison table has no "${THROUGHPUT_ROW}" row`);
  }

  const counts = throughput.map(requestCount);
  const [snails, cluster, rails] = counts;

  return {
    // The three chart rows, in the order the page draws them.
    series: TARGETS.map((target, index) => ({
      label: target.label,
      requests: counts[index],
    })),
    // Raw strings from any other row, in target order. The caller names the
    // row it prints; a label the manual drops fails here.
    rowValues(rowLabel) {
      const values = table.get(rowLabel);
      if (!values) {
        throw new Error(`manual/${TABLE_CHAPTER}.md: comparison table has no "${rowLabel}" row`);
      }
      return values;
    },
    // Ratios are computed, never copied: a refreshed table must not leave a
    // stale "3.1×" above fresh numbers.
    clusterRatio: (snails / cluster).toFixed(1),
    defaultsRatio: (snails / rails).toFixed(1),
  };
}
