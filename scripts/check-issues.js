/* Checks data/issues/*.json before every build (npm runs it as "prebuild"), so a broken issue never reaches the site.
   Run by hand: node scripts/check-issues.js */
import { readFileSync, readdirSync } from "node:fs";
import { SUPABASE_URL, SUPABASE_KEY } from "../src/supabase.js";

const DIR = new URL("../data/issues/", import.meta.url);
const problems = [];
const problem = (file, msg) => problems.push(`${file}: ${msg}`);

/* ---------- the files themselves ---------- */
const owner = {}; /* every sentence and note id -> the file it is in */
const segIds = new Set(), noteIds = new Set(), issueIds = new Set();
for (const file of readdirSync(DIR).filter(f => f.endsWith(".json")).sort()) {
  let j;
  try { j = JSON.parse(readFileSync(new URL(file, DIR), "utf8")); }
  catch (e) { problem(file, "not valid JSON: " + e.message); continue; }

  for (const k of ["id", "parsha", "title", "ref", "date", "essay", "notes"]) if (j[k] == null) problem(file, `missing "${k}"`);
  if (!Array.isArray(j.essay) || !Array.isArray(j.notes)) continue;
  if (issueIds.has(j.id)) problem(file, `issue id "${j.id}" is used by another issue`);
  issueIds.add(j.id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(j.date))) problem(file, `date "${j.date}" should look like 2026-10-24`);

  const claim = id => { if (owner[id]) problem(file, `id "${id}" is also used in ${owner[id]}`); owner[id] = file; };
  const mine = new Set();
  j.essay.forEach((p, i) => {
    if (!Array.isArray(p.segs) || !p.segs.length) { problem(file, `paragraph ${i + 1} has no sentences`); return; }
    if (p.lead && !String(p.segs[0][1]).startsWith(p.lead)) problem(file, `paragraph ${i + 1}: the first sentence does not start with its lead "${p.lead}"`);
    for (const [id, text] of p.segs) {
      if (!id || !String(text || "").trim()) problem(file, `paragraph ${i + 1}: a sentence without an id or text`);
      claim(id); mine.add(id); segIds.add(id);
    }
  });
  for (const n of j.notes) {
    claim(n.id); noteIds.add(n.id);
    if (!["beer", "trad"].includes(n.kind)) problem(file, `${n.id}: kind should be "beer" or "trad"`);
    if (!Array.isArray(n.s) || !n.s.length) problem(file, `${n.id}: points at no sentence`);
    for (const s of n.s || []) if (!mine.has(s)) problem(file, `${n.id}: points at sentence "${s}", which is not in this issue`);
    if (n.kind === "beer" && !n.dh) problem(file, `${n.id}: no heading (dh)`);
    for (const f of n.full || []) if (!/^https:\/\//.test(String(f[2] || ""))) problem(file, `${n.id}: source "${f[0]}" has no https link`);
  }
}

/* ---------- comments and likes already on the site ---------- */
/* A sentence or note id that changed after publishing would silently hide what people wrote on it. */
async function fetchAll(table, cols) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${cols}`, {
      headers: { apikey: SUPABASE_KEY, Range: `${from}-${from + 999}` },
    });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}
try {
  const [comments, likes] = await Promise.all([fetchAll("comments", "id,seg_ids"), fetchAll("likes", "target_id")]);
  const commentIds = new Set(comments.map(c => c.id));
  for (const c of comments) for (const s of c.seg_ids) if (!segIds.has(s)) problem("database", `comment ${c.id} is on sentence "${s}", which no issue has any more`);
  const lost = new Set(likes.map(l => l.target_id).filter(t => !commentIds.has(t) && !noteIds.has(t)));
  for (const t of lost) problem("database", `👍 on "${t}", which is no longer a note or comment`);
} catch (e) {
  /* the database being unreachable should not stop a deploy */
  console.warn(`check-issues: skipped the database check (${e.message})`);
}

if (problems.length) {
  const shown = problems.slice(0, 20).concat(problems.length > 20 ? [`...and ${problems.length - 20} more`] : []);
  console.error(`check-issues: ${problems.length} problem(s) in the issue files:\n  ` + shown.join("\n  "));
  process.exitCode = 1; /* not process.exit(), which can crash Node on Windows while fetch handles close */
} else {
  console.log(`check-issues: ${issueIds.size} issues, ${segIds.size} sentences, ${noteIds.size} notes, OK`);
}
