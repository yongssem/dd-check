import test from "node:test";
import assert from "node:assert/strict";
import {
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
  MAX_BACKUP_BYTES,
} from "../js/core.mjs";

const student = (id = "s1", number = 1, name = "김하늘") => ({
  id,
  number,
  name,
});
const record = (changes = {}) => ({
  id: "r1",
  studentId: "s1",
  studentName: "김하늘",
  type: "sick-absence",
  startDate: "2026-10-23",
  endDate: "2026-10-23",
  memo: "",
  documents: {},
  ...changes,
});
const data = (
  records = [record()],
  students = [student()],
  settings = { fieldTripApplyDays: 3 },
) => ({
  schemaVersion: 2,
  students,
  records,
  settings,
});
const range = (startDate = "2026-10-01", endDate = "2026-10-31") => ({
  startDate,
  endDate,
});

test("exact dates reject overflow, wrong formats and century non-leap days", () => {
  for (const value of [
    "2026-02-29",
    "2026-04-31",
    "1900-02-29",
    "0000-01-01",
    "2026-1-01",
    "2026-01-01x",
    null,
    20260101,
  ]) {
    assert.equal(isValidDate(value), false, String(value));
  }
  for (const value of ["2024-02-29", "2000-02-29", "0001-01-01", "9999-12-31"])
    assert.equal(isValidDate(value), true);
  assert.equal(inclusiveDays("2024-02-28", "2024-03-01"), 3);
  assert.equal(inclusiveDays("0001-01-01", "0001-01-02"), 2);
  assert.throws(() => inclusiveDays("2026-10-24", "2026-10-23"));
});

test("month bounds and semester bounds include leap year February and academic years", () => {
  assert.deepEqual(
    resolveRange("month", { today: "2026-10-23", year: 2024, month: 1 }),
    {
      startDate: "2024-02-01",
      endDate: "2024-02-29",
      label: "2024년 2월 (2024-02-01 ~ 2024-02-29)",
    },
  );
  const expected = [
    ["2026-03-01", "2026-03-01", "2026-08-31"],
    ["2026-08-31", "2026-03-01", "2026-08-31"],
    ["2026-09-01", "2026-09-01", "2027-02-28"],
    ["2027-02-28", "2026-09-01", "2027-02-28"],
    ["2024-01-01", "2023-09-01", "2024-02-29"],
  ];
  for (const [today, startDate, endDate] of expected) {
    const resolved = resolveRange("semester", { today });
    assert.equal(resolved.startDate, startDate);
    assert.equal(resolved.endDate, endDate);
    assert.ok(resolved.label.includes(startDate));
    assert.ok(resolved.label.includes(endDate));
  }
  assert.throws(() => resolveRange("month", { month: 12 }));
  assert.throws(() =>
    resolveRange("custom", range("2026-11-01", "2026-10-01")),
  );
});

test("all period uses full actual records, including earlier starts and later ends", () => {
  const resolved = resolveRange("all", {
    today: "2026-10-23",
    records: [
      record(),
      record({ startDate: "2024-01-01", endDate: "2028-03-03" }),
    ],
  });
  assert.equal(resolved.startDate, "2024-01-01");
  assert.equal(resolved.endDate, "2028-03-03");
  const empty = resolveRange("all", { today: "2026-10-23", records: [] });
  assert.equal(empty.startDate, "2026-10-23");
  assert.match(empty.label, /등록 기록 없음/);
});

test("statistics clip long records, count records separately, and include weekends", () => {
  const rows = [
    record({ startDate: "2026-09-28", endDate: "2026-11-03" }),
    record({ id: "r2", startDate: "2026-10-23", endDate: "2026-10-25" }),
    record({ id: "r3", startDate: "2026-11-05", endDate: "2026-11-05" }),
  ];
  const result = summarize(rows, range());
  assert.equal(result.recordCount, 2);
  assert.equal(result.dayCount, 31);
  const weekend = summarize([rows[1]], range());
  assert.equal(weekend.recordCount, 1);
  assert.equal(weekend.dayCount, 3);
});

test("days union by persistent student identity, even across categories", () => {
  const rows = [
    record({ startDate: "2026-10-01", endDate: "2026-10-03" }),
    record({
      id: "r2",
      type: "sick-late",
      startDate: "2026-10-02",
      endDate: "2026-10-04",
    }),
    record({
      id: "r3",
      studentId: "s2",
      startDate: "2026-10-03",
      endDate: "2026-10-03",
    }),
  ];
  const result = summarize(rows, range());
  assert.equal(result.recordCount, 3);
  assert.equal(result.dayCount, 5);
  assert.equal(result.byStudent.s1.dayCount, 4);
  assert.equal(result.byStudent.s2.dayCount, 1);
  assert.equal(result.byCategory.absence.dayCount, 4);
  assert.equal(result.byCategory.late.dayCount, 3);
});

test("absence, recognized events, early, late, missed class and trip remain distinct", () => {
  const types = [
    "sick-absence",
    "approved-absence",
    "family-event",
    "sick-early",
    "sick-late",
    "sick-class",
    "field-trip",
  ];
  const result = summarize(
    types.map((type, i) => record({ id: `r${i}`, type })),
    range(),
  );
  assert.equal(result.byCategory.absence.recordCount, 1);
  assert.equal(result.byCategory.approved.recordCount, 2);
  for (const category of ["early", "late", "class", "trip"])
    assert.equal(result.byCategory[category].recordCount, 1);
  assert.equal(result.byType["family-event"].recordCount, 1);
  assert.equal(
    result.dayCount,
    1,
    "same student date is one overall calendar day",
  );
});

test("legacy migration is deterministic, retains names, missing roster records and document/settings metadata", () => {
  const legacy = {
    students: ["김하늘", " 김하늘 "],
    records: [
      {
        id: "old",
        studentName: "이바다",
        type: "field-trip",
        startDate: "2026-10-01",
        endDate: "2026-10-02",
        documents: { apply: true, report: false, absenceNote: true },
        memo: "원본 메모",
        custom: "보존",
      },
    ],
    settings: { fieldTripApplyDays: 0, customSetting: "유지" },
    meta: { source: "원본" },
  };
  const before = JSON.stringify(legacy),
    migrated = migrateData(legacy);
  assert.equal(JSON.stringify(legacy), before, "must not mutate source");
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.students.length, 3);
  assert.equal(migrated.students[0].name, "김하늘");
  assert.equal(migrated.students[1].name, " 김하늘 ");
  assert.notEqual(migrated.students[0].id, migrated.students[1].id);
  assert.equal(migrated.records[0].studentId, migrated.students[2].id);
  assert.deepEqual(migrated.records[0].documents, legacy.records[0].documents);
  assert.equal(migrated.records[0].custom, "보존");
  assert.equal(migrated.settings.customSetting, "유지");
  assert.equal(migrated.settings.fieldTripApplyDays, 0);
  assert.deepEqual(migrated.meta, legacy.meta);
  assert.deepEqual(migrateData(legacy), migrated);
  assert.deepEqual(migrateData(migrated), migrated);
});

test("legacy duplicate names collapse but new same names have separate numbers and IDs", () => {
  const old = migrateData({ students: ["김하늘", "김하늘"], records: [] });
  assert.equal(old.students.length, 1);
  const migrated = migrateData(
    data(
      [record(), record({ id: "r2", studentId: "s2" })],
      [student(), student("s2", 2)],
    ),
  );
  assert.equal(migrated.students.length, 2);
  assert.notEqual(migrated.records[0].studentId, migrated.records[1].studentId);
  assert.throws(
    () => migrateData(data([], [student(), student("s2", 1)])),
    /번호가 중복/,
  );
  assert.throws(
    () => migrateData(data([], [student(), student("s1", 2)])),
    /식별자가 중복/,
  );
});

test("overlap warning uses IDs and inclusive dates, excludes the edited record", () => {
  const rows = [
    record({ startDate: "2026-10-01", endDate: "2026-10-05" }),
    record({
      id: "r2",
      studentId: "s2",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
    }),
  ];
  assert.deepEqual(
    findOverlaps(
      rows,
      record({ id: "new", startDate: "2026-10-05", endDate: "2026-10-06" }),
    ).map((row) => row.id),
    ["r1"],
  );
  assert.equal(
    findOverlaps(
      rows,
      record({ startDate: "2026-10-05", endDate: "2026-10-06" }),
    ).length,
    0,
  );
  assert.equal(
    findOverlaps(
      rows,
      record({ id: "new", startDate: "2026-10-06", endDate: "2026-10-07" }),
    ).length,
    0,
  );
  assert.throws(() => findOverlaps(rows, record({ endDate: "2026-02-30" })));
});

test("name, student number, memo and period filters combine without altering the input", () => {
  const students = [student(), student("s2", 2, "이바다")];
  const rows = [
    record(),
    record({
      id: "r2",
      studentId: "s2",
      studentName: "이바다",
      memo: "병원 방문",
    }),
    record({
      id: "r3",
      studentId: "s2",
      studentName: "이바다",
      type: "field-trip",
      startDate: "2026-09-01",
      endDate: "2026-09-03",
    }),
  ];
  assert.equal(
    filterRecords(rows, { ...range(), query: "이바다", students }).length,
    1,
  );
  assert.equal(
    filterRecords(rows, { ...range(), query: "2", students }).length,
    1,
  );
  assert.equal(
    filterRecords(rows, {
      ...range(),
      query: "병원",
      studentId: "s2",
      type: "sick-absence",
      students,
    }).length,
    1,
  );
  assert.equal(
    filterRecords(rows, { ...range(), studentId: "s1", type: "field-trip" })
      .length,
    0,
  );
  assert.equal(rows.length, 3);
});

test("HTML-looking names and memos stay literal inert data; dangerous object properties rejected", () => {
  const name = "<img src=x onerror=alert(1)>",
    memo = "<script>globalThis.compromised=true</script>";
  const migrated = migrateData(
    data([record({ studentName: name, memo })], [student("s1", 1, name)]),
  );
  assert.equal(migrated.students[0].name, name);
  assert.equal(migrated.records[0].memo, memo);
  assert.equal(globalThis.compromised, undefined);
  assert.throws(
    () =>
      parseBackup('{"students":[],"records":[],"__proto__":{"polluted":true}}'),
    /허용하지 않는 속성/,
  );
  assert.equal({}.polluted, undefined);
});

test("malformed backups fail atomically instead of silently dropping bad records", () => {
  const invalid = [
    null,
    [],
    {},
    { students: "Kim", records: [] },
    { students: [], records: {} },
    { schemaVersion: 9, students: [], records: [] },
    data([record({ startDate: "2026-02-29" })]),
    data([record({ endDate: "2026-10-01" })]),
    data([record({ type: "unknown" })]),
    data([record({ studentId: "missing" })]),
    data([record({ documents: { apply: "true" } })]),
    data([record({ documents: { unexpected: true } })]),
    data([record({ memo: 15 })]),
    data([record({ studentName: [] })]),
    data([record({ createdAt: "not a time" })]),
    data([record(), record()]),
    data([record({ createdAt: "2026-02-30T00:00:00.000Z" })]),
    data([], [student("s1", -1)]),
    data([], [student("s1", 1.2)]),
    data([], [student()], { fieldTripApplyDays: "3" }),
    data([], [student()], { fieldTripApplyDays: -1 }),
    data([], [student()], { fieldTripApplyDays: 366 }),
  ];
  for (const value of invalid)
    assert.throws(() => migrateData(value), JSON.stringify(value));
  assert.throws(() => parseBackup("{invalid json}"), /JSON/);
  const mixed = data([record(), record({ id: "r2", endDate: "bad" })]);
  const before = JSON.stringify(mixed);
  assert.throws(() => parseBackup(before));
  assert.equal(JSON.stringify(mixed), before);
});

test("oversized and excessively nested backups are rejected before restore", () => {
  assert.throws(() => parseBackup(" ".repeat(MAX_BACKUP_BYTES + 1)), /5MB/);
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          ...emptyData(),
          extra: "한".repeat(MAX_BACKUP_BYTES / 3),
        }),
      ),
    /5MB/,
  );
  let nested = "leaf";
  for (let i = 0; i < 25; i++) nested = { value: nested };
  assert.throws(() => migrateData({ ...emptyData(), meta: nested }), /중첩/);
  const cyclic = emptyData();
  cyclic.meta = cyclic;
  assert.throws(() => migrateData(cyclic), /JSON/);
});

test("preview counts new, exact duplicate and conflicting records; merge keeps current conflict/settings", () => {
  const current = migrateData(
    data([record(), record({ id: "same", memo: "기존" })]),
  );
  const incoming = migrateData(
    data(
      [
        record(),
        record({ id: "same", memo: "가져온 변경" }),
        record({ id: "new", studentId: "s2", studentName: "이바다" }),
      ],
      [student(), student("s2", 2, "이바다")],
      { fieldTripApplyDays: 0 },
    ),
  );
  const preview = previewRestore(current, incoming);
  assert.equal(preview.incomingStudents, 2);
  assert.equal(preview.incomingRecords, 3);
  assert.equal(preview.newStudents, 1);
  assert.equal(preview.skippedStudents, 1);
  assert.equal(preview.newRecords, 1);
  assert.equal(preview.skippedRecords, 1);
  assert.equal(preview.recordConflicts, 1);
  assert.equal(preview.identityConflicts, 0);
  assert.equal(preview.canMerge, true);
  assert.equal(preview.settingsDiffer, true);
  const before = JSON.stringify(current),
    incomingBefore = JSON.stringify(incoming);
  const merged = mergeData(current, incoming);
  assert.equal(merged.data.records.length, 3);
  assert.equal(merged.data.students.length, 2);
  assert.equal(
    merged.data.records.find((row) => row.id === "same").memo,
    "기존",
  );
  assert.equal(merged.data.settings.fieldTripApplyDays, 3);
  assert.equal(JSON.stringify(current), before);
  assert.equal(JSON.stringify(incoming), incomingBefore);
});

test("student number collisions, renamed identities and changed numbers block ambiguous merge", () => {
  const current = data();
  const incomingCases = [
    data([], [student("different-id", 1)]),
    data([], [student("s1", 1, "다른 이름")]),
    data([], [student("s1", 2)]),
  ];
  for (const incoming of incomingCases) {
    const preview = previewRestore(current, incoming);
    assert.equal(preview.identityConflicts, 1);
    assert.equal(preview.canMerge, false);
    assert.throws(() => mergeData(current, incoming), /병합할 수 없습니다/);
  }
});

test("same-name different-ID different-number students can merge without losing identity", () => {
  const merged = mergeData(
    data(),
    data([record({ id: "r2", studentId: "s2" })], [student("s2", 2)]),
  );
  assert.equal(merged.preview.canMerge, true);
  assert.equal(merged.data.students.length, 2);
  assert.deepEqual(
    merged.data.students.map((row) => row.number),
    [1, 2],
  );
  assert.equal(summarize(merged.data.records, range()).dayCount, 2);
});

test("record-ID collision across different students is shown and existing record retained", () => {
  const merged = mergeData(
    data(),
    data([record({ studentId: "s2" })], [student("s2", 2)]),
  );
  assert.equal(merged.preview.recordConflicts, 1);
  assert.equal(merged.preview.newRecords, 0);
  assert.equal(merged.data.records[0].studentId, "s1");
});

test("required documents missing are pending data, extra known documents survive type changes", () => {
  const migrated = migrateData(
    data([record({ type: "field-trip", documents: { absenceNote: true } })]),
  );
  assert.equal(migrated.records[0].documents.apply, undefined);
  assert.equal(migrated.records[0].documents.report, undefined);
  assert.equal(migrated.records[0].documents.absenceNote, true);
  assert.deepEqual(migrateData({ students: [], records: [] }).settings, {
    fieldTripApplyDays: 3,
  });
});

test("union implementation handles exceptionally long intervals without iterating every day", () => {
  const result = summarize(
    [record({ startDate: "0001-01-01", endDate: "9999-12-31" })],
    range("0001-01-01", "9999-12-31"),
  );
  assert.equal(result.dayCount, 3652059);
});
