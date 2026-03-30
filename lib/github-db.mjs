// GitHub Contents APIを使ってdata.jsonを読み書き
const REPO = "toranosuke2377-dev/tani-toreru-kun";

export async function readData() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/data.json`, {
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
    },
  });
  if (!res.ok) return { tasks: [], attendance: {}, _sha: null };
  const json = await res.json();
  const content = JSON.parse(Buffer.from(json.content, "base64").toString("utf-8"));
  content._sha = json.sha;
  return content;
}

export async function writeData(data) {
  const sha = data._sha;
  const { _sha, ...cleanData } = data;
  const content = Buffer.from(JSON.stringify(cleanData, null, 2)).toString("base64");

  const body = {
    message: "update data.json",
    content,
    ...(sha ? { sha } : {}),
  };

  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/data.json`, {
    method: "PUT",
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  return res.ok;
}
