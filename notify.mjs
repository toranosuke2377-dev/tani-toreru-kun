import fs from "fs";
import https from "https";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

// 日本時間の現在日時を取得（UTC+9）
function nowJST() {
  const now = new Date();
  return new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
}

// 学期の開始日（第1回授業が行われる週の月曜日に設定）
const SEMESTER_START = {
  前学期: new Date("2026-04-06T00:00:00"),
  後学期: new Date("2026-09-21T00:00:00"),
};

const DAY_MAP = { 0: "日", 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土" };

function getCurrentWeek(semesterStart) {
  const now = nowJST();
  now.setHours(0, 0, 0, 0);
  const start = new Date(semesterStart);
  start.setHours(0, 0, 0, 0);
  const diffMs = now - start;
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  return diffWeeks + 1;
}

function getCurrentSemester() {
  const now = nowJST();
  const month = now.getMonth() + 1;
  // 3月〜8月は前学期（3月は前学期準備期間）
  if (month >= 3 && month <= 8) return "前学期";
  return "後学期";
}

function clampWeek(w) {
  if (w < 1) return 1;
  if (w > 13) return 13;
  return w;
}

async function buildMessage() {
  const courses = JSON.parse(fs.readFileSync(path.join(__dirname, "courses.json"), "utf-8"));
  const now = nowJST();
  const dayOfWeek = DAY_MAP[now.getDay()];
  const semester = getCurrentSemester();
  const semesterData = courses[semester];
  const rawWeek = getCurrentWeek(SEMESTER_START[semester]);
  const weekNum = clampWeek(rawWeek);
  const dateStr = `${now.getMonth() + 1}/${now.getDate()}(${dayOfWeek})`;

  const preStart = rawWeek < 1;
  const postEnd = rawWeek > 13;

  let lines = [];
  lines.push(`━━━━━━━━━━━━━━`);
  lines.push(`単位取れる君 ${dateStr}`);
  if (preStart) {
    lines.push(`${semester}まであと${1 - rawWeek}週!`);
  } else if (postEnd) {
    lines.push(`${semester} 授業終了!`);
  } else {
    lines.push(`${semester} ${weekNum}週目/全13週`);
  }
  lines.push(`━━━━━━━━━━━━━━`);

  if (dayOfWeek === "日" || dayOfWeek === "土") {
    // ===== 週末 =====
    lines.push("");
    lines.push("今日は休み!");

    if (semesterData["オンデマンド"]) {
      lines.push("");
      lines.push("-- 週末にやっておくこと --");
      for (const course of semesterData["オンデマンド"]) {
        const weekData = course.weeks[String(weekNum)];
        if (weekData) {
          lines.push("");
          lines.push(`[${course.name}]`);
          lines.push(`内容: ${weekData.topic}`);
          lines.push(`-> ${weekData.prep}`);
          if (weekData.exam) lines.push(`!! 試験あり!最優先で準備!`);
        }
      }
    }

    if (dayOfWeek === "日" && semesterData["月"]) {
      lines.push("");
      lines.push("-- 明日の準備 --");
      const nw = clampWeek(preStart ? 1 : rawWeek + 1);
      for (const [period, course] of Object.entries(semesterData["月"])) {
        if (course.shared_with) continue;
        const wd = course.weeks?.[String(nw)];
        if (wd) {
          lines.push("");
          lines.push(`[${course.name}] ${period} ${course.room}`);
          lines.push(`内容: ${wd.topic}`);
          lines.push(`-> ${wd.prep}`);
          if (wd.exam) lines.push(`!! テストあり!`);
        }
      }
    }

  } else {
    // ===== 平日 =====
    const todayCourses = semesterData[dayOfWeek];

    // --- 今日やること ---
    lines.push("");
    lines.push("-- 今日やること --");

    if (todayCourses && Object.keys(todayCourses).length > 0) {
      for (const [period, course] of Object.entries(todayCourses)) {
        if (course.shared_with) {
          lines.push("");
          lines.push(`[${course.name}] ${period}`);
          lines.push(`※${course.note}`);
          continue;
        }
        const wd = course.weeks?.[String(weekNum)];
        lines.push("");
        lines.push(`[${course.name}]`);
        lines.push(`${period} / ${course.room}`);
        if (wd) {
          lines.push(`内容: ${wd.topic}`);
          if (wd.exam) lines.push(`!! テスト・試験あり!必ず準備して!`);
          if (wd.presentation) lines.push(`!! プレゼン発表あり!`);
          if (wd.report) lines.push(`!! レポート提出日!`);
          lines.push(`準備: ${wd.prep}`);
        }
      }
    } else {
      lines.push("対面授業なし!");
    }

    // --- オンデマンド ---
    if (semesterData["オンデマンド"]) {
      lines.push("");
      lines.push("-- オンデマンド(今週分) --");
      for (const course of semesterData["オンデマンド"]) {
        const wd = course.weeks[String(weekNum)];
        if (wd) {
          lines.push(`[${course.name}]`);
          lines.push(`内容: ${wd.topic}`);
          lines.push(`-> ${wd.prep}`);
          if (wd.exam) lines.push(`!! 試験あり!`);
        }
      }
    }

    // --- 前回の復習 ---
    let prevDay = dayOfWeek === "月" ? "金" : DAY_MAP[new Date(now.getTime() - 86400000).getDay()];
    const prevCourses = semesterData[prevDay];
    if (prevCourses) {
      const pw = dayOfWeek === "月" ? clampWeek(rawWeek - 1) : weekNum;
      let items = [];
      for (const [, course] of Object.entries(prevCourses)) {
        if (course.shared_with) continue;
        const wd = course.weeks?.[String(pw)];
        if (wd?.review) items.push(`${course.name}: ${wd.review}`);
      }
      if (items.length > 0) {
        lines.push("");
        lines.push(`-- ${prevDay}曜の復習やった? --`);
        items.forEach(i => lines.push(i));
      }
    }

    // --- 明日の予習 ---
    const tomorrow = new Date(now.getTime() + 86400000);
    const nextDay = DAY_MAP[tomorrow.getDay()];
    if (nextDay !== "土" && nextDay !== "日") {
      const nextCourses = semesterData[nextDay];
      if (nextCourses) {
        let items = [];
        for (const [period, course] of Object.entries(nextCourses)) {
          if (course.shared_with) continue;
          const nw = nextDay === "月" ? clampWeek(rawWeek + 1) : weekNum;
          const wd = course.weeks?.[String(nw)];
          if (wd) {
            let line = `${course.name}(${period}): ${wd.prep}`;
            if (wd.exam) line += ` !!試験!!`;
            items.push(line);
          }
        }
        if (items.length > 0) {
          lines.push("");
          lines.push(`-- 明日(${nextDay})の準備 --`);
          items.forEach(i => lines.push(i));
        }
      }
    }
  }

  // --- 課題リマインド ---
  const taskData = await loadTaskData();
  const activeTasks = (taskData.tasks || []).filter(t => !t.done);
  if (activeTasks.length > 0) {
    activeTasks.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    lines.push("");
    lines.push("-- 課題の締切 --");
    for (const t of activeTasks) {
      const d = new Date(t.deadline);
      const diff = Math.ceil((d - new Date(now.toDateString())) / 86400000);
      const dl = `${d.getMonth() + 1}/${d.getDate()}`;
      let warn = `(あと${diff}日)`;
      if (diff < 0) warn = "(期限切れ!!)";
      else if (diff === 0) warn = "(今日!!)";
      else if (diff === 1) warn = "(明日!)";
      else if (diff <= 3) warn = `(あと${diff}日!)`;
      lines.push(`${t.course}: ${t.content} ${dl}${warn}`);
    }
  }

  // --- テスト週間カウントダウン ---
  const semStart = SEMESTER_START[semester];
  const week13Start = new Date(semStart.getTime() + 12 * 7 * 86400000);
  const daysToExam = Math.ceil((week13Start - new Date(now.toDateString())) / 86400000);
  if (daysToExam > 0 && daysToExam <= 30) {
    lines.push("");
    if (daysToExam <= 7) {
      lines.push(`!! 試験週間まであと${daysToExam}日!! !!`);
    } else if (daysToExam <= 14) {
      lines.push(`! 試験週間まであと${daysToExam}日! 復習始めよう!`);
    } else {
      lines.push(`試験週間まであと${daysToExam}日`);
    }
  }

  lines.push("");
  lines.push(`━━━━━━━━━━━━━━`);
  lines.push("単位、絶対取ろう!");

  return lines.join("\n");
}

async function loadTaskData() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      // ローカル実行時はdata.jsonを直接読む
      const localPath = path.join(__dirname, "data.json");
      if (fs.existsSync(localPath)) {
        return JSON.parse(fs.readFileSync(localPath, "utf-8"));
      }
      return { tasks: [], attendance: {} };
    }
    const res = await fetch("https://api.github.com/repos/toranosuke2377-dev/tani-toreru-kun/contents/data.json", {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) return { tasks: [], attendance: {} };
    const json = await res.json();
    return JSON.parse(Buffer.from(json.content, "base64").toString("utf-8"));
  } catch {
    return { tasks: [], attendance: {} };
  }
}

function sendLineBroadcast(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      messages: [{ type: "text", text: message }],
    });

    const options = {
      hostname: "api.line.me",
      path: "/v2/bot/message/broadcast",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          console.log("LINE通知送信成功！");
          resolve(body);
        } else {
          console.error(`送信失敗: ${res.statusCode} ${body}`);
          reject(new Error(`${res.statusCode}: ${body}`));
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// メイン実行
const message = await buildMessage();
console.log("--- 送信メッセージ ---");
console.log(message);
console.log("--- 送信中... ---");
await sendLineBroadcast(message);
