"""Render an offline, review-only HTML queue for Gmail import candidates."""

# ruff: noqa: E501 -- the self-contained HTML template intentionally uses compact lines.

from __future__ import annotations

import json
from typing import Any


REVIEW_TEMPLATE = r"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
<title>GradPilot · Gmail 邮件导入审核</title>
<style>
:root{--page:#f1f0ea;--paper:#fcfcf9;--ink:#172526;--muted:#667471;--line:#d7dcd4;--nav:#132527;--accent:#d45c35;--accent-dark:#a73f20;--blue:#246cae;--green:#147958;--amber:#9a6500;--red:#b63832;--display:"Avenir Next","Gill Sans","Trebuchet MS",sans-serif;--body:"Avenir Next","Segoe UI","Microsoft YaHei",sans-serif;--mono:"Cascadia Code",Consolas,monospace}*{box-sizing:border-box}body{margin:0;min-width:320px;background-color:var(--page);background-image:linear-gradient(rgba(50,80,70,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(50,80,70,.035) 1px,transparent 1px);background-size:28px 28px;color:var(--ink);font:14px/1.55 var(--body)}button,input,select{font:inherit}button{cursor:pointer}a{color:var(--blue);text-underline-offset:3px}:focus-visible{outline:3px solid var(--accent);outline-offset:3px}[hidden]{display:none!important}.skip{position:fixed;top:-70px;left:16px;padding:10px;background:var(--accent);color:white;z-index:20}.skip:focus{top:12px}.masthead{background:var(--nav);color:#ecf1e9;border-top:4px solid var(--accent)}.mast-inner{max-width:1440px;margin:auto;padding:28px clamp(20px,4vw,58px) 32px;display:grid;grid-template-columns:1fr auto;gap:28px;align-items:end}.brand{font:800 18px/1 var(--display);letter-spacing:.08em}.brand span{color:#ed8059}.eyebrow{margin:26px 0 8px;color:#e88b69;font:10px var(--mono);letter-spacing:.16em}.masthead h1{max-width:820px;margin:0;font:650 clamp(29px,4.2vw,52px)/1.08 var(--display);letter-spacing:-.045em}.masthead p{max-width:720px;margin:14px 0 0;color:#b9c7c0}.workflow{display:grid;gap:9px;font:10px var(--mono);color:#95a8a0}.workflow b{display:inline-block;width:25px;color:#ed8059}.workflow .active{color:white}.main{max-width:1440px;margin:auto;padding:26px clamp(20px,4vw,58px) 70px}.notice{display:flex;gap:12px;padding:15px 17px;border-left:4px solid var(--blue);background:#e7eef2;color:#27444e}.notice strong{display:block}.notice p{margin:2px 0 0}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;margin:24px 0;background:var(--line);border:1px solid var(--line)}.stat{background:var(--paper);padding:18px}.stat b{display:block;font:650 30px var(--display);letter-spacing:-.04em}.stat span{color:var(--muted);font-size:11px}.toolbar{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:14px 0;background:color-mix(in srgb,var(--page) 94%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}.toolbar .grow{flex:1;min-width:220px}.search,.filter{width:100%;min-height:39px;padding:8px 11px;border:1px solid var(--line);background:var(--paper);color:var(--ink)}.filter{min-width:170px}.button{min-height:39px;padding:8px 14px;border:1px solid #aebbb3;border-radius:2px;background:transparent;color:var(--ink);font-weight:650}.button:hover{border-color:var(--accent)}.button.primary{background:var(--accent);border-color:var(--accent);color:white}.button.primary:hover{background:var(--accent-dark)}.selection{font:11px var(--mono);color:var(--muted);white-space:nowrap}.batch{display:flex;flex-wrap:wrap;gap:8px 22px;margin:15px 0 25px;color:var(--muted);font:10px var(--mono);word-break:break-all}.queue{display:grid;gap:18px}.card{background:var(--paper);border:1px solid var(--line);box-shadow:0 8px 28px rgba(25,40,35,.035)}.card.approved{border-color:var(--accent);box-shadow:inset 4px 0 var(--accent)}.card.applied{opacity:.78}.card-head{display:grid;grid-template-columns:auto 1fr auto;gap:14px;align-items:start;padding:20px 22px;border-bottom:1px solid var(--line)}.approve{display:flex;align-items:center;gap:8px;padding-top:3px;font-weight:700}.approve input{width:18px;height:18px;accent-color:var(--accent)}.message h2{margin:0 0 6px;font:650 19px/1.3 var(--display);letter-spacing:-.02em;overflow-wrap:anywhere}.meta{color:var(--muted);font-size:12px;overflow-wrap:anywhere}.badges{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}.badge{padding:4px 7px;border:1px solid var(--line);font:9px var(--mono);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap}.badge.high{color:var(--green);border-color:#8dbaaa}.badge.medium{color:var(--blue)}.badge.low{color:var(--amber)}.badge.applied-badge{color:var(--red)}.card-body{display:grid;grid-template-columns:minmax(230px,.72fr) minmax(420px,1.6fr);gap:26px;padding:22px}.source h3,.changes h3{margin:0 0 11px;font:10px var(--mono);letter-spacing:.13em;color:var(--accent-dark)}.snippet{margin:0 0 15px;padding:13px;background:#f0f1eb;color:#43524f;font-size:12px;white-space:pre-wrap;overflow-wrap:anywhere}.evidence{margin:10px 0;color:var(--muted);font-size:11px}.warnings{display:grid;gap:6px;margin:13px 0;padding:0;list-style:none}.warnings li{padding-left:14px;position:relative;color:#8a5112;font-size:12px}.warnings li:before{content:"!";position:absolute;left:0;font:bold 10px var(--mono)}.school-label{display:block;margin:16px 0 5px;font-weight:650}.school-select{width:100%;padding:9px;border:1px solid #aebbb3;background:white;color:var(--ink)}.field-grid{display:grid;gap:7px}.field-row{display:grid;grid-template-columns:25px 125px minmax(150px,1fr) minmax(110px,.8fr);gap:10px;align-items:center;min-height:45px;padding:7px 9px;border:1px solid #e1e4dd}.field-row.selected{border-color:#bdc9bf;background:#f5f7f1}.field-row input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent)}.field-name{font:11px var(--mono);color:#344945}.field-value{width:100%;padding:7px 8px;border:1px solid #c8d0c8;background:white;color:var(--ink);font-size:12px}.current{color:var(--muted);font-size:11px;overflow-wrap:anywhere}.empty{padding:60px 24px;text-align:center;background:var(--paper);border:1px solid var(--line)}.empty h2{font:650 26px var(--display)}.export-help{margin-top:28px;padding:22px;background:var(--nav);color:#dce5dc}.export-help h2{margin:0 0 7px;font:650 20px var(--display)}.export-help p{color:#aebfb6}.command{display:block;padding:13px;overflow-x:auto;background:#0b181a;color:#ef9a78;font:12px var(--mono);white-space:nowrap}.error{position:fixed;right:20px;bottom:20px;z-index:30;max-width:480px;padding:14px 18px;background:#782e29;color:white;box-shadow:0 8px 30px #0004}.footer-note{margin-top:18px;color:var(--muted);font-size:11px}@media(max-width:900px){.mast-inner{grid-template-columns:1fr}.workflow{grid-template-columns:repeat(3,1fr)}.stats{grid-template-columns:repeat(2,1fr)}.card-body{grid-template-columns:1fr}.field-row{grid-template-columns:25px 105px 1fr}.current{grid-column:3}}@media(max-width:560px){.card-head{grid-template-columns:1fr}.badges{justify-content:flex-start}.approve{order:2}.field-row{grid-template-columns:22px 1fr}.field-value,.current{grid-column:2}.stats{grid-template-columns:1fr 1fr}.toolbar{position:static}}
</style>
</head>
<body>
<a class="skip" href="#queue">跳转到审核队列</a>
<header class="masthead"><div class="mast-inner"><div><div class="brand">GRAD<span>PILOT</span> / MAIL INTAKE</div><div class="eyebrow">LOCAL REVIEW · READ-ONLY GMAIL · NO AUTO APPLY</div><h1>确认之后，<br>才进入申请看板。</h1><p>邮件解析只是候选建议。核对学校、原始证据与每一个字段；只有你勾选并导出的内容，才能进入下一步写回。</p></div><div class="workflow" aria-label="工作流程"><span><b>01</b> FETCH / 已完成</span><span class="active"><b>02</b> REVIEW / 当前步骤</span><span><b>03</b> APPLY / 手动执行</span></div></div></header>
<main class="main">
<div class="notice"><div>◇</div><div><strong>此页面没有修改申请数据库，也不会发送、删除或归档邮件。</strong><p>邮件正文不写入审核 JSON；页面仅保留主题、发件人、摘要、提取字段和 Gmail 原文链接。</p></div></div>
<section class="stats" aria-label="导入统计"><div class="stat"><b id="stat-total">0</b><span>邮件候选</span></div><div class="stat"><b id="stat-matched">0</b><span>已匹配项目</span></div><div class="stat"><b id="stat-high">0</b><span>高置信候选</span></div><div class="stat"><b id="stat-applied">0</b><span>此前已导入</span></div></section>
<div class="toolbar"><div class="grow"><input class="search" id="search" type="search" placeholder="搜索主题、发件人或学校" aria-label="搜索邮件"></div><select class="filter" id="filter" aria-label="筛选邮件"><option value="all">全部邮件</option><option value="action">需要审核</option><option value="unmatched">未匹配学校</option><option value="applied">此前已导入</option></select><button class="button" id="select-high" type="button">勾选高置信</button><button class="button" id="clear" type="button">清空勾选</button><span class="selection" id="selection">0 封待导出</span><button class="button primary" id="export" type="button">导出确认 JSON ↓</button></div>
<div class="batch"><span id="batch-id"></span><span id="created-at"></span><span id="fingerprint"></span><span id="query"></span></div>
<section class="queue" id="queue" aria-live="polite"></section>
<section class="export-help"><h2>下一步：在终端显式写回</h2><p>先去掉命令末尾的 <code>--write-private</code> 可只预览变更。数据库指纹不一致时，工具会拒绝覆盖，需要重新抓取审核。</p><code class="command">uv run python scripts/import_gmail.py apply "下载的确认JSON路径" --write-private</code><p>写回成功后，再运行 <code>uv run python scripts/dashboard_sync.py</code>，并在看板「资产与设置」中重新载入同步数据。</p></section>
<p class="footer-note">GRADPILOT / CONSERVATIVE RULES V1 · 解析结果不构成学校官方事实。请打开原邮件核实。</p>
</main>
<div class="error" id="error" role="alert" hidden></div>
<script>
"use strict";
const REPORT = __REPORT_JSON__;
const STATUSES = ["Researching","Preparing","Submitted","Interview","Waitlisted","Admitted","Closed"];
const CLOSE_REASONS = [["not_applying","不再申请"],["rejected","被拒"],["withdrawn","主动撤回"],["declined_offer","拒绝 Offer"]];
const FIELDS = [["application_id","申请编号","text"],["submission_date","提交日期","date"],["interview_date","面试日期","date"],["status","申请状态","status"],["decision_date","结果日期","date"],["close_reason","关闭原因","close"]];
const schoolMap = new Map(REPORT.schools.map(school => [school.id, school]));
const queue = document.getElementById("queue");
const errorBox = document.getElementById("error");
let errorTimer;
function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function showError(message) { errorBox.textContent = message; errorBox.hidden = false; clearTimeout(errorTimer); errorTimer = setTimeout(() => { errorBox.hidden = true; }, 6000); }
function schoolFor(card) { return schoolMap.get(card.querySelector(".school-select").value); }
function updateCurrent(card) { const school = schoolFor(card); card.querySelectorAll(".field-row").forEach(row => { const value = school ? school.current[row.dataset.field] || "—" : "—"; row.querySelector(".current").textContent = "当前：" + value; }); }
function updateCounts() { const selected = queue.querySelectorAll(".approve-input:checked").length; document.getElementById("selection").textContent = selected + " 封待导出"; queue.querySelectorAll(".candidate").forEach(card => card.classList.toggle("approved", card.querySelector(".approve-input").checked)); }
function makeOptions(select, values, selected, blank) { select.append(new Option(blank, "")); values.forEach(value => { const pair = Array.isArray(value) ? value : [value,value]; select.append(new Option(pair[1], pair[0])); }); select.value = selected || ""; }
function renderCandidate(candidate, index) {
  const card = node("article", "candidate card" + (candidate.already_applied ? " applied" : "")); card.dataset.index = index;
  const head = node("div", "card-head"); const approveLabel = node("label", "approve"); const approve = node("input", "approve-input"); approve.type = "checkbox"; approve.setAttribute("aria-label", "纳入这封邮件的导出"); approveLabel.append(approve, document.createTextNode("纳入")); head.append(approveLabel);
  const message = node("div", "message"); message.append(node("h2", "", candidate.subject)); message.append(node("div", "meta", candidate.sender + (candidate.message_date ? " · " + candidate.message_date : ""))); head.append(message);
  const badges = node("div", "badges"); badges.append(node("span", "badge " + candidate.confidence, candidate.confidence + " confidence")); if (candidate.already_applied) badges.append(node("span", "badge applied-badge", "已导入")); if (candidate.raw_status) badges.append(node("span", "badge", candidate.raw_status)); head.append(badges); card.append(head);
  const body = node("div", "card-body"); const source = node("section", "source"); source.append(node("h3", "", "01 / 原始邮件与匹配"));
  if (candidate.snippet) source.append(node("p", "snippet", candidate.snippet));
  const link = node("a", "", "打开 Gmail 原邮件 ↗"); try { const url = new URL(candidate.source_url); if (url.protocol === "https:" && url.hostname === "mail.google.com") { link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer"; source.append(link); } } catch (_) {}
  if (candidate.status_evidence) source.append(node("p", "evidence", "状态证据：" + candidate.status_evidence));
  if (candidate.matched_terms.length) source.append(node("p", "evidence", "学校证据：" + candidate.matched_terms.join("；")));
  if (candidate.warnings.length) { const warnings = node("ul", "warnings"); candidate.warnings.forEach(warning => warnings.append(node("li", "", warning))); source.append(warnings); }
  const schoolLabel = node("label", "school-label", "写入哪个申请项目？"); const schoolSelect = node("select", "school-select"); schoolSelect.setAttribute("aria-label", "选择申请项目"); makeOptions(schoolSelect, REPORT.schools.map(school => [school.id, school.name + " · " + school.program_name]), candidate.school_id, "不导入 / 请选择学校"); schoolSelect.addEventListener("change", () => updateCurrent(card)); schoolLabel.append(schoolSelect); source.append(schoolLabel); body.append(source);
  const changes = node("section", "changes"); changes.append(node("h3", "", "02 / 选择并核对拟写字段")); const grid = node("div", "field-grid");
  FIELDS.forEach(([field,label,type]) => { const proposed = Object.prototype.hasOwnProperty.call(candidate.proposed, field) ? candidate.proposed[field] : ""; const current = candidate.current[field] || ""; const row = node("div", "field-row" + (proposed && proposed !== current ? " selected" : "")); row.dataset.field = field; const include = node("input", "field-include"); include.type = "checkbox"; include.checked = Boolean(proposed && proposed !== current); include.setAttribute("aria-label", "导出字段 " + label); include.addEventListener("change", () => row.classList.toggle("selected", include.checked)); row.append(include); row.append(node("span", "field-name", label)); let input; if (type === "status" || type === "close") { input = node("select", "field-value"); makeOptions(input, type === "status" ? STATUSES : CLOSE_REASONS, proposed, "不设置"); } else { input = node("input", "field-value"); input.type = type; input.value = proposed; if (field === "application_id") input.maxLength = 128; } input.setAttribute("aria-label", label); row.append(input); row.append(node("span", "current", "当前：" + (current || "—"))); grid.append(row); });
  changes.append(grid); body.append(changes); card.append(body); approve.addEventListener("change", updateCounts); return card;
}
function applyFilter() { const needle = document.getElementById("search").value.trim().toLowerCase(); const mode = document.getElementById("filter").value; queue.querySelectorAll(".candidate").forEach(card => { const candidate = REPORT.candidates[Number(card.dataset.index)]; const haystack = (candidate.subject + " " + candidate.sender + " " + (candidate.school_id || "")).toLowerCase(); const modeMatch = mode === "all" || (mode === "action" && !candidate.already_applied) || (mode === "unmatched" && !card.querySelector(".school-select").value) || (mode === "applied" && candidate.already_applied); card.hidden = !(modeMatch && (!needle || haystack.includes(needle))); }); }
function exportReview() {
  const approved = [];
  for (const card of queue.querySelectorAll(".candidate")) { if (!card.querySelector(".approve-input").checked) continue; const candidate = REPORT.candidates[Number(card.dataset.index)]; const schoolId = card.querySelector(".school-select").value; if (!schoolId) { showError("请为每一封已勾选邮件选择项目，或取消勾选：" + candidate.subject); card.scrollIntoView({behavior:"smooth",block:"center"}); return; } const fields = {}; card.querySelectorAll(".field-row").forEach(row => { if (row.querySelector(".field-include").checked) { const value = row.querySelector(".field-value").value.trim(); if (value) fields[row.dataset.field] = value; } }); if (!Object.keys(fields).length) { showError("已勾选邮件至少需要选择一个非空字段：" + candidate.subject); return; } if (fields.close_reason && (fields.status || schoolMap.get(schoolId).current.status) !== "Closed") { showError("关闭原因只能与 Closed 状态一起导出：" + candidate.subject); return; } approved.push({gmail_message_id:candidate.gmail_message_id,message_date:candidate.message_date,school_id:schoolId,subject:candidate.subject,fields}); }
  if (!approved.length) { showError("请先勾选至少一封需要导入的邮件。未勾选的内容不会导出。"); return; }
  const output = {kind:"gradpilot-gmail-review",version:1,batch_id:REPORT.batch_id,database_sha256:REPORT.database_sha256,approved};
  const blob = new Blob([JSON.stringify(output,null,2) + "\n"],{type:"application/json"}); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "gradpilot-gmail-approved-" + REPORT.batch_id + ".json"; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
document.getElementById("stat-total").textContent = REPORT.candidates.length;
document.getElementById("stat-matched").textContent = REPORT.candidates.filter(item => item.school_id).length;
document.getElementById("stat-high").textContent = REPORT.candidates.filter(item => item.confidence === "high" && !item.already_applied).length;
document.getElementById("stat-applied").textContent = REPORT.candidates.filter(item => item.already_applied).length;
document.getElementById("batch-id").textContent = "BATCH / " + REPORT.batch_id;
document.getElementById("created-at").textContent = "CREATED / " + REPORT.created_at;
document.getElementById("fingerprint").textContent = "DB SHA256 / " + REPORT.database_sha256.slice(0,16) + "…";
document.getElementById("query").textContent = "QUERY / " + REPORT.query;
if (!REPORT.candidates.length) { const empty = node("div", "empty"); empty.append(node("h2", "", "本次没有匹配邮件")); empty.append(node("p", "", "可以调整 Gmail 查询条件后重新抓取。申请数据库没有变化。")); queue.append(empty); } else REPORT.candidates.forEach((candidate,index) => queue.append(renderCandidate(candidate,index)));
document.getElementById("search").addEventListener("input",applyFilter); document.getElementById("filter").addEventListener("change",applyFilter); queue.addEventListener("change",event => { if (event.target.classList.contains("school-select")) applyFilter(); });
document.getElementById("select-high").addEventListener("click",() => { queue.querySelectorAll(".candidate").forEach(card => { const candidate = REPORT.candidates[Number(card.dataset.index)]; if (candidate.confidence === "high" && !candidate.already_applied && card.querySelector(".school-select").value && card.querySelector(".field-include:checked")) card.querySelector(".approve-input").checked = true; }); updateCounts(); });
document.getElementById("clear").addEventListener("click",() => { queue.querySelectorAll(".approve-input").forEach(input => { input.checked = false; }); updateCounts(); }); document.getElementById("export").addEventListener("click",exportReview); updateCounts();
</script>
</body>
</html>
"""


def render_review_html(report: dict[str, Any]) -> str:
    payload = json.dumps(report, ensure_ascii=False, separators=(",", ":"))
    payload = (
        payload.replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
        .replace(" ", "\\u2028")
        .replace(" ", "\\u2029")
    )
    return REVIEW_TEMPLATE.replace("__REPORT_JSON__", payload)
