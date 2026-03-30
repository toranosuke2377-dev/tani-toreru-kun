import { readData, writeData } from "../lib/github-db.mjs";
import {
  formatTimetable,
  formatToday,
  getSemester,
  getWeek,
  getExamCountdown,
  findCourse,
  getAllCourseNames,
  getMaxAbsences,
} from "../lib/timetable.mjs";

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const QUICK_REPLIES = [
  { type: "action", action: { type: "message", label: "今日の予定", text: "今日" } },
  { type: "action", action: { type: "message", label: "時間割", text: "時間割" } },
  { type: "action", action: { type: "message", label: "課題一覧", text: "課題一覧" } },
  { type: "action", action: { type: "message", label: "出席状況", text: "出席状況" } },
  { type: "action", action: { type: "message", label: "ヘルプ", text: "ヘルプ" } },
];

async function reply(replyToken, text) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${LINE_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [
        {
          type: "text",
          text,
          quickReply: { items: QUICK_REPLIES },
        },
      ],
    }),
  });
}

function parseDate(str) {
  // M/D or M-D or M月D日 形式に対応
  const m1 = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (m1) return `2026-${m1[1].padStart(2, "0")}-${m1[2].padStart(2, "0")}`;
  const m2 = str.match(/^(\d{1,2})月(\d{1,2})日?$/);
  if (m2) return `2026-${m2[1].padStart(2, "0")}-${m2[2].padStart(2, "0")}`;
  return null;
}

function formatDeadline(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = Math.ceil((d - now) / 86400000);
  const label = `${d.getMonth() + 1}/${d.getDate()}`;
  if (diff < 0) return `${label}(期限切れ)`;
  if (diff === 0) return `${label}(今日!!)`;
  if (diff === 1) return `${label}(明日!)`;
  if (diff <= 3) return `${label}(あと${diff}日!)`;
  return `${label}(あと${diff}日)`;
}

async function handleMessage(replyToken, text) {
  const msg = text.trim();

  // --- ヘルプ ---
  if (msg === "ヘルプ" || msg === "help" || msg === "メニュー") {
    return reply(replyToken, [
      "━━ 使い方 ━━",
      "",
      "[時間割]",
      "  時間割 → 今の学期",
      "  前学期時間割 / 後学期時間割",
      "",
      "[今日の予定]",
      "  今日",
      "",
      "[課題管理]",
      "  課題追加 科目名 内容 締切日",
      "  例: 課題追加 環境経営論 レポート 5/20",
      "  課題一覧",
      "  課題完了 番号",
      "  課題削除 番号",
      "",
      "[出席管理]",
      "  出席 科目名",
      "  欠席 科目名",
      "  出席状況",
      "",
      "[その他]",
      "  カウントダウン → 試験まで何日",
    ].join("\n"));
  }

  // --- 時間割 ---
  if (msg === "時間割") {
    const sem = getSemester(new Date());
    return reply(replyToken, formatTimetable(sem));
  }
  if (msg === "前学期時間割" || msg === "前期時間割") {
    return reply(replyToken, formatTimetable("前学期"));
  }
  if (msg === "後学期時間割" || msg === "後期時間割") {
    return reply(replyToken, formatTimetable("後学期"));
  }

  // --- 今日の予定 ---
  if (msg === "今日" || msg === "今日の予定") {
    return reply(replyToken, formatToday(new Date()));
  }

  // --- カウントダウン ---
  if (msg === "カウントダウン" || msg.includes("試験まで")) {
    const days = getExamCountdown(new Date());
    const sem = getSemester(new Date());
    const week = getWeek(new Date());
    let text;
    if (days <= 0) {
      text = "試験期間中、またはもう終わった!";
    } else if (days <= 14) {
      text = `!! ${sem}の試験週間まであと${days}日!!\n現在${week}週目/全13週\nそろそろ本気出さないとヤバい!`;
    } else if (days <= 30) {
      text = `${sem}の試験週間まであと${days}日\n現在${week}週目/全13週\n計画的に復習を始めよう!`;
    } else {
      text = `${sem}の試験週間まであと${days}日\n現在${week}週目/全13週\nまだ余裕あるけど毎日の復習が大事!`;
    }
    return reply(replyToken, text);
  }

  // --- 課題追加 ---
  if (msg.startsWith("課題追加")) {
    const parts = msg.replace("課題追加", "").trim().split(/\s+/);
    if (parts.length < 3) {
      return reply(replyToken, "書き方: 課題追加 科目名 内容 締切日\n例: 課題追加 環境経営論 レポート 5/20");
    }
    const courseName = findCourse(parts[0]);
    const content = parts.slice(1, -1).join(" ");
    const deadline = parseDate(parts[parts.length - 1]);

    if (!deadline) {
      return reply(replyToken, "締切日の形式が正しくないよ!\n例: 5/20 or 5月20日");
    }

    const data = await readData();
    const id = (data.tasks.length > 0 ? Math.max(...data.tasks.map(t => t.id)) : 0) + 1;
    data.tasks.push({
      id,
      course: courseName || parts[0],
      content,
      deadline,
      done: false,
    });
    await writeData(data);

    return reply(replyToken, `課題を追加したよ!\n${courseName || parts[0]}: ${content}\n締切: ${formatDeadline(deadline)}`);
  }

  // --- 課題一覧 ---
  if (msg === "課題一覧" || msg === "課題") {
    const data = await readData();
    const active = data.tasks.filter(t => !t.done);
    if (active.length === 0) {
      return reply(replyToken, "課題は今のところないよ!\n\n課題追加 科目名 内容 締切日\nで追加できるよ");
    }

    // 締切順にソート
    active.sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    let lines = ["━━ 課題一覧 ━━", ""];
    for (const t of active) {
      const dl = formatDeadline(t.deadline);
      lines.push(`#${t.id} ${t.course}`);
      lines.push(`  ${t.content} / ${dl}`);
    }
    lines.push("");
    lines.push("課題完了 番号 → 完了にする");
    lines.push("課題削除 番号 → 削除する");
    return reply(replyToken, lines.join("\n"));
  }

  // --- 課題完了 ---
  if (msg.startsWith("課題完了")) {
    const id = parseInt(msg.replace("課題完了", "").trim());
    if (isNaN(id)) return reply(replyToken, "番号を指定してね!\n例: 課題完了 1");
    const data = await readData();
    const task = data.tasks.find(t => t.id === id);
    if (!task) return reply(replyToken, `#${id} の課題が見つからないよ`);
    task.done = true;
    await writeData(data);
    return reply(replyToken, `#${id} ${task.course}の${task.content}を完了にしたよ! お疲れ!`);
  }

  // --- 課題削除 ---
  if (msg.startsWith("課題削除")) {
    const id = parseInt(msg.replace("課題削除", "").trim());
    if (isNaN(id)) return reply(replyToken, "番号を指定してね!\n例: 課題削除 1");
    const data = await readData();
    const idx = data.tasks.findIndex(t => t.id === id);
    if (idx === -1) return reply(replyToken, `#${id} の課題が見つからないよ`);
    const removed = data.tasks.splice(idx, 1)[0];
    await writeData(data);
    return reply(replyToken, `#${id} ${removed.course}の${removed.content}を削除したよ`);
  }

  // --- 出席 ---
  if (msg.startsWith("出席 ") || msg.startsWith("出席　")) {
    const input = msg.replace(/^出席[\s　]+/, "").trim();
    const courseName = findCourse(input);
    if (!courseName) {
      const all = getAllCourseNames();
      return reply(replyToken, `「${input}」が見つからないよ\n\n科目名の例:\n${all.slice(0, 8).join("\n")}`);
    }
    const data = await readData();
    if (!data.attendance[courseName]) {
      data.attendance[courseName] = { attended: 0, absent: 0 };
    }
    data.attendance[courseName].attended++;
    await writeData(data);
    const a = data.attendance[courseName];
    return reply(replyToken, `${courseName} 出席記録!\n出席${a.attended}回 / 欠席${a.absent}回`);
  }

  // --- 欠席 ---
  if (msg.startsWith("欠席 ") || msg.startsWith("欠席　")) {
    const input = msg.replace(/^欠席[\s　]+/, "").trim();
    const courseName = findCourse(input);
    if (!courseName) {
      return reply(replyToken, `「${input}」が見つからないよ`);
    }
    const data = await readData();
    if (!data.attendance[courseName]) {
      data.attendance[courseName] = { attended: 0, absent: 0 };
    }
    data.attendance[courseName].absent++;
    const a = data.attendance[courseName];
    const maxAbs = getMaxAbsences(courseName);
    const remaining = maxAbs - a.absent;
    await writeData(data);

    let warning = "";
    if (remaining <= 0) {
      warning = "\n!! もう休めない!次休んだら単位落ちるかも!";
    } else if (remaining === 1) {
      warning = "\n! あと1回しか休めないよ!気をつけて!";
    }

    return reply(replyToken, `${courseName} 欠席記録\n出席${a.attended}回 / 欠席${a.absent}回\nあと${Math.max(0, remaining)}回休める${warning}`);
  }

  // --- 出席状況 ---
  if (msg === "出席状況") {
    const data = await readData();
    const entries = Object.entries(data.attendance);
    if (entries.length === 0) {
      return reply(replyToken, "まだ記録がないよ!\n\n出席 科目名 → 出席を記録\n欠席 科目名 → 欠席を記録");
    }
    let lines = ["━━ 出席状況 ━━", ""];
    for (const [name, a] of entries) {
      const maxAbs = getMaxAbsences(name);
      const remaining = maxAbs - a.absent;
      let status = `残り${Math.max(0, remaining)}回休める`;
      if (remaining <= 0) status = "!! 休めない!";
      else if (remaining === 1) status = "! あと1回だけ";
      lines.push(`${name}`);
      lines.push(`  出席${a.attended} 欠席${a.absent} ${status}`);
    }
    return reply(replyToken, lines.join("\n"));
  }

  // --- デフォルト ---
  return reply(replyToken, "「ヘルプ」で使い方を見てね!");
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).send("OK");
  }

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const { events } = req.body || {};
  if (!events || events.length === 0) {
    return res.status(200).send("OK");
  }

  for (const event of events) {
    if (event.type === "message" && event.message.type === "text") {
      await handleMessage(event.replyToken, event.message.text);
    }
  }

  return res.status(200).send("OK");
}
