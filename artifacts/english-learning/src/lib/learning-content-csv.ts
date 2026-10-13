import type { LearningContentLevel } from '@workspace/api-client-react';

export type ParsedLearningContentCsvItem = {
  level: LearningContentLevel;
  word: string;
  shortMeaning: string;
};

function parseRows(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, '');
  const firstLine = content.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const delimiter = [',', '\t', ';']
    .map((candidate) => ({
      candidate,
      count: firstLine.split(candidate).length - 1,
    }))
    .sort((left, right) => right.count - left.count)[0]?.candidate ?? ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === '"') {
      if (quoted && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
      if (character === '\r' && content[index + 1] === '\n') index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV의 따옴표가 닫히지 않았습니다.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value: string) {
  return value.trim().replace(/[\s_-]/g, '').toLocaleLowerCase();
}

export function parseLearningContentCsv(
  text: string,
  level: LearningContentLevel,
): ParsedLearningContentCsvItem {
  const rows = parseRows(text);
  if (rows.length < 2) throw new Error('단어, 뜻 헤더와 단어 한 행을 입력해 주세요.');

  const headers = rows[0].map(normalizeHeader);
  const wordIndex = headers.findIndex((header) =>
    ['word', '단어', '영단어'].includes(header),
  );
  const meaningIndex = headers.findIndex((header) =>
    ['meaning', 'shortmeaning', '뜻', '한글뜻'].includes(header),
  );
  if (wordIndex < 0 || meaningIndex < 0 || headers.length !== 2) {
    throw new Error('CSV에는 단어와 뜻 두 열만 있어야 합니다.');
  }

  const values = rows.slice(1).filter((dataRow) => dataRow.some(Boolean));
  if (values.length !== 1) throw new Error('각 과정에는 한 번에 단어 한 개만 등록할 수 있어요.');
  const word = values[0][wordIndex]?.trim() ?? '';
  const shortMeaning = values[0][meaningIndex]?.trim() ?? '';
  if (!word || !shortMeaning) throw new Error('단어와 뜻을 모두 입력해 주세요.');
  if (word.length > 120) throw new Error('단어는 120자 이내로 입력해 주세요.');
  if (shortMeaning.length > 200) throw new Error('뜻은 200자 이내로 입력해 주세요.');
  return { level, word, shortMeaning };
}

export function createLearningContentCsv(word = '', meaning = '') {
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return `\uFEFF단어,뜻\r\n${escape(word)},${escape(meaning)}\r\n`;
}
