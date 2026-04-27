/* ============================================
   출결 관리 달력 - Application Logic
   ============================================ */

// ===== Constants =====
const STORAGE_KEY = 'ddcheck_data';

const ABSENCE_TYPES = [
    { id: 'field-trip', label: '교외체험학습', category: 'trip', color: '#1d648f', bg: 'bg-secondary-container', icon: 'forest', requiredDocs: ['apply', 'report'] },
    { id: 'sick-absence', label: '질병결석', category: 'absence', color: '#a83836', bg: 'bg-error-container/20', icon: 'sick', requiredDocs: ['absenceNote'] },
    { id: 'unauth-absence', label: '미인정결석', category: 'absence', color: '#c0392b', bg: 'bg-error-container/20', icon: 'block', requiredDocs: ['absenceNote'] },
    { id: 'other-absence', label: '기타결석', category: 'absence', color: '#95a5a6', bg: 'bg-surface-container-high', icon: 'person_off', requiredDocs: ['absenceNote'] },
    { id: 'approved-absence', label: '학교장인정결석', category: 'approved', color: '#006c53', bg: 'bg-primary-container/40', icon: 'verified', requiredDocs: ['absenceNote'] },
    { id: 'sick-early', label: '질병조퇴', category: 'earlylate', color: '#6f5e00', bg: 'bg-tertiary-container', icon: 'medical_services' },
    { id: 'unauth-early', label: '미인정조퇴', category: 'earlylate', color: '#e67e22', bg: 'bg-tertiary-container', icon: 'directions_walk' },
    { id: 'other-early', label: '기타조퇴', category: 'earlylate', color: '#f39c12', bg: 'bg-tertiary-container', icon: 'exit_to_app' },
    { id: 'sick-late', label: '질병지각', category: 'earlylate', color: '#8e44ad', bg: 'bg-tertiary-container', icon: 'schedule' },
    { id: 'unauth-late', label: '미인정지각', category: 'earlylate', color: '#795548', bg: 'bg-tertiary-container', icon: 'timer_off' },
    { id: 'other-late', label: '기타지각', category: 'earlylate', color: '#607d8b', bg: 'bg-tertiary-container', icon: 'watch_later' },
    { id: 'sick-class', label: '질병결과', category: 'earlylate', color: '#00838f', bg: 'bg-secondary-container/40', icon: 'event_busy' },
    { id: 'unauth-class', label: '미인정결과', category: 'earlylate', color: '#009688', bg: 'bg-secondary-container/40', icon: 'event_busy' },
    { id: 'other-class', label: '기타결과', category: 'earlylate', color: '#546e7a', bg: 'bg-surface-container-high', icon: 'event_busy' },
    { id: 'family-event', label: '경조사', category: 'approved', color: '#006c53', bg: 'bg-primary-container/40', icon: 'volunteer_activism' },
];

const DOC_TYPES = {
    apply: { label: '신청서', fullLabel: '교외체험학습 신청서', when: 'before' },
    report: { label: '보고서', fullLabel: '교외체험학습 보고서', when: 'after' },
    absenceNote: { label: '결석계', fullLabel: '결석계', when: 'after' },
};

const DEFAULT_SETTINGS = {
    fieldTripApplyDays: 3,
};

function getType(id) {
    return ABSENCE_TYPES.find(t => t.id === id);
}

function getRequiredDocs(typeId) {
    const t = getType(typeId);
    return (t && t.requiredDocs) || [];
}

function getCategoryColor(category) {
    const map = { trip: '#1d648f', absence: '#a83836', earlylate: '#6f5e00', approved: '#006c53' };
    return map[category] || '#757c7b';
}

// ===== State =====
const state = {
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(),
    currentView: 'calendar',
    editingRecordId: null,
    selectedDate: null,
    confirmCallback: null,
    pendingRestoreData: null,
};

// ===== Storage =====
function loadData() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            if (!parsed.settings) parsed.settings = { ...DEFAULT_SETTINGS };
            return parsed;
        }
    } catch (e) {
        console.error('Failed to load data:', e);
    }
    return { students: [], records: [], settings: { ...DEFAULT_SETTINGS } };
}

function getSettings() {
    const data = getData();
    return { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
}

function saveSettings(updates) {
    const data = getData();
    data.settings = { ...getSettings(), ...updates };
    saveData(data);
}

function saveData(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function getData() {
    return loadData();
}

function addRecord(record) {
    const data = getData();
    record.id = generateId();
    record.createdAt = new Date().toISOString();
    data.records.push(record);
    if (record.studentName && !data.students.includes(record.studentName)) {
        data.students.push(record.studentName);
        data.students.sort();
    }
    saveData(data);
    return record;
}

function updateRecord(id, updates) {
    const data = getData();
    const idx = data.records.findIndex(r => r.id === id);
    if (idx !== -1) {
        Object.assign(data.records[idx], updates);
        saveData(data);
    }
}

function deleteRecord(id) {
    const data = getData();
    data.records = data.records.filter(r => r.id !== id);
    saveData(data);
}

function addStudent(name) {
    const data = getData();
    const trimmed = name.trim();
    if (trimmed && !data.students.includes(trimmed)) {
        data.students.push(trimmed);
        data.students.sort();
        saveData(data);
        return true;
    }
    return false;
}

function removeStudent(name) {
    const data = getData();
    data.students = data.students.filter(s => s !== name);
    saveData(data);
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
}

// ===== Date Helpers =====
function dateStr(y, m, d) {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDateStr(str) {
    const [y, m, d] = str.split('-').map(Number);
    return { year: y, month: m - 1, day: d };
}

function formatKoreanDate(str) {
    const { month, day } = parseDateStr(str);
    return `${month + 1}월 ${day}일`;
}

function formatFullKoreanDate(str) {
    const { year, month, day } = parseDateStr(str);
    const d = new Date(year, month, day);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return `${year}년 ${month + 1}월 ${day}일 (${days[d.getDay()]})`;
}

function isDateInRange(dateStr, startDate, endDate) {
    return dateStr >= startDate && dateStr <= endDate;
}

function getRecordsForDate(dateStr) {
    const data = getData();
    return data.records.filter(r => isDateInRange(dateStr, r.startDate, r.endDate));
}

function todayStr() {
    const t = new Date();
    return dateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

function applyDeadlineStr(record) {
    const { year, month, day } = parseDateStr(record.startDate);
    const days = getSettings().fieldTripApplyDays;
    const d = new Date(year, month, day);
    d.setDate(d.getDate() - days);
    return dateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

// Returns 'submitted' | 'pending' | 'overdue'
function getDocStatus(record, docKey) {
    const submitted = record.documents && record.documents[docKey] === true;
    if (submitted) return 'submitted';
    if (docKey === 'apply') {
        if (todayStr() > applyDeadlineStr(record)) return 'overdue';
    }
    return 'pending';
}

function renderDocBadges(record, options) {
    const docs = getRequiredDocs(record.type);
    if (docs.length === 0) return '';
    const interactive = options && options.interactive;
    const showLabels = options && options.showLabels;
    return `<div class="flex flex-wrap gap-1.5 mt-2">${docs.map(key => {
        const def = DOC_TYPES[key];
        const status = getDocStatus(record, key);
        let cls, icon;
        if (status === 'submitted') {
            cls = 'bg-primary/10 text-primary';
            icon = 'check_circle';
        } else if (status === 'overdue') {
            cls = 'bg-error/15 text-error';
            icon = 'error';
        } else {
            cls = 'bg-surface-container-high text-on-surface-variant';
            icon = 'radio_button_unchecked';
        }
        const action = interactive ? `onclick="event.stopPropagation();toggleRecordDoc('${record.id}','${key}')"` : '';
        const cursor = interactive ? 'cursor-pointer hover:opacity-80 active:scale-95' : '';
        const overdueText = status === 'overdue' && showLabels ? ' · 지연' : '';
        return `<span ${action} class="inline-flex items-center gap-1 ${cls} ${cursor} text-[11px] font-bold px-2 py-1 rounded-full transition-all">
            <span class="material-symbols-outlined" style="font-size:14px">${icon}</span>
            ${def.label}${overdueText}
        </span>`;
    }).join('')}</div>`;
}

function getRecordsForMonth(year, month) {
    const data = getData();
    const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    return data.records.filter(r => {
        return r.startDate.startsWith(monthStr) || r.endDate.startsWith(monthStr) ||
            (r.startDate < monthStr + '-01' && r.endDate >= monthStr + '-01');
    });
}

// ===== Calendar Rendering =====
function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const title = document.getElementById('calendar-title');
    const { currentYear: y, currentMonth: m } = state;

    title.textContent = `${y}년 ${m + 1}월`;

    const firstDay = new Date(y, m, 1);
    const lastDay = new Date(y, m + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Monday = 0, Sunday = 6
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const prevMonthLast = new Date(y, m, 0).getDate();

    const today = new Date();
    const todayStr = dateStr(today.getFullYear(), today.getMonth(), today.getDate());

    const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

    let html = '';

    for (let i = 0; i < totalCells; i++) {
        const dayNum = i - startDow + 1;
        const dow = i % 7; // 0=Mon, 5=Sat, 6=Sun

        if (dayNum < 1) {
            // Previous month
            const d = prevMonthLast + dayNum;
            html += `<div class="day-cell day-cell--empty day-cell--other-month">
                <span class="day-number">${d}</span>
            </div>`;
        } else if (dayNum > daysInMonth) {
            // Next month
            const d = dayNum - daysInMonth;
            html += `<div class="day-cell day-cell--empty day-cell--other-month">
                <span class="day-number">${d}</span>
            </div>`;
        } else {
            // Current month
            const ds = dateStr(y, m, dayNum);
            const records = getRecordsForDate(ds);
            const isToday = ds === todayStr;
            const isSat = dow === 5;
            const isSun = dow === 6;

            let classes = 'day-cell bg-surface-container-lowest';
            if (isToday) classes += ' day-cell--today';
            if (isSat) classes += ' day-cell--saturday';
            if (isSun) classes += ' day-cell--sunday';
            if (records.length > 0) classes += ' day-cell--has-records';

            // Get unique category dots
            const categories = [...new Set(records.map(r => {
                const t = getType(r.type);
                return t ? t.category : 'other';
            }))];

            let dotsHtml = '';
            if (categories.length > 0) {
                dotsHtml = '<div class="day-dots">';
                categories.forEach(cat => {
                    dotsHtml += `<div class="day-dot" style="background-color: ${getCategoryColor(cat)}"></div>`;
                });
                if (records.length > categories.length) {
                    dotsHtml += `<span style="font-size:7px;color:#757c7b;line-height:5px;font-weight:700">${records.length}</span>`;
                }
                dotsHtml += '</div>';
            }

            html += `<div class="${classes}" data-date="${ds}" onclick="openDateDetail('${ds}')">
                <span class="day-number">${dayNum}</span>
                ${dotsHtml}
            </div>`;
        }
    }

    grid.innerHTML = html;
    updateMonthStats();
}

function updateMonthStats() {
    const records = getRecordsForMonth(state.currentYear, state.currentMonth);
    let trip = 0, absence = 0, etc = 0;
    records.forEach(r => {
        const t = getType(r.type);
        if (!t) return;
        if (t.category === 'trip') trip++;
        else if (t.category === 'absence') absence++;
        else etc++;
    });
    document.getElementById('stat-trip').textContent = trip;
    document.getElementById('stat-absence').textContent = absence;
    document.getElementById('stat-etc').textContent = etc;
}

// ===== View Switching =====
function switchView(viewName) {
    state.currentView = viewName;

    ['calendar', 'statistics', 'settings'].forEach(v => {
        const el = document.getElementById('view-' + v);
        el.classList.toggle('hidden', v !== viewName);
    });

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isActive = btn.dataset.view === viewName;
        btn.classList.toggle('nav-btn--active', isActive);
        btn.classList.toggle('opacity-60', !isActive);
        btn.classList.toggle('text-on-background', !isActive);
    });

    // FAB visibility
    document.getElementById('fab-add').classList.toggle('hidden', viewName !== 'calendar');

    // Refresh view content
    if (viewName === 'calendar') {
        renderCalendar();
        renderRecentRecords();
    } else if (viewName === 'statistics') {
        renderStatistics();
    } else if (viewName === 'settings') {
        renderSettings();
    }
}

// ===== Recent Records =====
function renderRecentRecords() {
    const container = document.getElementById('recent-records-list');
    const data = getData();
    const records = [...data.records].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);

    if (records.length === 0) {
        container.innerHTML = '<div class="text-center text-on-surface-variant/40 text-sm py-8">기록이 없습니다</div>';
        return;
    }

    container.innerHTML = records.map(r => {
        const t = getType(r.type);
        const color = t ? t.color : '#757c7b';
        const label = t ? t.label : r.type;
        const icon = t ? t.icon : 'event';
        const dateText = r.startDate === r.endDate
            ? formatKoreanDate(r.startDate)
            : `${formatKoreanDate(r.startDate)} ~ ${formatKoreanDate(r.endDate)}`;

        const categoryColorMap = {
            trip: { bg: 'bg-secondary-container', text: 'text-secondary', badge: 'bg-secondary/10 text-secondary' },
            absence: { bg: 'bg-error-container/20', text: 'text-error', badge: 'bg-error/10 text-error' },
            earlylate: { bg: 'bg-tertiary-container', text: 'text-tertiary', badge: 'bg-tertiary/20 text-tertiary' },
            approved: { bg: 'bg-primary-container', text: 'text-primary', badge: 'bg-primary/10 text-primary' },
        };
        const cat = t ? t.category : 'absence';
        const cm = categoryColorMap[cat] || categoryColorMap.absence;

        const docs = getRequiredDocs(r.type);
        let docSummary = '';
        if (docs.length > 0) {
            const statuses = docs.map(k => getDocStatus(r, k));
            const overdue = statuses.filter(s => s === 'overdue').length;
            const pending = statuses.filter(s => s === 'pending').length;
            const submitted = statuses.filter(s => s === 'submitted').length;
            if (overdue > 0) {
                docSummary = `<span class="inline-flex items-center gap-1 bg-error/15 text-error text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"><span class="material-symbols-outlined" style="font-size:12px">error</span>서류 지연 ${overdue}</span>`;
            } else if (pending > 0) {
                docSummary = `<span class="inline-flex items-center gap-1 bg-surface-container-high text-on-surface-variant text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"><span class="material-symbols-outlined" style="font-size:12px">description</span>서류 ${submitted}/${docs.length}</span>`;
            } else {
                docSummary = `<span class="inline-flex items-center gap-1 bg-primary/10 text-primary text-[10px] font-bold px-2 py-0.5 rounded-full mt-1"><span class="material-symbols-outlined" style="font-size:12px">check_circle</span>서류 완료</span>`;
            }
        }

        return `<div class="bg-surface-container-lowest p-4 rounded-lg flex items-center justify-between transition-transform active:scale-[0.98] cursor-pointer" onclick="openDateDetail('${r.startDate}')">
            <div class="flex items-center gap-4 min-w-0">
                <div class="w-10 h-10 rounded-full ${cm.bg} flex items-center justify-center ${cm.text} flex-shrink-0">
                    <span class="material-symbols-outlined text-lg" style="font-variation-settings: 'FILL' 1;">${icon}</span>
                </div>
                <div class="min-w-0">
                    <p class="font-bold text-sm text-on-surface">${r.studentName}</p>
                    <p class="text-[11px] text-on-surface-variant">${label} · ${dateText}</p>
                    ${docSummary}
                </div>
            </div>
            <span class="material-symbols-outlined text-on-surface-variant/40 flex-shrink-0">chevron_right</span>
        </div>`;
    }).join('');
}

// ===== Statistics View =====
function renderStatistics() {
    const data = getData();
    const records = data.records;

    let trip = 0, absence = 0, earlylate = 0, other = 0;
    records.forEach(r => {
        const t = getType(r.type);
        if (!t) return;
        if (t.category === 'trip') trip++;
        else if (t.category === 'absence') absence++;
        else if (t.category === 'earlylate') earlylate++;
        else other++;
    });

    document.getElementById('bento-total').textContent = records.length;
    document.getElementById('bento-trip').textContent = trip;
    document.getElementById('bento-absence').textContent = absence;
    document.getElementById('bento-earlylate').textContent = earlylate;
    document.getElementById('bento-other').textContent = other;

    // History list
    const container = document.getElementById('history-list');
    const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (sorted.length === 0) {
        container.innerHTML = '<div class="text-center text-on-surface-variant/40 text-sm py-8">기록이 없습니다</div>';
        return;
    }

    container.innerHTML = sorted.map(r => {
        const t = getType(r.type);
        const label = t ? t.label : r.type;
        const icon = t ? t.icon : 'event';
        const cat = t ? t.category : 'absence';
        const dateText = r.startDate === r.endDate
            ? formatKoreanDate(r.startDate)
            : `${formatKoreanDate(r.startDate)} ~ ${formatKoreanDate(r.endDate)}`;

        const categoryColorMap = {
            trip: { bg: 'bg-secondary-container', text: 'text-secondary', badge: 'bg-secondary/10 text-secondary' },
            absence: { bg: 'bg-error-container/20', text: 'text-error', badge: 'bg-error/10 text-error' },
            earlylate: { bg: 'bg-tertiary-container', text: 'text-tertiary', badge: 'bg-tertiary/20 text-tertiary' },
            approved: { bg: 'bg-primary-container', text: 'text-primary', badge: 'bg-primary/10 text-primary' },
        };
        const cm = categoryColorMap[cat] || categoryColorMap.absence;

        return `<div class="bg-surface-container-lowest p-4 rounded-lg">
            <div class="flex items-start justify-between gap-3">
                <div class="flex items-center gap-4 min-w-0">
                    <div class="w-12 h-12 ${cm.bg} rounded-full flex items-center justify-center ${cm.text} flex-shrink-0">
                        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${icon}</span>
                    </div>
                    <div class="min-w-0">
                        <h4 class="font-headline font-bold text-on-surface text-sm">${r.studentName}</h4>
                        <p class="text-on-surface-variant text-xs">${label} · ${dateText}</p>
                        ${r.memo ? `<p class="text-on-surface-variant/60 text-[11px] mt-0.5">${escapeHtml(r.memo)}</p>` : ''}
                    </div>
                </div>
                <span class="${cm.badge} text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider whitespace-nowrap flex-shrink-0">${label.replace(/질병|미인정|기타|학교장인정/, '').trim() || label}</span>
            </div>
            ${renderDocBadges(r)}
        </div>`;
    }).join('');
}

// ===== Settings View =====
function renderSettings() {
    const data = getData();

    document.getElementById('info-students').textContent = `학생 ${data.students.length}명`;
    document.getElementById('info-records').textContent = `기록 ${data.records.length}건`;

    document.getElementById('input-apply-days').value = getSettings().fieldTripApplyDays;

    renderStudentList();
}

function handleApplyDaysChange() {
    const input = document.getElementById('input-apply-days');
    let v = parseInt(input.value, 10);
    if (isNaN(v) || v < 0) v = 0;
    if (v > 30) v = 30;
    input.value = v;
    saveSettings({ fieldTripApplyDays: v });
    showToast(`신청서 마감일이 ${v}일 전으로 설정되었습니다`, 'success');
}

function renderStudentList() {
    const container = document.getElementById('student-list');
    const data = getData();

    if (data.students.length === 0) {
        container.innerHTML = '<p class="text-on-surface-variant/40 text-sm">등록된 학생이 없습니다</p>';
        return;
    }

    container.innerHTML = data.students.map(name =>
        `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-container/30 text-on-primary-container rounded-full text-sm font-medium">
            ${escapeHtml(name)}
            <button onclick="handleRemoveStudent('${escapeHtml(name)}')" class="w-5 h-5 rounded-full bg-primary/20 text-primary hover:bg-primary hover:text-on-primary flex items-center justify-center text-xs transition-colors">&times;</button>
        </span>`
    ).join('');
}

function updateStudentDatalist() {
    const datalist = document.getElementById('student-datalist');
    const data = getData();
    datalist.innerHTML = data.students.map(s => `<option value="${escapeHtml(s)}">`).join('');
}

// ===== Record Form =====
function openRecordForm(date, recordId) {
    state.editingRecordId = recordId || null;

    const overlay = document.getElementById('overlay-record');
    const titleEl = document.getElementById('record-form-title');
    const studentInput = document.getElementById('record-student');
    const typeSelect = document.getElementById('record-type');
    const startInput = document.getElementById('record-start-date');
    const endInput = document.getElementById('record-end-date');
    const memoInput = document.getElementById('record-memo');

    updateStudentDatalist();

    let initialDocs = {};
    if (recordId) {
        titleEl.textContent = '기록 수정';
        const data = getData();
        const record = data.records.find(r => r.id === recordId);
        if (record) {
            studentInput.value = record.studentName;
            typeSelect.value = record.type;
            startInput.value = record.startDate;
            endInput.value = record.endDate;
            memoInput.value = record.memo || '';
            initialDocs = record.documents || {};
        }
    } else {
        titleEl.textContent = '기록 추가';
        studentInput.value = '';
        typeSelect.value = '';
        startInput.value = date || '';
        endInput.value = date || '';
        memoInput.value = '';
    }

    renderDocsSection(typeSelect.value, initialDocs);

    overlay.classList.remove('hidden');
    overlay.classList.add('animate-fadeIn');
}

function renderDocsSection(typeId, currentValues) {
    const section = document.getElementById('record-docs-section');
    const list = document.getElementById('record-docs-list');
    const docs = getRequiredDocs(typeId);

    if (docs.length === 0) {
        section.classList.add('hidden');
        list.innerHTML = '';
        return;
    }

    section.classList.remove('hidden');
    const values = currentValues || {};
    list.innerHTML = docs.map(key => {
        const def = DOC_TYPES[key];
        const checked = values[key] === true ? 'checked' : '';
        const hint = def.when === 'before' ? '결석 전 제출' : '결석 후 제출';
        return `<label class="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-surface-container-low transition-colors">
            <input type="checkbox" data-doc-key="${key}" ${checked} class="w-5 h-5 accent-primary rounded">
            <div class="flex-1">
                <p class="text-sm font-semibold text-on-surface">${def.fullLabel}</p>
                <p class="text-[11px] text-on-surface-variant">${hint}</p>
            </div>
        </label>`;
    }).join('');
}

function closeRecordForm() {
    const overlay = document.getElementById('overlay-record');
    overlay.classList.add('hidden');
    state.editingRecordId = null;
}

function saveRecordForm() {
    const studentName = document.getElementById('record-student').value.trim();
    const type = document.getElementById('record-type').value;
    const startDate = document.getElementById('record-start-date').value;
    const endDate = document.getElementById('record-end-date').value || startDate;
    const memo = document.getElementById('record-memo').value.trim();

    if (!studentName) { showToast('학생 이름을 입력하세요', 'error'); return; }
    if (!type) { showToast('출결 유형을 선택하세요', 'error'); return; }
    if (!startDate) { showToast('시작일을 선택하세요', 'error'); return; }
    if (endDate < startDate) { showToast('종료일은 시작일 이후여야 합니다', 'error'); return; }

    const documents = {};
    getRequiredDocs(type).forEach(key => {
        const cb = document.querySelector(`#record-docs-list input[data-doc-key="${key}"]`);
        documents[key] = !!(cb && cb.checked);
    });

    if (state.editingRecordId) {
        updateRecord(state.editingRecordId, { studentName, type, startDate, endDate, memo, documents });
        showToast('기록이 수정되었습니다', 'success');
    } else {
        addRecord({ studentName, type, startDate, endDate, memo, documents });
        showToast('기록이 추가되었습니다', 'success');
    }

    closeRecordForm();
    refreshCurrentView();
}

function toggleRecordDoc(recordId, docKey) {
    const data = getData();
    const record = data.records.find(r => r.id === recordId);
    if (!record) return;
    const documents = { ...(record.documents || {}) };
    documents[docKey] = !documents[docKey];
    updateRecord(recordId, { documents });
    if (state.selectedDate) openDateDetail(state.selectedDate);
    if (state.currentView === 'calendar') {
        renderRecentRecords();
    } else if (state.currentView === 'statistics') {
        renderStatistics();
    }
}

// ===== Date Detail =====
function openDateDetail(dateStr) {
    state.selectedDate = dateStr;
    const overlay = document.getElementById('overlay-date');
    const titleEl = document.getElementById('date-detail-title');
    const listEl = document.getElementById('date-records-list');

    titleEl.textContent = formatFullKoreanDate(dateStr);

    const records = getRecordsForDate(dateStr);

    if (records.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-16">
                <span class="material-symbols-outlined text-5xl text-on-surface-variant/20 mb-4 block">event_available</span>
                <p class="text-on-surface-variant/40 text-sm mb-6">이 날의 기록이 없습니다</p>
                <button onclick="openRecordFromDate()" class="bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2 hover:bg-primary-dim transition-colors active:scale-95">
                    <span class="material-symbols-outlined text-lg">add</span>
                    기록 추가
                </button>
            </div>`;
    } else {
        listEl.innerHTML = records.map(r => {
            const t = getType(r.type);
            const label = t ? t.label : r.type;
            const icon = t ? t.icon : 'event';
            const cat = t ? t.category : 'absence';
            const dateText = r.startDate === r.endDate
                ? formatKoreanDate(r.startDate)
                : `${formatKoreanDate(r.startDate)} ~ ${formatKoreanDate(r.endDate)}`;

            const cm = {
                trip: { bg: 'bg-secondary-container', text: 'text-secondary' },
                absence: { bg: 'bg-error-container/20', text: 'text-error' },
                earlylate: { bg: 'bg-tertiary-container', text: 'text-tertiary' },
                approved: { bg: 'bg-primary-container', text: 'text-primary' },
            }[cat] || { bg: 'bg-surface-container-high', text: 'text-on-surface-variant' };

            return `<div class="bg-surface-container-lowest p-5 rounded-xl">
                <div class="flex items-start gap-4">
                    <div class="w-12 h-12 ${cm.bg} rounded-full flex items-center justify-center ${cm.text} flex-shrink-0">
                        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">${icon}</span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between mb-1">
                            <h4 class="font-headline font-bold text-on-surface">${escapeHtml(r.studentName)}</h4>
                            <div class="flex gap-1">
                                <button onclick="editRecordFromDetail('${r.id}')" class="w-8 h-8 rounded-full hover:bg-surface-container-high flex items-center justify-center text-on-surface-variant transition-colors">
                                    <span class="material-symbols-outlined text-lg">edit</span>
                                </button>
                                <button onclick="deleteRecordFromDetail('${r.id}')" class="w-8 h-8 rounded-full hover:bg-error-container/20 flex items-center justify-center text-error transition-colors">
                                    <span class="material-symbols-outlined text-lg">delete</span>
                                </button>
                            </div>
                        </div>
                        <p class="text-sm font-medium" style="color: ${t ? t.color : '#757c7b'}">${label}</p>
                        <p class="text-on-surface-variant text-xs mt-1">${dateText}</p>
                        ${renderDocBadges(r, { interactive: true, showLabels: true })}
                        ${r.memo ? `<p class="text-on-surface-variant/70 text-sm mt-2 bg-surface-container-low p-3 rounded-lg">${escapeHtml(r.memo)}</p>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('') + `
            <div class="text-center pt-4">
                <button onclick="openRecordFromDate()" class="bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm inline-flex items-center gap-2 hover:bg-primary-dim transition-colors active:scale-95">
                    <span class="material-symbols-outlined text-lg">add</span>
                    기록 추가
                </button>
            </div>`;
    }

    overlay.classList.remove('hidden');
    overlay.classList.add('animate-fadeIn');
}

function closeDateDetail() {
    document.getElementById('overlay-date').classList.add('hidden');
    state.selectedDate = null;
}

function openRecordFromDate() {
    closeDateDetail();
    openRecordForm(state.selectedDate);
}

function editRecordFromDetail(recordId) {
    const date = state.selectedDate;
    closeDateDetail();
    openRecordForm(date, recordId);
}

function deleteRecordFromDetail(recordId) {
    showConfirm('기록 삭제', '이 기록을 삭제하시겠습니까?', () => {
        deleteRecord(recordId);
        showToast('기록이 삭제되었습니다', 'success');
        if (state.selectedDate) {
            openDateDetail(state.selectedDate);
        }
        refreshCurrentView();
    });
}

// ===== Backup & Restore =====
function exportBackup() {
    const data = getData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const now = new Date();
    const dateLabel = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    a.href = url;
    a.download = `출결관리_백업_${dateLabel}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('백업 파일이 다운로드되었습니다', 'success');
}

function handleRestoreFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.students || !imported.records) {
                showToast('올바른 백업 파일이 아닙니다', 'error');
                return;
            }
            state.pendingRestoreData = imported;
            showRestoreModal();
        } catch (err) {
            showToast('파일을 읽을 수 없습니다', 'error');
        }
    };
    reader.readAsText(file);
}

function showRestoreModal() {
    document.getElementById('modal-restore').classList.remove('hidden');
}

function hideRestoreModal() {
    document.getElementById('modal-restore').classList.add('hidden');
    state.pendingRestoreData = null;
}

function executeRestore(mode) {
    const imported = state.pendingRestoreData;
    if (!imported) return;

    if (mode === 'replace') {
        saveData(imported);
    } else {
        const current = getData();
        const existingIds = new Set(current.records.map(r => r.id));
        const newRecords = imported.records.filter(r => !existingIds.has(r.id));
        const newStudents = imported.students.filter(s => !current.students.includes(s));
        current.records.push(...newRecords);
        current.students.push(...newStudents);
        current.students.sort();
        saveData(current);
    }

    hideRestoreModal();
    showToast('데이터가 복원되었습니다', 'success');
    refreshCurrentView();
}

// ===== Confirm Dialog =====
function showConfirm(title, message, callback) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    state.confirmCallback = callback;
    document.getElementById('modal-confirm').classList.remove('hidden');
}

function hideConfirm() {
    document.getElementById('modal-confirm').classList.add('hidden');
    state.confirmCallback = null;
}

// ===== Toast =====
function showToast(message, type) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'fixed bottom-28 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full shadow-lg z-[70] font-semibold text-sm';

    if (type === 'success') {
        toast.classList.add('bg-primary', 'text-on-primary');
    } else if (type === 'error') {
        toast.classList.add('bg-error', 'text-on-error');
    } else {
        toast.classList.add('bg-inverse-surface', 'text-inverse-on-surface');
    }

    toast.classList.remove('hidden');
    toast.classList.add('toast-show');

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.add('toast-hide');
        setTimeout(() => {
            toast.classList.add('hidden');
            toast.classList.remove('toast-show', 'toast-hide');
        }, 300);
    }, 2000);
}

// ===== Utility =====
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function refreshCurrentView() {
    switchView(state.currentView);
}

// ===== Student Management Handlers =====
function handleAddStudent() {
    const input = document.getElementById('input-student-name');
    const names = input.value.split(',').map(s => s.trim()).filter(s => s);
    let added = 0;
    names.forEach(name => {
        if (addStudent(name)) added++;
    });
    if (added > 0) {
        showToast(`${added}명의 학생이 추가되었습니다`, 'success');
        input.value = '';
        renderSettings();
    } else if (names.length > 0) {
        showToast('이미 등록된 학생입니다', 'error');
    }
}

function handleRemoveStudent(name) {
    showConfirm('학생 삭제', `"${name}" 학생을 목록에서 삭제하시겠습니까?`, () => {
        removeStudent(name);
        showToast('학생이 삭제되었습니다', 'success');
        renderSettings();
    });
}

function handleClearRecords() {
    showConfirm('전체 기록 삭제', '모든 출결 기록이 삭제됩니다. 이 작업은 되돌릴 수 없습니다.', () => {
        const data = getData();
        data.records = [];
        saveData(data);
        showToast('모든 기록이 삭제되었습니다', 'success');
        renderSettings();
    });
}

// ===== Event Binding =====
function bindEvents() {
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView(btn.dataset.view));
    });

    // Month navigation
    document.getElementById('btn-prev-month').addEventListener('click', () => {
        state.currentMonth--;
        if (state.currentMonth < 0) {
            state.currentMonth = 11;
            state.currentYear--;
        }
        renderCalendar();
        renderRecentRecords();
    });

    document.getElementById('btn-next-month').addEventListener('click', () => {
        state.currentMonth++;
        if (state.currentMonth > 11) {
            state.currentMonth = 0;
            state.currentYear++;
        }
        renderCalendar();
        renderRecentRecords();
    });

    document.getElementById('btn-today').addEventListener('click', () => {
        const now = new Date();
        state.currentYear = now.getFullYear();
        state.currentMonth = now.getMonth();
        renderCalendar();
        renderRecentRecords();
    });

    // FAB
    document.getElementById('fab-add').addEventListener('click', () => {
        const today = new Date();
        openRecordForm(dateStr(today.getFullYear(), today.getMonth(), today.getDate()));
    });

    // Record form
    document.getElementById('btn-record-close').addEventListener('click', closeRecordForm);
    document.getElementById('btn-record-cancel').addEventListener('click', closeRecordForm);
    document.getElementById('btn-record-save').addEventListener('click', saveRecordForm);
    document.getElementById('record-type').addEventListener('change', (e) => {
        renderDocsSection(e.target.value);
    });

    // Date detail
    document.getElementById('btn-date-close').addEventListener('click', closeDateDetail);
    document.getElementById('btn-date-add').addEventListener('click', openRecordFromDate);

    // Student management
    document.getElementById('btn-add-student').addEventListener('click', handleAddStudent);
    document.getElementById('input-student-name').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddStudent();
    });

    // Apply days setting
    document.getElementById('input-apply-days').addEventListener('change', handleApplyDaysChange);

    // Backup & Restore
    document.getElementById('btn-backup').addEventListener('click', exportBackup);
    document.getElementById('btn-restore').addEventListener('click', () => {
        document.getElementById('file-restore').click();
    });
    document.getElementById('file-restore').addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleRestoreFile(e.target.files[0]);
            e.target.value = '';
        }
    });

    // Restore modal
    document.getElementById('restore-cancel').addEventListener('click', hideRestoreModal);
    document.getElementById('restore-ok').addEventListener('click', () => {
        const mode = document.querySelector('input[name="restore-mode"]:checked').value;
        executeRestore(mode);
    });

    // Confirm dialog
    document.getElementById('confirm-cancel').addEventListener('click', hideConfirm);
    document.getElementById('confirm-backdrop').addEventListener('click', hideConfirm);
    document.getElementById('confirm-ok').addEventListener('click', () => {
        if (state.confirmCallback) state.confirmCallback();
        hideConfirm();
    });

    // Clear records
    document.getElementById('btn-clear-records').addEventListener('click', handleClearRecords);
}

// ===== Initialization =====
function init() {
    bindEvents();
    switchView('calendar');
}

document.addEventListener('DOMContentLoaded', init);
