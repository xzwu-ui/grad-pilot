(() => {
  "use strict";

  const STORAGE_KEY = "gradpilot.workspace.v1";
  const BACKUP_KEY = "gradpilot.workspace.backup.v1";
  const THEME_KEY = "gradpilot.theme";
  const Modules = window.GradPilotModules;
  const STATUSES = ["Researching", "Preparing", "Submitted", "Interview", "Waitlisted", "Admitted", "Closed"];
  const CONTACT_STATUSES = ["not_started", "drafted", "sent", "follow_up_sent", "replied", "meeting", "closed"];
  const CLOSE_REASON_LABELS = { not_applying: "不再申请", rejected: "被拒", withdrawn: "主动撤回", declined_offer: "拒绝 Offer" };
  const FUNDING_CONSIDERATION_LABELS = { unknown: "Funding 未知", automatic: "自动考虑 Funding", separate: "需单独申请 Funding", none: "无经费" };
  const SUPERVISOR_CONTACT_LABELS = { unknown: "导师联系政策未知", allowed: "允许联系导师", discouraged: "不鼓励联系导师", prohibited: "禁止联系导师" };
  const INTERVIEW_LABELS = { unknown: "面试要求未知", required: "要求 / 可能面试", not_required: "无面试" };
  const INTERACTION_KIND_LABELS = { call: "询问通话", meeting: "会议 / 面谈", email: "邮件往来", note: "研究备注" };
  const CONTACT_LABELS = {
    not_started: "未开始",
    drafted: "已起草",
    sent: "已发送",
    follow_up_sent: "已 Follow-up",
    replied: "已回复",
    meeting: "已约交流",
    closed: "已结束"
  };
  const DOCUMENT_LABELS = { missing: "缺失", draft: "草稿", in_review: "审阅中", final: "已定稿", submitted: "已提交", archived: "已归档" };
  const TASK_LABELS = { todo: "待办", in_progress: "进行中", done: "已完成", skipped: "已跳过" };
  const CHECKLIST_LABELS = { not_started: "未开始", in_progress: "进行中", ready: "已就绪", submitted: "已提交", not_required: "不适用" };
  const ESSAY_LABELS = { draft: "草稿", in_review: "审阅中", final: "已定稿", submitted: "已提交", archived: "已归档" };
  const ADMISSIONS_LABELS = { unknown: "招生未知", expected_open: "预期开放", accepting: "确认招生", not_accepting: "不招生" };
  const VISA_STATUS_LABELS = { not_started: "未开始", preparing: "准备材料中", applied: "已递交", approved: "已获签", not_required: "不需要签证" };
  const VIEW_META = {
    overview: ["MISSION CONTROL / 01", "申请任务总览"],
    season: ["APPLICATION SEASON / 02", "全局申请季"],
    tasks: ["DEPENDENT TIMELINE / 03", "申请规划时间线"],
    applications: ["PROGRAM PORTFOLIO / 04", "选校评分与逐校清单"],
    materials: ["LOCAL MATERIALS / 05", "材料收集与版本中心"],
    essays: ["WRITING & REVIEW / 06", "文书版本与人工审阅"],
    lor: ["LETTER OPERATIONS / 07", "推荐人分配矩阵"],
    outreach: ["ACADEMIC OUTREACH / 08", "PI 雷达与套磁 Follow-up"],
    budget: ["SEMI-DIY FINANCE / 09", "申请预算控制台"],
    visa: ["VISA & POLICY / 10", "签证与入境政策调研"],
    campus: ["CAMPUS LIFE / 11", "校园生活、成本与安全"],
    assets: ["PRE-FLIGHT CHECK / 12", "学术资产与工作区设置"]
  };

  const ui = {
    view: "overview",
    expanded: new Set(),
    schoolView: "table",
    calendarMonth: new Date().toISOString().slice(0, 7),
    materialView: "cards",
    schoolFilters: { search: "", tier: "", track: "", status: "", region: "" },
    outreachMode: "radar",
    outreachFilters: { search: "", status: "", dueOnly: false },
    piFilters: { search: "", region: "", track: "", admissions: "", verifiedOnly: false, shortlistedOnly: false, paperOnly: false },
    piVisible: 12,
    comparePis: new Set(),
    taskFilters: { search: "", status: "", school: "" },
    materialFilters: { search: "", status: "", school: "" },
    essayFilters: { search: "", status: "", school: "" },
    source: "empty",
    storageWarning: ""
  };

  let toastTimer;
  let state = loadInitialState();

  function emptyWorkspace() {
    return {
      schema_version: "1.0",
      cycle: {
        target_term: "2028 Fall",
        degree: "Ph.D.",
        as_of: new Date().toISOString().slice(0, 10),
        deadlines_are_estimated: true,
        timezone: "Asia/Shanghai"
      },
      applicant: { name: "Your Name", email: "your.email@example.com", target_term: "2028 Fall", gpa: null, gpa_scale: 4, research_years: null, publication_count: null, research_keywords: [] },
      recommenders: [
        { id: "dut-advisor", name: "DUT Advisor", display_name: "DUT 导师", institution: "Dalian University of Technology", email: "", relationship: "科研导师", priority: 1 },
        { id: "ucb-mentor", name: "UCB Mentor", display_name: "UCB 导师", institution: "", email: "", relationship: "校外科研导师", priority: 2 },
        { id: "collab-c", name: "Collaborator C", display_name: "合作导师 C", institution: "", email: "", relationship: "科研合作导师", priority: 3 },
        { id: "course-d", name: "Course Instructor D", display_name: "课程导师 D", institution: "", email: "", relationship: "课程导师", priority: 4 }
      ],
      assets: [
        { id: "homepage", label: "GitHub Pages 学术主页", url: "https://yourname.github.io/", verified: false, last_checked: null, note: "退出登录后用移动网络测试公开访问。" },
        { id: "github", label: "GitHub 代码与项目页", url: "https://github.com/yourname", verified: false, last_checked: null, note: "置顶人形机器人项目并写清个人贡献。" },
        { id: "paper-pdf", label: "论文 / Research Statement PDF", url: "https://yourname.github.io/assets/research.pdf", verified: false, last_checked: null, note: "检查作者、稿件状态和公开 PDF 链接。" },
        { id: "demo-youtube", label: "YouTube 真机 Demo", url: "https://www.youtube.com/watch?v=replace-with-demo-id", verified: false, last_checked: null, note: "建议包含未剪辑真机试验与英文字幕。" },
        { id: "demo-bilibili", label: "Bilibili 真机 Demo 镜像", url: "https://www.bilibili.com/video/replace-with-demo-id/", verified: false, last_checked: null, note: "保持与海外镜像的标题和实验表述一致。" }
      ],
      schools: [],
      documents: [],
      tasks: [],
      essays: [],
      gmail_imports: [],
      visa_records: [],
      budget_items: [
        { id: "toefl", label: "TOEFL iBT 考试", amount_usd: 260, enabled: true, category: "testing" },
        { id: "transcripts", label: "成绩单、寄送与翻译预留", amount_usd: 120, enabled: true, category: "documents" },
        { id: "writing-review", label: "半 DIY 文书润色服务", amount_usd: 0, enabled: false, category: "services" }
      ],
      settings: { currency: "USD", cny_per_usd: 7.2, follow_up_after_days: 12, deadline_warning_days: 30, chart_textures: false, pinned_items: [] }
    };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalize(input) {
    const data = clone(input);
    data.schema_version = "1.0";
    data.cycle = data.cycle || {};
    data.applicant = Object.assign({ name: "Your Name", email: "", target_term: "2028 Fall", gpa: null, gpa_scale: 4, research_years: null, publication_count: null, research_keywords: [] }, data.applicant || {});
    data.applicant.research_keywords = Array.isArray(data.applicant.research_keywords) ? data.applicant.research_keywords : [];
    data.recommenders = Array.isArray(data.recommenders) ? data.recommenders : [];
    data.assets = Array.isArray(data.assets) ? data.assets : [];
    data.schools = Array.isArray(data.schools) ? data.schools : [];
    data.documents = Array.isArray(data.documents) ? data.documents : [];
    data.tasks = Array.isArray(data.tasks) ? data.tasks : [];
    data.essays = Array.isArray(data.essays) ? data.essays : [];
    data.gmail_imports = Array.isArray(data.gmail_imports) ? data.gmail_imports : [];
    data.visa_records = Array.isArray(data.visa_records) ? data.visa_records : [];
    data.budget_items = Array.isArray(data.budget_items) ? data.budget_items : [];
    data.settings = Object.assign({ currency: "USD", cny_per_usd: 7.2, follow_up_after_days: 12, deadline_warning_days: 30, chart_textures: false, pinned_items: [] }, data.settings || {});
    data.settings.pinned_items = Array.isArray(data.settings.pinned_items) ? data.settings.pinned_items : [];
    data.documents.forEach((document) => {
      document.school_ids = Array.isArray(document.school_ids) ? document.school_ids : [];
      document.updated_on = document.updated_on || null;
    });
    data.tasks.forEach((task) => {
      task.school_id = task.school_id || null;
      task.depends_on = Array.isArray(task.depends_on) ? task.depends_on : [];
      task.notes = task.notes || "";
    });
    data.essays.forEach((essay) => {
      essay.school_id = essay.school_id || null;
      essay.versions = Array.isArray(essay.versions) ? essay.versions : [];
      essay.reviews = Array.isArray(essay.reviews) ? essay.reviews : [];
    });
    data.schools.forEach((school) => {
      school.aliases = Array.isArray(school.aliases) ? school.aliases : [];
      school.funding = Object.assign({ types: [], consideration: "unknown", deadline: null, source_url: "", verified: false, last_verified: null, notes: "" }, school.funding || {});
      school.funding.types = Array.isArray(school.funding.types) ? school.funding.types : [];
      school.application_policy = Object.assign({ supervisor_contact: "unknown", interview: "unknown", source_url: "", verified: false, last_verified: null }, school.application_policy || {});
      school.decision = Object.assign({ close_reason: null, decision_date: null, response_deadline: null, notes: "" }, school.decision || {});
      school.visa = Object.assign({ status: "not_started", notes: "", source_url: "", verified: false, last_verified: null }, school.visa || {});
      school.campus = Object.assign({ environment_notes: "", environment_rating: null, living_cost_monthly_usd: 0, housing_notes: "", safety_notes: "", safety_rating: null, source_url: "", verified: false, last_verified: null }, school.campus || {});
      school.campus.living_cost_monthly_usd = Math.max(0, Number(school.campus.living_cost_monthly_usd) || 0);
      for (const field of ["environment_rating", "safety_rating"]) {
        const rating = Number(school.campus[field]);
        school.campus[field] = Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
      }
      school.application_id = school.application_id || "";
      school.submission_date = school.submission_date || null;
      school.interview_date = school.interview_date || null;
      school.target_pis = Array.isArray(school.target_pis) ? school.target_pis : [];
      school.target_pis.forEach((pi) => {
        pi.recent_work_keywords = Array.isArray(pi.recent_work_keywords) ? pi.recent_work_keywords : [];
        pi.admissions_status = pi.admissions_status || "unknown";
        pi.shortlisted = Boolean(pi.shortlisted);
        pi.shortlisted_on = pi.shortlisted_on || null;
        pi.contact = Object.assign({ status: "not_started", last_contacted: null, next_follow_up: null, notes: "", history: [], draft_versions: [] }, pi.contact || {});
        pi.contact.history = Array.isArray(pi.contact.history) ? pi.contact.history : [];
        pi.contact.draft_versions = Array.isArray(pi.contact.draft_versions) ? pi.contact.draft_versions : [];
      });
      school.recommendations = Object.assign({ required: 3, assignments: [] }, school.recommendations || {});
      school.recommendations.assignments = Array.isArray(school.recommendations.assignments) ? school.recommendations.assignments : [];
      school.budget = Object.assign({ application_fee_usd: 0, score_report_usd: 0, other_usd: 0, fee_waiver: false }, school.budget || {});
      if (Array.isArray(school.application_checklist)) school.application_checklist.forEach((item) => { item.document_id = item.document_id || null; });
      Modules.ensureSchoolPlan(data, school);
    });
    const pinnedIds = new Set([
      ...data.documents.map((document) => `document:${document.id}`),
      ...data.essays.map((essay) => `essay:${essay.id}`)
    ]);
    data.settings.pinned_items = [...new Set(data.settings.pinned_items)].filter((item) => pinnedIds.has(item)).slice(0, 4);
    return data;
  }

  function validateImport(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("JSON 顶层必须是对象。");
    for (const key of ["schools", "recommenders", "assets", "budget_items"]) {
      if (!Array.isArray(data[key])) throw new Error(`缺少数组字段：${key}`);
    }
    for (const key of ["documents", "tasks", "essays", "gmail_imports", "visa_records"]) {
      if (data[key] !== undefined && !Array.isArray(data[key])) throw new Error(`字段必须是数组：${key}`);
    }
    if (!data.cycle || !data.applicant || !data.settings) throw new Error("缺少 cycle、applicant 或 settings。");
    const schoolIds = new Set();
    const applicationIds = new Set();
    for (const school of data.schools) {
      if (!school || typeof school !== "object") throw new Error("学校条目必须是对象。");
      if (!/^[a-z0-9][a-z0-9-]*$/.test(school.id || "")) throw new Error(`无效学校 ID：${school.id || "(空)"}`);
      if (schoolIds.has(school.id)) throw new Error(`学校 ID 重复：${school.id}`);
      schoolIds.add(school.id);
      const applicationId = String(school.application_id || "").trim().toLowerCase();
      if (applicationId && applicationIds.has(applicationId)) throw new Error(`申请编号重复：${school.application_id}`);
      if (applicationId) applicationIds.add(applicationId);
      for (const field of ["submission_date", "interview_date"]) {
        if (school[field] && !/^\d{4}-\d{2}-\d{2}$/.test(school[field])) throw new Error(`学校 ${school.id} 的 ${field} 日期无效。`);
      }
      if (!school.name || !school.program_name) throw new Error(`学校 ${school.id} 缺少名称或项目全称。`);
      if (!Number.isFinite(Date.parse(school.deadline))) throw new Error(`学校 ${school.id} 的截止日无效。`);
      if (!STATUSES.includes(school.status)) throw new Error(`学校 ${school.id} 的申请状态无效。`);
      if (!Array.isArray(school.target_pis) || !school.recommendations || !Array.isArray(school.recommendations.assignments)) {
        throw new Error(`学校 ${school.id} 缺少 PI 或推荐信结构。`);
      }
      if (school.funding) {
        if ((school.funding.types !== undefined && !Array.isArray(school.funding.types)) || !Object.hasOwn(FUNDING_CONSIDERATION_LABELS, school.funding.consideration || "unknown")) throw new Error(`学校 ${school.id} 的 funding 结构无效。`);
      }
      if (school.application_policy && (!Object.hasOwn(SUPERVISOR_CONTACT_LABELS, school.application_policy.supervisor_contact || "unknown") || !Object.hasOwn(INTERVIEW_LABELS, school.application_policy.interview || "unknown"))) {
        throw new Error(`学校 ${school.id} 的申请政策无效。`);
      }
      if (school.decision?.close_reason && !Object.hasOwn(CLOSE_REASON_LABELS, school.decision.close_reason)) throw new Error(`学校 ${school.id} 的关闭原因无效。`);
      if (school.visa && !Object.hasOwn(VISA_STATUS_LABELS, school.visa.status || "not_started")) throw new Error(`学校 ${school.id} 的签证状态无效。`);
      if (school.campus) {
        for (const field of ["environment_rating", "safety_rating"]) {
          const rating = school.campus[field];
          if (rating !== null && rating !== undefined && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) throw new Error(`学校 ${school.id} 的 ${field} 必须是 1–5 的整数或空。`);
        }
        const cost = school.campus.living_cost_monthly_usd;
        if (cost !== undefined && cost !== null && !(Number.isFinite(Number(cost)) && Number(cost) >= 0)) throw new Error(`学校 ${school.id} 的月生活成本必须是 ≥ 0 的数字。`);
      }
      for (const pi of school.target_pis) {
        if (pi.shortlisted !== undefined && typeof pi.shortlisted !== "boolean") throw new Error(`${pi.id} 的 Shortlist 状态必须是布尔值。`);
        if (pi.shortlisted_on && !/^\d{4}-\d{2}-\d{2}$/.test(pi.shortlisted_on)) throw new Error(`${pi.id} 的 Shortlist 日期无效。`);
        const history = pi.contact?.history || [];
        if (!Array.isArray(history)) throw new Error(`${pi.id} 的联系历史必须是数组。`);
        const eventIds = new Set();
        for (const event of history) {
          if (!/^[a-z0-9][a-z0-9-]*$/.test(event.id || "") || eventIds.has(event.id)) throw new Error(`${pi.id} 的交流记录 ID 无效或重复。`);
          if (!["initial", "follow_up", ...Object.keys(INTERACTION_KIND_LABELS)].includes(event.kind)) throw new Error(`${pi.id} 的交流类型无效。`);
          eventIds.add(event.id);
        }
      }
    }
    for (const item of data.gmail_imports || []) {
      if (!item || typeof item !== "object" || !item.gmail_message_id || !schoolIds.has(item.school_id)) throw new Error("Gmail 导入记录引用了未知学校或缺少邮件 ID。");
    }
    const visaIds = new Set();
    for (const record of data.visa_records || []) {
      if (!record || typeof record !== "object" || !/^[a-z0-9][a-z0-9-]*$/.test(record.id || "")) throw new Error(`签证记录 ID 无效：${record?.id || "(空)"}`);
      if (visaIds.has(record.id)) throw new Error(`签证记录 ID 重复：${record.id}`);
      visaIds.add(record.id);
      if (!record.country || !record.visa_type) throw new Error(`签证记录 ${record.id} 缺少国家或签证类型。`);
      if (!Object.hasOwn(VISA_STATUS_LABELS, record.status || "not_started")) throw new Error(`签证记录 ${record.id} 的状态无效。`);
      const fee = record.application_fee_usd;
      if (fee !== undefined && fee !== null && !(Number.isFinite(Number(fee)) && Number(fee) >= 0)) throw new Error(`签证记录 ${record.id} 的费用必须是 ≥ 0 的数字。`);
    }
    const recommenderIds = new Set();
    for (const person of data.recommenders) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(person.id || "")) throw new Error(`无效推荐人 ID：${person.id || "(空)"}`);
      if (recommenderIds.has(person.id)) throw new Error(`推荐人 ID 重复：${person.id}`);
      recommenderIds.add(person.id);
    }
    for (const school of data.schools) {
      for (const assignment of school.recommendations.assignments) {
        if (!recommenderIds.has(assignment.recommender_id)) throw new Error(`${school.id} 引用了未知推荐人 ${assignment.recommender_id}`);
      }
    }
    const documentIds = new Set();
    for (const document of data.documents || []) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(document.id || "") || documentIds.has(document.id)) throw new Error(`材料 ID 无效或重复：${document.id || "(空)"}`);
      documentIds.add(document.id);
      if ((document.school_ids || []).some((id) => !schoolIds.has(id))) throw new Error(`材料 ${document.id} 引用了未知学校。`);
    }
    const taskIds = new Set((data.tasks || []).map((task) => task.id));
    if (taskIds.size !== (data.tasks || []).length) throw new Error("任务 ID 不能重复。 ");
    for (const task of data.tasks || []) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(task.id || "") || !/^\d{4}-\d{2}-\d{2}$/.test(task.due_date || "")) throw new Error(`任务 ID 或日期无效：${task.id || "(空)"}`);
      if (task.season_phase && !["foundation", "discovery", "writing", "submission", "decisions", "transition"].includes(task.season_phase)) throw new Error(`任务 ${task.id} 的申请季阶段无效。`);
      if (task.school_id && !schoolIds.has(task.school_id)) throw new Error(`任务 ${task.id} 引用了未知学校。`);
      if ((task.depends_on || []).some((id) => !taskIds.has(id) || id === task.id)) throw new Error(`任务 ${task.id} 的前置依赖无效。`);
    }
    const essayIds = new Set();
    for (const essay of data.essays || []) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(essay.id || "") || essayIds.has(essay.id)) throw new Error(`文书 ID 无效或重复：${essay.id || "(空)"}`);
      essayIds.add(essay.id);
      if (essay.school_id && !schoolIds.has(essay.school_id)) throw new Error(`文书 ${essay.id} 引用了未知学校。`);
    }
    const pinnedItems = data.settings.pinned_items || [];
    if (!Array.isArray(pinnedItems) || new Set(pinnedItems).size !== pinnedItems.length || pinnedItems.length > 4) throw new Error("置顶活文档必须是不重复的数组，最多 4 项。");
    for (const item of pinnedItems) {
      const [kind, itemId] = String(item).split(":");
      if ((kind === "document" && !documentIds.has(itemId)) || (kind === "essay" && !essayIds.has(itemId)) || !["document", "essay"].includes(kind)) throw new Error(`置顶项引用了未知材料或文书：${item}`);
    }
    for (const school of data.schools) {
      for (const item of school.application_checklist || []) {
        if (item.document_id && !documentIds.has(item.document_id)) throw new Error(`清单 ${item.id} 引用了未知材料。`);
      }
    }
    return true;
  }

  function loadInitialState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        validateImport(parsed);
        ui.source = "local";
        return normalize(parsed);
      }
    } catch (error) {
      ui.storageWarning = `浏览器工作区读取失败，已使用同步数据：${error.message}`;
    }
    if (window.GRADPILOT_DATA) {
      try {
        validateImport(window.GRADPILOT_DATA);
        ui.source = "sync";
        return normalize(window.GRADPILOT_DATA);
      } catch (error) {
        ui.storageWarning = `data.js 校验失败：${error.message}`;
      }
    }
    ui.source = "empty";
    return emptyWorkspace();
  }

  function save() {
    state.workspace_meta = { saved_at: new Date().toISOString(), source: "GradPilot dashboard" };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      document.getElementById("save-state").textContent = `已自动保存 ${new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
      return true;
    } catch (error) {
      document.getElementById("save-state").textContent = "自动保存失败，请立即导出";
      toast(`localStorage 保存失败：${error.message}`);
      return false;
    }
  }

  function backup() {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(state));
    } catch (error) {
      toast(`无法写入恢复点：${error.message}`);
    }
  }

  function commit(message) {
    save();
    render(true);
    if (message) toast(message);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch (_) {
      return "";
    }
  }

  function slug(value, fallback = "item") {
    const result = String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return result || fallback;
  }

  function today() {
    return new Date().toISOString().slice(0, 10);
  }

  function addDays(dateString, days) {
    const date = new Date(`${dateString}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + Number(days));
    return date.toISOString().slice(0, 10);
  }

  function daysTo(deadline) {
    return Math.ceil((Date.parse(deadline) - Date.now()) / 86400000);
  }

  function formatDeadline(iso, withTime = true) {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "无效日期";
    const options = withTime
      ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: state.cycle.timezone || "Asia/Shanghai" }
      : { year: "numeric", month: "2-digit", day: "2-digit", timeZone: state.cycle.timezone || "Asia/Shanghai" };
    try {
      return new Intl.DateTimeFormat("zh-CN", options).format(date);
    } catch (_) {
      return date.toISOString().slice(0, withTime ? 16 : 10).replace("T", " ");
    }
  }

  function dateInTimezone(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "";
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: state.cycle.timezone || "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    } catch (_) {
      return String(value).slice(0, 10);
    }
  }

  function money(value) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function activeSchools() {
    return state.schools.filter((school) => school.status !== "Closed");
  }

  function schoolById(id) {
    return state.schools.find((school) => school.id === id);
  }

  function recommenderById(id) {
    return state.recommenders.find((person) => person.id === id);
  }

  function piById(school, id) {
    return school?.target_pis.find((pi) => pi.id === id);
  }

  function documentById(id) {
    return state.documents.find((document) => document.id === id);
  }

  function taskById(id) {
    return state.tasks.find((task) => task.id === id);
  }

  function essayById(id) {
    return state.essays.find((essay) => essay.id === id);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function uniqueId(base, collection) {
    let id = slug(base, `item-${Date.now()}`);
    let suffix = 2;
    while (collection.some((item) => item.id === id)) id = `${slug(base)}-${suffix++}`;
    return id;
  }

  function isTaskBlocked(task) {
    return (task.depends_on || []).some((id) => {
      const dependency = taskById(id);
      return dependency && !["done", "skipped"].includes(dependency.status);
    });
  }

  function schoolOptions(selected = "", blankLabel = "不关联学校") {
    const blank = blankLabel === null ? "" : `<option value="">${esc(blankLabel)}</option>`;
    return `${blank}${[...state.schools].sort((a, b) => a.name.localeCompare(b.name)).map((school) => `<option value="${esc(school.id)}" ${selected === school.id ? "selected" : ""}>${esc(school.name)} · ${esc(school.department_track)}</option>`).join("")}`;
  }

  function checklistStats(school) {
    const items = (school.application_checklist || []).filter((item) => item.required && item.status !== "not_required");
    const complete = items.filter((item) => ["ready", "submitted"].includes(item.status)).length;
    return { total: items.length, complete, percent: items.length ? Math.round(complete / items.length * 100) : 0 };
  }

  function lorStats(school) {
    const assignments = school.recommendations.assignments;
    const required = Number(school.recommendations.required) || 0;
    const submitted = assignments.filter((entry) => entry.status === "submitted").length;
    return { required, assigned: assignments.length, submitted, pending: Math.max(0, required - submitted), gap: Math.max(0, required - assignments.length) };
  }

  function allLorStats(schools = activeSchools()) {
    return schools.reduce((totals, school) => {
      const stats = lorStats(school);
      totals.required += stats.required;
      totals.assigned += stats.assigned;
      totals.submitted += stats.submitted;
      totals.gap += stats.gap;
      return totals;
    }, { required: 0, assigned: 0, submitted: 0, gap: 0 });
  }

  function contacted(pi) {
    return ["sent", "follow_up_sent", "replied", "meeting"].includes(pi.contact.status);
  }

  function followUpDue(pi) {
    if (!["sent", "follow_up_sent"].includes(pi.contact.status)) return false;
    let next = pi.contact.next_follow_up;
    if (!next && pi.contact.last_contacted) next = addDays(pi.contact.last_contacted, state.settings.follow_up_after_days || 12);
    return Boolean(next && next <= today());
  }

  function allPis(schools = state.schools) {
    return schools.flatMap((school) => school.target_pis.map((pi) => ({ school, pi })));
  }

  function piKey(schoolId, piId) {
    return `${schoolId}::${piId}`;
  }

  function piPairByKey(key) {
    const [schoolId, piId] = String(key).split("::");
    const school = schoolById(schoolId);
    const pi = piById(school, piId);
    return school && pi ? { school, pi } : null;
  }

  function pruneComparedPis() {
    ui.comparePis.forEach((key) => { if (!piPairByKey(key)) ui.comparePis.delete(key); });
  }

  function toggleComparedPi(key) {
    if (!piPairByKey(key)) return;
    if (ui.comparePis.has(key)) ui.comparePis.delete(key);
    else if (ui.comparePis.size >= 4) return toast("最多同时对比 4 位 PI，请先移除一位。 ");
    else ui.comparePis.add(key);
    render(true);
  }

  function schoolCost(school) {
    const application = school.budget.fee_waiver ? 0 : Number(school.budget.application_fee_usd) || 0;
    return application + (Number(school.budget.score_report_usd) || 0) + (Number(school.budget.other_usd) || 0);
  }

  function budgetTotals() {
    const schoolTotal = activeSchools().reduce((sum, school) => sum + schoolCost(school), 0);
    const fixedTotal = state.budget_items.filter((item) => item.enabled).reduce((sum, item) => sum + (Number(item.amount_usd) || 0), 0);
    return { schoolTotal, fixedTotal, total: schoolTotal + fixedTotal, cny: (schoolTotal + fixedTotal) * (Number(state.settings.cny_per_usd) || 0) };
  }

  function tierClass(tier) {
    return tier === "Reach" ? "reach" : tier === "Match" ? "match" : "safe";
  }

  function tierColor(tier) {
    return `var(--tier-${tierClass(tier)})`;
  }

  function countdownLabel(school) {
    const days = daysTo(school.deadline);
    if (days < 0) return `<span class="status-critical">已过 ${Math.abs(days)} 天</span>`;
    if (days === 0) return `<span class="status-critical">今天截止</span>`;
    if (days <= 30 && !["Submitted", "Interview", "Waitlisted", "Admitted"].includes(school.status)) return `<span class="status-critical">${days} 天</span>`;
    return `${days} 天`;
  }

  function emptyState(title, description, showAdd = true) {
    return `<div class="empty-state"><span class="empty-symbol" aria-hidden="true">⌖</span><h2>${esc(title)}</h2><p>${esc(description)}</p><div class="empty-actions"><button class="button button-primary" data-action="import">导入 applications JSON</button>${showAdd ? '<button class="button button-ghost" data-action="add-school">手动添加项目</button>' : ""}</div></div>`;
  }

  function chartTable(headers, rows) {
    return `<details class="data-table"><summary>查看图表数据表</summary><div class="table-wrap"><table><thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td class="${index ? "numeric" : ""}">${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
  }

  function roundedEndPath(x, y, width, height, radius = 4) {
    if (width <= 0) return "";
    if (width <= radius) return `M${x},${y}h${width}v${height}h${-width}Z`;
    return `M${x},${y}H${x + width - radius}Q${x + width},${y} ${x + width},${y + radius}V${y + height - radius}Q${x + width},${y + height} ${x + width - radius},${y + height}H${x}Z`;
  }

  function horizontalBarChart(id, title, rows, colorFunction, formatter = String) {
    if (!rows.length) return '<div class="note-box">当前筛选下没有可绘制的数据。</div>';
    const width = 560;
    const labelWidth = 138;
    const valueWidth = 66;
    const plotWidth = width - labelWidth - valueWidth;
    const maximum = Math.max(1, ...rows.map((row) => Number(row.value) || 0));
    const height = rows.length * 51 + 12;
    const marks = rows.map((row, index) => {
      const y = 10 + index * 51;
      const barWidth = Math.max(0, (Number(row.value) || 0) / maximum * (plotWidth - 10));
      const path = roundedEndPath(labelWidth, y, barWidth, 20);
      const value = formatter(row.value);
      return `<g class="chart-mark" tabindex="0" role="img" aria-label="${esc(`${row.label}：${value}`)}" data-tooltip-title="${esc(row.label)}" data-tooltip-value="${esc(value)}">
        <rect class="chart-hit" x="${labelWidth - 4}" y="${y - 7}" width="${Math.max(24, barWidth + 8)}" height="34"></rect>
        ${path ? `<path d="${path}" fill="${colorFunction(row)}"></path>` : ""}
        <text class="chart-label" x="0" y="${y + 15}">${esc(row.label)}</text>
        <text class="chart-value" x="${Math.min(width - 4, labelWidth + barWidth + 9)}" y="${y + 15}">${esc(value)}</text>
      </g>`;
    }).join("");
    return `<div class="chart-frame"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}"><line class="chart-axis" x1="${labelWidth}" y1="5" x2="${labelWidth}" y2="${height - 5}"></line>${marks}</svg></div>${chartTable(["类别", "数值"], rows.map((row) => [row.label, formatter(row.value)]))}`;
  }

  function statusChart(rows) {
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    if (!total) return '<div class="note-box">当前没有活跃申请项目。</div>';
    const width = 620;
    let cursor = 0;
    const colors = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--accent)"];
    const textures = Boolean(state.settings.chart_textures);
    const defs = rows.map((row, index) => `<pattern id="status-texture-${index}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(${index % 2 ? 135 : 45})"><rect width="8" height="8" fill="${colors[index]}"></rect><line x1="0" y1="0" x2="0" y2="8" stroke="var(--surface-1)" stroke-width="2"></line></pattern>`).join("");
    const segments = rows.map((row, index) => {
      const rawWidth = row.value / total * width;
      const x = cursor;
      cursor += rawWidth;
      const segmentWidth = Math.max(0, rawWidth - 2);
      if (segmentWidth <= 0 || !row.value) return "";
      const fill = textures ? `url(#status-texture-${index})` : colors[index];
      return `<g class="chart-mark" tabindex="0" role="img" aria-label="${esc(`${row.label}：${row.value}，${Math.round(row.value / total * 100)}%`)}" data-tooltip-title="${esc(row.label)}" data-tooltip-value="${esc(`${row.value} 所 · ${Math.round(row.value / total * 100)}%`)}"><rect class="chart-hit" x="${Math.max(0, x - 2)}" y="20" width="${Math.max(24, rawWidth + 4)}" height="40"></rect><rect x="${x}" y="27" width="${segmentWidth}" height="24" fill="${fill}"></rect></g>`;
    }).join("");
    const legend = rows.map((row, index) => `<span class="legend-item"><span class="legend-swatch" style="background:${colors[index]}"></span>${esc(row.label)} · ${row.value}</span>`).join("");
    return `<div class="chart-frame"><svg viewBox="0 0 ${width} 70" role="img" aria-label="申请状态构成，共 ${total} 所"><defs>${defs}</defs><text class="chart-value" x="0" y="13">总计 ${total} 所</text>${segments}</svg></div><div class="legend">${legend}</div>${chartTable(["状态", "学校数"], rows.map((row) => [row.label, row.value]))}`;
  }

  function pinnedEntries() {
    return (state.settings.pinned_items || []).map((key) => {
      const [kind, id] = key.split(":");
      const item = kind === "document" ? documentById(id) : essayById(id);
      return item ? { key, kind, item } : null;
    }).filter(Boolean);
  }

  function renderPinnedItems() {
    const entries = pinnedEntries();
    const cards = entries.map(({ key, kind, item }) => {
      if (kind === "document") {
        return `<article class="living-card"><span class="eyebrow">LOCAL DOCUMENT / ${esc(item.category)}</span><h3>${esc(item.label)}</h3><p>${esc(item.version || "无版本标识")} · ${esc(DOCUMENT_LABELS[item.status] || item.status)}<br>更新 ${esc(item.updated_on || "未记录")}</p><div class="detail-actions"><button class="button button-small button-primary" data-action="edit-document" data-id="${esc(item.id)}">查看 / 编辑</button><button class="button button-small button-ghost" data-action="copy-path" data-command="${esc(item.file_path || "")}">复制路径</button><button class="text-button" data-action="toggle-pin" data-kind="document" data-id="${esc(item.id)}" data-key="${esc(key)}">取消置顶</button></div></article>`;
      }
      const school = schoolById(item.school_id);
      return `<article class="living-card"><span class="eyebrow">VERSIONED WRITING / ${esc(item.type)}</span><h3>${esc(item.title)}</h3><p>${esc(school?.name || "通用母版")} · ${esc(ESSAY_LABELS[item.status] || item.status)}<br>${item.versions.length} 个版本 · 更新 ${esc(String(item.updated_at || "").slice(0, 10) || "未记录")}</p><div class="detail-actions"><button class="button button-small button-primary" data-action="edit-essay" data-id="${esc(item.id)}">继续写作</button><button class="button button-small button-ghost" data-action="essay-versions" data-id="${esc(item.id)}">版本历史</button><button class="text-button" data-action="toggle-pin" data-kind="essay" data-id="${esc(item.id)}" data-key="${esc(key)}">取消置顶</button></div></article>`;
    }).join("");
    return `<section class="panel living-workspace"><div class="panel-head"><div><span class="eyebrow">LIVING DOCUMENTS</span><h2>置顶活文档</h2><p>把当前 CV、Research Proposal 和 SoP 母版放在这里；引用现有记录，不复制正文。</p></div><span class="panel-code">${entries.length} / 4 PINNED</span></div>${entries.length ? `<div class="living-grid">${cards}</div>` : '<div class="note-box">尚未置顶。到「材料中心」或「文书与审阅」点击“置顶”，常用工作稿就会显示在这里。</div><div class="detail-actions"><button class="button button-small button-ghost" data-action="navigate" data-view="materials">选择材料</button><button class="button button-small button-ghost" data-action="navigate" data-view="essays">选择文书</button></div>'}</section>`;
  }

  function renderOverview() {
    const schools = activeSchools();
    if (!schools.length) {
      return emptyState("建立你的申请任务台", "导入 data/applications.example.json 查看 19 个预置项目；开始记录真实进度前，请使用 applications.private.json。", true);
    }
    const sorted = [...schools].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
    const upcoming = sorted.filter((school) => daysTo(school.deadline) >= 0);
    const next = upcoming[0] || sorted[sorted.length - 1];
    const days = daysTo(next.deadline);
    const lor = allLorStats(schools);
    const completion = lor.required ? Math.min(100, Math.round(lor.submitted / lor.required * 100)) : 100;
    const pis = allPis(schools);
    const contactedCount = pis.filter(({ pi }) => contacted(pi)).length;
    const totals = budgetTotals();
    const due30 = schools.filter((school) => daysTo(school.deadline) >= 0 && daysTo(school.deadline) <= 30 && !["Submitted", "Interview", "Waitlisted", "Admitted"].includes(school.status)).length;
    const pendingTasks = state.tasks.filter((task) => !["done", "skipped"].includes(task.status));
    const overdueTasks = pendingTasks.filter((task) => task.due_date < today()).length;
    const taskRows = [...pendingTasks].sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 5).map((task) => {
      const school = schoolById(task.school_id);
      return `<tr><td><span class="school-name">${esc(task.title)}</span><span class="subline">${esc(school?.name || "全局任务")}${isTaskBlocked(task) ? " · 等待前置" : ""}</span></td><td><span class="${task.due_date < today() ? "status-critical" : ""}">${esc(task.due_date)}</span></td><td><button class="button button-small button-ghost" data-action="navigate" data-view="tasks">处理</button></td></tr>`;
    }).join("");
    const tierRows = ["Reach", "Match", "Safe / Pivot"].map((tier) => ({ label: tier, value: schools.filter((school) => school.tier === tier).length, tier }));
    const statusRows = STATUSES.filter((status) => status !== "Closed" || state.schools.some((school) => school.status === "Closed")).map((status) => ({ label: status, value: state.schools.filter((school) => school.status === status).length })).filter((row) => row.value > 0);
    const upcomingRows = upcoming.slice(0, 6).map((school) => {
      const stats = lorStats(school);
      return `<tr><td><span class="school-name">${school.deadline_verified ? "" : "~"}${esc(formatDeadline(school.deadline, false))}</span><span class="subline">${countdownLabel(school)}</span></td><td><span class="school-name">${esc(school.name)}</span><span class="subline">${esc(school.department_track)}</span></td><td><span class="${stats.gap ? "required-warning" : ""}">${stats.submitted}/${stats.required} 已交</span><span class="subline">${stats.gap ? `缺分配 ${stats.gap}` : `${stats.assigned} 人已分配`}</span></td><td><button class="button button-small button-ghost" data-action="edit-school" data-id="${esc(school.id)}">查看</button></td></tr>`;
    }).join("");

    return `<div class="hero-grid">
      <section class="hero-panel"><div class="hero-kicker">NEXT APPLICATION DEADLINE / 下一截止日</div><div class="hero-number">${days >= 0 ? days : 0}<small>${days === 0 ? "DUE TODAY" : days > 0 ? "DAYS" : "PASSED"}</small></div><h2 class="hero-school">${esc(next.name)}</h2><div class="hero-meta">${esc(next.program_name)}</div><div class="hero-bottom"><span>${next.deadline_verified ? "" : "~ "}${esc(formatDeadline(next.deadline))}</span><span>${esc(state.cycle.timezone)}</span><span>${esc(next.status)}</span></div></section>
      <section class="hero-side"><div><span class="eyebrow">LETTER COMPLETION</span><div class="completion-value">${completion}%</div><div class="completion-caption">推荐信已交 ${lor.submitted} / ${lor.required}</div><div class="meter" role="meter" aria-label="推荐信完成率" aria-valuenow="${completion}" aria-valuemin="0" aria-valuemax="100"><span style="width:${completion}%"></span></div><span class="subline">${lor.gap ? `尚有 ${lor.gap} 个推荐人名额未分配` : "推荐人名额已全部分配"}</span></div><div class="micro-stats"><div class="micro-stat"><strong>${contactedCount}/${pis.length}</strong><span>PI 已联系</span></div><div class="micro-stat"><strong>${state.assets.filter((asset) => asset.verified).length}/${state.assets.length}</strong><span>学术资产已核验</span></div></div></section>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">活跃申请项目</div><div class="kpi-value">${schools.length}</div><div class="kpi-detail">${state.schools.filter((school) => school.status === "Submitted").length} 已提交 · ${state.schools.filter((school) => school.status === "Closed").length} 已关闭</div></div>
      <div class="kpi-card"><div class="kpi-label">30 天内待提交</div><div class="kpi-value">${due30}</div><div class="kpi-detail">${overdueTasks} 个规划任务已逾期 · ${pendingTasks.length} 待办</div></div>
      <div class="kpi-card"><div class="kpi-label">套磁触达率</div><div class="kpi-value">${pis.length ? Math.round(contactedCount / pis.length * 100) : 0}%</div><div class="kpi-detail">${allPis(schools).filter(({ pi }) => followUpDue(pi)).length} 个 Follow-up 到期</div></div>
      <div class="kpi-card"><div class="kpi-label">组合预计成本</div><div class="kpi-value">${money(totals.total)}</div><div class="kpi-detail">约 ¥${totals.cny.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} · 不含 Closed</div></div>
    </div>
    ${renderPinnedItems()}
    <div class="dashboard-grid">
      <section class="panel"><div class="panel-head"><div><h2>选校组合 / Tier Mix</h2><p>Reach → Match → Safe 使用有序蓝色梯度；具体数量见标签与数据表。</p></div><span class="panel-code">FIG. 01</span></div>${horizontalBarChart("tier-chart", "选校组合数量", tierRows, (row) => tierColor(row.tier))}</section>
      <section class="panel"><div class="panel-head"><div><h2>申请阶段 / Application State</h2><p>阶段颜色固定，并提供图例、悬停、键盘焦点与数据表。</p></div><div><span class="panel-code">FIG. 02</span><button class="text-button" data-action="toggle-textures">${state.settings.chart_textures ? "关闭纹理" : "纹理辅助"}</button></div></div>${statusChart(statusRows)}</section>
    </div>
    <section class="panel panel-flush"><div class="panel-head" style="padding:20px 20px 0"><div><h2>近期截止日</h2><p>按规划截止日排序；推荐信缺口优先处理。</p></div><button class="button button-small button-ghost" data-action="navigate" data-view="applications">全部项目 →</button></div>${upcomingRows ? `<div class="table-wrap" style="border:0"><table><thead><tr><th>截止日</th><th>项目</th><th>推荐信</th><th>操作</th></tr></thead><tbody>${upcomingRows}</tbody></table></div>` : '<div class="note-box" style="margin:20px">没有未来截止日。</div>'}</section>
    <section class="panel panel-flush overview-tasks"><div class="panel-head" style="padding:20px 20px 0"><div><h2>依赖任务队列</h2><p>逾期与前置依赖在时间线中明确标记。</p></div><button class="button button-small button-ghost" data-action="navigate" data-view="tasks">完整时间线 →</button></div>${taskRows ? `<div class="table-wrap" style="border:0"><table><thead><tr><th>任务</th><th>计划完成日</th><th>操作</th></tr></thead><tbody>${taskRows}</tbody></table></div>` : '<div class="note-box" style="margin:20px">没有待办任务。</div>'}</section>`;
  }

  function seasonPhaseStats(phaseId) {
    const pairs = allPis();
    if (phaseId === "foundation") {
      const testScores = state.documents.filter((document) => document.category === "test_score");
      return [
        `学术资产 ${state.assets.filter((asset) => asset.verified).length}/${state.assets.length} 已核验`,
        `论文 / 预印本 ${state.applicant.publication_count ?? "未登记"}`,
        `语言材料 ${testScores.filter((document) => ["final", "submitted"].includes(document.status)).length}/${testScores.length} 已定稿`
      ];
    }
    if (phaseId === "discovery") return [
      `PI Longlist ${pairs.length} 人`,
      `Shortlist ${pairs.filter(({ pi }) => pi.shortlisted).length} 人`,
      `任职已核验 ${pairs.filter(({ pi }) => pi.verification_status === "verified_official").length}/${pairs.length}`
    ];
    if (phaseId === "writing") {
      const lor = allLorStats();
      return [
        `文书定稿 ${state.essays.filter((essay) => ["final", "submitted"].includes(essay.status)).length}/${state.essays.length}`,
        `推荐信 ${lor.submitted}/${lor.required} 已交`,
        `材料定稿 ${state.documents.filter((document) => ["final", "submitted"].includes(document.status)).length}/${state.documents.length}`
      ];
    }
    if (phaseId === "submission") {
      const submitted = state.schools.filter((school) => ["Submitted", "Interview", "Waitlisted", "Admitted"].includes(school.status)).length;
      return [
        `已提交 / 后续阶段 ${submitted}/${state.schools.length}`,
        `截止日已核验 ${state.schools.filter((school) => school.deadline_verified).length}/${state.schools.length}`,
        `申请编号 ${state.schools.filter((school) => school.application_id).length} 个已记录`
      ];
    }
    if (phaseId === "decisions") return [
      `面试 ${state.schools.filter((school) => school.status === "Interview").length} 个`,
      `录取 ${state.schools.filter((school) => school.status === "Admitted").length} 个`,
      `回复截止 ${state.schools.filter((school) => school.decision.response_deadline).length} 个已记录`
    ];
    const transitionTask = state.tasks.find((task) => task.id === "season-transition");
    return [
      `待选择 Offer ${state.schools.filter((school) => school.status === "Admitted" && !school.decision.close_reason).length} 个`,
      `行前里程碑 ${transitionTask ? TASK_LABELS[transitionTask.status] : "未创建"}`,
      "签证与行政要求需以官方通知为准"
    ];
  }

  function renderSeason() {
    const phases = Modules.seasonPlan(state, today());
    const current = phases.find((phase) => phase.status === "current") || phases.find((phase) => phase.status === "upcoming") || phases.at(-1);
    const currentTask = state.tasks.find((task) => task.id === `season-${current.id}`);
    const seasonTasks = state.tasks.filter((task) => task.season_phase);
    const completedTasks = seasonTasks.filter((task) => task.status === "done").length;
    const nextTask = [...state.tasks].filter((task) => !["done", "skipped"].includes(task.status)).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    const cards = phases.map((phase) => {
      const task = state.tasks.find((item) => item.id === `season-${phase.id}`);
      const statusLabel = phase.status === "current" ? "◆ 当前阶段" : phase.status === "complete" ? "→ 时间段已过" : "◇ 尚未进入";
      return `<article class="season-phase phase-${phase.status}" ${phase.id === current.id ? 'aria-current="date"' : ""}>
        <div class="season-phase-top"><span class="season-phase-number">${String(phase.number).padStart(2, "0")}</span><span class="season-status">${statusLabel}</span></div>
        <span class="eyebrow">${esc(phase.english)}</span><h2>${esc(phase.label)}</h2>
        <div class="season-dates">${esc(phase.start)} <span>→</span> ${esc(phase.end)}</div>
        <p>${esc(phase.focus)}</p>
        <ul class="season-outcomes">${phase.outcomes.map((outcome) => `<li>${esc(outcome)}</li>`).join("")}</ul>
        <div class="season-evidence">${seasonPhaseStats(phase.id).map((stat) => `<span>${esc(stat)}</span>`).join("")}</div>
        <div class="season-phase-footer"><span class="subline">${task ? `${TASK_LABELS[task.status]} · ${esc(task.due_date)}${task.season_term && task.season_term !== state.cycle.target_term ? " · 旧周期日期" : ""}` : "阶段里程碑未创建"}</span><button class="button button-small button-ghost" data-action="season-milestone" data-phase="${esc(phase.id)}">${task ? "查看里程碑" : "+ 创建里程碑"}</button></div>
      </article>`;
    }).join("");
    return `<section class="season-hero">
      <div class="season-hero-main"><span class="hero-kicker">${esc(state.cycle.target_term)} / APPLICATION SEASON</span><div class="season-current-number">${String(current.number).padStart(2, "0")}<small>/ 06</small></div><h2>${esc(current.label)}</h2><p>${esc(current.focus)}</p><div class="hero-bottom"><span>${esc(current.start)} → ${esc(current.end)}</span><span>${current.status === "current" ? `距阶段结束 ${Math.max(0, current.days_left)} 天` : "规划阶段"}</span></div></div>
      <aside class="season-hero-side"><span class="eyebrow">NEXT ACTION / 下一步</span><h3>${esc(nextTask?.title || "创建申请季里程碑")}</h3><p>${nextTask ? `${esc(nextTask.due_date)} · ${esc(nextTask.school_id ? schoolById(nextTask.school_id)?.name || "关联项目" : "申请季 / 全局任务")}` : "按阶段生成 6 个规划任务，或在卡片中单独创建。"}</p><div class="season-hero-actions"><button class="button button-primary" data-action="${nextTask ? "edit-task" : "generate-season-plan"}" ${nextTask ? `data-id="${esc(nextTask.id)}"` : ""}>${nextTask ? "处理下一任务" : "生成阶段任务"}</button><button class="button button-ghost" data-action="navigate" data-view="tasks">全部依赖任务 →</button></div><div class="micro-stats"><div class="micro-stat"><strong>${completedTasks}/${seasonTasks.length || 6}</strong><span>申请季里程碑已完成</span></div><div class="micro-stat"><strong>${allPis().filter(({ pi }) => pi.shortlisted).length}</strong><span>Shortlist PI</span></div></div></aside>
    </section>
    <div class="season-toolbar"><div><strong>从科研准备到入学，而不是只看网申截止日。</strong><span class="subline">日期由目标入学季生成，仅作规划；所有学校截止日、签证和行政要求仍以官网为准。</span></div><div class="panel-action-row"><button class="button button-ghost" data-action="generate-season-plan">${seasonTasks.length === 6 ? "检查阶段任务" : "生成 / 补齐 6 个阶段任务"}</button><button class="button button-ghost" data-action="export-calendar">导出 ICS</button></div></div>
    <div class="season-grid">${cards}</div>
    <section class="panel season-notes"><div><span class="eyebrow">EVIDENCE OVER DATES</span><h2>阶段状态不等于工作完成</h2></div><p>“时间段已过”只描述日期；只有真实任务状态才会标记里程碑完成。Shortlist、文书、材料和网申数字均从现有工作区实时汇总，不建立第二套进度数据。</p></section>`;
  }

  function filteredSchools() {
    const filters = ui.schoolFilters;
    const needle = filters.search.trim().toLowerCase();
    return state.schools.filter((school) => {
      const haystack = `${school.name} ${school.id} ${school.program_name} ${school.department_track} ${school.target_pis.map((pi) => `${pi.name} ${pi.recent_work_keywords.join(" ")}`).join(" ")}`.toLowerCase();
      return (!needle || haystack.includes(needle)) && (!filters.tier || school.tier === filters.tier) && (!filters.track || school.track_type === filters.track) && (!filters.status || school.status === filters.status) && (!filters.region || school.region === filters.region);
    }).sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline));
  }

  function renderPiCard(school, pi) {
    const homepage = safeUrl(pi.homepage);
    const paperUrl = safeUrl(pi.paper_url);
    return `<div class="pi-card"><div><span class="school-name">${pi.shortlisted ? "★ " : ""}${esc(pi.name)}</span><span class="subline">${esc(pi.lab || "实验室待补充")}</span><span class="fit-score" aria-label="匹配度 ${pi.fit_score}/5">${"◆".repeat(Number(pi.fit_score) || 0)}${"◇".repeat(5 - (Number(pi.fit_score) || 0))}</span></div><div class="keyword-list">${esc(pi.recent_work_keywords.join(" · "))}<span class="subline">${pi.verification_status === "verified_official" ? "✓ 已官网核验" : "⚠ 任职与论文待核验"} · ${esc(ADMISSIONS_LABELS[pi.admissions_status] || "招生未知")} · ${esc(CONTACT_LABELS[pi.contact.status] || pi.contact.status)}</span>${pi.paper_title ? `<span class="paper-note">已读：${paperUrl ? `<a href="${esc(paperUrl)}" target="_blank" rel="noopener noreferrer">${esc(pi.paper_title)} ↗</a>` : esc(pi.paper_title)}</span>` : '<span class="subline status-warning">尚无具体论文阅读记录</span>'}</div><div class="table-actions">${homepage ? `<a class="button button-small button-ghost" href="${esc(homepage)}" target="_blank" rel="noopener noreferrer">主页</a>` : ""}<button class="button button-small button-ghost" data-action="email-draft" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">草稿</button><button class="button button-small button-ghost" data-action="interactions" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">交流 ${pi.contact.history.length ? `(${pi.contact.history.length})` : ""}</button><button class="button button-small button-ghost" data-action="edit-pi" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">研究笔记</button><button class="icon-button" data-action="delete-pi" data-school="${esc(school.id)}" data-id="${esc(pi.id)}" aria-label="删除 ${esc(pi.name)}">×</button></div></div>`;
  }

  function renderChecklist(school) {
    const stats = checklistStats(school);
    const rows = (school.application_checklist || []).map((item) => {
      const document = item.document_id ? documentById(item.document_id) : null;
      const source = safeUrl(item.source_url);
      return `<tr><td><span class="school-name">${esc(item.label)}</span><span class="subline">${item.required ? "必需" : "可选"} · ${item.verified ? "✓ 要求已官网核验" : "◇ 要求待核验"}</span></td><td>${document ? `<span>${esc(document.label)}</span><span class="subline">${esc(document.version || "—")} · ${esc(DOCUMENT_LABELS[document.status])}</span>` : '<span class="subline">未关联材料</span>'}</td><td><select class="inline-input" data-action="checklist-status" data-school="${esc(school.id)}" data-id="${esc(item.id)}" aria-label="${esc(item.label)} 状态">${Object.entries(CHECKLIST_LABELS).map(([value, label]) => `<option value="${value}" ${item.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td><td>${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">要求来源 ↗</a>` : '<span class="subline">未填写来源</span>'}</td><td><div class="table-actions"><button class="icon-button" data-action="edit-checklist" data-school="${esc(school.id)}" data-id="${esc(item.id)}" aria-label="编辑 ${esc(item.label)}">✎</button><button class="icon-button" data-action="delete-checklist" data-school="${esc(school.id)}" data-id="${esc(item.id)}" aria-label="删除 ${esc(item.label)}">×</button></div></td></tr>`;
    }).join("");
    return `<section class="checklist-section"><div class="panel-head"><div><h3>逐校申请清单 · ${stats.complete}/${stats.total}</h3><p>默认清单只作规划模板；字数、送分和材料要求必须记录官方来源并人工核验。</p></div><button class="button button-small button-ghost" data-action="add-checklist" data-school="${esc(school.id)}">+ 自定义清单项</button></div><div class="meter" role="meter" aria-label="${esc(school.name)} 清单完成率" aria-valuenow="${stats.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${stats.percent}%"></span></div><div class="table-wrap checklist-table"><table><thead><tr><th>要求 / 核验</th><th>关联材料</th><th>状态</th><th>来源</th><th>操作</th></tr></thead><tbody>${rows || '<tr><td colspan="5">暂无清单项。</td></tr>'}</tbody></table></div></section>`;
  }

  function renderSchoolPlanFacts(school) {
    const funding = school.funding;
    const policy = school.application_policy;
    const decision = school.decision;
    const fundingSource = safeUrl(funding.source_url);
    const policySource = safeUrl(policy.source_url);
    const applicationRecord = school.application_id || school.submission_date || school.interview_date ? `<h3>网申回执</h3><p>${school.application_id ? `申请编号：<strong>${esc(school.application_id)}</strong>` : ""}${school.submission_date ? `<span class="subline">实际提交：${esc(school.submission_date)}</span>` : ""}${school.interview_date ? `<span class="subline">面试日期：${esc(school.interview_date)}</span>` : ""}</p>` : "";
    return `<div class="school-plan-facts">${applicationRecord}<h3>Funding 与申请政策</h3><p><strong>${esc(FUNDING_CONSIDERATION_LABELS[funding.consideration])}</strong>${funding.types.length ? `<span class="subline">${esc(funding.types.join(" · "))}</span>` : ""}${funding.deadline ? `<span class="subline">Funding 截止：${esc(funding.deadline)}</span>` : ""}<span class="subline">${funding.verified ? `✓ 已核验 ${esc(funding.last_verified || "")}` : "◇ Funding 待核验"}</span>${fundingSource ? ` <a href="${esc(fundingSource)}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a>` : ""}</p><p>${esc(SUPERVISOR_CONTACT_LABELS[policy.supervisor_contact])} · ${esc(INTERVIEW_LABELS[policy.interview])}<span class="subline">${policy.verified ? `✓ 政策已核验 ${esc(policy.last_verified || "")}` : "◇ 申请政策待核验"}</span>${policySource ? ` <a href="${esc(policySource)}" target="_blank" rel="noopener noreferrer">政策来源 ↗</a>` : ""}</p>${funding.notes ? `<p class="subline">${esc(funding.notes)}</p>` : ""}${decision.close_reason || decision.decision_date || decision.response_deadline || decision.notes ? `<h3>申请结果</h3><p>${esc(CLOSE_REASON_LABELS[decision.close_reason] || school.status)}${decision.decision_date ? `<span class="subline">结果日期：${esc(decision.decision_date)}</span>` : ""}${decision.response_deadline ? `<span class="subline">回复截止：${esc(decision.response_deadline)}</span>` : ""}${decision.notes ? `<span class="subline">${esc(decision.notes)}</span>` : ""}</p>` : ""}</div>`;
  }

  function renderScoreDimensions(score) {
    const icons = { research_fit: "◎", readiness: "✓", data_confidence: "◇" };
    return `<div class="score-dimensions">${score.dimensions.map((dimension) => `<div class="score-dimension" data-dimension="${dimension.id}"><div class="score-dimension-head"><span>${icons[dimension.id]} ${esc(dimension.label)}</span><strong>${dimension.score}<small>/100</small></strong></div><div class="meter" role="meter" aria-label="${esc(dimension.label)}" aria-valuenow="${dimension.score}" aria-valuemin="0" aria-valuemax="100"><span style="width:${dimension.score}%"></span></div><p>${esc(dimension.description)}</p><span class="subline">综合工作分权重 ${dimension.max}% · 原始得分 ${dimension.earned}/${dimension.max}</span></div>`).join("")}</div>`;
  }

  function renderSchoolDetail(school) {
    const score = Modules.scoreSchool(school, state);
    const components = score.components.map((component) => `<li><span>${esc(component.label)}</span><strong>${component.earned}/${component.max}</strong><small>${esc(component.detail)}</small></li>`).join("");
    return `<tr class="detail-row"><td colspan="9"><div class="detail-content"><div class="detail-grid"><div><div class="panel-head"><div><h3>目标 PI 与研究匹配</h3><p>只有真实阅读并官网核验的论文笔记才会进入 CLI 套磁正文。</p></div><button class="button button-small button-ghost" data-action="add-pi" data-school="${esc(school.id)}">+ 添加 PI</button></div><div class="pi-list">${school.target_pis.length ? school.target_pis.map((pi) => renderPiCard(school, pi)).join("") : '<div class="note-box">尚未添加目标 PI。</div>'}</div></div><aside><div class="score-header"><span class="eyebrow">WEIGHTED WORKSPACE SCORE</span><strong class="score-total">${score.total}<small>/100</small></strong><span class="subline">综合工作分，不是录取概率</span></div>${renderScoreDimensions(score)}<details class="score-details"><summary>查看 ${score.components.length} 项评分依据</summary><ul class="score-components">${components}</ul></details><div class="note-box score-guidance">${esc(score.guidance)}</div>${score.risks.length ? `<ul class="risk-list">${score.risks.map((risk) => `<li>${esc(risk)}</li>`).join("")}</ul>` : ""}<h3>项目策略备注</h3><div class="note-box">${esc(school.notes || "暂无备注")}</div>${renderSchoolPlanFacts(school)}<p class="subline" style="margin-top:12px">${esc(school.deadline_type || "user_planning_date")} · ${school.deadline_verified ? "截止日已核验" : "截止日未核验"}</p>${safeUrl(school.portal_url) ? `<a href="${esc(safeUrl(school.portal_url))}" target="_blank" rel="noopener noreferrer">打开项目官网 ↗</a>` : ""}<div class="detail-actions"><button class="button button-small button-ghost" data-action="edit-school" data-id="${esc(school.id)}">编辑项目</button><button class="button button-small button-ghost" data-action="duplicate-school" data-id="${esc(school.id)}">复制为新 Track</button><button class="button button-small button-ghost button-danger" data-action="delete-school" data-id="${esc(school.id)}">删除</button></div></aside></div>${renderChecklist(school)}</div></td></tr>`;
  }

  function applicationReady(school) {
    const checklist = checklistStats(school);
    return checklist.total > 0 && checklist.complete === checklist.total && lorStats(school).pending === 0;
  }

  function renderSchoolBoard(schools) {
    const columns = STATUSES.map((status) => {
      const group = schools.filter((school) => school.status === status);
      const cards = group.map((school) => {
        const checklist = checklistStats(school);
        const lor = lorStats(school);
        return `<article class="stage-card"><div class="asset-head"><div><h3>${esc(school.name)}</h3><span class="subline">${esc(school.program_name)}</span></div><span class="tag tag-${tierClass(school.tier)}">${esc(school.tier)}</span></div><p class="subline">${school.deadline_verified ? "" : "~"}${esc(formatDeadline(school.deadline, false))} · ${esc(school.track_type)}</p><div class="stage-card-stats"><span>清单 ${checklist.complete}/${checklist.total}</span><span>LOR ${lor.submitted}/${lor.required}</span></div>${applicationReady(school) ? '<span class="status-good subline">✓ Ready to Apply</span>' : ""}${school.funding.consideration !== "unknown" ? `<span class="subline">${esc(FUNDING_CONSIDERATION_LABELS[school.funding.consideration])}</span>` : ""}${school.status === "Closed" && school.decision.close_reason ? `<span class="subline">${esc(CLOSE_REASON_LABELS[school.decision.close_reason])}</span>` : ""}<label class="subline">阶段<select class="inline-input" data-action="school-status" data-id="${esc(school.id)}">${STATUSES.map((value) => `<option ${value === status ? "selected" : ""}>${value}</option>`).join("")}</select></label><div class="detail-actions"><button class="button button-small button-ghost" data-action="school-details" data-id="${esc(school.id)}">清单与详情</button><button class="button button-small button-ghost" data-action="edit-school" data-id="${esc(school.id)}">编辑</button></div></article>`;
      }).join("");
      return `<section class="stage-column"><header><h2>${esc(status)}</h2><span>${group.length}</span></header><div class="stage-column-body">${cards || '<div class="stage-empty">暂无项目</div>'}</div></section>`;
    }).join("");
    return `<div class="panel-head"><div><h2>按申请阶段分组 · ${schools.length} 个项目</h2><p>使用卡片内的阶段选择器移动项目；筛选条件与表格、日历共享。</p></div><span class="panel-code">BY STAGE</span></div><div class="stage-board">${columns}</div>`;
  }

  function applicationCalendarEvents(schools) {
    const events = [];
    const schoolIds = new Set(schools.map((school) => school.id));
    const add = (date, event) => { if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) events.push({ ...event, date }); };
    schools.forEach((school) => {
      const deadline = dateInTimezone(school.deadline);
      add(deadline, { id: school.id, schoolId: school.id, kind: "application", title: school.name, detail: `${school.deadline_verified ? "" : "~ "}申请截止` });
      add(school.funding.deadline, { id: school.id, schoolId: school.id, kind: "funding", title: school.name, detail: `${school.funding.verified ? "" : "~ "}Funding 截止` });
      add(school.decision.response_deadline, { id: school.id, schoolId: school.id, kind: "decision", title: school.name, detail: "结果 / Offer 回复截止" });
      const lor = lorStats(school);
      if (lor.pending > 0 && !["Submitted", "Interview", "Waitlisted", "Admitted", "Closed"].includes(school.status)) add(deadline, { id: school.id, schoolId: school.id, kind: "lor", title: school.name, detail: `推荐信缺口 ${lor.submitted}/${lor.required} 已交` });
    });
    state.tasks.filter((task) => !["done", "skipped"].includes(task.status) && (!task.school_id || schoolIds.has(task.school_id))).forEach((task) => {
      const school = schoolById(task.school_id);
      add(task.due_date, { id: task.id, schoolId: task.school_id || "", kind: "task", title: school?.name || "全局任务", detail: task.title });
    });
    return events.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  }

  function renderSchoolCalendar(schools) {
    const events = applicationCalendarEvents(schools).filter((event) => event.date.startsWith(ui.calendarMonth));
    const byDate = new Map();
    events.forEach((event) => {
      if (!byDate.has(event.date)) byDate.set(event.date, []);
      byDate.get(event.date).push(event);
    });
    const first = new Date(`${ui.calendarMonth}-01T12:00:00Z`);
    const start = addDays(`${ui.calendarMonth}-01`, -((first.getUTCDay() + 6) % 7));
    const monthLabel = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", timeZone: "UTC" }).format(first);
    const weeks = Array.from({ length: 6 }, (_, week) => `<tr>${Array.from({ length: 7 }, (_, weekday) => {
      const date = addDays(start, week * 7 + weekday);
      const inMonth = date.startsWith(ui.calendarMonth);
      const dayEvents = inMonth ? byDate.get(date) || [] : [];
      return `<td class="calendar-day ${inMonth ? "" : "outside"} ${date === today() ? "today" : ""}"><span class="calendar-date">${Number(date.slice(-2))}</span><div class="calendar-events">${dayEvents.map((event) => `<button class="calendar-event event-${event.kind}" data-action="calendar-event" data-kind="${event.kind}" data-id="${esc(event.id)}" data-school="${esc(event.schoolId)}" title="${esc(`${event.title} · ${event.detail}`)}"><strong>${esc(event.detail)}</strong><span>${esc(event.title)}</span></button>`).join("")}</div></td>`;
    }).join("")}</tr>`).join("");
    return `<div class="panel-head"><div><h2>${esc(monthLabel)} · ${events.length} 项安排</h2><p>~ 表示未核验。日历包含申请 / Funding / 回复截止、未完成任务和推荐信缺口；点击条目处理。</p></div><div class="panel-action-row"><button class="button button-small button-ghost" data-action="calendar-nav" data-direction="-1">← 上月</button><button class="button button-small button-ghost" data-action="calendar-today">本月</button><button class="button button-small button-ghost" data-action="calendar-nav" data-direction="1">下月 →</button></div></div><div class="calendar-legend"><span class="event-application">申请</span><span class="event-task">任务</span><span class="event-lor">推荐信</span><span class="event-funding">Funding</span><span class="event-decision">结果回复</span></div><div class="table-wrap calendar-wrap"><table class="month-calendar"><thead><tr>${["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>${weeks}</tbody></table></div>`;
  }

  function renderApplicationToolbar(filters) {
    return `<div class="section-toolbar"><label class="filter-field search"><span>搜索学校 / PI / 关键词</span><input data-focus-key="school-search" data-filter="school-search" value="${esc(filters.search)}" placeholder="例如 humanoid、Sergey、ECE"></label><label class="filter-field"><span>Tier</span><select data-filter="school-tier"><option value="">全部层级</option>${["Reach", "Match", "Safe / Pivot"].map((value) => `<option ${filters.tier === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="filter-field"><span>Track</span><select data-filter="school-track"><option value="">全部 Track</option>${["CS", "Robotics", "ME"].map((value) => `<option ${filters.track === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="filter-field"><span>状态</span><select data-filter="school-status"><option value="">全部状态</option>${STATUSES.map((value) => `<option ${filters.status === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="filter-field"><span>地区</span><select data-filter="school-region"><option value="">全部地区</option>${["North America", "Asia", "Europe", "Other"].map((value) => `<option ${filters.region === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><div class="view-switch" role="group" aria-label="申请项目视图">${[["table", "表格"], ["board", "阶段看板"], ["calendar", "日历"]].map(([mode, label]) => `<button class="button button-small ${ui.schoolView === mode ? "button-primary" : "button-ghost"}" data-action="school-view" data-mode="${mode}" aria-pressed="${ui.schoolView === mode}">${label}</button>`).join("")}</div><button class="button button-primary" data-action="add-school">+ 添加项目</button></div>`;
  }

  function renderApplications() {
    const schools = filteredSchools();
    const content = ui.schoolView === "board" ? renderSchoolBoard(schools) : ui.schoolView === "calendar" ? renderSchoolCalendar(schools) : renderSchoolTable();
    return `${renderApplicationToolbar(ui.schoolFilters)}${content}`;
  }

  function renderSchoolTable() {
    const schools = filteredSchools();
    const rows = schools.map((school) => {
      const lor = lorStats(school);
      const contactedCount = school.target_pis.filter(contacted).length;
      const expanded = ui.expanded.has(school.id);
      const score = Modules.scoreSchool(school, state);
      return `<tr class="school-row ${expanded ? "expanded" : ""}" data-school-expand="${esc(school.id)}"><td><button class="text-button school-name" data-action="toggle-school" data-id="${esc(school.id)}">${esc(school.name)}</button><span class="subline">${esc(school.department_track)} · ${esc(school.region)}</span>${applicationReady(school) ? '<span class="subline status-good">✓ Ready to Apply</span>' : ""}</td><td><strong class="table-score">${score.total}</strong><span class="subline">综合工作分 / 100</span></td><td><span class="tag tag-${tierClass(school.tier)}">${esc(school.tier)}</span><span class="subline">${esc(school.track_type)}</span></td><td><span class="school-name">${school.deadline_verified ? "" : "~"}${esc(formatDeadline(school.deadline, false))}</span><span class="subline">${countdownLabel(school)}</span></td><td><span class="${lor.gap ? "required-warning" : ""}">${lor.submitted}/${lor.required}</span><span class="subline">${lor.gap ? `缺分配 ${lor.gap}` : `${lor.assigned} 人已分配`}</span></td><td>${contactedCount}/${school.target_pis.length}<span class="subline">PI 已联系</span></td><td><select class="inline-input" data-action="school-status" data-id="${esc(school.id)}" aria-label="${esc(school.name)} 申请状态">${STATUSES.map((status) => `<option ${school.status === status ? "selected" : ""}>${status}</option>`).join("")}</select>${school.status === "Closed" && school.decision.close_reason ? `<span class="subline">${esc(CLOSE_REASON_LABELS[school.decision.close_reason])}</span>` : ""}</td><td class="numeric">${money(schoolCost(school))}${school.budget.fee_waiver ? '<span class="subline">Fee waiver</span>' : ""}</td><td><div class="table-actions"><button class="icon-button" data-action="toggle-school" data-id="${esc(school.id)}" aria-label="${expanded ? "收起" : "展开"} ${esc(school.name)}">${expanded ? "−" : "+"}</button><button class="icon-button" data-action="edit-school" data-id="${esc(school.id)}" aria-label="编辑 ${esc(school.name)}">✎</button></div></td></tr>${expanded ? renderSchoolDetail(school) : ""}`;
    }).join("");
    return `<div class="panel-head"><div><h2>${schools.length} / ${state.schools.length} 个项目</h2><p>Ready to Apply 由必需清单和推荐信完成度计算，不是录取概率。展开学校查看 funding、政策与逐校材料。</p></div><span class="panel-code">DUAL-WRITE: JSON ↔ BROWSER</span></div>${schools.length ? `<div class="table-wrap"><table><thead><tr><th>学校 / 院系</th><th>综合工作分</th><th>组合 / Track</th><th>截止日</th><th>推荐信</th><th>套磁</th><th>申请状态</th><th class="numeric">费用</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>` : emptyState("没有匹配的项目", state.schools.length ? "调整筛选条件，或添加一个新的申请 Track。" : "导入预置数据库或手动创建第一个项目。", true)}`;
  }

  function renderTasks() {
    const filters = ui.taskFilters;
    const needle = filters.search.trim().toLowerCase();
    const tasks = state.tasks.filter((task) => {
      const school = schoolById(task.school_id);
      const seasonPhase = task.season_phase ? Modules.seasonPlan(state).find((phase) => phase.id === task.season_phase) : null;
      const haystack = `${task.title} ${task.id} ${task.notes} ${task.season_phase || ""} ${seasonPhase?.label || ""} ${school?.name || ""}`.toLowerCase();
      return (!needle || haystack.includes(needle)) && (!filters.status || task.status === filters.status) && (!filters.school || task.school_id === filters.school);
    }).sort((a, b) => {
      const aDone = ["done", "skipped"].includes(a.status) ? 1 : 0;
      const bDone = ["done", "skipped"].includes(b.status) ? 1 : 0;
      return aDone - bDone || a.due_date.localeCompare(b.due_date) || a.id.localeCompare(b.id);
    });
    const pending = state.tasks.filter((task) => !["done", "skipped"].includes(task.status));
    const overdue = pending.filter((task) => task.due_date < today()).length;
    const blocked = pending.filter(isTaskBlocked).length;
    const rows = tasks.map((task) => {
      const school = schoolById(task.school_id);
      const seasonPhase = task.season_phase ? Modules.seasonPlan(state).find((phase) => phase.id === task.season_phase) : null;
      const isBlocked = isTaskBlocked(task) && !["done", "skipped"].includes(task.status);
      const late = task.due_date < today() && !["done", "skipped"].includes(task.status);
      const dependencies = (task.depends_on || []).map((id) => {
        const dependency = taskById(id);
        return dependency ? `${dependency.title}（${TASK_LABELS[dependency.status]}）` : `${id}（缺失）`;
      });
      return `<tr class="${late ? "task-overdue" : ""}"><td><span class="school-name">${esc(task.title)}</span><span class="subline">${esc(task.id)}</span>${dependencies.length ? `<span class="subline">前置：${esc(dependencies.join("；"))}</span>` : ""}</td><td>${school ? `<span>${esc(school.name)}</span><span class="subline">${esc(school.department_track)}</span>` : `<span class="subline">${seasonPhase ? `申请季 · ${esc(seasonPhase.label)}` : "全局任务"}</span>`}</td><td><span class="school-name ${late ? "status-critical" : ""}">${esc(task.due_date)}</span><span class="subline">${late ? "已逾期" : isBlocked ? "等待前置任务" : task.due_date === today() ? "今天到期" : "按计划"}</span></td><td><span class="tag">${esc(task.category)}</span>${isBlocked ? '<span class="subline status-warning">◇ 尚未解锁</span>' : ""}</td><td><select class="inline-input" data-action="task-status" data-id="${esc(task.id)}" aria-label="${esc(task.title)} 状态">${Object.entries(TASK_LABELS).map(([value, label]) => `<option value="${value}" ${task.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></td><td><div class="table-actions"><button class="icon-button" data-action="edit-task" data-id="${esc(task.id)}" aria-label="编辑 ${esc(task.title)}">✎</button><button class="icon-button" data-action="delete-task" data-id="${esc(task.id)}" aria-label="删除 ${esc(task.title)}">×</button></div></td></tr>`;
    }).join("");
    return `<div class="outreach-summary"><div><span class="kpi-label">未完成任务</span><strong>${pending.length}</strong></div><div><span class="kpi-label">已逾期</span><strong class="${overdue ? "status-critical" : ""}">${overdue}</strong></div><div><span class="kpi-label">等待前置</span><strong>${blocked}</strong></div><div><span class="kpi-label">全部任务</span><strong>${state.tasks.length}</strong></div></div><div class="section-toolbar"><label class="filter-field search"><span>搜索任务</span><input data-focus-key="task-search" data-filter="task-search" value="${esc(filters.search)}" placeholder="标题、学校或任务 ID"></label><label class="filter-field"><span>状态</span><select data-filter="task-status"><option value="">全部状态</option>${Object.entries(TASK_LABELS).map(([value, label]) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="filter-field"><span>学校</span><select data-filter="task-school"><option value="">全部学校</option>${schoolOptions(filters.school, null)}</select></label><button class="button button-ghost" data-action="generate-plans">补齐默认计划</button><button class="button button-ghost" data-action="export-calendar">导出 ICS 日历</button><button class="button button-primary" data-action="add-task">+ 添加任务</button></div><div class="panel-head"><div><h2>依赖驱动的申请时间线</h2><p>每所学校首次载入时生成一次规划任务，之后可自由修改或删除。完成前置任务后才能标记后续任务完成。</p></div><span class="panel-code">LOCAL / ICS 2.0</span></div>${rows ? `<div class="table-wrap"><table><thead><tr><th>任务 / 前置依赖</th><th>项目</th><th>计划完成日</th><th>类别</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="note-box">当前筛选下没有任务。可添加自定义任务，或点击“补齐默认计划”。</div>'}`;
  }

  const MATERIAL_MATRIX_COLUMNS = [
    { key: "cv", label: "CV", presetLabel: "CV / Resume", category: "writing", pattern: /\bCV\b|resume/i },
    { key: "sop", label: "SoP / PS", presetLabel: "SoP / PS / PHS 与项目短文", category: "writing", pattern: /\bSoP\b|personal statement|statement of purpose|PHS|项目短文/i },
    { key: "research-proposal", label: "Research Proposal", presetLabel: "Research Proposal / Research Statement", category: "writing", pattern: /research proposal|research statement|研究计划|研究陈述/i },
    { key: "transcript", label: "成绩单", presetLabel: "成绩单与学历材料", category: "documents", pattern: /成绩单|学历|transcript/i },
    { key: "scores", label: "语言 / GRE", presetLabel: "语言 / GRE 成绩与送分", category: "documents", pattern: /语言|GRE|送分|test score/i },
    { key: "lor", label: "推荐信", presetLabel: "推荐信分配与提交", category: "recommendations", pattern: /推荐信|recommendation|reference/i }
  ];

  function materialViewSwitch() {
    return `<div class="view-switch" role="group" aria-label="材料视图">${[["cards", "材料卡片"], ["matrix", "逐校矩阵"]].map(([mode, label]) => `<button class="button button-small ${ui.materialView === mode ? "button-primary" : "button-ghost"}" data-action="material-view" data-mode="${mode}" aria-pressed="${ui.materialView === mode}">${label}</button>`).join("")}</div>`;
  }

  function matrixChecklistItem(school, column) {
    return (school.application_checklist || []).find((item) => item.id.endsWith(`--check-${column.key}`) || column.pattern.test(item.label));
  }

  function renderMaterialMatrix() {
    const schools = [...state.schools].filter((school) => !ui.materialFilters.school || school.id === ui.materialFilters.school).sort((a, b) => a.name.localeCompare(b.name));
    const rows = schools.map((school) => `<tr><td><span class="school-name">${esc(school.name)}</span><span class="subline">${esc(school.department_track)} · ${esc(school.status)}</span></td>${MATERIAL_MATRIX_COLUMNS.map((column) => {
      const item = matrixChecklistItem(school, column);
      if (!item) return `<td class="material-matrix-cell"><button class="matrix-document untracked" data-action="add-matrix-item" data-school="${esc(school.id)}" data-column="${column.key}"><strong>＋ 未列入</strong><span>添加追踪</span></button></td>`;
      const document = item.document_id ? documentById(item.document_id) : null;
      return `<td class="material-matrix-cell"><button class="matrix-document" data-state="${esc(item.status)}" data-action="edit-checklist" data-school="${esc(school.id)}" data-id="${esc(item.id)}"><strong>${esc(CHECKLIST_LABELS[item.status] || item.status)}</strong><span>${item.verified ? "✓ 要求已核验" : "◇ 要求待核验"}</span>${document ? `<small>${esc(document.label)} · ${esc(document.version || DOCUMENT_LABELS[document.status])}</small>` : "<small>未关联材料</small>"}</button></td>`;
    }).join("")}</tr>`).join("");
    return `<div class="section-toolbar"><label class="filter-field"><span>学校</span><select data-filter="material-school"><option value="">全部学校</option>${schoolOptions(ui.materialFilters.school, null)}</select></label>${materialViewSwitch()}<button class="button button-primary" data-action="add-document">+ 添加材料</button></div><div class="panel-head"><div><h2>逐校材料要求矩阵</h2><p>由现有清单与材料关联生成，不建立重复数据库。点击单元格编辑要求、核验状态和材料版本；“未列入”可创建追踪项。</p></div><span class="panel-code">DERIVED VIEW</span></div>${schools.length ? `<div class="table-wrap"><table class="material-matrix-table"><thead><tr><th>学校 / 项目</th>${MATERIAL_MATRIX_COLUMNS.map((column) => `<th>${esc(column.label)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="note-box">当前筛选下没有学校。</div>'}`;
  }

  function renderMaterials() {
    return ui.materialView === "matrix" ? renderMaterialMatrix() : renderMaterialCards();
  }

  function renderMaterialCards() {
    const filters = ui.materialFilters;
    const needle = filters.search.trim().toLowerCase();
    const documents = state.documents.filter((document) => {
      const haystack = `${document.label} ${document.id} ${document.category} ${document.file_path} ${document.notes}`.toLowerCase();
      return (!needle || haystack.includes(needle)) && (!filters.status || document.status === filters.status) && (!filters.school || document.school_ids.includes(filters.school));
    }).sort((a, b) => String(b.updated_on || "").localeCompare(String(a.updated_on || "")) || a.label.localeCompare(b.label));
    const finalCount = state.documents.filter((document) => ["final", "submitted"].includes(document.status)).length;
    const missing = state.documents.filter((document) => document.status === "missing").length;
    const cards = documents.map((document) => {
      const schools = document.school_ids.length ? document.school_ids.map((id) => schoolById(id)?.name || id).join(" · ") : "通用材料";
      return `<article class="material-card"><div class="asset-head"><div><span class="eyebrow">${esc(document.category)}</span><h3>${esc(document.label)}</h3><span class="subline">${esc(document.id)}</span></div><span class="tag">${esc(DOCUMENT_LABELS[document.status] || document.status)}</span></div><div class="material-version"><strong>${esc(document.version || "—")}</strong><span>${esc(document.updated_on || "未记录更新日期")}</span></div><div class="local-path"><span>LOCAL PATH</span><code>${esc(document.file_path || "尚未填写本地路径")}</code></div><p class="subline">适用：${esc(schools)}</p><p>${esc(document.notes || "暂无备注")}</p><div class="document-controls"><select class="inline-input" data-action="document-status" data-id="${esc(document.id)}" aria-label="${esc(document.label)} 状态">${Object.entries(DOCUMENT_LABELS).map(([value, label]) => `<option value="${value}" ${document.status === value ? "selected" : ""}>${label}</option>`).join("")}</select><div class="table-actions"><button class="icon-button" data-action="copy-path" data-command="${esc(document.file_path || "")}" aria-label="复制 ${esc(document.label)} 本地路径" title="复制本地路径">⧉</button><button class="icon-button" data-action="toggle-pin" data-kind="document" data-id="${esc(document.id)}" aria-label="${state.settings.pinned_items.includes(`document:${document.id}`) ? "取消置顶" : "置顶"} ${esc(document.label)}" title="置顶到总览">${state.settings.pinned_items.includes(`document:${document.id}`) ? "★" : "☆"}</button><button class="icon-button" data-action="edit-document" data-id="${esc(document.id)}" aria-label="编辑 ${esc(document.label)}">✎</button><button class="icon-button" data-action="delete-document" data-id="${esc(document.id)}" aria-label="删除 ${esc(document.label)}">×</button></div></div></article>`;
    }).join("");
    return `<div class="outreach-summary"><div><span class="kpi-label">材料记录</span><strong>${state.documents.length}</strong></div><div><span class="kpi-label">已定稿 / 提交</span><strong>${finalCount}</strong></div><div><span class="kpi-label">缺失</span><strong class="${missing ? "status-critical" : ""}">${missing}</strong></div><div><span class="kpi-label">上传云端</span><strong>0</strong></div></div><div class="section-toolbar"><label class="filter-field search"><span>搜索材料</span><input data-focus-key="material-search" data-filter="material-search" value="${esc(filters.search)}" placeholder="名称、路径、类别或备注"></label><label class="filter-field"><span>状态</span><select data-filter="material-status"><option value="">全部状态</option>${Object.entries(DOCUMENT_LABELS).map(([value, label]) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="filter-field"><span>适用学校</span><select data-filter="material-school"><option value="">全部学校</option>${schoolOptions(filters.school, null)}</select></label>${materialViewSwitch()}<button class="button button-primary" data-action="add-document">+ 添加材料</button></div><div class="panel-head"><div><h2>本地材料索引</h2><p>只保存路径、版本与状态，不读取文件内容。文件本身仍需纳入你的私密备份；路径不会被自动验证为存在。</p></div><span class="panel-code">NO FILE UPLOAD</span></div>${cards ? `<div class="material-grid">${cards}</div>` : '<div class="empty-state"><span class="empty-symbol">⌑</span><h2>材料中心尚未建立</h2><p>添加成绩单、CV、论文、语言成绩等本地文件记录，再到逐校清单中关联材料。</p><button class="button button-primary" data-action="add-document">添加第一份材料</button></div>'}`;
  }

  function renderEssays() {
    const filters = ui.essayFilters;
    const needle = filters.search.trim().toLowerCase();
    const essays = state.essays.filter((essay) => {
      const school = schoolById(essay.school_id);
      const haystack = `${essay.title} ${essay.type} ${essay.content} ${school?.name || ""}`.toLowerCase();
      return (!needle || haystack.includes(needle)) && (!filters.status || essay.status === filters.status) && (!filters.school || essay.school_id === filters.school);
    }).sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
    const unresolved = state.essays.reduce((sum, essay) => sum + essay.reviews.filter((review) => !review.resolved).length, 0);
    const cards = essays.map((essay) => {
      const school = schoolById(essay.school_id);
      const lint = Modules.lintEssay(essay, school, state);
      const errors = lint.issues.filter((issue) => issue.severity === "error").length;
      const warnings = lint.issues.length - errors;
      const openReviews = essay.reviews.filter((review) => !review.resolved).length;
      return `<article class="essay-card"><div class="asset-head"><div><span class="eyebrow">${esc(essay.type)} / ${esc(school?.name || "通用母版")}</span><h3>${esc(essay.title)}</h3><span class="subline">更新 ${esc(String(essay.updated_at || "").slice(0, 16).replace("T", " ") || "—")}</span></div><span class="tag">${esc(ESSAY_LABELS[essay.status])}</span></div><div class="writing-metrics"><div><strong>${lint.stats.total}</strong><span>英文词 + CJK 字符</span></div><div><strong>${essay.word_limit || "∞"}</strong><span>字数上限</span></div><div><strong>${essay.versions.length}</strong><span>保存版本</span></div><div><strong>${openReviews}</strong><span>待处理意见</span></div></div><div class="lint-summary ${errors ? "has-errors" : ""}"><strong>${errors ? `${errors} 个阻止定稿问题` : "✓ 无阻止定稿问题"}</strong><span>${warnings} 个人工复核警告</span></div>${lint.issues.length ? `<ul class="lint-list">${lint.issues.slice(0, 3).map((issue) => `<li class="${issue.severity === "error" ? "status-critical" : ""}">${issue.severity === "error" ? "×" : "◇"} ${esc(issue.message)}</li>`).join("")}</ul>` : '<div class="note-box">当前静态检查未发现问题；事实准确性与语言质量仍需人工审阅。</div>'}<div class="detail-actions"><button class="button button-small button-primary" data-action="edit-essay" data-id="${esc(essay.id)}">继续写作</button><button class="button button-small button-ghost" data-action="essay-versions" data-id="${esc(essay.id)}">版本对比</button><button class="button button-small button-ghost" data-action="essay-reviews" data-id="${esc(essay.id)}">审阅 ${openReviews ? `(${openReviews})` : ""}</button><button class="button button-small button-ghost" data-action="toggle-pin" data-kind="essay" data-id="${esc(essay.id)}">${state.settings.pinned_items.includes(`essay:${essay.id}`) ? "★ 已置顶" : "☆ 置顶"}</button><button class="button button-small button-ghost button-danger" data-action="delete-essay" data-id="${esc(essay.id)}">删除</button></div></article>`;
    }).join("");
    return `<div class="outreach-summary"><div><span class="kpi-label">文书项目</span><strong>${state.essays.length}</strong></div><div><span class="kpi-label">已定稿 / 提交</span><strong>${state.essays.filter((essay) => ["final", "submitted"].includes(essay.status)).length}</strong></div><div><span class="kpi-label">待处理审阅</span><strong class="${unresolved ? "status-critical" : ""}">${unresolved}</strong></div><div><span class="kpi-label">自动云端润色</span><strong>关闭</strong></div></div><div class="section-toolbar"><label class="filter-field search"><span>搜索文书</span><input data-focus-key="essay-search" data-filter="essay-search" value="${esc(filters.search)}" placeholder="标题、正文、学校或类型"></label><label class="filter-field"><span>状态</span><select data-filter="essay-status"><option value="">全部状态</option>${Object.entries(ESSAY_LABELS).map(([value, label]) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label class="filter-field"><span>学校</span><select data-filter="essay-school"><option value="">全部学校</option>${schoolOptions(filters.school, null)}</select></label><button class="button button-primary" data-action="add-essay">+ 新建文书</button></div><div class="panel-head"><div><h2>版本化写作与人工审阅</h2><p>静态检查覆盖字数、占位符、错误入学季、跨校名称和证据提示；不调用 AI，也不替代导师或语言编辑。</p></div><span class="panel-code">LOCAL TEXT / VERSIONED</span></div>${cards ? `<div class="essay-grid">${cards}</div>` : '<div class="empty-state"><span class="empty-symbol">¶</span><h2>建立第一本文书</h2><p>可创建通用母版或逐校 SoP、PHS、CV、Research Statement 和项目短文。</p><button class="button button-primary" data-action="add-essay">新建文书</button></div>'}`;
  }

  function renderLor() {
    if (!state.schools.length) return emptyState("推荐信矩阵等待项目数据", "先导入或创建申请项目，再为每所学校分配推荐人。", false);
    const cards = state.recommenders.map((person) => {
      let assigned = 0;
      let submitted = 0;
      activeSchools().forEach((school) => {
        const entry = school.recommendations.assignments.find((assignment) => assignment.recommender_id === person.id);
        if (entry) {
          assigned += 1;
          if (entry.status === "submitted") submitted += 1;
        }
      });
      return `<article class="recommender-card"><div class="panel-head"><div><button class="text-button school-name" data-action="edit-recommender" data-id="${esc(person.id)}">${esc(person.display_name)}</button><span class="subline">${esc(person.name)}</span></div><button class="icon-button" data-action="delete-recommender" data-id="${esc(person.id)}" aria-label="删除 ${esc(person.display_name)}">×</button></div><div class="recommender-numbers"><div><strong>${submitted}</strong><span>已交</span></div><div><strong>${assigned - submitted}</strong><span>待交</span></div><div><strong>${assigned}</strong><span>总分配</span></div></div></article>`;
    }).join("");
    const rows = [...state.schools].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline)).map((school) => {
      const stats = lorStats(school);
      const cells = state.recommenders.map((person) => {
        const assignment = school.recommendations.assignments.find((entry) => entry.recommender_id === person.id);
        const status = assignment ? assignment.status : "unassigned";
        const symbol = status === "submitted" ? "✓" : status === "pending" ? "…" : "—";
        const label = status === "submitted" ? "已交" : status === "pending" ? "待交" : "未分配";
        return `<td class="matrix-cell"><button class="lor-toggle" data-action="cycle-lor" data-school="${esc(school.id)}" data-id="${esc(person.id)}" data-state="${status}" aria-label="${esc(`${school.name} / ${person.display_name}：${label}。点击切换状态`)}" title="${esc(`${label} · 点击：未分配 → 待交 → 已交 → 未分配`)}">${symbol}</button>${assignment?.submitted_on ? `<span class="matrix-date">${esc(assignment.submitted_on)}</span>` : ""}</td>`;
      }).join("");
      return `<tr><td><span class="school-name">${esc(school.name)}</span><span class="subline">${school.deadline_verified ? "" : "~"}${esc(formatDeadline(school.deadline, false))} · ${esc(school.status)}</span></td><td><input class="inline-input" style="width:58px" type="number" min="0" max="6" value="${stats.required}" data-action="lor-required" data-id="${esc(school.id)}" aria-label="${esc(school.name)} 推荐信要求数量"><span class="subline ${stats.gap ? "required-warning" : ""}">${stats.gap ? `缺 ${stats.gap} 人` : `${stats.assigned} 人`}</span></td>${cells}<td><span class="${stats.submitted >= stats.required ? "status-good" : "status-warning"}">${stats.submitted}/${stats.required}</span></td></tr>`;
    }).join("");
    return `<div class="section-toolbar"><div style="flex:1"><strong>三态矩阵：</strong><span class="subline">点击单元格依次切换「未分配 — → 待交 … → 已交 ✓」。切回未分配会清除该条提交日期。</span></div><button class="button button-primary" data-action="add-recommender">+ 添加推荐人</button></div><div class="matrix-summary">${cards || '<div class="note-box">尚未添加推荐人。</div>'}</div><div class="table-wrap"><table class="matrix-table"><thead><tr><th>学校 / 截止日</th><th>要求</th>${state.recommenders.map((person) => `<th>${esc(person.display_name)}</th>`).join("")}<th>已交 / 要求</th></tr></thead><tbody>${rows}</tbody></table></div><p class="subline" style="margin-top:12px">已交数量按当前勾选的推荐人计算；如某校允许额外推荐人，请将“要求”调整为实际数量。催交草稿由 <code>scripts/gen_lor_reminder.py</code> 按推荐人生成。</p>`;
  }

  function filteredPis() {
    const filters = ui.outreachFilters;
    const needle = filters.search.trim().toLowerCase();
    return allPis().filter(({ school, pi }) => {
      const haystack = `${school.name} ${pi.name} ${pi.lab} ${pi.recent_work_keywords.join(" ")}`.toLowerCase();
      return (!needle || haystack.includes(needle)) && (!filters.status || pi.contact.status === filters.status) && (!filters.dueOnly || followUpDue(pi));
    }).sort((a, b) => {
      if (followUpDue(a.pi) !== followUpDue(b.pi)) return followUpDue(a.pi) ? -1 : 1;
      return Date.parse(a.school.deadline) - Date.parse(b.school.deadline);
    });
  }

  function outreachModeSwitch() {
    return `<div class="view-switch outreach-mode-switch" role="group" aria-label="套磁研究视图">${[["radar", "◎ PI 雷达与对比"], ["contacts", "↗ 联系记录"]].map(([mode, label]) => `<button class="button button-small ${ui.outreachMode === mode ? "button-primary" : "button-ghost"}" data-action="outreach-mode" data-mode="${mode}" aria-pressed="${ui.outreachMode === mode}">${label}</button>`).join("")}</div>`;
  }

  function filteredRadarPis() {
    const filters = ui.piFilters;
    const needle = filters.search.trim().toLowerCase();
    return allPis().filter(({ school, pi }) => {
      const haystack = `${school.name} ${school.department_track} ${school.program_name} ${pi.name} ${pi.lab} ${pi.recent_work_keywords.join(" ")} ${pi.paper_title || ""}`.toLowerCase();
      return (!needle || haystack.includes(needle))
        && (!filters.region || school.region === filters.region)
        && (!filters.track || school.track_type === filters.track)
        && (!filters.admissions || pi.admissions_status === filters.admissions)
        && (!filters.verifiedOnly || pi.verification_status === "verified_official")
        && (!filters.shortlistedOnly || pi.shortlisted)
        && (!filters.paperOnly || (pi.paper_title && pi.paper_notes));
    }).sort((a, b) => Number(b.pi.shortlisted) - Number(a.pi.shortlisted) || (Number(b.pi.fit_score) || 0) - (Number(a.pi.fit_score) || 0) || a.school.name.localeCompare(b.school.name) || a.pi.name.localeCompare(b.pi.name));
  }

  function renderPiComparison() {
    pruneComparedPis();
    const pairs = [...ui.comparePis].map(piPairByKey).filter(Boolean);
    if (!pairs.length) return "";
    const chips = pairs.map(({ school, pi }) => `<span class="compare-chip"><strong>${esc(pi.name)}</strong><span>${esc(school.name)}</span><button class="icon-button" data-action="compare-pi" data-key="${esc(piKey(school.id, pi.id))}" aria-label="移除 ${esc(pi.name)} 的对比">×</button></span>`).join("");
    if (pairs.length < 2) return `<section class="comparison-panel"><div class="panel-head"><div><span class="eyebrow">HEAD-TO-HEAD / 1 OF 4</span><h2>再选择 1 位 PI 开始对比</h2><p>最多同时对比 4 位；选择只保留在当前会话，不会修改申请数据。</p></div><button class="button button-small button-ghost" data-action="clear-compare">清空</button></div><div class="compare-chips">${chips}</div></section>`;
    const row = (label, renderer) => `<tr><th scope="row">${esc(label)}</th>${pairs.map((pair) => `<td>${renderer(pair)}</td>`).join("")}</tr>`;
    return `<section class="comparison-panel"><div class="panel-head"><div><span class="eyebrow">HEAD-TO-HEAD / ${pairs.length} OF 4</span><h2>PI 研究匹配对比</h2><p>只比较当前记录中的证据。“未记录 / 待核验”不代表研究实力较弱，也不计算录取概率。</p></div><button class="button button-small button-ghost" data-action="clear-compare">清空对比</button></div><div class="compare-chips">${chips}</div><div class="table-wrap comparison-table-wrap"><table class="comparison-table"><thead><tr><th>对比维度</th>${pairs.map(({ school, pi }) => `<th><span class="school-name">${esc(pi.name)}</span><span class="subline">${esc(school.name)}</span></th>`).join("")}</tr></thead><tbody>
      ${row("项目 / Track", ({ school }) => `<strong>${esc(school.department_track)}</strong><span class="subline">${esc(school.track_type)} · ${esc(school.region)}</span>`)}
      ${row("主观匹配", ({ pi }) => `<strong class="comparison-value">${esc(pi.fit_score)}/5</strong><span class="subline">由你手动填写</span>`)}
      ${row("个人关键词命中", ({ pi }) => {
        const matches = Modules.researchKeywordMatches(pi, state.applicant);
        return matches.length ? `<div class="comparison-keywords">${matches.map((keyword) => `<span>${esc(keyword)}</span>`).join("")}</div>` : '<span class="subline">暂无重合；检查关键词是否完整</span>';
      })}
      ${row("PI 研究关键词", ({ pi }) => `<div class="comparison-keywords">${pi.recent_work_keywords.map((keyword) => `<span>${esc(keyword)}</span>`).join("")}</div>`)}
      ${row("具体论文证据", ({ pi }) => {
        const url = safeUrl(pi.paper_url);
        return pi.paper_title ? `${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(pi.paper_title)} ↗</a>` : `<strong>${esc(pi.paper_title)}</strong>`}<span class="subline">${pi.paper_notes ? "✓ 已记录阅读笔记" : "◇ 缺阅读笔记"}</span>` : '<span class="subline">未记录真正读过的论文</span>';
      })}
      ${row("个性化匹配论证", ({ pi }) => pi.fit_note ? `<p class="comparison-note">${esc(pi.fit_note)}</p>` : '<span class="subline">未记录</span>')}
      ${row("任职与招生", ({ pi }) => `<span class="${pi.verification_status === "verified_official" ? "status-good" : "status-warning"}">${pi.verification_status === "verified_official" ? "✓ 任职已官网核验" : "◇ 任职待核验"}</span><span class="subline">${esc(pi.last_verified || "无核验日期")}</span><strong class="comparison-status">${esc(ADMISSIONS_LABELS[pi.admissions_status] || "招生未知")}</strong>`)}
      ${row("套磁状态", ({ pi }) => `<strong>${esc(CONTACT_LABELS[pi.contact.status] || pi.contact.status)}</strong><span class="subline">${pi.contact.last_contacted ? `最近联系 ${esc(pi.contact.last_contacted)}` : "尚无真实发送记录"}</span>`)}
      ${row("研究操作", ({ school, pi }) => `<div class="detail-actions"><button class="button button-small button-ghost" data-action="edit-pi" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">研究笔记</button><button class="button button-small ${pi.shortlisted ? "button-primary" : "button-ghost"}" data-action="toggle-shortlist" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">${pi.shortlisted ? "✓ 已入 Shortlist" : "+ 加入 Shortlist"}</button></div>`)}
    </tbody></table></div></section>`;
  }

  function renderPiRadar() {
    const pairs = filteredRadarPis();
    const visiblePairs = pairs.slice(0, ui.piVisible);
    const all = allPis();
    const cards = visiblePairs.map(({ school, pi }) => {
      const key = piKey(school.id, pi.id);
      const selected = ui.comparePis.has(key);
      const compareDisabled = !selected && ui.comparePis.size >= 4;
      const matches = Modules.researchKeywordMatches(pi, state.applicant);
      const homepage = safeUrl(pi.homepage);
      return `<article class="radar-card ${selected ? "is-compared" : ""}"><div class="radar-card-head"><label class="compare-toggle ${compareDisabled ? "disabled" : ""}"><input type="checkbox" data-action="compare-pi" data-key="${esc(key)}" ${selected ? "checked" : ""} ${compareDisabled ? "disabled" : ""}><span>${selected ? "✓ 对比中" : "＋ 对比"}</span></label><span class="tag">${esc(school.track_type)}</span></div><span class="eyebrow">${esc(school.name)} / ${esc(school.department_track)}</span><h2>${esc(pi.name)}</h2><p class="radar-lab">${esc(pi.lab || "实验室待补充")}</p><div class="radar-fit"><span>主观匹配 <strong>${esc(pi.fit_score)}/5</strong></span><span>个人关键词命中 <strong>${matches.length}</strong></span></div><div class="comparison-keywords">${pi.recent_work_keywords.slice(0, 4).map((keyword) => `<span class="${Modules.researchKeywordMatches({ recent_work_keywords: [keyword] }, state.applicant).length ? "matched" : ""}">${esc(keyword)}</span>`).join("")}</div><div class="radar-evidence"><span>${pi.verification_status === "verified_official" ? "✓ 任职已核验" : "◇ 任职待核验"} · ${esc(ADMISSIONS_LABELS[pi.admissions_status] || "招生未知")}</span><span>${pi.paper_title && pi.paper_notes ? "✓ 有论文与阅读笔记" : "◇ 缺具体论文证据"}</span><span>${esc(CONTACT_LABELS[pi.contact.status] || pi.contact.status)}${pi.shortlisted_on ? ` · Shortlist ${esc(pi.shortlisted_on)}` : ""}</span></div><div class="radar-actions"><button class="button button-small ${pi.shortlisted ? "button-primary" : "button-ghost"}" data-action="toggle-shortlist" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">${pi.shortlisted ? "★ Shortlist" : "☆ 加入 Shortlist"}</button><button class="button button-small button-ghost" data-action="edit-pi" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">研究笔记</button>${homepage ? `<a class="button button-small button-ghost" href="${esc(homepage)}" target="_blank" rel="noopener noreferrer">主页 ↗</a>` : ""}</div></article>`;
    }).join("");
    return `<div class="outreach-summary"><div><span class="kpi-label">PI Longlist</span><strong>${all.length}</strong></div><div><span class="kpi-label">Shortlist</span><strong>${all.filter(({ pi }) => pi.shortlisted).length}</strong></div><div><span class="kpi-label">任职已核验</span><strong>${all.filter(({ pi }) => pi.verification_status === "verified_official").length}</strong></div><div><span class="kpi-label">具体论文已读</span><strong>${all.filter(({ pi }) => pi.paper_title && pi.paper_notes).length}</strong></div><div><span class="kpi-label">对比中</span><strong>${ui.comparePis.size}/4</strong></div></div>${outreachModeSwitch()}<div class="section-toolbar radar-toolbar"><label class="filter-field search"><span>搜索 PI / 学校 / 论文 / 关键词</span><input data-focus-key="pi-search" data-filter="pi-search" value="${esc(ui.piFilters.search)}" placeholder="例如 humanoid、retargeting、CMU"></label><label class="filter-field"><span>地区</span><select data-filter="pi-region"><option value="">全部地区</option>${["North America", "Asia", "Europe", "Other"].map((value) => `<option ${ui.piFilters.region === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="filter-field"><span>Track</span><select data-filter="pi-track"><option value="">全部 Track</option>${["CS", "Robotics", "ME"].map((value) => `<option ${ui.piFilters.track === value ? "selected" : ""}>${value}</option>`).join("")}</select></label><label class="filter-field"><span>招生状态</span><select data-filter="pi-admissions"><option value="">全部状态</option>${Object.entries(ADMISSIONS_LABELS).map(([value, label]) => `<option value="${value}" ${ui.piFilters.admissions === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><div class="radar-checks"><label class="check-label"><input type="checkbox" data-filter="pi-verified" ${ui.piFilters.verifiedOnly ? "checked" : ""}> 仅已核验</label><label class="check-label"><input type="checkbox" data-filter="pi-shortlisted" ${ui.piFilters.shortlistedOnly ? "checked" : ""}> 仅 Shortlist</label><label class="check-label"><input type="checkbox" data-filter="pi-paper" ${ui.piFilters.paperOnly ? "checked" : ""}> 仅有论文笔记</label></div></div>${renderPiComparison()}<div class="panel-head radar-results-head"><div><h2>${pairs.length} / ${all.length} 位 PI</h2><p>先比较研究证据，再加入 Shortlist；主观匹配和关键词命中都不是录取概率。</p></div><span class="panel-code">LOCAL RESEARCH CATALOG</span></div>${cards ? `<div class="radar-grid">${cards}</div><div class="radar-more"><span>显示 ${visiblePairs.length} / ${pairs.length} 位 PI</span><div class="panel-action-row">${ui.piVisible > 12 ? '<button class="button button-small button-ghost" data-action="pi-less">收起</button>' : ""}${visiblePairs.length < pairs.length ? `<button class="button button-small button-ghost" data-action="pi-more">再显示 ${Math.min(12, pairs.length - visiblePairs.length)} 位 ↓</button>` : ""}</div></div>` : '<div class="empty-state"><span class="empty-symbol">◎</span><h2>当前筛选没有 PI</h2><p>清除部分筛选条件，或到选校项目中添加新的研究记录。</p></div>'}`;
  }

  function renderOutreach() {
    return ui.outreachMode === "contacts" ? renderOutreachContacts() : renderPiRadar();
  }

  function renderOutreachContacts() {
    const pairs = filteredPis();
    const all = allPis();
    const due = all.filter(({ pi }) => followUpDue(pi)).length;
    const replied = all.filter(({ pi }) => ["replied", "meeting"].includes(pi.contact.status)).length;
    const sent = all.filter(({ pi }) => contacted(pi)).length;
    const rows = pairs.map(({ school, pi }) => {
      const command = `uv run python scripts/gen_cold_email.py --school "${school.id}" --pi "${pi.id}" --format both`;
      return `<tr><td><span class="school-name">${esc(pi.name)}</span><span class="subline">${esc(school.name)} · ${esc(school.department_track)}</span></td><td><span class="keyword-list">${esc(pi.recent_work_keywords.slice(0, 3).join(" · "))}</span><span class="subline">${pi.verification_status === "verified_official" ? "✓ 已核验" : "⚠ 发送前核验"} · ${esc(ADMISSIONS_LABELS[pi.admissions_status] || "招生未知")}</span>${pi.paper_title ? `<span class="paper-note">论文：${esc(pi.paper_title)}</span>` : '<span class="subline status-warning">缺具体论文阅读记录</span>'}${pi.fit_note ? '<span class="subline">✓ 已写个性化匹配论证</span>' : ""}${latestMeetingDate(pi) ? `<span class="subline">交流：${esc(latestMeetingDate(pi))}</span>` : ""}</td><td><select class="inline-input contact-select" data-action="contact-status" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">${CONTACT_STATUSES.map((status) => `<option value="${status}" ${pi.contact.status === status ? "selected" : ""}>${CONTACT_LABELS[status]}</option>`).join("")}</select>${followUpDue(pi) ? '<span class="subline status-critical">◆ Follow-up 到期</span>' : ""}</td><td><input type="date" class="inline-input date-input" value="${esc(pi.contact.last_contacted || "")}" data-action="contact-date" data-field="last_contacted" data-school="${esc(school.id)}" data-id="${esc(pi.id)}" aria-label="${esc(pi.name)} 最近联系日期"></td><td><input type="date" class="inline-input date-input" value="${esc(pi.contact.next_follow_up || "")}" data-action="contact-date" data-field="next_follow_up" data-school="${esc(school.id)}" data-id="${esc(pi.id)}" aria-label="${esc(pi.name)} Follow-up 日期"></td><td><div class="table-actions"><button class="button button-small button-ghost" data-action="email-draft" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">草稿 ${pi.contact.draft_versions.length ? `(${pi.contact.draft_versions.length})` : ""}</button><button class="button button-small button-ghost" data-action="interactions" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">交流 ${pi.contact.history.length ? `(${pi.contact.history.length})` : ""}</button><button class="button button-small button-ghost" data-action="mark-sent" data-school="${esc(school.id)}" data-id="${esc(pi.id)}">${pi.contact.status === "not_started" || pi.contact.status === "drafted" ? "标记已发" : "再次联系"}</button><button class="icon-button" data-action="copy-command" data-command="${esc(command)}" aria-label="复制套磁生成命令" title="复制 CLI 套磁草稿命令">⧉</button><button class="icon-button" data-action="edit-pi" data-school="${esc(school.id)}" data-id="${esc(pi.id)}" aria-label="编辑 ${esc(pi.name)}">✎</button></div></td></tr>`;
    }).join("");
    return `${outreachModeSwitch()}<div class="outreach-summary"><div><span class="kpi-label">目标 PI</span><strong>${all.length}</strong></div><div><span class="kpi-label">已触达</span><strong>${sent}</strong></div><div><span class="kpi-label">回复 / 交流</span><strong>${replied}</strong></div><div><span class="kpi-label">Follow-up 到期</span><strong class="${due ? "status-critical" : ""}">${due}</strong></div><div><span class="kpi-label">具体论文已读</span><strong>${all.filter(({ pi }) => pi.paper_title && pi.paper_notes).length}</strong></div></div>${due ? `<div class="due-banner"><strong>◆ ${due} 个 Follow-up 已到期。</strong> 先生成简短提醒草稿，确认前一封邮件已真实发送且未收到回复。</div>` : ""}<div class="section-toolbar"><label class="filter-field search"><span>搜索 PI / 学校 / 关键词</span><input data-focus-key="outreach-search" data-filter="outreach-search" value="${esc(ui.outreachFilters.search)}" placeholder="例如 whole-body、CMU"></label><label class="filter-field"><span>联系状态</span><select data-filter="outreach-status"><option value="">全部状态</option>${CONTACT_STATUSES.map((status) => `<option value="${status}" ${ui.outreachFilters.status === status ? "selected" : ""}>${CONTACT_LABELS[status]}</option>`).join("")}</select></label><label class="check-label" style="padding-bottom:8px"><input type="checkbox" data-filter="outreach-due" ${ui.outreachFilters.dueOnly ? "checked" : ""}> 仅看到期 Follow-up</label></div><div class="panel-head"><div><h2>${pairs.length} 条联系记录</h2><p>⧉ 复制对应 CLI 命令，在项目根目录生成 Markdown / HTML 草稿。浏览器不会自动发信。</p></div><span class="panel-code">DEFAULT FOLLOW-UP: ${esc(state.settings.follow_up_after_days)}D</span></div>${pairs.length ? `<div class="table-wrap"><table><thead><tr><th>PI / 项目</th><th>研究准备 / 招生</th><th>状态</th><th>最近联系</th><th>下次 Follow-up</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="note-box">当前筛选下没有 PI 记录。可在选校看板展开学校后添加。</div>'}`;
  }

  function renderBudget() {
    const totals = budgetTotals();
    const tierRows = ["Reach", "Match", "Safe / Pivot"].map((tier) => ({ label: tier, value: activeSchools().filter((school) => school.tier === tier).reduce((sum, school) => sum + schoolCost(school), 0) }));
    const fixedRows = state.budget_items.map((item) => `<div class="fixed-budget-row"><input type="checkbox" data-action="budget-item-enabled" data-id="${esc(item.id)}" ${item.enabled ? "checked" : ""} aria-label="启用 ${esc(item.label)}"><label>${esc(item.label)}</label><input type="number" class="inline-input" min="0" step="0.01" value="${Number(item.amount_usd) || 0}" data-action="budget-item-amount" data-id="${esc(item.id)}" aria-label="${esc(item.label)} 美元金额"><span class="budget-category subline">${esc(item.category)}</span><button class="icon-button" data-action="delete-budget-item" data-id="${esc(item.id)}" aria-label="删除 ${esc(item.label)}">×</button></div>`).join("");
    const schoolRows = [...state.schools].sort((a, b) => Date.parse(a.deadline) - Date.parse(b.deadline)).map((school) => `<tr><td><span class="school-name">${esc(school.name)}</span><span class="subline">${esc(school.status)} · ${esc(school.tier)}</span></td><td><input type="number" class="inline-input numeric" min="0" step="0.01" value="${Number(school.budget.application_fee_usd) || 0}" data-action="school-budget" data-field="application_fee_usd" data-id="${esc(school.id)}" aria-label="${esc(school.name)} 申请费"></td><td><input type="number" class="inline-input numeric" min="0" step="0.01" value="${Number(school.budget.score_report_usd) || 0}" data-action="school-budget" data-field="score_report_usd" data-id="${esc(school.id)}" aria-label="${esc(school.name)} 送分费"></td><td><input type="number" class="inline-input numeric" min="0" step="0.01" value="${Number(school.budget.other_usd) || 0}" data-action="school-budget" data-field="other_usd" data-id="${esc(school.id)}" aria-label="${esc(school.name)} 其他费用"></td><td><input type="checkbox" data-action="school-waiver" data-id="${esc(school.id)}" ${school.budget.fee_waiver ? "checked" : ""} aria-label="${esc(school.name)} 申请费减免"></td><td class="numeric"><strong>${money(schoolCost(school))}</strong></td></tr>`).join("");
    return `<div class="budget-hero"><section class="budget-total"><span class="hero-kicker">ESTIMATED APPLICATION PORTFOLIO</span><div class="amount">${money(totals.total)}</div><div class="budget-cny">约 ¥${totals.cny.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} CNY</div><div class="budget-breakdown"><div><strong>${money(totals.schoolTotal)}</strong><span>学校相关费用</span></div><div><strong>${money(totals.fixedTotal)}</strong><span>考试 / 材料 / 半 DIY 服务</span></div></div></section><section class="budget-controls"><span class="eyebrow">PLANNING ASSUMPTIONS</span><h2>预算口径</h2><p class="subline">统计所有非 Closed 项目；Fee waiver 只免除申请费，不免除送分及其他费用。金额均为规划值，请以支付页面为准。</p><label>规划汇率（CNY / USD）<input type="number" min="0.01" step="0.01" value="${esc(state.settings.cny_per_usd)}" data-action="settings-field" data-field="cny_per_usd"></label><p class="subline" style="margin-top:12px">半 DIY 服务默认金额为 0 且未启用。若使用润色、咨询或材料服务，请修改对应条目，不涉及任何云端支付。</p></section></div><div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>固定与可选支出</h2><p>勾选纳入预算，可添加自己的半 DIY 项目。</p></div><span class="panel-code">FIXED COSTS</span></div>${fixedRows}<form id="add-budget-form" class="add-budget-form"><input name="label" required placeholder="新支出名称" aria-label="新支出名称"><input name="amount" type="number" min="0" step="0.01" value="0" required aria-label="金额"><select name="category" aria-label="类别"><option value="testing">testing</option><option value="documents">documents</option><option value="services">services</option><option value="other">other</option></select><button class="button button-small button-ghost" type="submit">+ 添加</button></form></section><section class="panel"><div class="panel-head"><div><h2>学校费用 / Tier</h2><p>单一蓝色编码金额，不代表学校层级。</p></div><span class="panel-code">FIG. 03</span></div>${horizontalBarChart("budget-chart", "各层级学校费用", tierRows, () => "var(--series-1)", money)}</section></div><div class="table-wrap"><table><thead><tr><th>学校</th><th class="numeric">申请费 USD</th><th class="numeric">送分 USD</th><th class="numeric">其他 USD</th><th>Fee waiver</th><th class="numeric">小计</th></tr></thead><tbody>${schoolRows}</tbody></table></div>`;
  }

  function visaRecordForSchool(school) {
    const needle = String(school.country || "").trim().toLowerCase();
    if (!needle) return null;
    return state.visa_records.find((record) => String(record.country || "").trim().toLowerCase() === needle) || null;
  }

  function visaStatusSelect(action, id, current) {
    return `<select class="inline-input" data-action="${action}" data-id="${esc(id)}">${Object.entries(VISA_STATUS_LABELS).map(([value, label]) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`).join("")}</select>`;
  }

  function ratingDots(rating, label) {
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1) return '<span class="subline">未评价</span>';
    const value = Number(rating);
    return `<span class="fit-score" aria-label="${esc(label)} ${value}/5">${"◆".repeat(value)}${"◇".repeat(5 - value)}</span>`;
  }

  function renderVisa() {
    const records = state.visa_records;
    const approved = records.filter((record) => record.status === "approved").length;
    const unverified = records.filter((record) => !record.verified).length;
    const schoolsPrepared = state.schools.filter((school) => school.visa.status !== "not_started").length;
    const cards = records.map((record) => {
      const source = safeUrl(record.source_url);
      return `<article class="panel visa-record-card">
        <div class="panel-head"><div><h3>${esc(record.country)} · ${esc(record.visa_type)}</h3><p>${record.verified ? `✓ 已按官方来源核验 ${esc(record.last_verified || "")}` : "◇ 政策调研待核验"}${source ? ` · <a href="${esc(source)}" target="_blank" rel="noopener noreferrer">官方来源 ↗</a>` : ""}</p></div>
        <div class="detail-actions"><button class="icon-button" data-action="edit-visa" data-id="${esc(record.id)}" aria-label="编辑 ${esc(record.country)} 签证记录">✎</button><button class="icon-button" data-action="delete-visa" data-id="${esc(record.id)}" aria-label="删除 ${esc(record.country)} 签证记录">×</button></div></div>
        <div class="visa-record-fields">
          <label class="inline-field"><span>整体状态</span>${visaStatusSelect("visa-status", record.id, record.status)}</label>
          <label class="inline-field"><span>官方费用 USD</span><input type="number" class="inline-input" min="0" step="0.01" value="${Number(record.application_fee_usd) || 0}" data-action="visa-fee" data-id="${esc(record.id)}" aria-label="${esc(record.country)} 签证官方费用"></label>
          <label class="check-label"><input type="checkbox" data-action="visa-verified" data-id="${esc(record.id)}" ${record.verified ? "checked" : ""}> 已人工核验</label>
        </div>
        ${record.timeline_notes ? `<p><strong>流程时间线</strong><span class="subline">${esc(record.timeline_notes)}</span></p>` : ""}
        ${record.policy_notes ? `<p><strong>政策观察</strong><span class="subline">${esc(record.policy_notes)}</span></p>` : ""}
        ${record.documents_notes ? `<p><strong>材料清单</strong><span class="subline">${esc(record.documents_notes)}</span></p>` : ""}
        ${record.notes ? `<p class="subline">${esc(record.notes)}</p>` : ""}
      </article>`;
    }).join("");
    const rows = [...state.schools].sort((a, b) => a.name.localeCompare(b.name)).map((school) => {
      const record = visaRecordForSchool(school);
      const officeUrl = safeUrl(school.visa.source_url);
      return `<tr><td><span class="school-name">${esc(school.name)}</span><span class="subline">${esc(school.country)} · ${esc(school.status)}</span></td>
        <td>${record ? `<span class="tag tag-match">${esc(record.visa_type)}</span>` : '<span class="subline status-warning">无匹配国家记录</span>'}</td>
        <td>${visaStatusSelect("school-visa-status", school.id, school.visa.status)}</td>
        <td><input type="text" class="inline-input" value="${esc(school.visa.notes)}" data-action="school-visa-field" data-field="notes" data-id="${esc(school.id)}" placeholder="I-20 / 签证标签进度等" aria-label="${esc(school.name)} 签证行政笔记"></td>
        <td><input type="url" class="inline-input" value="${esc(school.visa.source_url)}" data-action="school-visa-field" data-field="source_url" data-id="${esc(school.id)}" placeholder="国际学生办公室页面" aria-label="${esc(school.name)} 签证官方页面">${officeUrl ? `<a href="${esc(officeUrl)}" target="_blank" rel="noopener noreferrer">↗</a>` : ""}</td></tr>`;
    }).join("");
    return `<div class="panel" style="margin-bottom:18px;border-left:3px solid var(--warning)"><h2>政策调研，不是法律或移民建议</h2><p class="subline" style="margin-bottom:0">签证与入境政策随时可能变化，且因个人情况而异。本页只保存你自己的调研记录、来源链接与核验状态；行动前一切以使领馆、移民局与学校国际学生办公室的官方通知为准。</p></div>
      <div class="outreach-summary"><div><span class="kpi-label">国家 / 地区记录</span><strong>${records.length}</strong></div><div><span class="kpi-label">已获签</span><strong>${approved}</strong></div><div><span class="kpi-label">待人工核验</span><strong class="${unverified ? "status-warning" : ""}">${unverified}</strong></div><div><span class="kpi-label">已启动行前准备的学校</span><strong>${schoolsPrepared}/${state.schools.length}</strong></div></div>
      <div class="panel-head"><div><h2>按国家 / 地区的签证与政策记录</h2><p>每个国家一条记录：流程时间线、政策观察、材料清单与官方来源；状态与费用可在此直接修改。</p></div><button class="button button-primary" data-action="add-visa">+ 添加国家记录</button></div>
      ${cards ? `<div class="visa-record-grid">${cards}</div>` : '<div class="note-box">尚无签证记录。点击右上角按国家添加，先覆盖你实际会入读的国家。</div>'}
      <div class="panel-head"><div><h2>逐校签证进度</h2><p>学校按国家自动匹配签证记录；这里记录每所学校自己的行政进度（如 I-20 签发、签证标签寄送）。</p></div><span class="panel-code">BY SCHOOL</span></div>
      ${state.schools.length ? `<div class="table-wrap"><table><thead><tr><th>学校</th><th>匹配签证类型</th><th>该校进度</th><th>行政笔记</th><th>学校官方页面</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="note-box">尚无学校；先在选校与清单中添加项目。</div>'}`;
  }

  function renderCampus() {
    const schools = [...state.schools].sort((a, b) => (Number(b.campus.living_cost_monthly_usd) || 0) - (Number(a.campus.living_cost_monthly_usd) || 0));
    const recorded = schools.filter((school) => Number(school.campus.living_cost_monthly_usd) > 0);
    const average = recorded.length ? Math.round(recorded.reduce((sum, school) => sum + Number(school.campus.living_cost_monthly_usd), 0) / recorded.length) : 0;
    const verified = schools.filter((school) => school.campus.verified).length;
    const costRows = schools.slice(0, 12).map((school) => ({ label: school.name, value: Number(school.campus.living_cost_monthly_usd) || 0 }));
    const rows = schools.map((school) => {
      const campus = school.campus;
      const source = safeUrl(campus.source_url);
      return `<tr><td><span class="school-name">${esc(school.name)}</span><span class="subline">${esc(school.country)} · ${esc(school.department_track)}</span></td>
        <td><span class="subline">${esc(campus.environment_notes || "待调研")}</span>${ratingDots(campus.environment_rating, "环境评价")}</td>
        <td><input type="number" class="inline-input numeric" min="0" step="10" value="${Number(campus.living_cost_monthly_usd) || 0}" data-action="campus-cost" data-id="${esc(school.id)}" aria-label="${esc(school.name)} 预估月生活成本"></td>
        <td><span class="subline">${esc(campus.housing_notes || "待调研")}</span></td>
        <td>${ratingDots(campus.safety_rating, "安全评价")}<span class="subline">${esc(campus.safety_notes || "待调研")}</span></td>
        <td>${campus.verified ? `<span class="status-good subline">✓ 已核验 ${esc(campus.last_verified || "")}</span>` : '<span class="subline status-warning">◇ 待核验</span>'}${source ? `<a href="${esc(source)}" target="_blank" rel="noopener noreferrer">来源 ↗</a>` : ""}</td>
        <td><div class="table-actions"><button class="button button-small button-ghost" data-action="edit-campus" data-id="${esc(school.id)}">编辑调研</button></div></td></tr>`;
    }).join("");
    return `<div class="panel" style="margin-bottom:18px;border-left:3px solid var(--warning)"><h2>个人调研，不是官方统计</h2><p class="subline" style="margin-bottom:0">生活成本与安全评价是你的个人规划记录：金额为规划估计，安全结论请基于 Clery 年报、校方安全通报等一手来源，并在访问学校时实地核实。未核验条目不会显示 ✓。</p></div>
      <div class="outreach-summary"><div><span class="kpi-label">已记录成本学校</span><strong>${recorded.length}/${schools.length}</strong></div><div><span class="kpi-label">平均月成本</span><strong>${money(average)}</strong></div><div><span class="kpi-label">成本区间</span><strong>${recorded.length ? `${money(Math.min(...recorded.map((school) => Number(school.campus.living_cost_monthly_usd))))} – ${money(Math.max(...recorded.map((school) => Number(school.campus.living_cost_monthly_usd))))}` : "—"}</strong></div><div><span class="kpi-label">已核验调研</span><strong class="${verified < schools.length ? "status-warning" : ""}">${verified}/${schools.length}</strong></div></div>
      <div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>月生活成本对比（Top 12）</h2><p>单一蓝色编码金额，只表示你自己记录的规划值；完整数据见随附数据表。</p></div><span class="panel-code">FIG. 04</span></div>${horizontalBarChart("campus-chart", "各校预估月生活成本", costRows, () => "var(--series-1)", money)}</section></div>
      <div class="panel-head"><div><h2>校园环境 · 成本 · 住宿 · 安全对比</h2><p>月成本可直接在此修改；环境和安全笔记、评分与来源在「编辑调研」中维护。</p></div><span class="panel-code">COMPARISON</span></div>
      ${schools.length ? `<div class="table-wrap"><table><thead><tr><th>学校</th><th>环境</th><th class="numeric">月成本 USD</th><th>住宿</th><th>安全</th><th>核验</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="note-box">尚无学校；先在选校与清单中添加项目。</div>'}`;
  }

  function renderAssets() {
    const cards = state.assets.map((asset) => {
      const url = safeUrl(asset.url);
      return `<article class="asset-card ${asset.verified ? "verified" : "unverified"}"><div class="asset-head"><div><h3>${esc(asset.label)}</h3><span class="subline">${esc(asset.id)}</span></div><span class="asset-state ${asset.verified ? "status-good" : "status-warning"}">${asset.verified ? "✓ VERIFIED" : "◆ CHECK REQUIRED"}</span></div><label><span class="sr-only">${esc(asset.label)} URL</span><input type="url" value="${esc(asset.url)}" data-action="asset-url" data-id="${esc(asset.id)}" placeholder="https://..."></label><label class="asset-check"><input type="checkbox" data-action="asset-verified" data-id="${esc(asset.id)}" ${asset.verified ? "checked" : ""}> 我已人工验证公开可访问</label><span class="subline">${asset.last_checked ? `最近人工核验：${esc(asset.last_checked)}` : "尚无人工核验日期"}</span>${url ? `<div class="detail-actions"><a class="button button-small button-ghost" href="${esc(url)}" target="_blank" rel="noopener noreferrer">打开并检查 ↗</a></div>` : '<span class="subline status-critical">请输入有效 HTTP(S) URL</span>'}<p>${esc(asset.note || "")}</p></article>`;
    }).join("");
    let backupAvailable = false;
    try { backupAvailable = Boolean(localStorage.getItem(BACKUP_KEY)); } catch (_) { backupAvailable = false; }
    return `<div class="panel" style="margin-bottom:18px;border-left:3px solid var(--warning)"><h2>套磁与网申前的 Pre-flight Check</h2><p class="subline" style="margin-bottom:0">浏览器受 CORS 与平台登录策略限制，不会伪造“链接可访问”的自动检测结果。请退出账号后人工打开链接，确认无 404、权限墙或地区限制，再勾选核验。修改 URL 会自动清除旧核验状态。</p></div><div class="asset-grid">${cards || '<div class="note-box">尚未配置学术资产。</div>'}</div><div class="settings-grid"><section class="panel"><div class="panel-head"><div><h2>申请人与周期</h2><p>此处写入看板 JSON；SoP/邮件 CLI 的权威个人资料仍是 profile.private.yaml。</p></div><span class="panel-code">PROFILE</span></div><div class="settings-form"><label>姓名<input value="${esc(state.applicant.name)}" data-action="profile-field" data-field="name"></label><label>邮箱<input type="email" value="${esc(state.applicant.email)}" data-action="profile-field" data-field="email"></label><label>GPA<input type="number" min="0" step="0.01" value="${esc(state.applicant.gpa ?? "")}" data-action="applicant-number" data-field="gpa"></label><label>GPA 分制<input type="number" min="0.01" step="0.1" value="${esc(state.applicant.gpa_scale || 4)}" data-action="applicant-number" data-field="gpa_scale"></label><label>科研年限<input type="number" min="0" step="0.5" value="${esc(state.applicant.research_years ?? "")}" data-action="applicant-number" data-field="research_years"></label><label>论文 / 预印本数（已核实）<input type="number" min="0" step="1" value="${esc(state.applicant.publication_count ?? "")}" data-action="applicant-number" data-field="publication_count"></label><label class="span-2">个人研究关键词（逗号分隔）<input value="${esc(state.applicant.research_keywords.join(", "))}" data-action="applicant-keywords" placeholder="humanoid, sim-to-real, visuomotor policy"></label><label>目标入学季<input value="${esc(state.cycle.target_term)}" data-action="cycle-field" data-field="target_term" placeholder="2028 Fall"></label><label>看板显示时区<input value="${esc(state.cycle.timezone)}" data-action="cycle-field" data-field="timezone" placeholder="Asia/Shanghai"></label><label>Follow-up 等待天数<input type="number" min="1" max="90" value="${esc(state.settings.follow_up_after_days)}" data-action="settings-field" data-field="follow_up_after_days"></label><label>Deadline 预警窗口（天）<input type="number" min="1" max="365" value="${esc(state.settings.deadline_warning_days)}" data-action="settings-field" data-field="deadline_warning_days"></label></div></section><section class="panel"><div class="panel-head"><div><h2>本地数据管理</h2><p>导入会替换当前工作区；替换前自动保留一个浏览器恢复点。</p></div><span class="panel-code">LOCAL STORAGE</span></div><div class="settings-form"><div class="note-box">当前来源：${esc(ui.source)}<br>学校 ${state.schools.length} · PI ${allPis().length} · 推荐人 ${state.recommenders.length}<br>材料 ${state.documents.length} · 任务 ${state.tasks.length} · 文书 ${state.essays.length}<br>本地估算大小 ${(JSON.stringify(state).length / 1024).toFixed(1)} KB</div><button class="button button-primary" data-action="export">导出完整 JSON 备份</button><button class="button button-ghost" data-action="import">导入并替换工作区</button>${window.GRADPILOT_DATA ? '<button class="button button-ghost" data-action="reload-sync">重新载入 dashboard/data.js</button>' : ""}${backupAvailable ? '<button class="button button-ghost" data-action="restore-backup">恢复替换前恢复点</button>' : ""}<label class="check-label"><input type="checkbox" data-action="toggle-textures" ${state.settings.chart_textures ? "checked" : ""}> 图表纹理辅助（打印 / 色觉辅助）</label></div></section></div><section class="panel danger-zone"><h2>清空浏览器工作区</h2><p class="subline">此操作只清空看板数据，不删除项目目录中的 JSON/YAML。操作前会保留恢复点，但仍建议先导出。</p><button class="button button-ghost button-danger" data-action="reset-empty">清空并返回空白工作区</button></section>`;
  }

  function renderGlobalNotice() {
    const unverified = state.assets.filter((asset) => !asset.verified);
    const alert = document.getElementById("global-alert");
    if (unverified.length && (allPis().some(({ pi }) => contacted(pi)) || activeSchools().some((school) => daysTo(school.deadline) <= 60))) {
      alert.innerHTML = `<strong>◆ Pre-flight：</strong>${unverified.length} 项主页 / PDF / 视频尚未人工核验。套磁或网申前请完成公开访问检查。<button class="text-button" data-action="navigate" data-view="assets">立即检查 →</button>`;
      alert.hidden = false;
    } else {
      alert.hidden = true;
    }
    const notice = document.getElementById("source-notice");
    const messages = [];
    if (ui.storageWarning) messages.push(ui.storageWarning);
    if (ui.source === "sync") messages.push("已载入 dashboard/data.js；此后的浏览器修改以 localStorage 为准。重新同步文件后，请在「资产与设置」中显式重新载入。");
    if (ui.source === "local") messages.push("正在使用此浏览器的自动保存工作区。CLI 修改 JSON 后不会覆盖浏览器修改，需重新导入或显式载入同步文件。");
    if (state.schools.some((school) => !school.deadline_verified) || (!state.schools.length && state.cycle.deadlines_are_estimated)) messages.push("预置截止日与费用是 2028 Fall 规划估计，带 ~ 的日期必须到项目官网核验。");
    if (messages.length) {
      notice.textContent = messages.join(" ");
      notice.hidden = false;
    } else {
      notice.hidden = true;
    }
  }

  function render(preserveFocus = false) {
    const active = preserveFocus ? document.activeElement : null;
    const focusKey = active?.dataset?.focusKey;
    const selection = focusKey && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
    document.getElementById("cycle-chip").textContent = String(state.cycle.target_term || "2028 Fall").toUpperCase();
    document.getElementById("view-eyebrow").textContent = VIEW_META[ui.view][0];
    document.getElementById("view-title").textContent = VIEW_META[ui.view][1];
    document.querySelectorAll(".nav-item").forEach((button) => {
      const selected = button.dataset.view === ui.view;
      button.classList.toggle("active", selected);
      if (selected) button.setAttribute("aria-current", "page"); else button.removeAttribute("aria-current");
    });
    document.querySelectorAll(".view-panel").forEach((panel) => {
      const selected = panel.id === `view-${ui.view}`;
      panel.hidden = !selected;
      panel.classList.toggle("active", selected);
    });
    renderGlobalNotice();
    const renderers = { overview: renderOverview, season: renderSeason, tasks: renderTasks, applications: renderApplications, materials: renderMaterials, essays: renderEssays, lor: renderLor, outreach: renderOutreach, budget: renderBudget, visa: renderVisa, campus: renderCampus, assets: renderAssets };
    document.getElementById(`view-${ui.view}`).innerHTML = renderers[ui.view]();
    if (focusKey) {
      const replacement = document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`);
      if (replacement) {
        replacement.focus();
        if (selection && typeof replacement.setSelectionRange === "function") replacement.setSelectionRange(...selection);
      }
    }
  }

  function navigate(view) {
    if (!VIEW_META[view]) return;
    ui.view = view;
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(message) {
    const element = document.getElementById("toast");
    element.textContent = message;
    element.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => element.classList.remove("show"), 3400);
  }

  function openDialog(id) {
    const dialog = document.getElementById(id);
    if (!dialog.open) dialog.showModal();
  }

  function closeDialog(id) {
    document.getElementById(id).close();
  }

  function openSchool(id = "", duplicate = false) {
    const form = document.getElementById("school-form");
    form.reset();
    const school = id ? schoolById(id) : null;
    document.getElementById("school-dialog-title").textContent = duplicate ? "复制为新申请 Track" : school ? "编辑申请项目" : "添加申请项目";
    form.elements.original_id.value = school && !duplicate ? id : "";
    form.dataset.duplicateId = duplicate ? id : "";
    form.elements.id.readOnly = Boolean(school && !duplicate);
    const values = school ? clone(school) : {
      name: "", id: "", tier: "Match", track_type: "CS", region: "North America", country: "United States", department_track: "CS", program_name: "", deadline: "2027-12-15T23:59:00-05:00", deadline_verified: false, status: "Researching", portal_url: "", application_id: "", submission_date: null, interview_date: null, aliases: [], notes: "", budget: { application_fee_usd: 90, score_report_usd: 25 }, recommendations: { required: 3 }
    };
    for (const field of ["name", "tier", "track_type", "region", "country", "department_track", "program_name", "status", "portal_url", "notes"]) form.elements[field].value = values[field] || "";
    form.elements.id.value = duplicate ? "" : values.id;
    form.elements.aliases.value = (values.aliases || []).join(", ");
    form.elements.deadline_local.value = String(values.deadline).slice(0, 16);
    form.elements.deadline_offset.value = String(values.deadline).slice(-6);
    form.elements.application_id.value = values.application_id || "";
    form.elements.submission_date.value = values.submission_date || "";
    form.elements.interview_date.value = values.interview_date || "";
    form.elements.deadline_verified.checked = duplicate ? false : Boolean(values.deadline_verified);
    if (duplicate) form.elements.status.value = "Researching";
    form.elements.application_fee_usd.value = Number(values.budget.application_fee_usd) || 0;
    form.elements.score_report_usd.value = Number(values.budget.score_report_usd) || 0;
    form.elements.lor_required.value = Number(values.recommendations.required) || 0;
    const funding = values.funding || {};
    const policy = values.application_policy || {};
    const decision = values.decision || {};
    form.elements.funding_types.value = (funding.types || []).join(", ");
    form.elements.funding_consideration.value = funding.consideration || "unknown";
    form.elements.funding_deadline.value = funding.deadline || "";
    form.elements.funding_source_url.value = funding.source_url || "";
    form.elements.funding_verified.checked = Boolean(funding.verified);
    form.elements.funding_notes.value = funding.notes || "";
    form.elements.supervisor_contact.value = policy.supervisor_contact || "unknown";
    form.elements.interview_requirement.value = policy.interview || "unknown";
    form.elements.policy_source_url.value = policy.source_url || "";
    form.elements.policy_verified.checked = Boolean(policy.verified);
    form.elements.decision_date.value = decision.decision_date || "";
    form.elements.response_deadline.value = decision.response_deadline || "";
    form.elements.close_reason.value = decision.close_reason || "";
    form.elements.decision_notes.value = decision.notes || "";
    if (duplicate) {
      form.elements.funding_verified.checked = false;
      form.elements.policy_verified.checked = false;
      for (const field of ["decision_date", "response_deadline", "close_reason", "decision_notes"]) form.elements[field].value = "";
      for (const field of ["application_id", "submission_date", "interview_date"]) form.elements[field].value = "";
    }
    openDialog("school-dialog");
  }

  function openPi(schoolId, piId = "") {
    const school = schoolById(schoolId);
    if (!school) return;
    const pi = piId ? piById(school, piId) : null;
    const form = document.getElementById("pi-form");
    form.reset();
    document.getElementById("pi-dialog-title").textContent = pi ? `编辑 ${pi.name}` : `为 ${school.name} 添加 PI`;
    form.elements.school_id.value = schoolId;
    form.elements.original_id.value = piId;
    form.elements.id.readOnly = Boolean(pi);
    form.elements.name.value = pi?.name || "";
    form.elements.id.value = pi?.id || "";
    form.elements.lab.value = pi?.lab || "";
    form.elements.recent_work_keywords.value = (pi?.recent_work_keywords || []).join(", ");
    form.elements.homepage.value = pi?.homepage || "";
    form.elements.email.value = pi?.email || "";
    form.elements.fit_score.value = pi?.fit_score || 4;
    form.elements.verification_status.value = pi?.verification_status || "needs_2026_review";
    form.elements.admissions_status.value = pi?.admissions_status || "unknown";
    form.elements.last_verified.value = pi?.last_verified || "";
    form.elements.shortlisted.checked = Boolean(pi?.shortlisted);
    form.elements.paper_title.value = pi?.paper_title || "";
    form.elements.paper_url.value = pi?.paper_url || "";
    form.elements.paper_notes.value = pi?.paper_notes || "";
    form.elements.fit_note.value = pi?.fit_note || "";
    form.elements.contact_notes.value = pi?.contact?.notes || "";
    if (!["applications", "outreach"].includes(ui.view)) navigate("applications");
    if (ui.view === "applications") {
      ui.expanded.add(schoolId);
      render();
    }
    openDialog("pi-dialog");
  }

  function openVisa(id = "") {
    const record = id ? state.visa_records.find((entry) => entry.id === id) : null;
    const form = document.getElementById("visa-form");
    form.reset();
    document.getElementById("visa-dialog-title").textContent = record ? `编辑 ${record.country} 签证记录` : "添加国家 / 地区签证记录";
    form.elements.original_id.value = id;
    form.elements.id.readOnly = Boolean(record);
    form.elements.country.value = record?.country || "";
    form.elements.id.value = record?.id || "";
    form.elements.visa_type.value = record?.visa_type || "";
    form.elements.status.value = record?.status || "not_started";
    form.elements.application_fee_usd.value = Number(record?.application_fee_usd) || 0;
    form.elements.timeline_notes.value = record?.timeline_notes || "";
    form.elements.policy_notes.value = record?.policy_notes || "";
    form.elements.documents_notes.value = record?.documents_notes || "";
    form.elements.source_url.value = record?.source_url || "";
    form.elements.verified.checked = Boolean(record?.verified);
    form.elements.last_verified.value = record?.last_verified || "";
    form.elements.notes.value = record?.notes || "";
    openDialog("visa-dialog");
  }

  function openCampus(schoolId) {
    const school = schoolById(schoolId);
    if (!school) return;
    const campus = school.campus || {};
    const form = document.getElementById("campus-form");
    form.reset();
    document.getElementById("campus-dialog-title").textContent = `${school.name} · 校园与生活调研`;
    form.elements.school_id.value = schoolId;
    form.elements.environment_notes.value = campus.environment_notes || "";
    form.elements.environment_rating.value = Number.isInteger(campus.environment_rating) ? campus.environment_rating : "";
    form.elements.living_cost_monthly_usd.value = Number(campus.living_cost_monthly_usd) || 0;
    form.elements.housing_notes.value = campus.housing_notes || "";
    form.elements.safety_rating.value = Number.isInteger(campus.safety_rating) ? campus.safety_rating : "";
    form.elements.safety_notes.value = campus.safety_notes || "";
    form.elements.source_url.value = campus.source_url || "";
    form.elements.verified.checked = Boolean(campus.verified);
    form.elements.last_verified.value = campus.last_verified || "";
    openDialog("campus-dialog");
  }

  function openRecommender(id = "") {
    const person = id ? recommenderById(id) : null;
    const form = document.getElementById("recommender-form");
    form.reset();
    document.getElementById("recommender-dialog-title").textContent = person ? "编辑推荐人" : "添加推荐人";
    form.elements.original_id.value = id;
    form.elements.id.readOnly = Boolean(person);
    for (const field of ["name", "display_name", "id", "email", "institution", "relationship"]) form.elements[field].value = person?.[field] || "";
    openDialog("recommender-dialog");
  }

  function openDocument(id = "") {
    const material = id ? documentById(id) : null;
    const form = document.getElementById("document-form");
    form.reset();
    document.getElementById("document-dialog-title").textContent = material ? `编辑 ${material.label}` : "添加本地材料";
    form.elements.original_id.value = id;
    form.elements.id.readOnly = Boolean(material);
    for (const field of ["label", "id", "file_path", "version", "notes"]) form.elements[field].value = material?.[field] || "";
    form.elements.category.value = material?.category || "cv";
    form.elements.status.value = material?.status || "draft";
    form.elements.updated_on.value = material?.updated_on || today();
    document.getElementById("document-school-options").innerHTML = state.schools.map((school) => `<label class="check-label"><input type="checkbox" name="school_id" value="${esc(school.id)}" ${material?.school_ids.includes(school.id) ? "checked" : ""}> ${esc(school.name)} · ${esc(school.department_track)}</label>`).join("") || '<span class="subline">尚无学校；保存后材料将作为通用记录。</span>';
    openDialog("document-dialog");
  }

  function openTask(id = "", preset = null) {
    const task = id ? taskById(id) : null;
    const form = document.getElementById("task-form");
    form.reset();
    form.dataset.seasonPhase = task?.season_phase || preset?.season_phase || "";
    document.getElementById("task-dialog-title").textContent = task ? "编辑规划任务" : "添加自定义任务";
    form.elements.original_id.value = id;
    form.elements.id.readOnly = Boolean(task || preset?.season_phase);
    document.getElementById("task-school-options").innerHTML = schoolOptions(task?.school_id || "");
    form.elements.title.value = task?.title || "";
    form.elements.id.value = task?.id || "";
    form.elements.due_date.value = task?.due_date || today();
    form.elements.category.value = task?.category || "other";
    form.elements.status.value = task?.status || "todo";
    form.elements.depends_on.value = (task?.depends_on || []).join(", ");
    form.elements.notes.value = task?.notes || "";
    if (preset) {
      form.elements.title.value = preset.title || "";
      form.elements.id.value = uniqueId(preset.id || `pi-follow-up-${Date.now()}`, state.tasks);
      document.getElementById("task-school-options").innerHTML = schoolOptions(preset.school_id || "");
      form.elements.due_date.value = preset.due_date || today();
      form.elements.category.value = preset.category || "outreach";
      form.elements.notes.value = preset.notes || "";
    }
    openDialog("task-dialog");
  }

  function openChecklist(schoolId, itemId = "", preset = null) {
    const school = schoolById(schoolId);
    if (!school) return;
    const item = itemId ? school.application_checklist.find((entry) => entry.id === itemId) : null;
    const form = document.getElementById("checklist-form");
    form.reset();
    document.getElementById("checklist-dialog-title").textContent = `${school.name} · ${item ? "编辑" : "添加"}清单项`;
    form.elements.school_id.value = schoolId;
    form.elements.original_id.value = itemId;
    form.elements.id.readOnly = Boolean(item);
    form.elements.label.value = item?.label || preset?.label || "";
    form.elements.id.value = item?.id || preset?.id || "";
    form.elements.category.value = item?.category || preset?.category || "documents";
    form.elements.status.value = item?.status || "not_started";
    form.elements.source_url.value = item ? item.source_url || "" : school.portal_url || "";
    form.elements.notes.value = item?.notes || "";
    form.elements.required.checked = item ? Boolean(item.required) : true;
    form.elements.verified.checked = Boolean(item?.verified);
    document.getElementById("checklist-document-options").innerHTML = `<option value="">不关联材料</option>${state.documents.filter((document) => !document.school_ids.length || document.school_ids.includes(schoolId)).map((document) => `<option value="${esc(document.id)}" ${item?.document_id === document.id ? "selected" : ""}>${esc(document.label)} · ${esc(DOCUMENT_LABELS[document.status])}</option>`).join("")}`;
    openDialog("checklist-dialog");
  }

  function updateEssayPreview() {
    const form = document.getElementById("essay-form");
    const candidate = { content: form.elements.content.value, word_limit: Number(form.elements.word_limit.value), type: form.elements.type.value };
    const result = Modules.lintEssay(candidate, schoolById(form.elements.school_id.value), state);
    document.getElementById("essay-lint-preview").textContent = `${result.stats.total} 英文词 + CJK 字符（英文 ${result.stats.english} / CJK ${result.stats.cjk}） · ${result.issues.length} 条静态提示${candidate.word_limit ? ` · 上限 ${candidate.word_limit}` : ""}`;
  }

  function openEssay(id = "") {
    const essay = id ? essayById(id) : null;
    const form = document.getElementById("essay-form");
    form.reset();
    document.getElementById("essay-dialog-title").textContent = essay ? `编辑 ${essay.title}` : "新建版本化文书";
    form.elements.original_id.value = id;
    document.getElementById("essay-school-options").innerHTML = schoolOptions(essay?.school_id || "", "通用 / 母版");
    form.elements.type.value = essay?.type || "SoP";
    form.elements.title.value = essay?.title || "";
    form.elements.word_limit.value = Number(essay?.word_limit) || (essay ? 0 : 1000);
    form.elements.status.value = essay?.status || "draft";
    form.elements.content.value = essay?.content || "";
    form.elements.version_note.value = "";
    updateEssayPreview();
    openDialog("essay-dialog");
  }

  function renderEssayDiff() {
    const dialog = document.getElementById("versions-dialog");
    const essay = essayById(dialog.dataset.essayId);
    if (!essay) return;
    const select = document.getElementById("essay-version-select");
    const version = essay.versions.find((entry) => entry.id === select.value);
    document.getElementById("versions-dialog-title").textContent = `${essay.title} · 版本对比`;
    if (!version) {
      document.getElementById("essay-diff").innerHTML = '<div class="note-box">尚无可对比版本。每次正文变化并保存时会建立一个版本。</div>';
      return;
    }
    const rows = Modules.diffLines(version.content, essay.content);
    document.getElementById("essay-diff").innerHTML = `<div class="diff-caption">历史：${esc(version.created_at)} · ${esc(version.note || "无备注")} → 当前正文</div>${rows.map((row) => `<div class="diff-line diff-${row.type}"><span>${row.type === "add" ? "+" : row.type === "remove" ? "−" : " "}</span><code>${esc(row.text) || " "}</code></div>`).join("")}`;
  }

  function openEssayVersions(id) {
    const essay = essayById(id);
    if (!essay) return;
    const dialog = document.getElementById("versions-dialog");
    dialog.dataset.essayId = id;
    const select = document.getElementById("essay-version-select");
    select.innerHTML = essay.versions.length ? [...essay.versions].reverse().map((version) => `<option value="${esc(version.id)}">${esc(version.created_at)} · ${esc(version.note || "无备注")} · ${version.word_count} 词</option>`).join("") : '<option value="">暂无历史版本</option>';
    openDialog("versions-dialog");
    renderEssayDiff();
  }

  function renderReviewList(essay) {
    document.getElementById("review-dialog-title").textContent = `${essay.title} · 人工审阅`;
    document.getElementById("review-list").innerHTML = essay.reviews.length ? [...essay.reviews].reverse().map((review) => `<article class="review-item ${review.resolved ? "resolved" : ""}"><div><strong>${esc(review.reviewer)}</strong><span class="subline">${esc(review.created_on)} · ${review.resolved ? "✓ 已处理" : "◇ 待处理"}</span></div><p>${esc(review.comment)}</p><button class="button button-small button-ghost" data-action="toggle-review" data-id="${esc(review.id)}" data-essay="${esc(essay.id)}">${review.resolved ? "重新打开" : "标记已处理"}</button></article>`).join("") : '<div class="note-box">尚无审阅意见。可记录导师、语言编辑或自己的具体反馈。</div>';
  }

  function openEssayReviews(id) {
    const essay = essayById(id);
    if (!essay) return;
    const form = document.getElementById("review-form");
    form.reset();
    form.elements.essay_id.value = id;
    form.elements.created_on.value = today();
    renderReviewList(essay);
    openDialog("review-dialog");
  }

  function renderEmailDraftHistory(pi) {
    const versions = pi.contact.draft_versions;
    document.getElementById("email-draft-history").innerHTML = versions.length ? `<strong>已保存 ${versions.length} 个版本</strong>${[...versions].reverse().map((version) => `<div class="draft-history-row"><span>${esc(version.created_at.slice(0, 16).replace("T", " "))} · ${esc(version.kind)} · ${esc(version.note || "无备注")}</span><button type="button" class="text-button" data-action="load-email-draft" data-id="${esc(version.id)}">载入</button></div>`).join("")}` : '<span class="subline">尚无草稿版本。可用 CLI 生成后粘贴到这里，保存不会发送邮件。</span>';
  }

  function openEmailDraft(schoolId, piId) {
    const school = schoolById(schoolId);
    const pi = piById(school, piId);
    if (!pi) return;
    const form = document.getElementById("email-draft-form");
    form.reset();
    form.elements.school_id.value = schoolId;
    form.elements.pi_id.value = piId;
    const latest = pi.contact.draft_versions.at(-1);
    form.elements.kind.value = latest?.kind || "initial";
    form.elements.subject.value = latest?.subject || `Prospective Ph.D. Student ${state.cycle.target_term} - Humanoid Loco-Manipulation & Sim-to-Real (${state.applicant.name})`;
    form.elements.body.value = latest?.body || "";
    document.getElementById("email-draft-dialog-title").textContent = `${pi.name} · ${school.name} · 邮件草稿`;
    renderEmailDraftHistory(pi);
    openDialog("email-draft-dialog");
  }

  function interactionKindLabel(kind) {
    return INTERACTION_KIND_LABELS[kind] || ({ initial: "首次套磁", follow_up: "Follow-up" }[kind] || kind);
  }

  function latestMeetingDate(pi) {
    const events = (pi.contact.history || []).filter((event) => ["call", "meeting"].includes(event.kind)).sort((a, b) => a.date.localeCompare(b.date));
    return events.at(-1)?.date || pi.meeting_on || null;
  }

  function renderInteractionHistory(pi) {
    const history = [...(pi.contact.history || [])].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    document.getElementById("interaction-history").innerHTML = `${pi.meeting_on || pi.meeting_notes ? `<article class="interaction-item legacy"><strong>早期会议记录 · ${esc(pi.meeting_on || "日期未记录")}</strong><p>${esc(pi.meeting_notes || "仅记录了日期")}</p></article>` : ""}${history.length ? history.map((event) => {
      const editable = Object.hasOwn(INTERACTION_KIND_LABELS, event.kind);
      return `<article class="interaction-item"><div class="asset-head"><div><strong>${esc(interactionKindLabel(event.kind))}</strong><span class="subline">${esc(event.date)}${event.subject ? ` · ${esc(event.subject)}` : ""}</span></div>${editable ? `<div class="table-actions"><button type="button" class="icon-button" data-action="edit-interaction" data-id="${esc(event.id)}" aria-label="编辑交流记录">✎</button><button type="button" class="icon-button" data-action="delete-interaction" data-id="${esc(event.id)}" aria-label="删除交流记录">×</button></div>` : ""}</div>${event.questions ? `<p><strong>问题 / 目的</strong>${esc(event.questions)}</p>` : ""}${event.outcomes || event.notes ? `<p><strong>结论 / 记录</strong>${esc(event.outcomes || event.notes)}</p>` : ""}${event.funding_notes ? `<p><strong>Funding / 招生</strong>${esc(event.funding_notes)}</p>` : ""}${event.next_action ? `<p><strong>下一步</strong>${esc(event.next_action)}</p><button type="button" class="button button-small button-ghost" data-action="interaction-to-task" data-id="${esc(event.id)}">转为规划任务</button>` : ""}${event.follow_up_date ? `<span class="subline">Follow-up：${esc(event.follow_up_date)}</span>` : ""}</article>`;
    }).join("") : '<div class="note-box">尚无交流记录。邮件发送历史与通话 / 会议笔记会统一显示在这里。</div>'}`;
  }

  function resetInteractionForm(schoolId, piId) {
    const form = document.getElementById("interaction-form");
    form.reset();
    form.elements.school_id.value = schoolId;
    form.elements.pi_id.value = piId;
    form.elements.original_id.value = "";
    form.elements.kind.value = "call";
    form.elements.date.value = today();
  }

  function openInteractions(schoolId, piId) {
    const school = schoolById(schoolId);
    const pi = piById(school, piId);
    if (!pi) return;
    document.getElementById("interaction-dialog-title").textContent = `${pi.name} · ${school.name} · 交流记录`;
    resetInteractionForm(schoolId, piId);
    renderInteractionHistory(pi);
    openDialog("interaction-dialog");
  }

  function editInteraction(eventId) {
    const form = document.getElementById("interaction-form");
    const pi = piById(schoolById(form.elements.school_id.value), form.elements.pi_id.value);
    const event = pi?.contact.history.find((entry) => entry.id === eventId);
    if (!event || !Object.hasOwn(INTERACTION_KIND_LABELS, event.kind)) return;
    for (const field of ["kind", "date", "questions", "outcomes", "funding_notes", "next_action", "follow_up_date"]) form.elements[field].value = event[field] || "";
    form.elements.original_id.value = eventId;
    form.elements.questions.focus();
  }

  async function copyText(text, message = "命令已复制；请在 GradPilot 项目根目录运行。 ") {
    try {
      await navigator.clipboard.writeText(text);
      toast(message);
    } catch (_) {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      const success = document.execCommand("copy");
      area.remove();
      toast(success ? message : "复制失败，请手动选择内容。 ");
    }
  }

  function exportData() {
    save();
    const blob = new Blob([`${JSON.stringify(state, null, 2)}\n`], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gradpilot-${slug(state.cycle.target_term)}-${today()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("完整 JSON 已导出；其中含隐私数据，请勿提交到公开仓库。 ");
  }

  function exportCalendar() {
    const blob = new Blob([Modules.calendar(state)], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `gradpilot-${slug(state.cycle.target_term)}-${today()}.ics`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("日历已导出，包含活跃项目截止日和未完成任务。 ");
  }

  function replaceWorkspace(data, source, message) {
    validateImport(data);
    backup();
    state = normalize(data);
    ui.source = source;
    ui.expanded.clear();
    ui.comparePis.clear();
    save();
    render();
    toast(message);
  }

  function handleAction(action, element, event) {
    const id = element.dataset.id;
    const schoolId = element.dataset.school;
    if (action === "navigate") return navigate(element.dataset.view);
    if (action === "outreach-mode" && ["radar", "contacts"].includes(element.dataset.mode)) {
      ui.outreachMode = element.dataset.mode;
      return render();
    }
    if (action === "compare-pi") return toggleComparedPi(element.dataset.key);
    if (action === "pi-more") {
      ui.piVisible += 12;
      return render(true);
    }
    if (action === "pi-less") {
      ui.piVisible = 12;
      return render(true);
    }
    if (action === "clear-compare") {
      ui.comparePis.clear();
      return render();
    }
    if (action === "toggle-shortlist") {
      const pi = piById(schoolById(schoolId), id);
      if (!pi) return undefined;
      pi.shortlisted = !pi.shortlisted;
      pi.shortlisted_on = pi.shortlisted ? today() : null;
      return commit(pi.shortlisted ? `${pi.name} 已加入 Shortlist。` : `${pi.name} 已移出 Shortlist。`);
    }
    if (action === "school-view" && ["table", "board", "calendar"].includes(element.dataset.mode)) {
      ui.schoolView = element.dataset.mode;
      return render();
    }
    if (action === "material-view" && ["cards", "matrix"].includes(element.dataset.mode)) {
      ui.materialView = element.dataset.mode;
      return render();
    }
    if (action === "calendar-nav") {
      const month = new Date(`${ui.calendarMonth}-01T12:00:00Z`);
      month.setUTCMonth(month.getUTCMonth() + Number(element.dataset.direction));
      ui.calendarMonth = month.toISOString().slice(0, 7);
      return render();
    }
    if (action === "calendar-today") {
      ui.calendarMonth = today().slice(0, 7);
      return render();
    }
    if (action === "calendar-event") {
      if (element.dataset.kind === "task") return openTask(id);
      if (element.dataset.kind === "lor") return navigate("lor");
      return openSchool(schoolId);
    }
    if (action === "toggle-pin") {
      const key = `${element.dataset.kind}:${id}`;
      const current = state.settings.pinned_items.includes(key);
      if (!current && state.settings.pinned_items.length >= 4) return toast("最多置顶 4 项，请先取消一个已有置顶。 ");
      state.settings.pinned_items = current ? state.settings.pinned_items.filter((item) => item !== key) : [...state.settings.pinned_items, key];
      return commit(current ? "已取消置顶。 " : "已置顶到任务总览。 ");
    }
    if (action === "import") return document.getElementById("import-file").click();
    if (action === "export") return exportData();
    if (action === "toggle-theme") return toggleTheme();
    if (action === "close-dialog") return closeDialog(element.dataset.dialog);
    if (action === "add-school") return openSchool();
    if (action === "edit-school") return openSchool(id);
    if (action === "duplicate-school") return openSchool(id, true);
    if (action === "toggle-school") {
      ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
      return render();
    }
    if (action === "delete-school") {
      const school = schoolById(id);
      if (school && window.confirm(`删除 ${school.name} 及其 PI、推荐信、任务、清单和逐校文书？通用材料会保留但移除该校关联。此操作可通过恢复点或导出备份恢复。`)) {
        backup();
        state.schools = state.schools.filter((item) => item.id !== id);
        state.tasks = state.tasks.filter((task) => task.school_id !== id);
        const remainingTaskIds = new Set(state.tasks.map((task) => task.id));
        state.tasks.forEach((task) => { task.depends_on = task.depends_on.filter((dependency) => remainingTaskIds.has(dependency)); });
        state.essays = state.essays.filter((essay) => essay.school_id !== id);
        state.gmail_imports = state.gmail_imports.filter((item) => item.school_id !== id);
        state.documents.forEach((document) => { document.school_ids = document.school_ids.filter((schoolId) => schoolId !== id); });
        ui.expanded.delete(id);
        return commit("项目及其关联申请记录已删除。 ");
      }
      return undefined;
    }
    if (action === "school-details") {
      ui.schoolView = "table";
      ui.expanded.add(id);
      render();
      document.querySelector(`tr[data-school-expand="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      return undefined;
    }
    if (action === "add-document") return openDocument();
    if (action === "edit-document") return openDocument(id);
    if (action === "delete-document") {
      const material = documentById(id);
      if (material && window.confirm(`删除材料记录「${material.label}」？不会删除本地文件，清单中的关联也会移除。`)) {
        state.documents = state.documents.filter((document) => document.id !== id);
        state.schools.forEach((school) => school.application_checklist.forEach((item) => { if (item.document_id === id) item.document_id = null; }));
        state.settings.pinned_items = state.settings.pinned_items.filter((item) => item !== `document:${id}`);
        return commit("材料记录已删除；本地文件未受影响。 ");
      }
      return undefined;
    }
    if (action === "copy-path") {
      if (!element.dataset.command) return toast("该材料尚未填写本地路径。 ");
      return copyText(element.dataset.command, "本地路径已复制。 ");
    }
    if (action === "add-task") return openTask();
    if (action === "edit-task") return openTask(id);
    if (action === "generate-season-plan") {
      const added = Modules.ensureSeasonPlan(state);
      return commit(added ? `已生成 ${added} 个申请季里程碑；可在规划时间线中修改。` : "6 个申请季里程碑已齐全，未修改现有任务。 ");
    }
    if (action === "season-milestone") {
      const phase = Modules.seasonPlan(state, today()).find((item) => item.id === element.dataset.phase);
      if (!phase) return undefined;
      const existing = taskById(`season-${phase.id}`);
      if (existing) return openTask(existing.id);
      return openTask("", {
        id: `season-${phase.id}`,
        title: `${phase.label}：完成阶段复盘`,
        due_date: phase.end,
        category: phase.category,
        notes: `${phase.focus}\n阶段成果：${phase.outcomes.join("；")}。\n这是规划里程碑，不替代学校官方截止日。`,
        season_phase: phase.id
      });
    }
    if (action === "delete-task") {
      const task = taskById(id);
      if (task && window.confirm(`删除任务「${task.title}」？其他任务对它的依赖也会移除。`)) {
        state.tasks = state.tasks.filter((entry) => entry.id !== id);
        state.tasks.forEach((entry) => { entry.depends_on = entry.depends_on.filter((dependency) => dependency !== id); });
        return commit("任务及相关依赖已删除。 ");
      }
      return undefined;
    }
    if (action === "generate-plans") {
      let added = 0;
      state.schools.forEach((school) => { added += Modules.ensureSchoolPlan(state, school, { force: true }); });
      return commit(added ? `已补齐 ${added} 个缺失的默认任务。` : "默认任务已齐全，未修改现有计划。 ");
    }
    if (action === "export-calendar") return exportCalendar();
    if (action === "add-matrix-item") {
      const column = MATERIAL_MATRIX_COLUMNS.find((entry) => entry.key === element.dataset.column);
      if (!column || !schoolById(schoolId)) return undefined;
      return openChecklist(schoolId, "", { id: `${schoolId}--check-${column.key}`, label: column.presetLabel, category: column.category });
    }
    if (action === "add-checklist") return openChecklist(schoolId);
    if (action === "edit-checklist") return openChecklist(schoolId, id);
    if (action === "delete-checklist") {
      const school = schoolById(schoolId);
      const item = school?.application_checklist.find((entry) => entry.id === id);
      if (item && window.confirm(`从 ${school.name} 删除清单项「${item.label}」？`)) {
        school.application_checklist = school.application_checklist.filter((entry) => entry.id !== id);
        return commit("清单项已删除。 ");
      }
      return undefined;
    }
    if (action === "add-essay") return openEssay();
    if (action === "edit-essay") return openEssay(id);
    if (action === "delete-essay") {
      const essay = essayById(id);
      if (essay && window.confirm(`删除「${essay.title}」及其全部版本和审阅意见？建议先导出备份。`)) {
        backup();
        state.essays = state.essays.filter((entry) => entry.id !== id);
        state.settings.pinned_items = state.settings.pinned_items.filter((item) => item !== `essay:${id}`);
        return commit("文书及其版本已删除。 ");
      }
      return undefined;
    }
    if (action === "essay-versions") return openEssayVersions(id);
    if (action === "essay-reviews") return openEssayReviews(id);
    if (action === "toggle-review") {
      const essay = essayById(element.dataset.essay);
      const review = essay?.reviews.find((entry) => entry.id === id);
      if (!review) return undefined;
      review.resolved = !review.resolved;
      commit(review.resolved ? "审阅意见已标记处理。 " : "审阅意见已重新打开。 ");
      renderReviewList(essay);
      return undefined;
    }
    if (action === "revert-essay-version") {
      const dialog = document.getElementById("versions-dialog");
      const essay = essayById(dialog.dataset.essayId);
      const version = essay?.versions.find((entry) => entry.id === document.getElementById("essay-version-select").value);
      if (!version) return toast("没有可恢复的历史版本。 ");
      if (!window.confirm("用所选历史正文替换当前正文？当前内容仍保留在已有版本中，恢复内容会另存为新版本。")) return undefined;
      essay.content = version.content;
      essay.updated_at = nowIso();
      essay.versions.push({ id: uniqueId(`version-${Date.now()}`, essay.versions), created_at: essay.updated_at, content: essay.content, word_count: Modules.wordStats(essay.content).total, note: `恢复自 ${version.created_at}` });
      closeDialog("versions-dialog");
      return commit("历史正文已恢复为新版本。 ");
    }
    if (action === "email-draft") return openEmailDraft(schoolId, id);
    if (action === "interactions") return openInteractions(schoolId, id);
    if (action === "edit-interaction") return editInteraction(id);
    if (action === "new-interaction") {
      const form = document.getElementById("interaction-form");
      return resetInteractionForm(form.elements.school_id.value, form.elements.pi_id.value);
    }
    if (action === "delete-interaction") {
      const form = document.getElementById("interaction-form");
      const pi = piById(schoolById(form.elements.school_id.value), form.elements.pi_id.value);
      const historyEvent = pi?.contact.history.find((entry) => entry.id === id);
      if (!historyEvent || !window.confirm(`删除 ${historyEvent.date} 的${interactionKindLabel(historyEvent.kind)}记录？邮件正文和其他历史不受影响。`)) return undefined;
      pi.contact.history = pi.contact.history.filter((entry) => entry.id !== id);
      commit("交流记录已删除。 ");
      resetInteractionForm(form.elements.school_id.value, form.elements.pi_id.value);
      renderInteractionHistory(pi);
      return undefined;
    }
    if (action === "interaction-to-task") {
      const form = document.getElementById("interaction-form");
      const school = schoolById(form.elements.school_id.value);
      const pi = piById(school, form.elements.pi_id.value);
      const historyEvent = pi?.contact.history.find((entry) => entry.id === id);
      if (!historyEvent?.next_action) return undefined;
      closeDialog("interaction-dialog");
      return openTask("", {
        id: `${school.id}-${pi.id}-follow-up-${Date.now()}`,
        school_id: school.id,
        title: `${pi.name} · ${historyEvent.next_action}`,
        due_date: historyEvent.follow_up_date || today(),
        category: "outreach",
        notes: [historyEvent.outcomes, historyEvent.funding_notes, "由交流记录手动转为任务。"].filter(Boolean).join("\n")
      });
    }
    if (action === "load-email-draft") {
      const form = document.getElementById("email-draft-form");
      const pi = piById(schoolById(form.elements.school_id.value), form.elements.pi_id.value);
      const version = pi?.contact.draft_versions.find((entry) => entry.id === id);
      if (!version) return undefined;
      form.elements.kind.value = version.kind;
      form.elements.subject.value = version.subject;
      form.elements.body.value = version.body;
      form.elements.note.value = `基于 ${version.created_at.slice(0, 10)} 版本`;
      return toast("历史草稿已载入；点击保存才会创建新版本。 ");
    }
    if (action === "add-pi") return openPi(schoolId);
    if (action === "edit-pi") return openPi(schoolId, id);
    if (action === "delete-pi") {
      const school = schoolById(schoolId);
      const pi = piById(school, id);
      if (school && pi && window.confirm(`从 ${school.name} 删除 ${pi.name}？`)) {
        school.target_pis = school.target_pis.filter((item) => item.id !== id);
        return commit("PI 记录已删除。 ");
      }
      return undefined;
    }
    if (action === "add-recommender") return openRecommender();
    if (action === "edit-recommender") return openRecommender(id);
    if (action === "delete-recommender") {
      const person = recommenderById(id);
      if (person && window.confirm(`删除 ${person.display_name}，并移除所有学校中的对应分配？`)) {
        state.recommenders = state.recommenders.filter((item) => item.id !== id);
        state.schools.forEach((school) => { school.recommendations.assignments = school.recommendations.assignments.filter((entry) => entry.recommender_id !== id); });
        return commit("推荐人及相关分配已删除。 ");
      }
      return undefined;
    }
    if (action === "cycle-lor") {
      const school = schoolById(schoolId);
      if (!school || !recommenderById(id)) return undefined;
      const assignments = school.recommendations.assignments;
      const index = assignments.findIndex((entry) => entry.recommender_id === id);
      if (index < 0) assignments.push({ recommender_id: id, status: "pending", submitted_on: null });
      else if (assignments[index].status === "pending") Object.assign(assignments[index], { status: "submitted", submitted_on: today() });
      else assignments.splice(index, 1);
      return commit("推荐信矩阵已更新。 ");
    }
    if (action === "mark-sent") {
      const school = schoolById(schoolId);
      const pi = piById(school, id);
      if (!pi) return undefined;
      const isFollowUp = ["sent", "follow_up_sent"].includes(pi.contact.status);
      pi.contact.status = isFollowUp ? "follow_up_sent" : "sent";
      pi.contact.last_contacted = today();
      pi.contact.next_follow_up = addDays(today(), state.settings.follow_up_after_days || 12);
      const latestDraft = pi.contact.draft_versions.at(-1);
      pi.contact.history.push({ id: uniqueId(`contact-${Date.now()}`, pi.contact.history), date: today(), kind: isFollowUp ? "follow_up" : "initial", subject: latestDraft?.subject || "", notes: "用户在看板中手动记录为已发送；工具未发送邮件。" });
      return commit(isFollowUp ? "已记录 Follow-up，并计算下一次提醒。" : "已记录发送日期、历史与 Follow-up 提醒。 ");
    }
    if (action === "copy-command") return copyText(element.dataset.command || "");
    if (action === "delete-budget-item") {
      const item = state.budget_items.find((entry) => entry.id === id);
      if (item && window.confirm(`删除预算条目「${item.label}」？`)) {
        state.budget_items = state.budget_items.filter((entry) => entry.id !== id);
        return commit("预算条目已删除。 ");
      }
      return undefined;
    }
    if (action === "add-visa") return openVisa();
    if (action === "edit-visa") return openVisa(id);
    if (action === "edit-campus") return openCampus(id);
    if (action === "delete-visa") {
      const record = state.visa_records.find((entry) => entry.id === id);
      if (record && window.confirm(`删除 ${record.country} 的签证记录？逐校签证进度会保留，但不再匹配到该国家记录。`)) {
        state.visa_records = state.visa_records.filter((entry) => entry.id !== id);
        return commit("签证记录已删除。 ");
      }
      return undefined;
    }
    if (action === "toggle-textures") {
      state.settings.chart_textures = !state.settings.chart_textures;
      return commit(`图表纹理辅助已${state.settings.chart_textures ? "开启" : "关闭"}。`);
    }
    if (action === "reload-sync" && window.GRADPILOT_DATA) {
      if (window.confirm("用 dashboard/data.js 替换当前浏览器工作区？当前状态会先保存为恢复点。")) return replaceWorkspace(window.GRADPILOT_DATA, "sync", "已重新载入同步文件。 ");
      return undefined;
    }
    if (action === "restore-backup") {
      try {
        const saved = localStorage.getItem(BACKUP_KEY);
        if (saved && window.confirm("恢复到上一次替换前的浏览器状态？")) return replaceWorkspace(JSON.parse(saved), "local", "恢复点已恢复。 ");
      } catch (error) { toast(`恢复失败：${error.message}`); }
      return undefined;
    }
    if (action === "reset-empty") {
      if (window.confirm("清空当前浏览器工作区？建议先导出 JSON。原始项目文件不会被删除。")) return replaceWorkspace(emptyWorkspace(), "empty", "已建立空白工作区。 ");
      return undefined;
    }
    return undefined;
  }

  function handleChange(element) {
    const action = element.dataset.action;
    const id = element.dataset.id;
    const schoolId = element.dataset.school;
    if (action === "essay-version-select") return renderEssayDiff();
    if (action === "compare-pi") return toggleComparedPi(element.dataset.key);
    if (action === "task-status") {
      const task = taskById(id);
      if (element.value === "done" && isTaskBlocked(task)) {
        render();
        return toast("请先完成或跳过全部前置任务。 ");
      }
      task.status = element.value;
      return commit("任务状态已更新。 ");
    }
    if (action === "document-status") {
      const material = documentById(id);
      material.status = element.value;
      material.updated_on = today();
      return commit("材料状态与更新日期已保存。 ");
    }
    if (action === "checklist-status") {
      const school = schoolById(schoolId);
      const item = school?.application_checklist.find((entry) => entry.id === id);
      if (!item) return undefined;
      item.status = element.value;
      item.completed_on = ["ready", "submitted"].includes(element.value) ? today() : null;
      return commit("逐校清单已更新。 ");
    }
    if (action === "applicant-number") {
      const value = element.value === "" ? null : Number(element.value);
      if (value !== null && (!Number.isFinite(value) || value < 0 || (element.dataset.field === "gpa_scale" && value <= 0))) {
        element.value = state.applicant[element.dataset.field] ?? "";
        return toast("请输入有效的非负数字；GPA 分制必须大于 0。 ");
      }
      state.applicant[element.dataset.field] = value;
      return commit("选校评分所用的个人资料已更新。 ");
    }
    if (action === "applicant-keywords") {
      state.applicant.research_keywords = element.value.split(/[,，]/).map((value) => value.trim()).filter(Boolean);
      return commit("个人研究关键词已更新。 ");
    }
    if (action === "school-status") {
      const school = schoolById(id);
      school.status = element.value;
      if (element.value !== "Closed") school.decision.close_reason = null;
      return commit(element.value === "Closed" ? "项目已关闭；可在编辑项目中记录关闭原因与结果日期。 " : "申请状态已更新。 ");
    }
    if (action === "lor-required") {
      schoolById(id).recommendations.required = Math.max(0, Math.min(6, Number(element.value) || 0));
      return commit("推荐信要求数量已更新。 ");
    }
    if (action === "contact-status") {
      const pi = piById(schoolById(schoolId), id);
      pi.contact.status = element.value;
      if (["sent", "follow_up_sent"].includes(element.value)) {
        pi.contact.last_contacted = pi.contact.last_contacted || today();
        pi.contact.next_follow_up = addDays(pi.contact.last_contacted, state.settings.follow_up_after_days || 12);
      }
      if (["replied", "meeting", "closed", "not_started", "drafted"].includes(element.value)) pi.contact.next_follow_up = null;
      return commit("套磁状态已更新。 ");
    }
    if (action === "contact-date") {
      const pi = piById(schoolById(schoolId), id);
      pi.contact[element.dataset.field] = element.value || null;
      return commit("联系日期已更新。 ");
    }
    if (action === "school-budget") {
      schoolById(id).budget[element.dataset.field] = Math.max(0, Number(element.value) || 0);
      return commit("学校费用已更新。 ");
    }
    if (action === "school-waiver") {
      schoolById(id).budget.fee_waiver = element.checked;
      return commit("Fee waiver 状态已更新。 ");
    }
    if (action === "budget-item-enabled") {
      state.budget_items.find((item) => item.id === id).enabled = element.checked;
      return commit("预算口径已更新。 ");
    }
    if (action === "budget-item-amount") {
      state.budget_items.find((item) => item.id === id).amount_usd = Math.max(0, Number(element.value) || 0);
      return commit("预算金额已更新。 ");
    }
    if (action === "asset-url") {
      const asset = state.assets.find((item) => item.id === id);
      asset.url = element.value.trim();
      asset.verified = false;
      asset.last_checked = null;
      return commit("URL 已更新；请重新人工核验。 ");
    }
    if (action === "asset-verified") {
      const asset = state.assets.find((item) => item.id === id);
      if (element.checked && !safeUrl(asset.url)) {
        element.checked = false;
        return toast("请先填写有效的 HTTP(S) URL，再进行人工核验。 ");
      }
      asset.verified = element.checked;
      asset.last_checked = element.checked ? today() : null;
      return commit(element.checked ? "已记录人工核验日期。" : "已取消核验标记。 ");
    }
    if (action === "profile-field") {
      state.applicant[element.dataset.field] = element.value.trim();
      return commit("申请人信息已保存到看板 JSON。 ");
    }
    if (action === "cycle-field") {
      state.cycle[element.dataset.field] = element.value.trim();
      if (element.dataset.field === "target_term") state.applicant.target_term = element.value.trim();
      return commit("申请周期设置已更新。 ");
    }
    if (action === "settings-field") {
      const numeric = Number(element.value);
      const minimum = element.dataset.field === "cny_per_usd" ? 0.01 : 1;
      if (!Number.isFinite(numeric) || numeric < minimum) {
        element.value = state.settings[element.dataset.field];
        return toast(`该设置必须是 ≥ ${minimum} 的数字。`);
      }
      state.settings[element.dataset.field] = numeric;
      return commit("工作区设置已更新。 ");
    }
    if (action === "visa-status") {
      const record = state.visa_records.find((entry) => entry.id === id);
      if (!record) return undefined;
      record.status = element.value;
      return commit("签证整体状态已更新。 ");
    }
    if (action === "visa-fee") {
      const record = state.visa_records.find((entry) => entry.id === id);
      if (!record) return undefined;
      record.application_fee_usd = Math.max(0, Number(element.value) || 0);
      return commit("签证官方费用已更新。 ");
    }
    if (action === "visa-verified") {
      const record = state.visa_records.find((entry) => entry.id === id);
      if (!record) return undefined;
      record.verified = element.checked;
      record.last_verified = element.checked ? record.last_verified || today() : null;
      return commit(element.checked ? "已记录人工核验。" : "已取消核验标记。 ");
    }
    if (action === "school-visa-status") {
      const school = schoolById(id);
      if (!school) return undefined;
      school.visa.status = element.value;
      return commit("逐校签证进度已更新。 ");
    }
    if (action === "school-visa-field") {
      const school = schoolById(id);
      if (!school) return undefined;
      school.visa[element.dataset.field] = element.value.trim();
      return commit("逐校签证记录已更新。 ");
    }
    if (action === "campus-cost") {
      const school = schoolById(id);
      if (!school) return undefined;
      school.campus.living_cost_monthly_usd = Math.max(0, Number(element.value) || 0);
      return commit("月生活成本已更新。 ");
    }
    if (action === "toggle-textures") {
      state.settings.chart_textures = element.checked;
      return commit(`图表纹理辅助已${element.checked ? "开启" : "关闭"}。`);
    }
    return undefined;
  }

  function handleFilter(element) {
    const filter = element.dataset.filter;
    if (!filter) return false;
    if (filter.startsWith("pi-")) ui.piVisible = 12;
    if (filter.startsWith("school-")) {
      const key = filter.replace("school-", "");
      ui.schoolFilters[key] = element.value;
    } else if (filter === "outreach-search") ui.outreachFilters.search = element.value;
    else if (filter === "outreach-status") ui.outreachFilters.status = element.value;
    else if (filter === "outreach-due") ui.outreachFilters.dueOnly = element.checked;
    else if (filter === "pi-search") ui.piFilters.search = element.value;
    else if (["pi-region", "pi-track", "pi-admissions"].includes(filter)) ui.piFilters[filter.replace("pi-", "")] = element.value;
    else if (filter === "pi-verified") ui.piFilters.verifiedOnly = element.checked;
    else if (filter === "pi-shortlisted") ui.piFilters.shortlistedOnly = element.checked;
    else if (filter === "pi-paper") ui.piFilters.paperOnly = element.checked;
    else if (filter.startsWith("task-")) ui.taskFilters[filter.replace("task-", "")] = element.value;
    else if (filter.startsWith("material-")) ui.materialFilters[filter.replace("material-", "")] = element.value;
    else if (filter.startsWith("essay-")) ui.essayFilters[filter.replace("essay-", "")] = element.value;
    render(true);
    return true;
  }

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* Theme persistence is optional. */ }
    document.getElementById("theme-toggle").textContent = next === "dark" ? "◐ 切换浅色模式" : "◐ 切换深色模式";
  }

  document.addEventListener("click", (event) => {
    const element = event.target.closest("[data-action]");
    if (element) {
      if (element.tagName === "A" || element.matches("input, select, textarea")) return;
      event.preventDefault();
      handleAction(element.dataset.action, element, event);
      return;
    }
    const row = event.target.closest("tr[data-school-expand]");
    if (row && !event.target.closest("button,a,input,select,textarea,label")) {
      const id = row.dataset.schoolExpand;
      ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
      render();
    }
  });

  document.addEventListener("change", (event) => {
    if (handleFilter(event.target)) return;
    handleChange(event.target);
  });

  document.addEventListener("input", (event) => {
    if (["school-search", "outreach-search", "pi-search", "task-search", "material-search", "essay-search"].includes(event.target.dataset.filter)) handleFilter(event.target);
    if (["essay-content", "essay-form"].includes(event.target.id) || event.target.form?.id === "essay-form") updateEssayPreview();
  });

  document.addEventListener("submit", (event) => {
    event.preventDefault();
    const form = event.target;
    if (!form.reportValidity()) return;
    if (form.getAttribute("id") === "school-form") {
      const values = Object.fromEntries(new FormData(form));
      const originalId = values.original_id;
      if (!originalId && schoolById(values.id)) return toast(`学校 ID ${values.id} 已存在。`);
      const applicationId = values.application_id.trim().toLowerCase();
      if (applicationId && state.schools.some((school) => school.id !== originalId && String(school.application_id || "").trim().toLowerCase() === applicationId)) return toast("该网申申请编号已分配给另一个项目。");
      const existing = originalId ? schoolById(originalId) : null;
      const duplicateSource = form.dataset.duplicateId ? schoolById(form.dataset.duplicateId) : null;
      const local = values.deadline_local.length === 16 ? `${values.deadline_local}:00` : values.deadline_local;
      const deadline = `${local}${values.deadline_offset}`;
      if (!Number.isFinite(Date.parse(deadline))) return toast("截止日或 UTC 偏移无效。 ");
      const school = existing || (duplicateSource ? clone(duplicateSource) : { target_pis: [], recommendations: { assignments: [] }, budget: {} });
      Object.assign(school, {
        id: values.id,
        name: values.name.trim(),
        aliases: values.aliases.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
        country: values.country.trim(),
        region: values.region,
        tier: values.tier,
        department_track: values.department_track.trim(),
        track_type: values.track_type,
        program_name: values.program_name.trim(),
        deadline,
        deadline_type: existing?.deadline_type || "user_planning_date",
        deadline_verified: Boolean(values.deadline_verified),
        portal_url: values.portal_url.trim(),
        application_id: values.application_id.trim() || null,
        submission_date: values.submission_date || null,
        interview_date: values.interview_date || null,
        status: values.status,
        notes: values.notes.trim()
      });
      school.recommendations = school.recommendations || { assignments: [] };
      school.recommendations.required = Number(values.lor_required);
      school.budget = Object.assign({ other_usd: 0, fee_waiver: false }, school.budget || {}, { application_fee_usd: Number(values.application_fee_usd), score_report_usd: Number(values.score_report_usd) });
      const previousFunding = school.funding || {};
      school.funding = {
        types: values.funding_types.split(/[,，]/).map((value) => value.trim()).filter(Boolean),
        consideration: values.funding_consideration,
        deadline: values.funding_deadline || null,
        source_url: values.funding_source_url.trim(),
        verified: Boolean(values.funding_verified),
        last_verified: values.funding_verified ? (previousFunding.source_url === values.funding_source_url.trim() ? previousFunding.last_verified || today() : today()) : null,
        notes: values.funding_notes.trim()
      };
      const previousPolicy = school.application_policy || {};
      school.application_policy = {
        supervisor_contact: values.supervisor_contact,
        interview: values.interview_requirement,
        source_url: values.policy_source_url.trim(),
        verified: Boolean(values.policy_verified),
        last_verified: values.policy_verified ? (previousPolicy.source_url === values.policy_source_url.trim() ? previousPolicy.last_verified || today() : today()) : null
      };
      school.decision = {
        close_reason: values.status === "Closed" ? values.close_reason || null : null,
        decision_date: values.decision_date || null,
        response_deadline: values.response_deadline || null,
        notes: values.decision_notes.trim()
      };
      if (duplicateSource) {
        school.application_checklist = undefined;
        school.plan_version = 0;
        school.target_pis.forEach((pi) => { pi.contact = { status: "not_started", last_contacted: null, next_follow_up: null, notes: "", history: [], draft_versions: [] }; });
        school.recommendations.assignments.forEach((entry) => { entry.status = "pending"; entry.submitted_on = null; });
        school.budget.fee_waiver = false;
        school.funding.verified = false;
        school.funding.last_verified = null;
        school.application_policy.verified = false;
        school.application_policy.last_verified = null;
        school.decision = { close_reason: null, decision_date: null, response_deadline: null, notes: "" };
      }
      if (!existing) {
        state.schools.push(school);
        Modules.ensureSchoolPlan(state, school, { force: true });
      }
      closeDialog("school-dialog");
      commit(existing ? "项目已保存。 " : "新项目已添加；接下来可展开并添加目标 PI。 ");
    } else if (form.getAttribute("id") === "pi-form") {
      const values = Object.fromEntries(new FormData(form));
      const school = schoolById(values.school_id);
      if (!school) return toast("目标学校不存在。 ");
      if (!values.original_id && piById(school, values.id)) return toast(`PI ID ${values.id} 在该校已存在。`);
      const keywords = values.recent_work_keywords.split(/[,，]/).map((value) => value.trim()).filter(Boolean);
      if (keywords.length < 2) return toast("请至少填写两个研究关键词。 ");
      const existing = values.original_id ? piById(school, values.original_id) : null;
      const pi = existing || { contact: { status: "not_started", last_contacted: null, next_follow_up: null, notes: "", history: [], draft_versions: [] } };
      Object.assign(pi, { id: values.id, name: values.name.trim(), lab: values.lab.trim(), homepage: values.homepage.trim(), email: values.email.trim(), recent_work_keywords: keywords, fit_score: Number(values.fit_score), verification_status: values.verification_status, admissions_status: values.admissions_status, last_verified: values.last_verified || null, paper_title: values.paper_title.trim(), paper_url: values.paper_url.trim(), paper_notes: values.paper_notes.trim(), fit_note: values.fit_note.trim() });
      const wasShortlisted = Boolean(pi.shortlisted);
      pi.shortlisted = Boolean(values.shortlisted);
      pi.shortlisted_on = pi.shortlisted ? (wasShortlisted ? pi.shortlisted_on || today() : today()) : null;
      pi.contact.notes = values.contact_notes.trim();
      if (pi.verification_status === "verified_official" && !pi.last_verified) pi.last_verified = today();
      if (!existing) school.target_pis.push(pi);
      closeDialog("pi-dialog");
      commit("PI 信息已保存。 ");
    } else if (form.getAttribute("id") === "recommender-form") {
      const values = Object.fromEntries(new FormData(form));
      if (!values.original_id && recommenderById(values.id)) return toast(`推荐人 ID ${values.id} 已存在。`);
      const existing = values.original_id ? recommenderById(values.original_id) : null;
      const person = existing || { priority: Math.max(0, ...state.recommenders.map((item) => Number(item.priority) || 0)) + 1 };
      Object.assign(person, { id: values.id, name: values.name.trim(), display_name: values.display_name.trim(), email: values.email.trim(), institution: values.institution.trim(), relationship: values.relationship.trim() });
      if (!existing) state.recommenders.push(person);
      closeDialog("recommender-dialog");
      commit("推荐人已保存。 ");
    } else if (form.getAttribute("id") === "document-form") {
      const formData = new FormData(form);
      const values = Object.fromEntries(formData);
      if (!values.original_id && documentById(values.id)) return toast(`材料 ID ${values.id} 已存在。`);
      const existing = values.original_id ? documentById(values.original_id) : null;
      const material = existing || {};
      Object.assign(material, { id: values.id, label: values.label.trim(), category: values.category, status: values.status, file_path: values.file_path.trim(), version: values.version.trim(), updated_on: values.updated_on || today(), school_ids: formData.getAll("school_id"), notes: values.notes.trim() });
      if (!existing) state.documents.push(material);
      closeDialog("document-dialog");
      commit("材料索引已保存；未读取或上传文件内容。 ");
    } else if (form.getAttribute("id") === "task-form") {
      const values = Object.fromEntries(new FormData(form));
      if (!values.original_id && taskById(values.id)) return toast(`任务 ID ${values.id} 已存在。`);
      const dependencies = values.depends_on.split(/[,，]/).map((value) => value.trim()).filter(Boolean);
      if (dependencies.includes(values.id) || dependencies.some((dependency) => !taskById(dependency))) return toast("前置任务必须已存在，且不能依赖自身。 ");
      if (values.status === "done" && dependencies.some((dependency) => !["done", "skipped"].includes(taskById(dependency).status))) return toast("前置任务尚未完成，不能标记当前任务完成。 ");
      const existing = values.original_id ? taskById(values.original_id) : null;
      const candidate = { id: values.id, title: values.title.trim(), school_id: values.school_id || null, due_date: values.due_date, category: values.category, status: values.status, depends_on: dependencies, notes: values.notes.trim() };
      if (form.dataset.seasonPhase) {
        candidate.season_phase = form.dataset.seasonPhase;
        candidate.season_term = existing?.season_term || state.cycle.target_term;
      }
      const taskMap = new Map(state.tasks.filter((task) => task.id !== values.original_id).map((task) => [task.id, task]));
      taskMap.set(candidate.id, candidate);
      const visiting = new Set();
      const visited = new Set();
      const hasCycle = (taskId) => {
        if (visiting.has(taskId)) return true;
        if (visited.has(taskId)) return false;
        visiting.add(taskId);
        for (const dependency of taskMap.get(taskId)?.depends_on || []) if (taskMap.has(dependency) && hasCycle(dependency)) return true;
        visiting.delete(taskId);
        visited.add(taskId);
        return false;
      };
      if ([...taskMap.keys()].some(hasCycle)) return toast("任务依赖不能形成循环。 ");
      if (existing) Object.assign(existing, candidate); else state.tasks.push(candidate);
      closeDialog("task-dialog");
      commit("规划任务与依赖已保存。 ");
    } else if (form.getAttribute("id") === "checklist-form") {
      const values = Object.fromEntries(new FormData(form));
      const school = schoolById(values.school_id);
      if (!school) return toast("目标学校不存在。 ");
      if (!values.original_id && school.application_checklist.some((item) => item.id === values.id)) return toast(`清单 ID ${values.id} 已存在。`);
      if (values.document_id && !documentById(values.document_id)) return toast("关联材料不存在。 ");
      const existing = values.original_id ? school.application_checklist.find((item) => item.id === values.original_id) : null;
      const item = existing || {};
      Object.assign(item, { id: values.id, label: values.label.trim(), category: values.category, required: Boolean(values.required), status: values.status, document_id: values.document_id || null, source_url: values.source_url.trim(), verified: Boolean(values.verified), notes: values.notes.trim() });
      item.completed_on = ["ready", "submitted"].includes(item.status) ? existing?.completed_on || today() : null;
      if (!existing) school.application_checklist.push(item);
      closeDialog("checklist-dialog");
      commit("逐校清单项已保存。 ");
    } else if (form.getAttribute("id") === "essay-form") {
      const values = Object.fromEntries(new FormData(form));
      const existing = values.original_id ? essayById(values.original_id) : null;
      const school = schoolById(values.school_id);
      const candidate = { id: existing?.id || uniqueId(`${values.school_id || "master"}-${values.type}-${values.title}`, state.essays), school_id: values.school_id || null, type: values.type, title: values.title.trim(), content: values.content, word_limit: Number(values.word_limit), status: values.status, versions: existing?.versions || [], reviews: existing?.reviews || [], updated_at: nowIso() };
      const lint = Modules.lintEssay(candidate, school, state);
      if (["final", "submitted"].includes(candidate.status) && !candidate.content.trim()) return toast("正文为空，不能标记定稿或已提交。 ");
      const errors = lint.issues.filter((issue) => issue.severity === "error");
      if (["final", "submitted"].includes(candidate.status) && errors.length) return toast(`请先解决阻止定稿的问题：${errors.map((issue) => issue.message).join("；")}`);
      const contentChanged = !existing || existing.content !== candidate.content;
      if (existing) Object.assign(existing, candidate); else state.essays.push(candidate);
      const essay = existing || candidate;
      if (contentChanged) essay.versions.push({ id: uniqueId(`version-${Date.now()}`, essay.versions), created_at: essay.updated_at, content: essay.content, word_count: lint.stats.total, note: values.version_note.trim() || (existing ? "保存正文修改" : "初始版本") });
      closeDialog("essay-dialog");
      commit(contentChanged ? "文书正文与新版本已保存。 " : "文书元数据已保存；正文未变化，因此未新增版本。 ");
    } else if (form.getAttribute("id") === "review-form") {
      const values = Object.fromEntries(new FormData(form));
      const essay = essayById(values.essay_id);
      if (!essay) return toast("目标文书不存在。 ");
      essay.reviews.push({ id: uniqueId(`review-${Date.now()}`, essay.reviews), reviewer: values.reviewer.trim(), created_on: values.created_on, comment: values.comment.trim(), resolved: false });
      form.elements.comment.value = "";
      form.elements.reviewer.value = "";
      commit("人工审阅意见已保存。 ");
      renderReviewList(essay);
    } else if (form.getAttribute("id") === "email-draft-form") {
      const values = Object.fromEntries(new FormData(form));
      const pi = piById(schoolById(values.school_id), values.pi_id);
      if (!pi) return toast("目标 PI 不存在。 ");
      pi.contact.draft_versions.push({ id: uniqueId(`draft-${Date.now()}`, pi.contact.draft_versions), created_at: nowIso(), kind: values.kind, subject: values.subject.trim(), body: values.body, note: values.note.trim() });
      if (pi.contact.status === "not_started") pi.contact.status = "drafted";
      closeDialog("email-draft-dialog");
      commit("邮件草稿新版本已保存；没有发送任何邮件。 ");
    } else if (form.getAttribute("id") === "interaction-form") {
      const values = Object.fromEntries(new FormData(form));
      const pi = piById(schoolById(values.school_id), values.pi_id);
      if (!pi) return toast("目标 PI 不存在。 ");
      const existing = values.original_id ? pi.contact.history.find((entry) => entry.id === values.original_id) : null;
      const historyEvent = existing || { id: uniqueId(`interaction-${Date.now()}`, pi.contact.history) };
      Object.assign(historyEvent, {
        date: values.date,
        kind: values.kind,
        subject: existing?.subject || INTERACTION_KIND_LABELS[values.kind],
        notes: values.outcomes.trim(),
        questions: values.questions.trim(),
        outcomes: values.outcomes.trim(),
        funding_notes: values.funding_notes.trim(),
        next_action: values.next_action.trim(),
        follow_up_date: values.follow_up_date || null
      });
      if (!existing) pi.contact.history.push(historyEvent);
      if (["call", "meeting"].includes(values.kind)) {
        pi.contact.status = "meeting";
        pi.contact.last_contacted = values.date;
        pi.contact.next_follow_up = values.follow_up_date || null;
      }
      commit(existing ? "交流记录已更新。 " : "交流记录已添加；可继续记录下一次联系。 ");
      resetInteractionForm(values.school_id, values.pi_id);
      renderInteractionHistory(pi);
    } else if (form.getAttribute("id") === "visa-form") {
      const values = Object.fromEntries(new FormData(form));
      if (!values.original_id && state.visa_records.some((entry) => entry.id === values.id)) return toast(`签证记录 ID ${values.id} 已存在。`);
      const existing = values.original_id ? state.visa_records.find((entry) => entry.id === values.original_id) : null;
      const record = existing || {};
      Object.assign(record, {
        id: values.id,
        country: values.country.trim(),
        visa_type: values.visa_type.trim(),
        status: values.status,
        application_fee_usd: Math.max(0, Number(values.application_fee_usd) || 0),
        timeline_notes: values.timeline_notes.trim(),
        policy_notes: values.policy_notes.trim(),
        documents_notes: values.documents_notes.trim(),
        source_url: values.source_url.trim(),
        verified: Boolean(values.verified),
        last_verified: values.verified ? values.last_verified || today() : null,
        notes: values.notes.trim()
      });
      if (!existing) state.visa_records.push(record);
      closeDialog("visa-dialog");
      commit(existing ? "签证记录已保存。 " : "签证记录已添加；请补充官方来源并人工核验。 ");
    } else if (form.getAttribute("id") === "campus-form") {
      const values = Object.fromEntries(new FormData(form));
      const school = schoolById(values.school_id);
      if (!school) return toast("目标学校不存在。 ");
      const rating = (raw) => {
        if (raw === "" || raw === null) return null;
        const parsed = Number(raw);
        return Number.isInteger(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
      };
      school.campus = {
        environment_notes: values.environment_notes.trim(),
        environment_rating: rating(values.environment_rating),
        living_cost_monthly_usd: Math.max(0, Number(values.living_cost_monthly_usd) || 0),
        housing_notes: values.housing_notes.trim(),
        safety_notes: values.safety_notes.trim(),
        safety_rating: rating(values.safety_rating),
        source_url: values.source_url.trim(),
        verified: Boolean(values.verified),
        last_verified: values.verified ? values.last_verified || today() : null
      };
      closeDialog("campus-dialog");
      commit("校园与生活调研已保存。 ");
    } else if (form.getAttribute("id") === "add-budget-form") {
      const values = Object.fromEntries(new FormData(form));
      const idBase = slug(values.label, `budget-${Date.now()}`);
      let id = idBase;
      let suffix = 2;
      while (state.budget_items.some((item) => item.id === id)) id = `${idBase}-${suffix++}`;
      state.budget_items.push({ id, label: values.label.trim(), amount_usd: Number(values.amount), enabled: true, category: values.category });
      commit("自定义预算条目已添加。 ");
    }
  });

  document.getElementById("import-file").addEventListener("change", async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      validateImport(data);
      if (!window.confirm(`用 ${file.name} 替换当前浏览器工作区？当前状态会先保存为恢复点。`)) return;
      replaceWorkspace(data, "import", `已导入 ${file.name}。`);
    } catch (error) {
      toast(`导入失败：${error.message}`);
    }
  });

  function tooltipTarget(event) {
    return event.target instanceof Element ? event.target.closest("[data-tooltip-title]") : null;
  }

  function showTooltip(target, pointerEvent) {
    const tooltip = document.getElementById("chart-tooltip");
    tooltip.querySelector("strong").textContent = target.dataset.tooltipValue || "";
    tooltip.querySelector("span").textContent = target.dataset.tooltipTitle || "";
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const x = pointerEvent?.clientX || rect.left + rect.width / 2;
    const y = pointerEvent?.clientY || rect.top;
    const tooltipRect = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, x + 14))}px`;
    tooltip.style.top = `${Math.max(8, Math.min(window.innerHeight - tooltipRect.height - 8, y - tooltipRect.height - 12))}px`;
  }

  document.addEventListener("pointerover", (event) => { const target = tooltipTarget(event); if (target) showTooltip(target, event); });
  document.addEventListener("pointermove", (event) => { const target = tooltipTarget(event); if (target) showTooltip(target, event); });
  document.addEventListener("pointerout", (event) => { if (tooltipTarget(event)) document.getElementById("chart-tooltip").hidden = true; });
  document.addEventListener("focusin", (event) => { const target = tooltipTarget(event); if (target) showTooltip(target); });
  document.addEventListener("focusout", (event) => { if (tooltipTarget(event)) document.getElementById("chart-tooltip").hidden = true; });

  try {
    const savedTheme = localStorage.getItem(THEME_KEY);
    document.documentElement.dataset.theme = savedTheme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  } catch (_) { document.documentElement.dataset.theme = "light"; }
  document.getElementById("theme-toggle").textContent = document.documentElement.dataset.theme === "dark" ? "◐ 切换浅色模式" : "◐ 切换深色模式";
  save();
  render();
})();
