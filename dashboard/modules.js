/* Pure workspace planning, scoring, writing and calendar helpers. No DOM or network access. */
(function attachGradPilotModules(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.GradPilotModules = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createModules() {
  "use strict";

  const CHECKLIST_STATUSES = ["not_started", "in_progress", "ready", "submitted", "not_required"];
  const CONTACT_POINTS = { not_started: 0, drafted: 1, sent: 3, follow_up_sent: 3, replied: 5, meeting: 5, closed: 0 };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days));
    return date.toISOString().slice(0, 10);
  }

  function seasonPlan(data, referenceDate) {
    const term = String(data.cycle?.target_term || "2028 Fall");
    const match = term.match(/(20\d{2})\s*(Fall|Spring|Summer|Winter)/i);
    const year = match ? Number(match[1]) : new Date().getUTCFullYear() + 1;
    const season = match ? match[2].toLowerCase() : "fall";
    const entryMonth = { spring: 0, summer: 5, fall: 7, winter: 11 }[season];
    const entry = new Date(Date.UTC(year, entryMonth, 1));
    const month = (offset, day = 1) => new Date(Date.UTC(entry.getUTCFullYear(), entry.getUTCMonth() + offset, day));
    const endOfMonth = (offset) => new Date(Date.UTC(entry.getUTCFullYear(), entry.getUTCMonth() + offset + 1, 0));
    const iso = (date) => date.toISOString().slice(0, 10);
    const definitions = [
      {
        id: "foundation", label: "科研与证据积累", english: "FOUNDATION", category: "research",
        start: iso(month(-21)), end: iso(endOfMonth(-14)),
        focus: "把研究经历转化为可验证的论文、代码、真机 Demo 与个人学术资产，同时推进英语和推荐人关系。",
        outcomes: ["论文 / 预印本与代码证据", "学术主页、CV 与真机 Demo", "英语、暑研与推荐人铺垫"]
      },
      {
        id: "discovery", label: "发现与收敛选校", english: "DISCOVERY", category: "outreach",
        start: iso(month(-13)), end: iso(month(-11, 15)),
        focus: "从研究方向出发建立 PI Longlist，核验任职、招生和 Funding，再收敛到真正值得申请的 Shortlist。",
        outcomes: ["PI 搜索与横向对比", "任职、招生与项目归属核验", "分批个性化套磁"]
      },
      {
        id: "writing", label: "文书与推荐信", english: "WRITING", category: "writing",
        start: iso(month(-11, 16)), end: iso(month(-9, 15)),
        focus: "完成文书母版和逐校适配，落实推荐人分配、成绩单、送分与奖学金材料。",
        outcomes: ["SoP / PS / Research Statement", "推荐人分配与催交", "成绩单、送分与 Fellowship"]
      },
      {
        id: "submission", label: "网申提交与终检", english: "SUBMISSION", category: "application",
        start: iso(month(-9, 16)), end: iso(endOfMonth(-7)),
        focus: "以每所学校官网截止日为准完成终检，预留提交缓冲并保存申请编号和回执。",
        outcomes: ["逐校清单与跨校防穿帮", "提前提交并保存回执", "Portal 缺件与推荐信检查"]
      },
      {
        id: "decisions", label: "面试与结果", english: "DECISIONS", category: "other",
        start: iso(month(-6)), end: iso(month(-4, 15)),
        focus: "准备研究面试，记录真实结果、Waitlist 和回复截止日，比较 Offer 与 Funding。",
        outcomes: ["研究面试与交流记录", "结果、Waitlist 与补申决策", "Offer / Funding 比较"]
      },
      {
        id: "transition", label: "入学决定与行前", english: "TRANSITION", category: "other",
        start: iso(month(-4, 16)), end: iso(endOfMonth(0)),
        focus: "确认入学项目和 Funding，推进签证、住宿、保险与行程；行政要求以官方通知为准。",
        outcomes: ["确认入学与回复 Offer", "签证和所需行政材料", "住宿、保险与行前安排"]
      }
    ];
    const reference = /^\d{4}-\d{2}-\d{2}$/.test(referenceDate || "") ? referenceDate : new Date().toISOString().slice(0, 10);
    return definitions.map((phase, index) => ({
      ...phase,
      number: index + 1,
      status: reference > phase.end ? "complete" : reference < phase.start ? "upcoming" : "current",
      days_left: Math.ceil((Date.parse(`${phase.end}T12:00:00Z`) - Date.parse(`${reference}T12:00:00Z`)) / 86400000)
    }));
  }

  function defaultSeasonTasks(data) {
    const phases = seasonPlan(data);
    return phases.map((phase, index) => ({
      id: `season-${phase.id}`,
      title: `${phase.label}：完成阶段复盘`,
      school_id: null,
      due_date: phase.end,
      category: phase.category,
      status: "todo",
      depends_on: index ? [`season-${phases[index - 1].id}`] : [],
      notes: `${phase.focus}\n阶段成果：${phase.outcomes.join("；")}。\n这是 ${data.cycle?.target_term || "当前周期"} 的规划里程碑，不替代学校官方截止日。`,
      season_phase: phase.id,
      season_term: data.cycle?.target_term || ""
    }));
  }

  function ensureSeasonPlan(data) {
    if (!Array.isArray(data.tasks)) data.tasks = [];
    const known = new Set(data.tasks.map((task) => task.id));
    let added = 0;
    defaultSeasonTasks(data).forEach((task) => {
      if (!known.has(task.id)) {
        data.tasks.push(task);
        known.add(task.id);
        added += 1;
      }
    });
    return added;
  }

  function defaultChecklist(school) {
    const definitions = [
      ["official", "核验官网要求、截止日与费用", "research"],
      ["transcript", "成绩单与学历材料", "documents"],
      ["scores", "语言 / GRE 成绩与送分", "documents"],
      ["cv", "CV / Resume", "writing"],
      ["sop", "SoP / PS / PHS 与项目短文", "writing"],
      ["lor", "推荐信分配与提交", "recommendations"],
      ["fee", "申请费或 Fee waiver", "application"],
      ["review", "最终事实、格式与跨校检查", "application"],
      ["receipt", "提交并保存回执", "application"]
    ];
    return definitions.map(([key, label, category]) => ({
      id: `${school.id}--check-${key}`,
      label,
      category,
      required: true,
      status: "not_started",
      document_id: null,
      source_url: key === "official" ? school.portal_url || "" : "",
      verified: false,
      notes: "",
      completed_on: null
    }));
  }

  function defaultTasks(school) {
    const deadline = String(school.deadline || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return [];
    const definitions = [
      ["verify", "核验项目、截止日与 PI 招生状态", 120, "research", []],
      ["outreach", "完成论文阅读与首轮个性化套磁", 90, "outreach", ["verify"]],
      ["documents", "收齐成绩单、送分与学术材料", 75, "documents", ["verify"]],
      ["essays", "完成项目文书定稿与事实核验", 45, "writing", ["verify"]],
      ["letters", "确认推荐信全部分配并提交", 30, "recommendations", ["verify"]],
      ["review", "完成网申终检与跨校防穿帮检查", 14, "application", ["documents", "essays", "letters"]],
      ["submit", "提交网申并保存回执", 7, "application", ["review"]]
    ];
    return definitions.map(([key, title, offset, category, dependencies]) => ({
      id: `${school.id}--task-${key}`,
      title,
      school_id: school.id,
      due_date: addDays(deadline, -offset),
      category,
      status: "todo",
      depends_on: dependencies.map((dependency) => `${school.id}--task-${dependency}`),
      notes: "规划日期；以学校官网和实际进度为准。"
    }));
  }

  function ensureSchoolPlan(data, school, options = {}) {
    if (!Array.isArray(data.tasks)) data.tasks = [];
    const firstInitialization = school.plan_version !== 1;
    if (!Array.isArray(school.application_checklist)) school.application_checklist = defaultChecklist(school);
    let added = 0;
    if (firstInitialization || options.force) {
      const known = new Set(data.tasks.map((task) => task.id));
      defaultTasks(school).forEach((task) => {
        if (!known.has(task.id)) {
          data.tasks.push(task);
          known.add(task.id);
          added += 1;
        }
      });
    }
    school.plan_version = 1;
    return added;
  }

  function normalizedTokens(value) {
    const stopwords = new Set(["and", "for", "the", "of", "to", "in", "with", "learning", "robot", "robotics"]);
    return String(value || "").toLowerCase().split(/[^a-z0-9\u3400-\u9fff]+/).filter((token) => token.length > 1 && !stopwords.has(token));
  }

  function keywordsMatch(left, right) {
    const a = String(left || "").toLowerCase().trim();
    const b = String(right || "").toLowerCase().trim();
    if (!a || !b) return false;
    if (a.includes(b) || b.includes(a)) return true;
    const leftTokens = new Set(normalizedTokens(a));
    const rightTokens = new Set(normalizedTokens(b));
    if (!leftTokens.size || !rightTokens.size) return false;
    const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
    return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.5;
  }

  function researchKeywordMatches(pi, applicant) {
    const applicantKeywords = Array.isArray(applicant?.research_keywords) ? applicant.research_keywords : [];
    return applicantKeywords.filter((keyword) => (pi?.recent_work_keywords || []).some((other) => keywordsMatch(keyword, other)));
  }

  function scoreSchool(school, data) {
    const applicant = data.applicant || {};
    const pis = Array.isArray(school.target_pis) ? school.target_pis : [];
    const components = [];
    const risks = [];
    const part = (label, earned, max, detail, dimension = "research_fit") => components.push({ label, earned: Math.round(earned * 10) / 10, max, detail, dimension });

    const averageFit = pis.length ? pis.reduce((sum, pi) => sum + Math.max(0, Math.min(5, Number(pi.fit_score) || 0)), 0) / pis.length : 0;
    part("PI 主观研究匹配", averageFit / 5 * 20, 20, pis.length ? `目标 PI 平均 ${averageFit.toFixed(1)}/5` : "尚未添加目标 PI");

    const applicantKeywords = Array.isArray(applicant.research_keywords) ? applicant.research_keywords : [];
    const matchedKeywords = researchKeywordMatches({ recent_work_keywords: pis.flatMap((pi) => pi.recent_work_keywords || []) }, applicant);
    part("研究方向文本重合", applicantKeywords.length ? matchedKeywords.length / applicantKeywords.length * 10 : 0, 10, applicantKeywords.length ? `${matchedKeywords.length}/${applicantKeywords.length} 个申请人关键词有对应 PI 方向` : "未填写申请人研究关键词");

    const paperReaders = pis.filter((pi) => pi.paper_title && pi.paper_notes);
    part("具体论文阅读证据", paperReaders.length ? 5 : 0, 5, paperReaders.length ? `${paperReaders.length} 位 PI 有论文标题与阅读笔记` : "尚无具体论文阅读记录");

    const gpaKnown = applicant.gpa !== undefined && applicant.gpa !== null && applicant.gpa !== "" && Number(applicant.gpa_scale) > 0;
    part("GPA 信息", gpaKnown ? Math.max(0, Math.min(1, Number(applicant.gpa) / Number(applicant.gpa_scale))) * 5 : 0, 5, gpaKnown ? `${applicant.gpa}/${applicant.gpa_scale}；仅作信息完整度评分` : "未填写 GPA / 分制");

    const yearsKnown = applicant.research_years !== undefined && applicant.research_years !== null && applicant.research_years !== "";
    part("科研经历", yearsKnown ? Math.min(1, Number(applicant.research_years) / 2) * 7 : 0, 7, yearsKnown ? `${Number(applicant.research_years) || 0} 年；两年及以上取得该项满分` : "未填写科研年限");

    const publicationsKnown = applicant.publication_count !== undefined && applicant.publication_count !== null && applicant.publication_count !== "";
    part("可证明科研成果", publicationsKnown ? Math.min(1, Number(applicant.publication_count)) * 4 : 0, 4, publicationsKnown ? `${Number(applicant.publication_count) || 0} 项已登记论文 / 预印本` : "未填写论文 / 预印本数量");

    const assets = Array.isArray(data.assets) ? data.assets : [];
    const verifiedAssets = assets.filter((asset) => asset.verified).length;
    part("公开学术证据", assets.length ? verifiedAssets / assets.length * 4 : 0, 4, `${verifiedAssets}/${assets.length} 项学术资产已人工核验`);

    const verifiedPis = pis.filter((pi) => pi.verification_status === "verified_official").length;
    part("PI 任职信息核验", pis.length ? verifiedPis / pis.length * 10 : 0, 10, `${verifiedPis}/${pis.length} 位 PI 已官网核验`, "data_confidence");
    part("截止日核验", school.deadline_verified ? 5 : 0, 5, school.deadline_verified ? "截止日已核验" : "截止日仍是规划估计", "data_confidence");

    const admissionsKnown = pis.filter((pi) => ["accepting", "expected_open"].includes(pi.admissions_status)).length;
    part("招生状态", pis.length ? admissionsKnown / pis.length * 5 : 0, 5, admissionsKnown ? `${admissionsKnown} 位 PI 有开放 / 预期开放记录` : "尚无明确招生状态", "data_confidence");

    const recommendations = school.recommendations || { required: 0, assignments: [] };
    const required = Number(recommendations.required) || 0;
    const submitted = (recommendations.assignments || []).filter((entry) => entry.status === "submitted").length;
    part("推荐信准备", required ? Math.min(1, submitted / required) * 5 : 5, 5, required ? `${submitted}/${required} 封已提交` : "该项目未登记推荐信要求", "readiness");

    const documents = (data.documents || []).filter((document) => document.status !== "archived" && (!document.school_ids?.length || document.school_ids.includes(school.id)));
    const finalDocuments = documents.filter((document) => ["final", "submitted"].includes(document.status)).length;
    part("材料定稿", documents.length ? finalDocuments / documents.length * 5 : 0, 5, documents.length ? `${finalDocuments}/${documents.length} 份适用材料已定稿 / 提交` : "材料中心尚无适用记录", "readiness");

    const checklist = school.application_checklist || [];
    const actionable = checklist.filter((item) => item.required && item.status !== "not_required");
    const completed = actionable.filter((item) => ["ready", "submitted"].includes(item.status)).length;
    part("申请清单完成", actionable.length ? completed / actionable.length * 5 : 0, 5, `${completed}/${actionable.length} 项已就绪 / 提交`, "readiness");

    const fitNotes = pis.filter((pi) => pi.fit_note).length;
    part("个性化匹配论证", fitNotes.length ? 5 : 0, 5, fitNotes ? `${fitNotes} 位 PI 有具体匹配备注` : "尚未写具体匹配论证");
    const bestContact = pis.length ? Math.max(...pis.map((pi) => CONTACT_POINTS[pi.contact?.status] || 0)) : 0;
    part("真实套磁进展", bestContact, 5, bestContact ? "按当前最高真实联系状态计分" : "尚无真实联系进展", "readiness");

    if (!pis.length) risks.push("先添加并核验目标 PI，再决定是否保留该项目。");
    if (pis.length && verifiedPis < pis.length) risks.push("部分 PI 任职与研究方向尚未官网核验。");
    if (pis.length && !paperReaders.length) risks.push("至少精读并记录一篇具体论文，避免只用宽泛关键词套磁。");
    if (!applicantKeywords.length) risks.push("在资产与设置中填写个人研究关键词，评分才会考虑方向匹配。");
    if (!school.deadline_verified) risks.push("截止日未核验，不应用估计日期安排最终提交。");
    if (required && (recommendations.assignments || []).length < required) risks.push("推荐人分配数量不足。 ");
    if (pis.length && pis.every((pi) => pi.admissions_status === "not_accepting")) risks.push("所有目标 PI 均标记为不招生，应复核并考虑调整项目。 ");

    const total = Math.round(components.reduce((sum, component) => sum + component.earned, 0));
    const dimensionMeta = [
      ["research_fit", "研究匹配与背景", "方向、个人研究证据与匹配论证；不是录取概率。"],
      ["readiness", "申请准备度", "推荐信、材料、清单与真实套磁进展。"],
      ["data_confidence", "数据可信度", "PI 任职、招生状态和截止日的官网核验程度。"]
    ];
    const dimensions = dimensionMeta.map(([id, label, description]) => {
      const entries = components.filter((component) => component.dimension === id);
      const earned = entries.reduce((sum, component) => sum + component.earned, 0);
      const max = entries.reduce((sum, component) => sum + component.max, 0);
      return { id, label, description, earned: Math.round(earned * 10) / 10, max, score: max ? Math.round(earned / max * 100) : null, components: entries };
    });
    const guidance = total >= 80 ? "信息较完整：继续逐项核验，不把高分解释为录取优势。" : total >= 60 ? "可作为候选：优先补齐研究证据与官方信息。" : total >= 40 ? "信息不足：先完成官网与 PI 核验，再作选校决策。" : "暂不作申请决策：从目标 PI 和个人资料开始补齐。";
    return { total, components, dimensions, risks: [...new Set(risks)], guidance };
  }

  function wordStats(text) {
    const value = String(text || "");
    const english = value.match(/[A-Za-z0-9]+(?:[’'-][A-Za-z0-9]+)*/g) || [];
    const cjk = value.match(/[\u3400-\u9fff]/g) || [];
    return { english: english.length, cjk: cjk.length, total: english.length + cjk.length };
  }

  function lintEssay(essay, school, data) {
    const content = String(essay.content || "");
    const stats = wordStats(content);
    const issues = [];
    const add = (severity, code, message) => issues.push({ severity, code, message });
    if (!content.trim()) add("warning", "EMPTY", "正文为空。 ");
    if (Number(essay.word_limit) > 0 && stats.total > Number(essay.word_limit)) add("error", "WORD_LIMIT", `当前 ${stats.total}，超过 ${essay.word_limit} 上限。`);
    if (/(your\s*name|yourname|replace-with|\[insert|\{\{|\}\}|\[\[|\]\]|\bTODO\b|\bTBD\b)/i.test(content)) add("error", "PLACEHOLDER", "发现姓名、链接、模板或 TODO 占位符。 ");

    const term = data.cycle?.target_term || "";
    const terms = content.match(/\b20\d{2}\s+(?:Fall|Spring|Summer|Winter)\b/gi) || [];
    if (term && terms.some((value) => value.toLowerCase() !== term.toLowerCase())) add("error", "TERM", `发现与目标入学季 ${term} 不一致的年份 / 学期。`);

    if (school) {
      const otherSchools = (data.schools || []).filter((candidate) => candidate.id !== school.id);
      otherSchools.forEach((candidate) => {
        const names = [candidate.name, ...(candidate.aliases || [])].filter((name) => String(name).length >= 3);
        const found = names.find((name) => content.toLowerCase().includes(String(name).toLowerCase()));
        if (found) add("error", "OTHER_SCHOOL", `发现其他学校名称或别名：${found}。`);
      });
      if (!["CV", "Other"].includes(essay.type)) {
        const names = [school.name, ...(school.aliases || []), school.department_track].filter(Boolean);
        if (!names.some((name) => content.toLowerCase().includes(String(name).toLowerCase()))) add("warning", "FIT", "正文未出现本校名称、别名或院系，请确认项目适配段落。 ");
      }
    }
    if (/\b\d+(?:\.\d+)?%|\b(?:state-of-the-art|first|best|leading|breakthrough)\b/i.test(content)) add("warning", "EVIDENCE", "包含数字或绝对化表述；逐项确认有可复现证据。 ");
    return { stats, issues };
  }

  function diffLines(before, after) {
    const left = String(before || "").split("\n");
    const right = String(after || "").split("\n");
    if (left.length > 250 || right.length > 250) {
      return [...left.map((text) => ({ type: "remove", text })), ...right.map((text) => ({ type: "add", text }))];
    }
    const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
    for (let i = left.length - 1; i >= 0; i -= 1) {
      for (let j = right.length - 1; j >= 0; j -= 1) table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
    const rows = [];
    let i = 0;
    let j = 0;
    while (i < left.length && j < right.length) {
      if (left[i] === right[j]) rows.push({ type: "same", text: left[i] }), i += 1, j += 1;
      else if (table[i + 1][j] >= table[i][j + 1]) rows.push({ type: "remove", text: left[i] }), i += 1;
      else rows.push({ type: "add", text: right[j] }), j += 1;
    }
    while (i < left.length) rows.push({ type: "remove", text: left[i++] });
    while (j < right.length) rows.push({ type: "add", text: right[j++] });
    return rows;
  }

  function icsEscape(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }

  function calendar(data) {
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GradPilot//Application Planner//ZH-CN", "CALSCALE:GREGORIAN"];
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const event = (uid, date, summary, description, url) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return;
      lines.push("BEGIN:VEVENT", `UID:${icsEscape(uid)}@gradpilot.local`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(date, 1).replace(/-/g, "")}`, `SUMMARY:${icsEscape(summary)}`, `DESCRIPTION:${icsEscape(description)}`);
      if (url) lines.push(`URL:${icsEscape(url)}`);
      lines.push("END:VEVENT");
    };
    (data.schools || []).filter((school) => school.status !== "Closed").forEach((school) => {
      event(`${school.id}--deadline`, String(school.deadline).slice(0, 10), `${school.deadline_verified ? "" : "[待核验] "}${school.name} 申请截止`, `${school.program_name}\n状态：${school.status}`, school.portal_url);
      if (school.funding?.deadline) event(`${school.id}--funding-deadline`, school.funding.deadline, `${school.funding.verified ? "" : "[待核验] "}${school.name} Funding 截止`, school.funding.notes || "Funding 规划截止日", school.funding.source_url || school.portal_url);
      if (school.decision?.response_deadline) event(`${school.id}--response-deadline`, school.decision.response_deadline, `${school.name} 结果 / Offer 回复截止`, school.decision.notes || "结果回复截止日", school.portal_url);
    });
    (data.tasks || []).filter((task) => !["done", "skipped"].includes(task.status)).forEach((task) => {
      const school = (data.schools || []).find((candidate) => candidate.id === task.school_id);
      event(task.id, task.due_date, `${school ? `${school.name} · ` : ""}${task.title}`, `${task.notes || ""}\n任务状态：${task.status}`, school?.portal_url || "");
    });
    lines.push("END:VCALENDAR");
    return `${lines.join("\r\n")}\r\n`;
  }

  return { CHECKLIST_STATUSES, addDays, clone, seasonPlan, defaultSeasonTasks, ensureSeasonPlan, defaultChecklist, defaultTasks, ensureSchoolPlan, researchKeywordMatches, scoreSchool, wordStats, lintEssay, diffLines, calendar };
});
