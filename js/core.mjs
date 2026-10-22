/** Pure data rules. Day totals describe inclusive calendar days, not official attendance. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;
export const MAX_STUDENTS = 3000;
export const MAX_RECORDS = 50000;
export const DEFAULT_SETTINGS = Object.freeze({ fieldTripApplyDays: 3 });
export const TYPE_CATEGORIES = Object.freeze({
  "field-trip": "trip",
  "sick-absence": "absence",
  "unauth-absence": "absence",
  "other-absence": "absence",
  "approved-absence": "approved",
  "family-event": "approved",
  "sick-early": "early",
  "unauth-early": "early",
  "other-early": "early",
  "sick-late": "late",
  "unauth-late": "late",
  "other-late": "late",
  "sick-class": "class",
  "unauth-class": "class",
  "other-class": "class",
});
export const DOC_TYPES = Object.freeze({
  apply: { label: "신청서", fullLabel: "교외체험학습 신청서", when: "before" },
  report: { label: "보고서", fullLabel: "교외체험학습 보고서", when: "after" },
  absenceNote: { label: "결석계", fullLabel: "결석계", when: "after" },
});
const DAY_MS = 86400000;
const CATEGORY_KEYS = ["trip", "absence", "approved", "early", "late", "class"];
const badKeys = new Set(["__proto__", "prototype", "constructor"]);

function fail(message) {
  throw new Error(message);
}
function plain(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
function requireObject(value, label) {
  if (!plain(value)) fail(`${label}: 객체 형식이어야 합니다.`);
}
function requireString(value, label, max, empty = false) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!empty && !value.trim())
  ) {
    fail(`${label}: 올바른 문자열을 입력해 주세요.`);
  }
}
function safeClone(value, depth = 0, seen = new Set()) {
  if (depth > 20) fail("백업 자료의 중첩이 너무 깊습니다.");
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || seen.has(value))
    fail("백업에 JSON으로 저장할 수 없는 값이 있습니다.");
  if (!Array.isArray(value) && !plain(value))
    fail("백업에 지원하지 않는 객체가 있습니다.");
  seen.add(value);
  const result = Array.isArray(value) ? [] : {};
  for (const key of Object.keys(value)) {
    if (badKeys.has(key)) fail("백업에 허용하지 않는 속성이 있습니다.");
    result[key] = safeClone(value[key], depth + 1, seen);
  }
  seen.delete(value);
  return result;
}
function byteLength(value) {
  return new TextEncoder().encode(value).length;
}
function boundedClone(input) {
  const result = safeClone(input);
  if (byteLength(JSON.stringify(result)) > MAX_BACKUP_BYTES)
    fail("백업 파일은 5MB 이하여야 합니다.");
  return result;
}

/** Exact civil date validation; UTC arithmetic avoids DST and local timezone errors. */
export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1)
    return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    day <=
    [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
function requireDate(value, label) {
  if (!isValidDate(value)) fail(`${label}: 유효한 날짜가 아닙니다.`);
}
function dayNumber(date) {
  requireDate(date, "날짜");
  const [y, m, d] = date.split("-").map(Number);
  const stamp = new Date(0);
  stamp.setUTCFullYear(y, m - 1, d);
  stamp.setUTCHours(0, 0, 0, 0);
  return stamp.getTime() / DAY_MS;
}
export function inclusiveDays(startDate, endDate) {
  const days = dayNumber(endDate) - dayNumber(startDate) + 1;
  if (days < 1) fail("종료일은 시작일보다 빠를 수 없습니다.");
  return days;
}
function validateTimestamp(value, label) {
  if (
    value !== undefined &&
    (typeof value !== "string" ||
      value.length > 100 ||
      !isValidDate(value.slice(0, 10)) ||
      !Number.isFinite(Date.parse(value)))
  ) {
    fail(`${label}: 유효한 시각이 아닙니다.`);
  }
}
function legacyStudentId(name) {
  // Encoding the complete exact name makes migration stable without hash collisions.
  return `legacy-${Array.from(name)
    .map((char) => char.codePointAt(0).toString(16))
    .join("-")}`;
}
export function emptyData() {
  return {
    schemaVersion: 2,
    students: [],
    records: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Validate every row, then migrate old name-only data without mutating the input. */
export function migrateData(input) {
  const data = boundedClone(input);
  requireObject(data, "백업");
  if (
    data.schemaVersion !== undefined &&
    data.schemaVersion !== 1 &&
    data.schemaVersion !== 2
  ) {
    fail("지원하지 않는 백업 버전입니다.");
  }
  if (!Array.isArray(data.students) || !Array.isArray(data.records))
    fail("학생과 기록 목록이 필요합니다.");
  if (data.students.length > MAX_STUDENTS || data.records.length > MAX_RECORDS)
    fail("학생 또는 기록 수가 너무 많습니다.");
  const legacy =
    data.schemaVersion !== 2 &&
    data.students.every((student) => typeof student === "string");
  if (!legacy && data.students.some((student) => typeof student === "string"))
    fail("학생 자료 형식이 섞여 있습니다.");
  const students = [],
    studentById = new Map(),
    studentByName = new Map(),
    numberIds = new Map();
  function register(student) {
    requireObject(student, "학생");
    requireString(student.id, "학생 식별자", 2000);
    requireString(student.name, "학생 이름", 200);
    if (student.number === undefined) student.number = null;
    if (
      student.number !== null &&
      (!Number.isSafeInteger(student.number) ||
        student.number < 1 ||
        student.number > 999999)
    ) {
      fail("학생 번호는 1~999999의 정수여야 합니다.");
    }
    if (studentById.has(student.id)) fail("학생 식별자가 중복됩니다.");
    if (student.number !== null && numberIds.has(student.number))
      fail("학생 번호가 중복됩니다.");
    if (student.number !== null) numberIds.set(student.number, student.id);
    studentById.set(student.id, student);
    studentByName.set(student.name, student);
    students.push(student);
    if (students.length > MAX_STUDENTS) fail("학생 수가 너무 많습니다.");
    return student;
  }
  for (const entry of data.students) {
    if (legacy) {
      requireString(entry, "학생 이름", 200);
      if (!studentByName.has(entry))
        register({ id: legacyStudentId(entry), number: null, name: entry });
    } else register(entry);
  }
  const recordIds = new Set();
  const records = data.records.map((record, index) => {
    const label = `${index + 1}번째 기록`;
    requireObject(record, label);
    requireString(record.id, `${label} 식별자`, 200);
    if (recordIds.has(record.id)) fail("기록 식별자가 중복됩니다.");
    recordIds.add(record.id);
    requireString(record.studentName, `${label} 학생 이름`, 200);
    requireString(record.type, `${label} 출결 유형`, 100);
    if (!Object.hasOwn(TYPE_CATEGORIES, record.type))
      fail(`${label}: 알 수 없는 출결 유형입니다.`);
    requireDate(record.startDate, `${label} 시작일`);
    requireDate(record.endDate, `${label} 종료일`);
    inclusiveDays(record.startDate, record.endDate);
    if (record.memo === undefined) record.memo = "";
    requireString(record.memo, `${label} 메모`, 10000, true);
    if (record.documents === undefined) record.documents = {};
    requireObject(record.documents, `${label} 서류`);
    for (const [key, value] of Object.entries(record.documents)) {
      if (!Object.hasOwn(DOC_TYPES, key) || typeof value !== "boolean")
        fail(`${label}: 서류 확인 값이 올바르지 않습니다.`);
    }
    validateTimestamp(record.createdAt, `${label} 생성 시각`);
    validateTimestamp(record.updatedAt, `${label} 수정 시각`);
    if (legacy) {
      let student = studentByName.get(record.studentName);
      if (!student)
        student = register({
          id: legacyStudentId(record.studentName),
          number: null,
          name: record.studentName,
        });
      record.studentId = student.id;
    } else {
      requireString(record.studentId, `${label} 학생 식별자`, 2000);
      if (!studentById.has(record.studentId))
        fail(`${label}: 학생 목록에 없는 식별자입니다.`);
    }
    if (record.createdAt === undefined)
      record.createdAt = `${record.startDate}T00:00:00.000Z`;
    return record;
  });
  if (data.settings === undefined) data.settings = {};
  requireObject(data.settings, "설정");
  data.settings = { ...DEFAULT_SETTINGS, ...data.settings };
  if (
    !Number.isInteger(data.settings.fieldTripApplyDays) ||
    data.settings.fieldTripApplyDays < 0 ||
    data.settings.fieldTripApplyDays > 365
  ) {
    fail("신청서 제출 안내일은 0~365일이어야 합니다.");
  }
  if (data.meta !== undefined) requireObject(data.meta, "저장 정보");
  const result = { ...data, schemaVersion: 2, students, records };
  if (byteLength(JSON.stringify(result)) > MAX_BACKUP_BYTES)
    fail("변환한 백업 자료는 5MB 이하여야 합니다.");
  return result;
}

export function parseBackup(text) {
  if (typeof text !== "string") fail("백업 파일을 텍스트로 읽어 주세요.");
  if (byteLength(text) > MAX_BACKUP_BYTES)
    fail("백업 파일은 5MB 이하여야 합니다.");
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    fail("JSON 백업 파일을 읽을 수 없습니다.");
  }
  return migrateData(parsed);
}

function dateString(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function lastDay(year, month) {
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
}
function validateRange(range) {
  requireObject(range, "조회 기간");
  requireDate(range.startDate, "조회 시작일");
  requireDate(range.endDate, "조회 종료일");
  if (range.startDate > range.endDate)
    fail("조회 종료일은 시작일보다 빠를 수 없습니다.");
  return range;
}
/** Month is zero-based. Semesters are Mar-Aug and Sep-Feb, including next year. */
export function resolveRange(mode, options = {}) {
  const now = new Date();
  const today =
    options.today ||
    dateString(now.getFullYear(), now.getMonth() + 1, now.getDate());
  requireDate(today, "기준일");
  const todayYear = Number(today.slice(0, 4)),
    todayMonth = Number(today.slice(5, 7)) - 1;
  let startDate, endDate, title;
  if (mode === "month") {
    const year = options.year ?? todayYear,
      month = options.month ?? todayMonth;
    if (
      !Number.isInteger(year) ||
      year < 1 ||
      year > 9999 ||
      !Number.isInteger(month) ||
      month < 0 ||
      month > 11
    )
      fail("조회 연월이 올바르지 않습니다.");
    startDate = dateString(year, month + 1, 1);
    endDate = dateString(year, month + 1, lastDay(year, month + 1));
    title = `${year}년 ${month + 1}월`;
  } else if (mode === "semester") {
    if (todayMonth >= 2 && todayMonth <= 7) {
      startDate = dateString(todayYear, 3, 1);
      endDate = dateString(todayYear, 8, 31);
      title = `${todayYear}학년도 1학기`;
    } else {
      const schoolYear = todayMonth < 2 ? todayYear - 1 : todayYear;
      startDate = dateString(schoolYear, 9, 1);
      endDate = dateString(schoolYear + 1, 2, lastDay(schoolYear + 1, 2));
      title = `${schoolYear}학년도 2학기`;
    }
  } else if (mode === "custom") {
    ({ startDate, endDate } = options);
    title = "선택 기간";
  } else if (mode === "all") {
    const records = options.records || [];
    startDate = records.length
      ? records.reduce(
          (value, record) =>
            record.startDate < value ? record.startDate : value,
          records[0].startDate,
        )
      : today;
    endDate = records.length
      ? records.reduce(
          (value, record) => (record.endDate > value ? record.endDate : value),
          records[0].endDate,
        )
      : today;
    title = records.length ? "전체 기록 기간" : "전체 기간 · 등록 기록 없음";
  } else fail("알 수 없는 조회 기간입니다.");
  validateRange({ startDate, endDate });
  return { startDate, endDate, label: `${title} (${startDate} ~ ${endDate})` };
}

export function filterRecords(records, options = {}) {
  if (options.startDate !== undefined || options.endDate !== undefined)
    validateRange(options);
  const students = new Map(
    (options.students || []).map((student) => [student.id, student]),
  );
  const query = String(options.query || "")
    .trim()
    .toLocaleLowerCase();
  return records.filter((record) => {
    if (
      options.startDate &&
      (record.endDate < options.startDate || record.startDate > options.endDate)
    )
      return false;
    if (options.studentId && record.studentId !== options.studentId)
      return false;
    if (options.type && options.type !== "all" && record.type !== options.type)
      return false;
    const student = students.get(record.studentId);
    return (
      !query ||
      [record.studentName, student?.name, student?.number, record.memo].some(
        (value) =>
          value !== undefined &&
          String(value).toLocaleLowerCase().includes(query),
      )
    );
  });
}

/** Inclusive overlap for the same persistent student identity; overlaps are warnings only. */
export function findOverlaps(records, candidate, excludeId = candidate.id) {
  requireString(candidate.studentId, "학생 식별자", 2000);
  inclusiveDays(candidate.startDate, candidate.endDate);
  return records.filter(
    (record) =>
      record.id !== excludeId &&
      record.studentId === candidate.studentId &&
      record.startDate <= candidate.endDate &&
      record.endDate >= candidate.startDate,
  );
}

// Union intervals rather than expanding dates, so even very long records remain inexpensive.
function uniqueDays(intervals) {
  const students = new Map();
  for (const item of intervals) {
    if (!students.has(item.studentId)) students.set(item.studentId, []);
    students
      .get(item.studentId)
      .push([dayNumber(item.startDate), dayNumber(item.endDate)]);
  }
  let total = 0;
  for (const ranges of students.values()) {
    ranges.sort((a, b) => a[0] - b[0]);
    let start = ranges[0][0],
      end = ranges[0][1];
    for (const [nextStart, nextEnd] of ranges.slice(1)) {
      if (nextStart <= end + 1) end = Math.max(end, nextEnd);
      else {
        total += end - start + 1;
        start = nextStart;
        end = nextEnd;
      }
    }
    total += end - start + 1;
  }
  return total;
}
export function summarize(records, range) {
  validateRange(range);
  const clipped = filterRecords(records, range).map((record) => ({
    ...record,
    startDate:
      record.startDate < range.startDate ? range.startDate : record.startDate,
    endDate: record.endDate > range.endDate ? range.endDate : record.endDate,
  }));
  const result = {
    recordCount: clipped.length,
    dayCount: uniqueDays(clipped),
    byCategory: {},
    byType: {},
    byStudent: {},
  };
  function totals(list) {
    return { recordCount: list.length, dayCount: uniqueDays(list) };
  }
  const categoryRows = new Map(CATEGORY_KEYS.map((key) => [key, []]));
  const typeRows = new Map(
    Object.keys(TYPE_CATEGORIES).map((key) => [key, []]),
  );
  const studentRows = new Map();
  for (const record of clipped) {
    categoryRows.get(TYPE_CATEGORIES[record.type])?.push(record);
    typeRows.get(record.type)?.push(record);
    if (!studentRows.has(record.studentId))
      studentRows.set(record.studentId, []);
    studentRows.get(record.studentId).push(record);
  }
  for (const [key, rows] of categoryRows) result.byCategory[key] = totals(rows);
  for (const [key, rows] of typeRows) result.byType[key] = totals(rows);
  for (const [studentId, rows] of studentRows) {
    Object.defineProperty(result.byStudent, studentId, {
      value: totals(rows),
      enumerable: true,
    });
  }
  return result;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function planRestore(currentInput, incomingInput) {
  const current = migrateData(currentInput),
    incoming = migrateData(incomingInput);
  const preview = {
    incomingStudents: incoming.students.length,
    incomingRecords: incoming.records.length,
    newStudents: 0,
    newRecords: 0,
    skippedStudents: 0,
    skippedRecords: 0,
    recordConflicts: 0,
    identityConflicts: 0,
    conflicts: [],
    canMerge: true,
    settingsDiffer:
      canonical(current.settings) !== canonical(incoming.settings),
  };
  const ids = new Map(current.students.map((student) => [student.id, student]));
  const numbers = new Map(
    current.students
      .filter((student) => student.number !== null)
      .map((student) => [student.number, student]),
  );
  for (const student of incoming.students) {
    const known = ids.get(student.id),
      sameNumber = student.number !== null ? numbers.get(student.number) : null;
    if (
      (known &&
        (known.name !== student.name || known.number !== student.number)) ||
      (sameNumber && sameNumber.id !== student.id)
    ) {
      preview.identityConflicts++;
      preview.conflicts.push({
        kind: "student",
        id: student.id,
        message: "학생 식별자 또는 번호가 현재 명렬표와 충돌합니다.",
      });
    } else if (known) preview.skippedStudents++;
    else preview.newStudents++;
  }
  const currentRecords = new Map(
    current.records.map((record) => [record.id, record]),
  );
  for (const record of incoming.records) {
    const known = currentRecords.get(record.id);
    if (!known) preview.newRecords++;
    else if (canonical(known) === canonical(record)) preview.skippedRecords++;
    else {
      preview.recordConflicts++;
      preview.conflicts.push({
        kind: "record",
        id: record.id,
        message: "같은 식별자의 기록이 달라 현재 기록을 유지합니다.",
      });
    }
  }
  preview.canMerge =
    preview.identityConflicts === 0 &&
    current.students.length + preview.newStudents <= MAX_STUDENTS &&
    current.records.length + preview.newRecords <= MAX_RECORDS;
  return { current, incoming, preview };
}
export function previewRestore(current, incoming) {
  return planRestore(current, incoming).preview;
}
export function mergeData(currentInput, incomingInput) {
  const { current, incoming, preview } = planRestore(
    currentInput,
    incomingInput,
  );
  if (!preview.canMerge)
    fail(
      "학생 식별자·번호 충돌 또는 자료 수 제한 때문에 병합할 수 없습니다. 복원 미리보기를 확인해 주세요.",
    );
  const studentIds = new Set(current.students.map((student) => student.id));
  const recordIds = new Set(current.records.map((record) => record.id));
  current.students.push(
    ...incoming.students.filter((student) => !studentIds.has(student.id)),
  );
  current.records.push(
    ...incoming.records.filter((record) => !recordIds.has(record.id)),
  );
  // Settings and local metadata belong to the current device during merge.
  return { data: migrateData(current), preview };
}

if (typeof window !== "undefined")
  window.DDCore = Object.freeze({
    MAX_BACKUP_BYTES,
    MAX_STUDENTS,
    MAX_RECORDS,
    DEFAULT_SETTINGS,
    TYPE_CATEGORIES,
    DOC_TYPES,
    emptyData,
    migrateData,
    parseBackup,
    isValidDate,
    inclusiveDays,
    resolveRange,
    filterRecords,
    findOverlaps,
    summarize,
    previewRestore,
    mergeData,
  });
