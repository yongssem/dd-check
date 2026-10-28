import * as Core from "./core.mjs";

const KEY = "ddcheck_data";
const TYPES = [
  ["field-trip", "교외체험학습", "trip", "#286d91", ["apply", "report"]],
  ["sick-absence", "질병결석", "absence", "#a63837", ["absenceNote"]],
  ["unauth-absence", "미인정결석", "absence", "#a63837", ["absenceNote"]],
  ["other-absence", "기타결석", "absence", "#a63837", ["absenceNote"]],
  [
    "approved-absence",
    "학교장인정결석",
    "approved",
    "#087f72",
    ["absenceNote"],
  ],
  ["sick-early", "질병조퇴", "early", "#86621d", []],
  ["unauth-early", "미인정조퇴", "early", "#86621d", []],
  ["other-early", "기타조퇴", "early", "#86621d", []],
  ["sick-late", "질병지각", "late", "#78599a", []],
  ["unauth-late", "미인정지각", "late", "#78599a", []],
  ["other-late", "기타지각", "late", "#78599a", []],
  ["sick-class", "질병결과", "class", "#287787", []],
  ["unauth-class", "미인정결과", "class", "#287787", []],
  ["other-class", "기타결과", "class", "#287787", []],
  ["family-event", "경조사", "approved", "#087f72", []],
].map(([id, label, category, color, docs]) => ({
  id,
  label,
  category,
  color,
  docs,
}));
const CATEGORIES = [
  ["trip", "교외체험학습"],
  ["absence", "결석"],
  ["approved", "인정결석·경조사"],
  ["early", "조퇴"],
  ["late", "지각"],
  ["class", "결과"],
];
const DOCS = { apply: "신청서", report: "보고서", absenceNote: "결석계" };
const root = document.querySelector("#app");
const state = {
  view: "calendar",
  date: today(),
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  period: "month",
  startDate: "",
  endDate: "",
  query: "",
  type: "",
  category: "",
  studentId: "",
  docsOnly: false,
};
let data,
  storageError = "",
  originalRaw = null;
const copy = (value) => JSON.parse(JSON.stringify(value));
const typeOf = (id) => TYPES.find((t) => t.id === id);
const uid = () => crypto.randomUUID();
function today() {
  const d = new Date();
  return dateString(d.getFullYear(), d.getMonth(), d.getDate());
}
function dateString(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function dateLabel(str) {
  const [y, m, d] = str.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
}
function studentOf(record) {
  return data.students.find((s) => s.id === record.studentId);
}
function studentLabel(student) {
  return `${student?.number ? `${student.number}번 · ` : ""}${student?.name || "학생 정보 없음"}`;
}
function compareStudents(a, b) {
  return (
    (a.number ?? Infinity) - (b.number ?? Infinity) ||
    a.name.localeCompare(b.name, "ko")
  );
}
function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}
function add(parent, ...children) {
  children
    .flat(Infinity)
    .filter((x) => x !== null && x !== undefined && x !== false)
    .forEach((child) => parent.append(child));
  return parent;
}
function button(text, fn, className = "", attrs = {}) {
  const b = el("button", className, text);
  b.type = "button";
  Object.entries(attrs).forEach(([k, v]) => b.setAttribute(k, v));
  b.addEventListener("click", () => {
    try {
      fn();
    } catch (error) {
      notify(error.message || "작업을 완료하지 못했습니다.", true);
    }
  });
  return b;
}
function field(label, input, note) {
  const l = el("label", "", label);
  add(l, input);
  if (note) add(l, el("p", "field-note", note));
  return l;
}
function input(type, value = "", id) {
  const n = el("input");
  n.type = type;
  n.value = value;
  if (id) n.id = id;
  return n;
}
function select(options, value) {
  const n = el("select");
  options.forEach(([v, label]) => {
    const opt = el("option", "", label);
    opt.value = v;
    n.append(opt);
  });
  n.value = value;
  return n;
}
function notify(message, error = false) {
  const activeDialog = [...document.querySelectorAll("dialog[open]")].at(-1);
  if (activeDialog && error) {
    let warning = activeDialog.querySelector(".dialog-error");
    if (!warning) {
      warning = el("p", "notice error dialog-error");
      warning.setAttribute("role", "alert");
      activeDialog.querySelector(".dialog-body").prepend(warning);
    }
    warning.textContent = message;
  }
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.className = error ? "error" : "";
  t.hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => (t.hidden = true), 6000);
}
function panel(title) {
  const p = el("section", "panel");
  if (title) add(p, el("h2", "settings-title", title));
  return p;
}
function empty(title, description) {
  return add(
    el("div", "empty"),
    el("strong", "", title),
    el("span", "", description),
  );
}
function guard() {
  if (storageError)
    throw new Error(
      "기존 저장 자료를 읽지 못해 변경을 잠갔습니다. 설정에서 원본을 내려받아 주세요.",
    );
}
function safeMeta(value) {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const counter =
    Number.isSafeInteger(source.mutationCount) && source.mutationCount >= 0
      ? Math.min(source.mutationCount, Number.MAX_SAFE_INTEGER - 1)
      : 0;
  return {
    ...source,
    lastExportAt:
      typeof source.lastExportAt === "string" &&
      Number.isFinite(Date.parse(source.lastExportAt))
        ? source.lastExportAt
        : null,
    mutationCount: counter,
  };
}
function save(next, { count = true } = {}) {
  guard();
  const valid = Core.migrateData(next);
  valid.meta = safeMeta(valid.meta);
  valid.meta.mutationCount += count ? 1 : 0;
  const serialized = JSON.stringify(valid);
  if (new TextEncoder().encode(serialized).length > Core.MAX_BACKUP_BYTES)
    throw new Error(
      "자료가 파일 복원 한도인 5MB를 넘습니다. 메모나 기록 수를 정리해 주세요.",
    );
  try {
    localStorage.setItem(KEY, serialized);
  } catch (error) {
    throw new Error(
      "기기에 저장하지 못했습니다. 저장 공간과 브라우저 설정을 확인해 주세요. 기존 자료는 유지됩니다.",
    );
  }
  data = valid;
}
function mutate(fn, message) {
  const next = copy(data);
  fn(next);
  save(next);
  render();
  if (message) notify(message);
}
function snapshot(key, raw) {
  try {
    localStorage.setItem(key, raw);
  } catch {
    throw new Error(
      "복구용 원본 사본을 보관할 공간이 없어 작업을 중단했습니다. 파일 백업 후 다시 시도해 주세요.",
    );
  }
}
function load() {
  try {
    originalRaw = localStorage.getItem(KEY);
    data = originalRaw
      ? Core.migrateData(JSON.parse(originalRaw))
      : Core.emptyData();
    if (
      originalRaw &&
      JSON.stringify(JSON.parse(originalRaw)) !== JSON.stringify(data)
    ) {
      if (localStorage.getItem("ddcheck_recovery_before_migration") === null)
        snapshot("ddcheck_recovery_before_migration", originalRaw);
      localStorage.setItem(KEY, JSON.stringify(data));
    }
  } catch (error) {
    storageError = error.message || "저장 자료를 읽지 못했습니다.";
    data = Core.emptyData();
  }
}
function backupInfo() {
  const meta = safeMeta(data.meta);
  return meta.lastExportAt
    ? `마지막 다운로드 요청 ${new Date(meta.lastExportAt).toLocaleString("ko-KR")} · 이후 변경 ${meta.mutationCount}회`
    : `아직 파일 백업을 요청하지 않았습니다. · 저장 변경 ${meta.mutationCount}회`;
}
function download(text, name) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = el("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportBackup() {
  guard();
  const stamp = new Date().toISOString();
  const next = copy(data);
  next.meta = { ...safeMeta(next.meta), lastExportAt: stamp, mutationCount: 0 };
  const valid = Core.migrateData(next);
  download(JSON.stringify(valid), `뚝딱체크_백업_${today()}.json`);
  try {
    save(valid, { count: false });
    render();
    notify(
      "백업 다운로드를 요청했습니다. 파일이 실제로 저장됐는지 확인해 주세요.",
    );
  } catch (error) {
    notify(
      `다운로드를 요청했지만 백업 안내 날짜를 저장하지 못했습니다. ${error.message}`,
      true,
    );
  }
}
function docStatus(record, key) {
  if (record.documents?.[key]) return "done";
  if (key === "apply" && today() > applyDeadline(record)) return "overdue";
  return "pending";
}
function applyDeadline(record) {
  const d = new Date(`${record.startDate}T12:00:00`);
  d.setDate(d.getDate() - (data.settings?.fieldTripApplyDays ?? 3));
  return dateString(d.getFullYear(), d.getMonth(), d.getDate());
}
function pendingDocs(record) {
  return typeOf(record.type).docs.some((key) => !record.documents?.[key]);
}
function dialog(title, { side = false } = {}) {
  const d = el("dialog", `dialog${side ? " side-dialog" : ""}`);
  const inner = el("div", "dialog-inner");
  const head = add(
    el("div", "dialog-head"),
    el("h2", "", title),
    button("닫기", () => d.close(), "subtle"),
  );
  const body = el("div", "dialog-body");
  add(inner, head, body);
  add(d, inner);
  document.body.append(d);
  d.addEventListener("close", () => d.remove());
  d.showModal();
  return { dialog: d, body, inner };
}
function confirmAction(title, message, fn, accept = "계속하기") {
  const { dialog: d, body } = dialog(title);
  add(
    body,
    el("p", "text-break", message),
    add(
      el("div", "dialog-footer"),
      button("취소", () => d.close()),
      button(
        accept,
        () => {
          fn();
          d.close();
        },
        "primary",
      ),
    ),
  );
}
function switchView(view) {
  state.view = view;
  render();
  window.scrollTo(0, 0);
  document.querySelector("#main-content").focus({ preventScroll: true });
}
function render() {
  root.replaceChildren();
  const shell = el("div", "shell");
  const header = el("header", "app-header");
  const brand = add(
    el("div", "brand"),
    el("span", "brand-mark", "✓"),
    add(
      el("div"),
      el("h1", "", "뚝딱체크"),
      el("p", "eyebrow", "우리 반 출결과 제출 서류를 한눈에"),
    ),
  );
  const tools = add(
    el("div", "toolbar"),
    button("파일 백업", exportBackup, "header-backup"),
    button("+ 기록 추가", () => openRecord(), "primary"),
  );
  add(header, brand, tools);
  const nav = el("nav", "nav");
  nav.setAttribute("aria-label", "주 메뉴");
  [
    ["calendar", "달력"],
    ["statistics", "기록·통계"],
    ["students", "학생"],
    ["settings", "설정·백업"],
  ].forEach(([v, l]) =>
    add(
      nav,
      button(l, () => switchView(v), "", {
        "aria-current": state.view === v ? "page" : "false",
      }),
    ),
  );
  const main = el("main");
  main.id = "main-content";
  main.tabIndex = -1;
  if (storageError)
    add(
      main,
      add(
        el("div", "notice error"),
        el("p", "", `저장 자료 보호를 위해 변경을 잠갔습니다. ${storageError}`),
        button("원본 내려받기", () =>
          download(originalRaw ?? "", "뚝딱체크_복구원본.json"),
        ),
      ),
    );
  if (state.view === "calendar") renderCalendar(main);
  else if (state.view === "statistics") renderStatistics(main);
  else if (state.view === "students") renderStudents(main);
  else renderSettings(main);
  const footer = el("footer", "app-footer");
  const brandLink = el("a", "", "무궁무진클래스");
  brandLink.href = "https://mumuclass.kr";
  brandLink.target = "_blank";
  brandLink.rel = "noreferrer noopener";
  add(footer, "© 2026 ", brandLink, " · 바이브용샘");
  add(shell, header, nav, main, footer);
  add(root, shell);
}
function renderCalendar(main) {
  const forToday = data.records.filter(
    (r) => r.startDate <= today() && r.endDate >= today(),
  );
  const pending = data.records.filter(pendingDocs);
  const summary = el("div", "summary-grid");
  add(
    summary,
    add(
      el("div", "summary"),
      add(
        el("div"),
        el("p", "eyebrow", "오늘 출결 특이사항"),
        el("p", "muted", dateLabel(today())),
      ),
      el("strong", "accent", `${forToday.length}건`),
    ),
    add(
      el("div", "summary"),
      add(
        el("div"),
        el("p", "eyebrow", "서류 확인 필요"),
        button(
          "미확인 기록 보기",
          () => {
            state.docsOnly = true;
            state.period = "all";
            state.query = "";
            state.type = "";
            state.category = "";
            state.studentId = "";
            switchView("statistics");
          },
          "subtle small",
        ),
      ),
      el("strong", "", `${pending.length}건`),
    ),
  );
  add(main, summary);
  const workspace = el("div", "workspace");
  const cal = panel();
  const heading = el("div", "calendar-head");
  add(
    heading,
    add(
      el("div"),
      el("p", "eyebrow", "날짜를 선택해 기록을 확인하세요"),
      el("h2", "", `${state.year}년 ${state.month + 1}월`),
    ),
    add(
      el("div", "month-nav"),
      button("‹", () => moveMonth(-1), "", { "aria-label": "이전 달" }),
      button(
        "오늘",
        () => {
          const t = new Date();
          state.year = t.getFullYear();
          state.month = t.getMonth();
          state.date = today();
          render();
        },
        "small",
      ),
      button("›", () => moveMonth(1), "", { "aria-label": "다음 달" }),
    ),
  );
  add(cal, heading);
  const week = el("div", "weekday");
  ["일", "월", "화", "수", "목", "금", "토"].forEach((d) =>
    add(week, el("span", "", d)),
  );
  add(cal, week);
  const grid = el("div", "calendar-grid");
  grid.setAttribute("aria-label", `${state.year}년 ${state.month + 1}월 달력`);
  const first = new Date(state.year, state.month, 1).getDay();
  const days = new Date(state.year, state.month + 1, 0).getDate();
  for (let i = 0; i < first; i++) add(grid, el("div", "day-empty"));
  for (let day = 1; day <= days; day++) {
    const date = dateString(state.year, state.month, day);
    const records = data.records.filter(
      (r) => r.startDate <= date && r.endDate >= date,
    );
    const dow = new Date(state.year, state.month, day).getDay();
    const b = button(
      "",
      () => {
        state.date = date;
        render();
        document
          .querySelector(`[data-date="${date}"]`)
          ?.focus({ preventScroll: true });
      },
      `day-cell${date === today() ? " today" : ""}${dow === 0 ? " sunday" : ""}${dow === 6 ? " saturday" : ""}`,
      {
        "aria-label": `${dateLabel(date)}, 출결 ${records.length}건`,
        "aria-pressed": String(state.date === date),
      },
    );
    b.dataset.date = date;
    add(b, el("span", "day-number", day));
    records.slice(0, 2).forEach((r) => {
      const chip = el(
        "span",
        "day-chip",
        `${studentLabel(studentOf(r))} · ${typeOf(r.type).label}`,
      );
      chip.title = chip.textContent;
      chip.style.setProperty("--chip", typeOf(r.type).color);
      add(b, chip);
    });
    if (records.length)
      add(
        b,
        el(
          "span",
          "day-count",
          `${records.length}건${records.length > 2 ? " +" : ""}`,
        ),
      );
    b.addEventListener("keydown", (event) => {
      const offsets = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: -7,
        ArrowDown: 7,
      };
      if (offsets[event.key] !== undefined) {
        event.preventDefault();
        const target = new Date(`${date}T12:00:00`);
        target.setDate(target.getDate() + offsets[event.key]);
        state.date = dateString(
          target.getFullYear(),
          target.getMonth(),
          target.getDate(),
        );
        state.year = target.getFullYear();
        state.month = target.getMonth();
        render();
        document.querySelector(`[data-date="${state.date}"]`)?.focus();
      }
    });
    add(grid, b);
  }
  add(
    cal,
    grid,
    el(
      "p",
      "calendar-foot",
      "여러 날에 걸친 기록은 해당 날짜마다 표시됩니다. 달력 날짜는 방향키로도 이동할 수 있습니다.",
    ),
  );
  const detail = panel();
  const records = data.records.filter(
    (r) => r.startDate <= state.date && r.endDate >= state.date,
  );
  add(
    detail,
    add(
      el("div", "panel-head"),
      add(
        el("div"),
        el("p", "eyebrow", "선택한 날짜"),
        el("h2", "", dateLabel(state.date)),
      ),
      button("+ 기록", () => openRecord(), "primary small"),
    ),
  );
  add(
    detail,
    el(
      "p",
      "period-caption",
      `출결 ${records.length}건 · 같은 날짜의 기록을 함께 확인하세요.`,
    ),
  );
  const list = el("div", "record-list");
  records
    .sort((a, b) => compareStudents(studentOf(a), studentOf(b)))
    .forEach((r) => add(list, recordCard(r)));
  if (!records.length)
    add(
      list,
      empty(
        "아직 등록된 기록이 없습니다.",
        "위의 + 기록 버튼으로 선택한 날짜의 출결을 추가하세요.",
      ),
    );
  add(detail, list);
  add(workspace, cal, detail);
  add(
    main,
    workspace,
    add(
      el("div", "notice section-gap"),
      el(
        "span",
        "",
        "자료는 이 브라우저에만 저장됩니다. 브라우저 자료 삭제 전에는 파일 백업이 필요합니다.",
      ),
      button("백업 안내", () => switchView("settings"), "small"),
    ),
    el("p", "backup-hint", backupInfo()),
  );
}
function moveMonth(delta) {
  const d = new Date(state.year, state.month + delta, 1);
  state.year = d.getFullYear();
  state.month = d.getMonth();
  state.date = dateString(state.year, state.month, 1);
  render();
}
function recordCard(record) {
  const type = typeOf(record.type);
  const card = el("article", "record-card");
  const badge = el("span", "type-badge", type.label);
  badge.style.setProperty("--badge", type.color);
  add(
    card,
    add(
      el("div", "heading"),
      button(
        studentLabel(studentOf(record)),
        () => openStudent(record.studentId),
        "student-link",
      ),
      badge,
    ),
    el(
      "p",
      "date-line",
      `${record.startDate} ~ ${record.endDate} · ${Core.inclusiveDays(record.startDate, record.endDate)}달력일`,
    ),
  );
  if (record.memo) add(card, el("p", "memo", record.memo));
  if (type.docs.length) {
    const row = el("div", "doc-row");
    type.docs.forEach((key) => {
      const status = docStatus(record, key);
      const b = button(
        `${status === "done" ? "✓" : "○"} ${DOCS[key]} · ${status === "done" ? "제출 완료" : status === "overdue" ? "기한 지남" : "확인 필요"}`,
        () =>
          mutate((next) => {
            const r = next.records.find((x) => x.id === record.id);
            r.documents = {
              ...(r.documents || {}),
              [key]: !r.documents?.[key],
            };
          }, "서류 확인 상태를 저장했습니다."),
        `doc-button ${status}`,
        {
          "aria-pressed": String(status === "done"),
          "aria-label": `${studentLabel(studentOf(record))} ${DOCS[key]} ${status === "done" ? "제출 완료, 확인 필요로 변경" : "확인 필요, 제출 완료로 변경"}`,
        },
      );
      add(row, b);
    });
    add(card, row);
    if (type.docs.includes("apply"))
      add(
        card,
        el(
          "p",
          "field-note",
          `신청서 확인 기준일 ${applyDeadline(record)} · 시작 ${data.settings.fieldTripApplyDays}일 전`,
        ),
      );
  }
  add(
    card,
    add(
      el("div", "record-actions"),
      button("수정", () => openRecord(record), "small subtle"),
      button(
        "삭제",
        () =>
          confirmAction(
            "기록 삭제",
            `${studentLabel(studentOf(record))} 학생의 ${type.label} 기록을 삭제할까요? 삭제 전에 파일 백업을 권합니다.`,
            () =>
              mutate(
                (next) =>
                  (next.records = next.records.filter(
                    (r) => r.id !== record.id,
                  )),
                "기록을 삭제했습니다.",
              ),
            "삭제하기",
          ),
        "small subtle danger",
      ),
    ),
  );
  return card;
}
function range() {
  return Core.resolveRange(state.period, {
    today: today(),
    year: state.year,
    month: state.month,
    startDate: state.startDate,
    endDate: state.endDate,
    records: data.records,
  });
}
function filteredRecords(rng) {
  let records = Core.filterRecords(data.records, {
    ...rng,
    studentId: state.studentId,
    type: state.type,
    query: state.query,
    students: data.students,
  });
  if (state.category)
    records = records.filter((r) => typeOf(r.type).category === state.category);
  if (state.docsOnly) records = records.filter(pendingDocs);
  return records;
}
function renderStatistics(main) {
  add(
    main,
    add(
      el("div", "view-header"),
      add(
        el("div"),
        el("h2", "", "기록과 통계"),
        el(
          "p",
          "lead",
          "집계 기간과 출결 유형을 골라 학생별 기록을 확인하세요.",
        ),
      ),
      button(
        "필터 초기화",
        () => {
          Object.assign(state, {
            query: "",
            type: "",
            category: "",
            studentId: "",
            docsOnly: false,
            period: "month",
          });
          render();
        },
        "small",
      ),
    ),
  );
  const p = panel();
  const row = el("div", "period-row");
  const period = select(
    [
      ["month", "선택한 달"],
      ["semester", "이번 학기"],
      ["custom", "직접 기간 선택"],
      ["all", "전체 기간"],
    ],
    state.period,
  );
  period.addEventListener("change", () => {
    state.period = period.value;
    if (period.value === "custom" && (!state.startDate || !state.endDate)) {
      state.startDate = dateString(state.year, state.month, 1);
      state.endDate = dateString(
        state.year,
        state.month,
        new Date(state.year, state.month + 1, 0).getDate(),
      );
    }
    render();
  });
  add(row, field("집계 기간", period));
  if (state.period === "month") {
    const month = input(
      "month",
      `${state.year}-${String(state.month + 1).padStart(2, "0")}`,
    );
    month.addEventListener("change", () => {
      if (month.value) {
        const [y, m] = month.value.split("-").map(Number);
        state.year = y;
        state.month = m - 1;
        render();
      }
    });
    add(row, field("달 선택", month));
  }
  if (state.period === "custom") {
    const start = input("date", state.startDate),
      end = input("date", state.endDate);
    start.addEventListener("change", () => (state.startDate = start.value));
    end.addEventListener("change", () => (state.endDate = end.value));
    add(
      row,
      field("시작일", start),
      field("종료일", end),
      button(
        "기간 적용",
        () => {
          if (
            !Core.isValidDate(state.startDate) ||
            !Core.isValidDate(state.endDate) ||
            state.startDate > state.endDate
          )
            throw new Error("시작일과 종료일을 올바르게 선택해 주세요.");
          render();
        },
        "primary",
      ),
    );
  }
  add(p, row);
  let rng;
  try {
    rng = range();
  } catch {
    add(
      p,
      empty(
        "기간을 확인해 주세요.",
        "시작일과 종료일을 입력하고 기간 적용을 눌러 주세요.",
      ),
    );
    add(main, p);
    return;
  }
  const filters = el("div", "filter-bar");
  const search = input("search", state.query);
  search.placeholder = "학생 이름·번호·메모 검색";
  search.addEventListener("input", () => {
    state.query = search.value;
    clearTimeout(search.timer);
    search.timer = setTimeout(() => {
      const pos = search.selectionStart;
      render();
      const target = document.querySelector("#record-search");
      target?.focus();
      target?.setSelectionRange(pos, pos);
    }, 250);
  });
  search.id = "record-search";
  const type = select(
    [["", "모든 출결 유형"], ...TYPES.map((t) => [t.id, t.label])],
    state.type,
  );
  type.addEventListener("change", () => {
    state.type = type.value;
    state.category = "";
    render();
  });
  const student = select(
    [
      ["", "모든 학생"],
      ...[...data.students]
        .sort(compareStudents)
        .map((s) => [s.id, studentLabel(s)]),
    ],
    state.studentId,
  );
  student.addEventListener("change", () => {
    state.studentId = student.value;
    render();
  });
  add(
    filters,
    field("검색", search),
    field("출결 유형", type),
    field("학생", student),
  );
  add(p, filters);
  const docCheck = input("checkbox");
  docCheck.checked = state.docsOnly;
  docCheck.addEventListener("change", () => {
    state.docsOnly = docCheck.checked;
    render();
  });
  add(
    p,
    add(
      el("label", "check-label"),
      docCheck,
      el("span", "", "서류 확인이 필요한 기록만 보기"),
    ),
  );
  const records = filteredRecords(rng);
  const stats = Core.summarize(records, rng);
  add(
    p,
    el(
      "p",
      "period-caption",
      `${rng.label} · 집계 범위 ${rng.startDate || "자료 시작"} ~ ${rng.endDate || "자료 끝"}`,
    ),
  );
  const totals = add(
    el("div", "notice"),
    el(
      "span",
      "",
      `등록 기록 ${stats.recordCount}건 · 해당 달력일수 ${stats.dayCount}일`,
    ),
    el("span", "muted", "주말 포함"),
  );
  add(
    p,
    totals,
    el(
      "p",
      "muted",
      "달력일수는 학생별로 계산해 합하며, 같은 학생의 겹친 날짜는 한 번만 셉니다. 유형끼리 날짜가 겹치면 유형별 일수의 합과 전체 일수가 다를 수 있습니다. 학교의 공식 출석·수업일수는 계산하지 않습니다.",
    ),
  );
  const metrics = el("div", "metric-grid");
  CATEGORIES.forEach(([key, label]) => {
    const value = stats.byCategory[key] || { recordCount: 0, dayCount: 0 };
    const b = button(
      "",
      () => {
        state.category = state.category === key ? "" : key;
        state.type = "";
        render();
      },
      "metric",
      { "aria-pressed": String(state.category === key) },
    );
    add(
      b,
      el("span", "", label),
      el("b", "", `${value.recordCount}건`),
      el("span", "", `해당 달력일수 ${value.dayCount}일`),
    );
    add(metrics, b);
  });
  add(p, metrics, typeBreakdown(stats));
  if (state.category)
    add(
      p,
      add(
        el("div", "notice"),
        el(
          "span",
          "",
          `${CATEGORIES.find(([k]) => k === state.category)[1]}만 표시 중`,
        ),
        button(
          "유형 묶음 해제",
          () => {
            state.category = "";
            render();
          },
          "small",
        ),
      ),
    );
  const table = el("table");
  add(
    table,
    add(
      el("thead"),
      add(
        el("tr"),
        ["학생", "등록 건수", "달력일수 (주말 포함)", "기록 보기"].map((t) =>
          el("th", "", t),
        ),
      ),
    ),
  );
  const tbody = el("tbody");
  Object.entries(stats.byStudent)
    .sort(([a], [b]) =>
      compareStudents(
        data.students.find((s) => s.id === a),
        data.students.find((s) => s.id === b),
      ),
    )
    .forEach(([id, values]) =>
      add(
        tbody,
        add(
          el("tr"),
          el("td", "", studentLabel(data.students.find((s) => s.id === id))),
          el("td", "", `${values.recordCount}건`),
          el("td", "", `${values.dayCount}일`),
          add(
            el("td"),
            button("학생 이력", () => openStudent(id), "small"),
          ),
        ),
      ),
    );
  add(table, tbody);
  if (records.length)
    add(
      p,
      el("h3", "section-gap", "학생별 누적 현황"),
      add(el("div", "table-wrap section-gap"), table),
    );
  add(main, p);
  const listPanel = panel();
  add(
    listPanel,
    add(
      el("div", "panel-head"),
      el("h2", "", `조건에 맞는 기록 ${records.length}건`),
    ),
  );
  const list = el("div", "record-list");
  records
    .sort(
      (a, b) =>
        b.startDate.localeCompare(a.startDate) ||
        compareStudents(studentOf(a), studentOf(b)),
    )
    .slice(0, 100)
    .forEach((r) => add(list, recordCard(r)));
  if (!records.length)
    add(
      list,
      empty(
        "조건에 맞는 기록이 없습니다.",
        "기간이나 검색 조건을 바꿔 보세요.",
      ),
    );
  if (records.length > 100)
    add(
      list,
      el(
        "p",
        "muted",
        "화면에는 최근 100건을 표시합니다. 위 통계는 조건에 맞는 전체 기록을 집계합니다. 기간·학생으로 범위를 좁혀 주세요.",
      ),
    );
  add(listPanel, list);
  listPanel.classList.add("section-gap");
  add(main, listPanel);
}
function openRecord(existing) {
  guard();
  const selected = existing?.startDate || state.date || today();
  const { dialog: d, body } = dialog(
    existing ? "출결 기록 수정" : "출결 기록 추가",
    { side: true },
  );
  const form = el("form");
  const grid = el("div", "form-grid");
  const studentSelect = select([], existing?.studentId || "");
  studentSelect.required = true;
  studentSelect.id = "record-student";
  function populateStudents(value) {
    studentSelect.replaceChildren();
    add(
      studentSelect,
      Object.assign(el("option", "", "학생을 선택해 주세요"), { value: "" }),
    );
    [...data.students]
      .sort(compareStudents)
      .forEach((s) =>
        add(
          studentSelect,
          Object.assign(el("option", "", studentLabel(s)), { value: s.id }),
        ),
      );
    studentSelect.value = value || "";
  }
  populateStudents(existing?.studentId);
  const studentField = field(
    "학생",
    studentSelect,
    "학생 번호로 동명이인을 구분합니다.",
  );
  studentField.classList.add("full");
  add(
    studentField,
    button(
      "+ 학생 등록",
      () => openStudentForm(null, (student) => populateStudents(student.id)),
      "small subtle",
    ),
  );
  const type = select(
    [["", "유형을 선택해 주세요"], ...TYPES.map((t) => [t.id, t.label])],
    existing?.type || "",
  );
  type.required = true;
  type.id = "record-type";
  const typeField = field("출결 유형", type);
  typeField.classList.add("full");
  const start = input("date", selected, "record-start-date"),
    end = input("date", existing?.endDate || selected, "record-end-date");
  start.required = true;
  end.required = true;
  const memo = el("textarea");
  memo.value = existing?.memo || "";
  memo.maxLength = 10000;
  memo.id = "record-memo";
  memo.placeholder = "필요한 내용만 간단히 적어 주세요.";
  const memoField = field("메모 (선택)", memo);
  memoField.classList.add("full");
  add(
    grid,
    studentField,
    typeField,
    field("시작일", start),
    field("종료일", end),
    memoField,
  );
  const docBox = el("section", "stack");
  const draftDocs = { ...(existing?.documents || {}) };
  function drawDocs() {
    docBox.replaceChildren();
    const def = typeOf(type.value);
    if (!def?.docs.length) return;
    add(docBox, el("h3", "", "제출 서류 확인"));
    def.docs.forEach((key) => {
      const cb = input("checkbox");
      cb.checked = !!draftDocs[key];
      cb.dataset.docKey = key;
      cb.addEventListener("change", () => (draftDocs[key] = cb.checked));
      add(
        docBox,
        add(
          el("label", "check-label"),
          cb,
          el("span", "", `${DOCS[key]} 제출 완료`),
        ),
      );
    });
    add(
      docBox,
      el(
        "p",
        "field-note",
        "선택하지 않은 서류는 확인 필요로 기록됩니다. 신청서 기한은 설정에서 바꿀 수 있습니다.",
      ),
    );
  }
  type.addEventListener("change", drawDocs);
  drawDocs();
  const hint = el(
    "p",
    "help-box",
    "여러 날 기록의 일수는 주말을 포함한 달력일수입니다. 학교의 공식 출석·수업일수와 다를 수 있습니다.",
  );
  const footer = el("div", "dialog-footer");
  const submit = el("button", "primary", existing ? "수정 저장" : "기록 저장");
  submit.type = "submit";
  add(
    footer,
    button("취소", () => d.close()),
    submit,
  );
  add(form, grid, el("div", "section-gap"), docBox, hint, footer);
  add(body, form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const student = data.students.find((s) => s.id === studentSelect.value);
      if (!student) throw new Error("학생을 먼저 선택해 주세요.");
      if (!typeOf(type.value)) throw new Error("출결 유형을 선택해 주세요.");
      if (
        !Core.isValidDate(start.value) ||
        !Core.isValidDate(end.value) ||
        start.value > end.value
      )
        throw new Error("시작일과 종료일을 확인해 주세요.");
      const candidate = {
        ...(existing || {}),
        id: existing?.id || uid(),
        studentId: student.id,
        studentName: student.name,
        type: type.value,
        startDate: start.value,
        endDate: end.value,
        memo: memo.value.trim(),
        documents: draftDocs,
        createdAt: existing?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const commit = () => {
        mutate(
          (next) => {
            if (existing) {
              const idx = next.records.findIndex((r) => r.id === existing.id);
              next.records[idx] = candidate;
            } else next.records.push(candidate);
          },
          existing ? "기록을 수정했습니다." : "기록을 추가했습니다.",
        );
        d.close();
      };
      const overlaps = Core.findOverlaps(data.records, candidate, existing?.id);
      if (overlaps.length) {
        confirmAction(
          "같은 학생의 기간이 겹칩니다",
          `${studentLabel(student)} 학생의 기존 기록 ${overlaps.length}건과 기간이 겹칩니다. ${overlaps
            .slice(0, 3)
            .map(
              (r) => `${typeOf(r.type).label} (${r.startDate} ~ ${r.endDate})`,
            )
            .join(
              ", ",
            )}. 필요한 기록이라면 중복을 허용하고 저장할 수 있습니다.`,
          commit,
          "중복 허용·저장",
        );
      } else commit();
    } catch (error) {
      notify(error.message, true);
    }
  });
}
function renderStudents(main) {
  add(
    main,
    add(
      el("div", "view-header"),
      add(
        el("div"),
        el("h2", "", "우리 반 학생"),
        el("p", "lead", "학생 번호와 이름을 등록하고 출결 이력을 모아 보세요."),
      ),
      button("+ 학생 등록", () => openStudentForm(), "primary"),
    ),
  );
  const p = panel();
  add(
    p,
    el(
      "p",
      "help-box",
      "기존 자료의 학생도 내부 식별자로 관리됩니다. 번호가 없는 학생은 ‘정보 수정’에서 번호를 지정해 주세요. 같은 이름이라도 번호가 다르면 각각 등록할 수 있습니다.",
    ),
  );
  const search = input("search");
  search.placeholder = "이름 또는 번호로 학생 찾기";
  const list = el("div", "student-grid");
  function draw() {
    list.replaceChildren();
    const query = search.value.trim().toLocaleLowerCase();
    const students = [...data.students]
      .sort(compareStudents)
      .filter((s) =>
        `${s.name} ${s.number ?? ""}`.toLocaleLowerCase().includes(query),
      );
    students.forEach((s) => {
      const records = data.records.filter((r) => r.studentId === s.id);
      const card = el("article", "student-card");
      add(
        card,
        button(studentLabel(s), () => openStudent(s.id), "student-link"),
        el(
          "p",
          "muted",
          `등록 기록 ${records.length}건${s.number ? "" : " · 번호 미지정"}`,
        ),
        add(
          el("div", "toolbar"),
          button("이력 보기", () => openStudent(s.id), "small"),
          button("정보 수정", () => openStudentForm(s), "small subtle"),
        ),
      );
      add(list, card);
    });
    if (!students.length)
      add(
        list,
        empty(
          "등록된 학생이 없습니다.",
          "학생 등록에서 번호와 이름을 입력해 주세요.",
        ),
      );
  }
  search.addEventListener("input", draw);
  add(p, add(el("div", "section-gap"), field("학생 검색", search)), list);
  draw();
  add(main, p);
}
function openStudentForm(existing, onSaved) {
  guard();
  const { dialog: d, body } = dialog(existing ? "학생 정보 수정" : "학생 등록");
  const form = el("form");
  const number = input("number", existing?.number ?? "", "student-number");
  number.min = "1";
  number.max = "99999";
  number.step = "1";
  if (!existing) number.required = true;
  const name = input("text", existing?.name || "", "student-name");
  name.required = true;
  name.maxLength = 100;
  const submit = el("button", "primary", "저장");
  submit.type = "submit";
  add(
    form,
    add(
      el("div", "form-grid"),
      field(
        "학생 번호",
        number,
        existing
          ? "기존 학생은 번호를 비워둘 수 있습니다."
          : "반에서 사용하는 고유한 번호를 입력해 주세요.",
      ),
      field("학생 이름", name),
    ),
    add(
      el("div", "dialog-footer"),
      existing
        ? button(
            "학생 삭제",
            () => {
              const linked = data.records.filter(
                (r) => r.studentId === existing.id,
              ).length;
              if (linked)
                throw new Error(
                  `연결된 출결 기록 ${linked}건이 있어 학생을 삭제할 수 없습니다. 기록을 먼저 확인해 주세요.`,
                );
              confirmAction(
                "학생 삭제",
                `${studentLabel(existing)} 학생을 명렬에서 삭제할까요?`,
                () => {
                  mutate(
                    (next) =>
                      (next.students = next.students.filter(
                        (s) => s.id !== existing.id,
                      )),
                    "학생을 삭제했습니다.",
                  );
                  d.close();
                },
                "삭제하기",
              );
            },
            "danger",
          )
        : null,
      button("취소", () => d.close()),
      submit,
    ),
  );
  add(body, form);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const student = {
        ...(existing || {}),
        id: existing?.id || uid(),
        number: number.value ? Number(number.value) : null,
        name: name.value.trim(),
      };
      if (!student.name) throw new Error("학생 이름을 입력해 주세요.");
      if (
        student.number !== null &&
        (!Number.isInteger(student.number) || student.number < 1)
      )
        throw new Error("학생 번호는 1 이상의 정수여야 합니다.");
      if (
        data.students.some(
          (s) =>
            s.id !== student.id &&
            student.number !== null &&
            s.number === student.number,
        )
      )
        throw new Error(
          "이미 사용 중인 학생 번호입니다. 다른 번호를 입력해 주세요.",
        );
      mutate((next) => {
        if (existing) {
          next.students[next.students.findIndex((s) => s.id === student.id)] =
            student;
          next.records
            .filter((r) => r.studentId === student.id)
            .forEach((r) => (r.studentName = student.name));
        } else next.students.push(student);
      }, "학생 정보를 저장했습니다.");
      d.close();
      onSaved?.(student);
    } catch (error) {
      notify(error.message, true);
    }
  });
}
function openStudent(id) {
  const student = data.students.find((s) => s.id === id);
  if (!student) return;
  const { body } = dialog(`${studentLabel(student)} · 출결 이력`);
  const records = data.records.filter((r) => r.studentId === id);
  const stats = Core.summarize(
    records,
    Core.resolveRange("all", { today: today(), records }),
  );
  add(
    body,
    el(
      "p",
      "help-box",
      `전체 기간 · 등록 ${stats.recordCount}건 · 해당 달력일수 ${stats.dayCount}일 (주말 포함, 같은 학생의 겹친 날짜는 한 번만 집계)`,
    ),
  );
  const byType = el("div", "table-wrap");
  const table = el("table");
  add(
    table,
    add(
      el("thead"),
      add(
        el("tr"),
        ["출결 유형", "등록 건수", "달력일수"].map((s) => el("th", "", s)),
      ),
    ),
  );
  const tbody = el("tbody");
  TYPES.filter((t) => stats.byType[t.id]?.recordCount).forEach((t) => {
    const s = stats.byType[t.id];
    add(
      tbody,
      add(
        el("tr"),
        el("td", "", t.label),
        el("td", "", `${s.recordCount}건`),
        el("td", "", `${s.dayCount}일`),
      ),
    );
  });
  add(table, tbody);
  add(byType, table);
  if (records.length)
    add(
      body,
      byType,
      el(
        "p",
        "field-note",
        "유형별 일수는 서로 겹칠 수 있어 전체 달력일수와 합이 다를 수 있습니다.",
      ),
    );
  const list = el("div", "record-list");
  records
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .slice(0, 100)
    .forEach((r) => {
      const card = el("article", "record-card");
      const def = typeOf(r.type);
      add(
        card,
        el("h3", "", def.label),
        el(
          "p",
          "date-line",
          `${r.startDate} ~ ${r.endDate} · ${Core.inclusiveDays(r.startDate, r.endDate)}달력일`,
        ),
      );
      if (r.memo) add(card, el("p", "memo", r.memo));
      if (def.docs.length)
        add(
          card,
          el(
            "p",
            "field-note",
            def.docs
              .map(
                (k) =>
                  `${DOCS[k]} ${r.documents?.[k] ? "제출 완료" : "확인 필요"}`,
              )
              .join(" · "),
          ),
        );
      add(list, card);
    });
  if (!records.length)
    add(
      list,
      empty(
        "아직 출결 기록이 없습니다.",
        "등록한 기록이 여기에 날짜순으로 모입니다.",
      ),
    );
  if (records.length > 100)
    add(
      list,
      el(
        "p",
        "muted",
        "최근 100건을 표시합니다. 기록·통계에서 기간을 좁혀 이전 기록을 확인할 수 있습니다.",
      ),
    );
  add(body, list);
}
function renderSettings(main) {
  add(
    main,
    add(
      el("div", "view-header"),
      add(
        el("div"),
        el("h2", "", "설정과 파일 백업"),
        el(
          "p",
          "lead",
          "자료 보관 상태를 확인하고 제출 서류 기준을 설정하세요.",
        ),
      ),
    ),
  );
  const cols = el("div", "two-col");
  const left = el("div", "stack"),
    right = el("div", "stack");
  const backup = panel("이 브라우저의 기록");
  add(
    backup,
    el(
      "p",
      "backup-line",
      `학생 ${data.students.length}명 · 출결 ${data.records.length}건`,
    ),
    el("p", "backup-line", backupInfo()),
    el(
      "p",
      "help-box section-gap",
      "자동 저장은 현재 브라우저 안에만 보관됩니다. 다른 기기로 옮기거나 브라우저 자료를 지우기 전에는 파일 백업을 내려받으세요. 다운로드 요청 후 실제 파일 저장 여부를 확인해야 합니다.",
    ),
    add(
      el("div", "toolbar section-gap"),
      button("백업 파일 내려받기", exportBackup, "primary"),
      button("백업 파일 복원", openRestoreFile),
    ),
  );
  const file = input("file");
  const recoveryTools = el("div", "toolbar section-gap");
  for (const [key, label] of [
    ["ddcheck_recovery_before_migration", "자료 변환 전 사본"],
    ["ddcheck_recovery_before_restore", "최근 복원 전 사본"],
    ["ddcheck_recovery_before_clear", "일괄 삭제 전 사본"],
  ]) {
    let recovery;
    try {
      recovery = localStorage.getItem(key);
    } catch {
      continue;
    }
    if (recovery !== null)
      add(
        recoveryTools,
        button(
          label,
          () => download(recovery, `뚝딱체크_${label}_${today()}.json`),
          "small",
        ),
      );
  }
  if (recoveryTools.childElementCount)
    add(
      backup,
      recoveryTools,
      el(
        "p",
        "field-note",
        "작업 전 사본을 파일로 내려받을 수 있습니다. 이 브라우저 안의 사본도 브라우저 자료를 지우면 사라집니다.",
      ),
    );
  file.accept = ".json,application/json";
  file.hidden = true;
  file.id = "restore-file";
  file.addEventListener("change", async () => {
    const selected = file.files?.[0];
    if (!selected) return;
    try {
      guard();
      if (selected.size > Core.MAX_BACKUP_BYTES)
        throw new Error("백업 파일은 5MB 이하여야 합니다.");
      const incoming = Core.parseBackup(await selected.text());
      openRestorePreview(incoming, selected.name);
    } catch (error) {
      notify(`복원할 수 없습니다. ${error.message}`, true);
    }
    file.value = "";
  });
  add(backup, file);
  const settings = panel("제출 서류 기준");
  const form = el("form");
  const days = input("number", data.settings.fieldTripApplyDays, "apply-days");
  days.min = "0";
  days.max = "365";
  days.step = "1";
  days.required = true;
  const submit = el("button", "primary", "기준 저장");
  submit.type = "submit";
  add(
    form,
    field(
      "교외체험학습 신청서 · 시작 며칠 전까지 확인할까요?",
      days,
      "달력일 기준입니다. 학교 규정에 맞는 값을 직접 설정해 주세요. 이 기준일이 지난 미제출 신청서는 ‘기한 지남’으로 표시합니다.",
    ),
    add(el("div", "toolbar section-gap"), submit),
  );
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    try {
      const value = Number(days.value);
      if (!Number.isInteger(value) || value < 0 || value > 365)
        throw new Error("0~365 사이의 정수를 입력해 주세요.");
      mutate(
        (next) => (next.settings.fieldTripApplyDays = value),
        "신청서 확인 기준을 저장했습니다.",
      );
    } catch (error) {
      notify(error.message, true);
    }
  });
  add(settings, form);
  const guide = panel("서류 확인 방법");
  add(
    guide,
    el(
      "p",
      "muted",
      "교외체험학습은 신청서와 보고서, 결석은 결석계를 확인합니다. 기록의 서류 버튼을 누르면 ‘확인 필요’와 ‘제출 완료’를 바꿀 수 있습니다.",
    ),
    el(
      "p",
      "help-box section-gap",
      "통계의 ‘달력일수’에는 주말이 포함됩니다. 공휴일·휴업일을 반영한 공식 출결 일수는 학교 기준에 따라 별도로 확인해 주세요.",
    ),
  );
  const danger = panel("자료 정리");
  add(
    danger,
    el(
      "p",
      "muted",
      "학생 명렬은 남기고 출결 기록만 삭제합니다. 실행 전 백업 파일을 저장해 주세요.",
    ),
    add(
      el("div", "toolbar section-gap"),
      button(
        "전체 출결 기록 삭제",
        () =>
          confirmAction(
            "전체 기록 삭제",
            `출결 기록 ${data.records.length}건을 모두 삭제합니다. 학생 명렬과 설정은 남습니다. 실제로 저장된 백업 파일이 있는지 확인하셨나요?`,
            () => {
              snapshot("ddcheck_recovery_before_clear", JSON.stringify(data));
              mutate(
                (next) => (next.records = []),
                "전체 출결 기록을 삭제했습니다.",
              );
            },
            "전체 기록 삭제",
          ),
        "danger",
      ),
    ),
  );
  add(left, backup, settings);
  add(right, guide, danger);
  add(cols, left, right);
  add(main, cols);
}
function openRestoreFile() {
  guard();
  if (state.view !== "settings") {
    state.view = "settings";
    render();
  }
  document.querySelector("#restore-file").click();
}
function openRestorePreview(incoming, filename) {
  const preview = Core.previewRestore(data, incoming);
  const { dialog: d, body } = dialog("백업 복원 미리보기");
  add(
    body,
    el("p", "muted text-break", filename),
    add(
      el("div", "restore-counts"),
      add(
        el("div"),
        el("span", "", "파일의 학생"),
        el("b", "", `${preview.incomingStudents}명`),
      ),
      add(
        el("div"),
        el("span", "", "파일의 기록"),
        el("b", "", `${preview.incomingRecords}건`),
      ),
    ),
  );
  const merge = input("radio");
  merge.name = "restore-mode";
  merge.value = "merge";
  merge.checked = true;
  const replace = input("radio");
  replace.name = "restore-mode";
  replace.value = "replace";
  const mergeLabel = add(
    el("label", "check-label"),
    merge,
    add(
      el("span"),
      el("strong", "", "기존 자료와 병합 (기본)"),
      el(
        "p",
        "field-note",
        `학생 ${preview.newStudents}명·기록 ${preview.newRecords}건 추가 · 같은 기록 ${preview.skippedRecords}건 유지`,
      ),
    ),
  );
  const replaceLabel = add(
    el("label", "check-label"),
    replace,
    add(
      el("span"),
      el("strong", "", "파일 자료로 전체 교체"),
      el(
        "p",
        "field-note",
        `현재 학생 ${data.students.length}명·기록 ${data.records.length}건을 파일의 자료로 바꿉니다.`,
      ),
    ),
  );
  add(body, mergeLabel, replaceLabel);
  if (preview.conflicts.length) {
    const box = add(
      el("div", "notice warning"),
      el(
        "p",
        "",
        `충돌 ${preview.conflicts.length}건을 확인해 주세요. 같은 식별자의 서로 다른 기록은 병합 시 현재 기록을 유지합니다. 학생 식별·번호 충돌이 있으면 병합을 실행할 수 없습니다.`,
      ),
    );
    add(body, box);
    const list = el("ul", "conflict-list");
    preview.conflicts
      .slice(0, 20)
      .forEach((c) => add(list, el("li", "", c.message)));
    add(body, list);
  }
  if (preview.settingsDiffer)
    add(
      body,
      el(
        "p",
        "field-note",
        "파일과 현재의 서류 기준이 다릅니다. 병합하면 현재 기준, 전체 교체하면 파일의 기준을 사용합니다.",
      ),
    );
  add(
    body,
    el(
      "p",
      "help-box",
      "복원 실행 직전에 이 브라우저의 현재 자료를 복구용 사본으로 보관합니다. 이 사본도 브라우저 자료를 지우면 사라지므로 파일 백업은 별도로 필요합니다.",
    ),
  );
  const execute = button(
    "병합하여 복원",
    () => {
      const isReplace = replace.checked;
      const apply = () => {
        const next = isReplace
          ? copy(incoming)
          : Core.mergeData(data, incoming).data;
        snapshot("ddcheck_recovery_before_restore", JSON.stringify(data));
        save(next);
        d.close();
        render();
        notify("자료를 복원했습니다. 학생과 기록 수를 확인해 주세요.");
      };
      if (isReplace)
        confirmAction(
          "현재 자료 전체 교체",
          `현재 학생 ${data.students.length}명·출결 ${data.records.length}건을 파일 자료로 바꿉니다. 전체 교체를 실행할까요?`,
          () => apply(),
          "전체 교체 실행",
        );
      else apply();
    },
    "primary",
  );
  function update() {
    execute.textContent = replace.checked ? "전체 교체 검토" : "병합하여 복원";
    execute.disabled = merge.checked && !preview.canMerge;
  }
  merge.addEventListener("change", update);
  replace.addEventListener("change", update);
  update();
  add(
    body,
    add(
      el("div", "dialog-footer"),
      button("취소", () => d.close()),
      execute,
    ),
  );
}
load();
render();

function typeBreakdown(stats) {
  const details = el("details", "section-gap");
  add(details, el("summary", "", "세부 유형별 집계 (15종)"));
  const table = el("table");
  add(
    table,
    add(
      el("thead"),
      add(
        el("tr"),
        ["출결 유형", "등록 건수", "달력일수 (주말 포함)"].map((t) =>
          el("th", "", t),
        ),
      ),
    ),
  );
  const body = el("tbody");
  TYPES.forEach((t) => {
    const value = stats.byType[t.id] || { recordCount: 0, dayCount: 0 };
    add(
      body,
      add(
        el("tr"),
        el("td", "", t.label),
        el("td", "", `${value.recordCount}건`),
        el("td", "", `${value.dayCount}일`),
      ),
    );
  });
  add(table, body);
  add(
    details,
    el(
      "p",
      "field-note",
      "유형별 일수는 서로 겹칠 수 있어 전체 달력일수와 합이 다를 수 있습니다. 이번 학기는 3~8월 / 9~다음 해 2월 기준이며, 학교의 학기 기간이 다르면 직접 기간을 지정해 주세요.",
    ),
    add(el("div", "table-wrap section-gap"), table),
  );
  return details;
}
