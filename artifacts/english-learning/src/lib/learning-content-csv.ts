import type {
  LearningContentBatchItem,
  LearningContentInput,
  LearningContentLevel,
} from '@workspace/api-client-react';

export type LearningContentCsvFields = Pick<
  LearningContentInput,
  'word' | 'shortMeaning' | 'exampleSentence' | 'exampleKorean'
>;

export type ParsedLearningContentCsvItem = {
  level: LearningContentLevel;
  content: LearningContentCsvFields;
};

const contentHeaders = [
  { key: 'level', label: '레벨', aliases: ['level', '레벨', '과정'] },
  { key: 'word', label: '단어', aliases: ['word', '단어', '영단어'] },
  { key: 'shortMeaning', label: '뜻', aliases: ['shortmeaning', 'meaning', '뜻', '간단한뜻', '한글뜻'] },
  { key: 'exampleSentence', label: '예문', aliases: ['examplesentence', '영어예문', '예문'] },
  { key: 'exampleKorean', label: '예문 해석', aliases: ['examplekorean', '예문해석', '예문뜻', '한글예문'] },
] as const;

const fieldLimits: Record<keyof LearningContentCsvFields, number> = {
  word: 120,
  shortMeaning: 200,
  exampleSentence: 1000,
  exampleKorean: 1000,
};

function normalizeHeader(value: string) {
  return value.trim().replace(/[\s_-]/g, '').toLocaleLowerCase();
}

function countOutsideQuotes(line: string, delimiter: string) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      count += 1;
    }
  }
  return count;
}

function parseRows(text: string): string[][] {
  const content = text.replace(/^\uFEFF/, '');
  const firstLine = content.split(/\r\n|\n|\r/, 1)[0] ?? '';
  const delimiter = [',', '\t', ';']
    .map((candidate) => ({ candidate, count: countOutsideQuotes(firstLine, candidate) }))
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
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      field = '';
      if (character === '\r' && content[index + 1] === '\n') index += 1;
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('CSV의 따옴표가 닫히지 않았습니다.');
  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

function parseLevel(value: string): LearningContentLevel | null {
  const normalized = normalizeHeader(value);
  if (normalized === 'beginner' || normalized === '초급' || normalized === '초급과정') return 'Beginner';
  if (normalized === 'intermediate' || normalized === '중급' || normalized === '중급과정') return 'Intermediate';
  if (normalized === 'advanced' || normalized === '고급' || normalized === '고급과정') return 'Advanced';
  return null;
}

export function parseLearningContentCsv(text: string): ParsedLearningContentCsvItem[] {
  const rows = parseRows(text);
  if (rows.length < 2) throw new Error('헤더 아래에 단어 콘텐츠 행을 한 개 이상 넣어 주세요.');

  const headerIndexes = new Map(
    rows[0].map((header, index) => [normalizeHeader(header), index]),
  );
  const indexes = Object.fromEntries(
    contentHeaders.map(({ key, aliases }) => [
      key,
      aliases
        .map(normalizeHeader)
        .map((alias) => headerIndexes.get(alias))
        .find((index) => index !== undefined),
    ]),
  ) as Record<(typeof contentHeaders)[number]['key'], number | undefined>;

  const missingHeaders = contentHeaders
    .filter(({ key }) => indexes[key] === undefined)
    .map(({ label }) => label);
  if (missingHeaders.length > 0) {
    throw new Error(`필수 열을 찾지 못했습니다: ${missingHeaders.join(', ')}`);
  }

  const items: ParsedLearningContentCsvItem[] = [];
  const seenLevels = new Set<LearningContentLevel>();

  rows.slice(1).forEach((row, rowIndex) => {
    const lineNumber = rowIndex + 2;
    const cell = (key: (typeof contentHeaders)[number]['key']) => row[indexes[key]!] ?? '';
    const level = parseLevel(cell('level'));
    if (!level) throw new Error(`${lineNumber}행: 레벨은 Beginner/Intermediate/Advanced 또는 초급/중급/고급이어야 합니다.`);
    if (seenLevels.has(level)) throw new Error(`${lineNumber}행: ${level} 레벨이 중복되어 있습니다.`);
    seenLevels.add(level);

    const content: LearningContentCsvFields = {
      word: cell('word'),
      shortMeaning: cell('shortMeaning'),
      exampleSentence: cell('exampleSentence'),
      exampleKorean: cell('exampleKorean'),
    };

    if (!content.word) throw new Error(`${lineNumber}행: 단어를 입력해 주세요.`);
    if (!content.shortMeaning) throw new Error(`${lineNumber}행: 간단한 뜻을 입력해 주세요.`);

    for (const [key, value] of Object.entries(content)) {
      const limit = fieldLimits[key as keyof LearningContentCsvFields];
      if (typeof value === 'string' && value.length > limit) {
        throw new Error(`${lineNumber}행: ${key} 항목은 ${limit}자 이내로 입력해 주세요.`);
      }
    }

    items.push({ level, content });
  });

  if (items.length > 3) throw new Error('한 파일에는 레벨별 한 행씩, 최대 3개까지 등록할 수 있습니다.');
  return items;
}

function escapeCsv(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

export function createLearningContentCsv(items: LearningContentBatchItem[]) {
  const headerRow = contentHeaders.map(({ label }) => label);
  const contentRows = items.map(({ level, content }) => [
    level,
    content.word,
    content.shortMeaning,
    content.exampleSentence,
    content.exampleKorean,
  ]);
  return `\uFEFF${[headerRow, ...contentRows]
    .map((row) => row.map(escapeCsv).join(','))
    .join('\r\n')}\r\n`;
}
