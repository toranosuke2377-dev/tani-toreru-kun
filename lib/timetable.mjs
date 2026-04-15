import fs from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let _courses = null;
function getCourses() {
  if (!_courses) {
    _courses = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "courses.json"), "utf-8"));
  }
  return _courses;
}

const SEMESTER_START = {
  前学期: new Date("2026-04-06T00:00:00"),
  後学期: new Date("2026-09-21T00:00:00"),
};

const DAY_MAP = { 0: "日", 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土" };
const PERIODS = ["1限", "2限", "3限", "4限", "5限"];

// 日本時間の現在日時を取得（UTC+9）
export function nowJST() {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
}

export function getSemester(date) {
  const m = date.getMonth() + 1;
  return m >= 3 && m <= 8 ? "前学期" : "後学期";
}

export function getWeek(date) {
  const sem = getSemester(date);
  const start = new Date(SEMESTER_START[sem]);
  start.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const w = Math.floor((d - start) / (7 * 86400000)) + 1;
  return Math.max(1, Math.min(13, w));
}

export function getRawWeek(date) {
  const sem = getSemester(date);
  const start = new Date(SEMESTER_START[sem]);
  start.setHours(0, 0, 0, 0);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d - start) / (7 * 86400000)) + 1;
}

export function getExamCountdown(date) {
  const sem = getSemester(date);
  const start = new Date(SEMESTER_START[sem]);
  // 第13週の月曜
  const week13 = new Date(start.getTime() + 12 * 7 * 86400000);
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  week13.setHours(0, 0, 0, 0);
  return Math.ceil((week13 - d) / 86400000);
}

export function formatTimetable(sem) {
  const courses = getCourses();
  const data = courses[sem];
  if (!data) return `${sem}のデータがありません`;

  const days = ["月", "火", "水", "木", "金"];
  let lines = [];
  lines.push(`━━ ${sem} 時間割 ━━`);
  lines.push("");

  for (const day of days) {
    const dayCourses = data[day];
    if (!dayCourses || Object.keys(dayCourses).length === 0) continue;

    lines.push(`【${day}曜日】`);
    for (const p of PERIODS) {
      if (dayCourses[p]) {
        const c = dayCourses[p];
        if (c.shared_with) {
          lines.push(`  ${p} ${c.name} ※${c.note}`);
        } else {
          lines.push(`  ${p} ${c.name} (${c.room})`);
        }
      }
    }
    lines.push("");
  }

  if (data["オンデマンド"]) {
    lines.push("【オンデマンド】");
    for (const c of data["オンデマンド"]) {
      lines.push(`  ${c.name}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function formatToday(date) {
  const courses = getCourses();
  const day = DAY_MAP[date.getDay()];
  const sem = getSemester(date);
  const week = getWeek(date);
  const data = courses[sem];

  if (day === "土" || day === "日") return "今日は休み!";

  const dayCourses = data[day];
  if (!dayCourses || Object.keys(dayCourses).length === 0) return "今日は対面授業なし!";

  let lines = [];
  lines.push(`${date.getMonth() + 1}/${date.getDate()}(${day}) ${sem}${week}週目`);
  lines.push("");

  for (const [period, course] of Object.entries(dayCourses)) {
    if (course.shared_with) {
      lines.push(`[${course.name}] ${period}`);
      lines.push(`※${course.note}`);
      continue;
    }
    const wd = course.weeks?.[String(week)];
    lines.push(`[${course.name}]`);
    lines.push(`${period} / ${course.room}`);
    if (wd) {
      lines.push(`内容: ${wd.topic}`);
      if (wd.exam) lines.push(`!! テスト・試験あり!`);
      if (wd.presentation) lines.push(`!! プレゼンあり!`);
      if (wd.report) lines.push(`!! レポート提出!`);
      lines.push(`準備: ${wd.prep}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// 全科目の名前一覧を取得
export function getAllCourseNames() {
  const courses = getCourses();
  const names = new Set();
  for (const sem of ["前学期", "後学期"]) {
    const data = courses[sem];
    if (!data) continue;
    for (const [key, dayCourses] of Object.entries(data)) {
      if (key === "オンデマンド") {
        for (const c of dayCourses) names.add(c.name);
      } else {
        for (const course of Object.values(dayCourses)) {
          if (course.name && !course.shared_with) names.add(course.name);
        }
      }
    }
  }
  return [...names];
}

// 科目名のあいまい検索
export function findCourse(input) {
  const all = getAllCourseNames();
  // 完全一致
  const exact = all.find(n => n === input);
  if (exact) return exact;
  // 部分一致
  const partial = all.find(n => n.includes(input) || input.includes(n));
  if (partial) return partial;
  // カタカナ/ひらがな無視の部分一致
  const norm = input.replace(/[ぁ-ん]/g, c => String.fromCharCode(c.charCodeAt(0) + 96));
  const normMatch = all.find(n => {
    const nn = n.replace(/[ぁ-ん]/g, c => String.fromCharCode(c.charCodeAt(0) + 96));
    return nn.includes(norm) || norm.includes(nn);
  });
  return normMatch || null;
}

// 各科目の最大許容欠席回数（全13回のうち）
export function getMaxAbsences(courseName) {
  const courses = getCourses();
  for (const sem of ["前学期", "後学期"]) {
    const data = courses[sem];
    if (!data) continue;
    for (const [key, dayCourses] of Object.entries(data)) {
      if (key === "オンデマンド") continue;
      for (const course of Object.values(dayCourses)) {
        if (course.name === courseName && !course.shared_with) {
          const eval_ = (course.evaluation || "").toLowerCase();
          // 出席・参加の割合が高い科目は厳しく
          if (eval_.includes("100%") || eval_.includes("参加50")) return 3;
          if (eval_.includes("participation") || eval_.includes("平常点")) return 4;
          return 4; // デフォルト: 4回まで
        }
      }
    }
  }
  return 4;
}
