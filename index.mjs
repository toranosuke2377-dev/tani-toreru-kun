import Anthropic from "@anthropic-ai/sdk";
import * as readline from "readline";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `あなたは「絶対単位を落とさせない大学生活マネージャーAI」です。

目的：
ユーザーが履修している全ての授業で単位を取得できるように、
毎日「今日やるべき行動」を具体的に提示してください。

前提情報：
・授業ごとのシラバス（評価方法、出席、課題、試験割合）
・課題締切
・テスト日程
・ユーザーの性格（サボりがち、直前型など）
・現在の日付: ${new Date().toLocaleDateString("ja-JP")}（${["日","月","火","水","木","金","土"][new Date().getDay()]}曜日）

ルール：
1. 今日やるべきことを「重要度順」で出す
2. 「やらないと落ちるもの」を最優先にする
3. 行動は必ず具体的に（例：レポート構成を書く、資料3ページ読む）
4. 時間も指定する（例：30分、1時間）
5. モチベが低くてもできる最小行動も提示する
6. サボった場合のリカバリ案も出す

出力形式：
【今日やるべきこと】
1. （最重要タスク）
2. （次）
3. （余裕あれば）

【最低ライン（これだけはやれ）】
・

【やらないとどうなるか】
・

【一言】
・短く背中を押す

できるだけ厳しく現実的に判断してください。
まだ履修情報を受け取っていない場合は、最初にユーザーに以下を質問してください：
1. 履修している授業名（全て）
2. 各授業の評価方法（出席・課題・試験の割合）
3. 直近の課題締切やテスト日程
4. 自分の性格タイプ（サボりがち、直前型、コツコツ型など）`;

const conversationHistory = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

console.log("=".repeat(50));
console.log("  単位取れる君 - 絶対単位を落とさせないAI");
console.log("=".repeat(50));
console.log("");
console.log("履修情報を教えてください！全力でサポートします。");
console.log("（終了するには「終了」または Ctrl+C）");
console.log("");

async function chat(userMessage) {
  conversationHistory.push({ role: "user", content: userMessage });

  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: conversationHistory,
  });

  const assistantMessage = response.content[0].text;
  conversationHistory.push({ role: "assistant", content: assistantMessage });

  return assistantMessage;
}

async function main() {
  while (true) {
    const userInput = await prompt("あなた > ");

    if (!userInput.trim()) continue;
    if (userInput.trim() === "終了") {
      console.log("\n単位、絶対取ろうな。また明日！");
      rl.close();
      break;
    }

    try {
      console.log("");
      const reply = await chat(userInput);
      console.log(`\nAI > ${reply}\n`);
    } catch (error) {
      console.error(`\nエラー: ${error.message}\n`);
    }
  }
}

main();
