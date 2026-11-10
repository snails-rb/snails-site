// The landing page's performance figures are read from the manual's comparison
// table (manual/01-welcome-to-snails.md), which is refreshed from the snails
// repository on a schedule. A second hard-coded copy would keep serving the old
// values after such a refresh; a table this loader cannot read fails the build,
// so drift breaks the build instead of the page.

import { loadChapters } from './manual.mjs';

const TABLE_CHAPTER = 'welcome-to-snails';
const COLUMNS = { snails: 'Snails', rails: 'Rails', cluster: 'Rails Cluster Mode' };

function cells(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((cell) => cell.trim());
}

function comparisonTable(markdown) {
  const lines = markdown.split('\n');
  const headerIndex = lines.findIndex((line) => {
    const row = cells(line);
    return row.includes(COLUMNS.snails) && row.includes(COLUMNS.cluster);
  });
  if (headerIndex === -1) {
    throw new Error(
      `manual/${TABLE_CHAPTER}.md: no comparison table with ${COLUMNS.snails} and ${COLUMNS.cluster} columns`,
    );
  }

  const header = cells(lines[headerIndex]);
  const columnIndex = (name) => {
    const index = header.indexOf(name);
    if (index === -1) {
      throw new Error(`manual/${TABLE_CHAPTER}.md: comparison table has no "${name}" column`);
    }
    return index;
  };

  const rows = new Map();
  // The line after the header is the alignment row (`|---:|---:|`).
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith('|')) break;
    const row = cells(line);
    rows.set(row[0], row);
  }

  return { columnIndex, rows };
}

function readFigure({ columnIndex, rows }, rowLabel, columnName) {
  const row = rows.get(rowLabel);
  if (!row) {
    throw new Error(`manual/${TABLE_CHAPTER}.md: comparison table has no "${rowLabel}" row`);
  }
  const value = row[columnIndex(columnName)];
  if (!value) {
    throw new Error(`manual/${TABLE_CHAPTER}.md: "${rowLabel}" has no value for ${columnName}`);
  }
  return value;
}

function requestsPerSecond(table, columnName) {
  const value = readFigure(table, 'Requests per second', columnName).replace(/,/g, '');
  const parsed = Number(value);
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
  const snails = requestsPerSecond(table, COLUMNS.snails);
  const rails = requestsPerSecond(table, COLUMNS.rails);
  const cluster = requestsPerSecond(table, COLUMNS.cluster);

  return {
    // Descending, so the chart reads from the winner down. The third row keeps
    // the manual's column name plus the qualifier a landing-page reader needs:
    // "Rails" alone reads as the only Rails shape, next to the cluster row.
    rows: [
      { name: COLUMNS.snails, requests: snails },
      { name: COLUMNS.cluster, requests: cluster },
      { name: `${COLUMNS.rails} (default)`, requests: rails },
    ],
    clusterRatio: (snails / cluster).toFixed(1),
    railsRatio: (snails / rails).toFixed(1),
    launch: {
      snails: readFigure(table, 'Launch to first answer', COLUMNS.snails),
      rails: readFigure(table, 'Launch to first answer', COLUMNS.rails),
    },
    memory: {
      snails: readFigure(table, 'Memory under load', COLUMNS.snails),
      cluster: readFigure(table, 'Memory under load', COLUMNS.cluster),
    },
  };
}
