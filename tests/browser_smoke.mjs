#!/usr/bin/env node
/** Headless Chrome smoke test using only Node built-ins and the DevTools protocol. */

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import net from "node:net";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "out");
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find((candidate) => existsSync(candidate));
if (!chrome) throw new Error("Set CHROME_PATH to a Chrome/Chromium executable.");

const wait = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function freePort() {
  const server = net.createServer();
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const { port } = server.address();
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

class CDP {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.exceptions = [];
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolvePromise, reject) => {
      this.socket.addEventListener("open", resolvePromise, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        clearTimeout(pending.timeout);
        if (message.error) pending.reject(new Error(JSON.stringify(message.error)));
        else pending.resolve(message.result);
      } else if (message.method === "Runtime.exceptionThrown") {
        this.exceptions.push(message.params.exceptionDetails);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 30000);
      this.pending.set(id, { resolve: resolvePromise, reject, timeout });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
      userGesture: true
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result?.value;
  }

  close() {
    this.socket?.close();
  }
}

async function waitFor(cdp, expression, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await cdp.evaluate(expression)) return;
    } catch (_) {
      // Navigation can briefly destroy the execution context; retry until ready.
    }
    await wait(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function screenshot(cdp, filename) {
  await wait(400);
  const metrics = await cdp.send("Page.getLayoutMetrics");
  const size = metrics.cssContentSize || metrics.contentSize;
  const result = await cdp.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(size.width), height: Math.ceil(size.height), scale: 1 }
  });
  await writeFile(join(OUT, filename), Buffer.from(result.data, "base64"));
}

const profile = await mkdtemp(join(tmpdir(), "gradpilot-chrome-"));
const port = await freePort();
await mkdir(OUT, { recursive: true });
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-dev-shm-usage",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=1440,1000",
  "--force-device-scale-factor=1",
  "about:blank"
], { stdio: ["ignore", "ignore", "pipe"] });
let browserErrors = "";
browser.stderr.on("data", (chunk) => { browserErrors += chunk.toString(); });

let cdp;
try {
  let target;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      target = targets.find((entry) => entry.type === "page");
      if (target) break;
    } catch (_) {
      // Chrome has not opened its debugging endpoint yet.
    }
    await wait(100);
  }
  if (!target) throw new Error(`Chrome did not start. ${browserErrors.slice(-1000)}`);
  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const url = pathToFileURL(join(ROOT, "dashboard", "index.html")).href;
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, "document.querySelector('.hero-school')?.textContent.includes('National University of Singapore')");
  await cdp.evaluate("document.fonts.ready.then(() => true)");
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.length"), 19);
  assert.ok(await cdp.evaluate("document.querySelectorAll('#view-overview svg').length >= 2"));
  assert.ok(await cdp.evaluate("document.querySelectorAll('#view-overview .data-table').length >= 2"));
  await screenshot(cdp, "dashboard-overview.png");

  await cdp.evaluate("document.getElementById('theme-toggle').click()");
  assert.equal(await cdp.evaluate("document.documentElement.dataset.theme"), "dark");
  await screenshot(cdp, "dashboard-dark.png");
  await cdp.evaluate("document.getElementById('theme-toggle').click()");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"season\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.season-phase').length === 6");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.season-phase[aria-current=\"date\"]').length"), 1);
  await screenshot(cdp, "dashboard-season.png");
  await cdp.evaluate("document.getElementById('theme-toggle').click()");
  await screenshot(cdp, "dashboard-season-dark.png");
  await cdp.evaluate("document.getElementById('theme-toggle').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"season-milestone\"][data-phase=\"foundation\"]').click()");
  assert.ok(await cdp.evaluate("document.getElementById('task-dialog').open && document.getElementById('task-form').elements.id.value === 'season-foundation' && document.getElementById('task-form').elements.id.readOnly"));
  await cdp.evaluate("document.querySelector('#task-dialog [data-action=\"close-dialog\"]').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"generate-season-plan\"]').click()");
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).tasks.filter(task => task.season_phase).length === 6");
  await cdp.evaluate("document.querySelector('[data-action=\"generate-season-plan\"]').click()");
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).tasks.filter(task => task.season_phase).length"), 6);
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await screenshot(cdp, "dashboard-season-mobile.png");
  assert.ok(await cdp.evaluate("document.documentElement.scrollWidth <= 390"), "Season page overflows mobile viewport");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"applications\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.school-row').length === 19");
  await screenshot(cdp, "dashboard-applications.png");

  await cdp.evaluate(`(() => {
    const input = document.querySelector('[data-filter="school-search"]');
    input.value = 'Berkeley';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  assert.equal(await cdp.evaluate("document.querySelectorAll('.school-row').length"), 1);
  await cdp.evaluate(`(() => {
    const input = document.querySelector('[data-filter="school-search"]');
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await cdp.evaluate("document.querySelector('.school-row [data-action=\"toggle-school\"]').click()");
  assert.ok(await cdp.evaluate("document.querySelectorAll('.detail-row .pi-card').length > 0"));

  await cdp.evaluate("document.querySelector('[data-action=\"add-school\"]').click()");
  await cdp.evaluate(`(() => {
    window.__submitDebug = { submitCount: 0, formSubmitCount: 0, errors: [] };
    document.addEventListener('submit', event => {
      window.__submitDebug.submitCount += 1;
      window.__submitDebug.target = event.target.id;
      window.__submitDebug.prevented = event.defaultPrevented;
    }, true);
    document.getElementById('school-form').addEventListener('submit', () => {
      window.__submitDebug.formSubmitCount += 1;
    });
    document.addEventListener('click', event => {
      if (event.target.matches('#school-form button[type="submit"]')) {
        window.__submitDebug.clickPrevented = event.defaultPrevented;
      }
    });
    window.addEventListener('error', event => window.__submitDebug.errors.push(event.message));
  })()`);
  await cdp.evaluate(`(() => {
    const form = document.getElementById('school-form');
    const values = {
      name: 'Test Robotics University', id: 'test-robotics', country: 'United States',
      department_track: 'ECE', track_type: 'Robotics', program_name: 'Ph.D. in ECE',
      deadline_local: '2027-12-20T23:59', deadline_offset: '-05:00',
      application_fee_usd: '100', score_report_usd: '25', lor_required: '3',
      portal_url: 'https://example.edu/apply', application_id: 'TEST-APPLICATION-001',
      submission_date: '2027-12-01', interview_date: '2028-02-10', funding_types: 'Departmental, External',
      funding_consideration: 'separate', funding_deadline: '2027-11-15',
      funding_source_url: 'https://example.edu/funding', funding_notes: 'Separate fellowship form',
      supervisor_contact: 'allowed', interview_requirement: 'required',
      policy_source_url: 'https://example.edu/policy', response_deadline: '2028-02-15',
      decision_notes: 'Record the actual outcome here'
    };
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.elements.funding_verified.checked = true;
    form.elements.policy_verified.checked = true;
    form.querySelector('button[type="submit"]').click();
  })()`);
  try {
    await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.length === 20", 2500);
  } catch (error) {
    const debug = await cdp.evaluate(`(() => {
      const form = document.getElementById('school-form');
      return {
        dialogOpen: document.getElementById('school-dialog').open,
        valid: form.checkValidity(),
        invalid: [...form.elements].filter(el => !el.checkValidity()).map(el => ({name: el.name, value: el.value, message: el.validationMessage})),
        values: Object.fromEntries(new FormData(form)),
        toast: document.getElementById('toast').textContent,
        count: JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.length,
        events: window.__submitDebug
      };
    })()`);
    throw new Error(`School form failed: ${JSON.stringify(debug)}; exceptions=${JSON.stringify(cdp.exceptions)}`);
  }
  assert.equal(await cdp.evaluate("document.getElementById('school-dialog').open"), false);
  assert.ok(await cdp.evaluate(`(() => {
    const school = JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(item => item.id === 'test-robotics');
    return school.funding.consideration === 'separate' && school.funding.deadline === '2027-11-15' &&
      school.funding.verified && school.application_policy.supervisor_contact === 'allowed' &&
      school.application_policy.interview === 'required' && school.decision.response_deadline === '2028-02-15' &&
      school.application_id === 'TEST-APPLICATION-001' && school.submission_date === '2027-12-01' &&
      school.interview_date === '2028-02-10';
  })()`));

  await cdp.evaluate("document.querySelector('[data-action=\"school-view\"][data-mode=\"board\"]').click()");
  assert.ok(await cdp.evaluate("document.querySelectorAll('.stage-card').length === 20"));
  await screenshot(cdp, "dashboard-stage-board.png");
  await cdp.evaluate(`(() => {
    const select = document.querySelector('.stage-card [data-action="school-status"][data-id="test-robotics"]');
    select.value = 'Waitlisted';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  assert.ok(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').status === 'Waitlisted'"));
  await cdp.evaluate("document.querySelector('[data-action=\"school-view\"][data-mode=\"calendar\"]').click()");
  await cdp.evaluate(`(() => {
    const target = '2027-11';
    const now = new Date();
    let difference = (2027 - now.getUTCFullYear()) * 12 + 10 - now.getUTCMonth();
    while (difference > 0) { document.querySelector('[data-action="calendar-nav"][data-direction="1"]').click(); difference -= 1; }
    while (difference < 0) { document.querySelector('[data-action="calendar-nav"][data-direction="-1"]').click(); difference += 1; }
  })()`);
  assert.ok(await cdp.evaluate("document.querySelector('#view-applications .panel-head h2')?.textContent.includes('2027')"));
  assert.ok(await cdp.evaluate("document.querySelector('.calendar-event.event-funding')?.textContent.includes('Test Robotics University')"));
  assert.equal(await cdp.evaluate("document.querySelectorAll('.calendar-day').length"), 42);
  await screenshot(cdp, "dashboard-calendar.png");
  await cdp.evaluate("document.querySelector('[data-action=\"school-view\"][data-mode=\"table\"]').click()");

  await cdp.send("Page.reload", { ignoreCache: true });
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1'))?.schools.length === 20 && !!document.querySelector('.hero-school')");
  assert.ok(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').funding.types.includes('External')"));

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"applications\"]').click()");
  await waitFor(cdp, "document.querySelector('[data-action=\"toggle-school\"][data-id=\"test-robotics\"]') !== null");
  await cdp.evaluate("document.querySelector('[data-action=\"toggle-school\"][data-id=\"test-robotics\"]').click()");
  assert.ok(await cdp.evaluate("document.querySelector('.detail-row .school-plan-facts')?.textContent.includes('TEST-APPLICATION-001') && document.querySelector('.detail-row .school-plan-facts')?.textContent.includes('2028-02-10')"));
  await cdp.evaluate("document.querySelector('[data-action=\"add-pi\"][data-school=\"test-robotics\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('pi-form');
    const values = {
      name: 'Test PI', id: 'test-pi', lab: 'Test Robotics Lab',
      recent_work_keywords: 'humanoid control, sim-to-real',
      homepage: 'https://example.edu/pi', email: '', fit_score: '5'
    };
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(s => s.id === 'test-robotics').target_pis.length === 1");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"outreach\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.radar-card').length === 12");
  await screenshot(cdp, "dashboard-pi-radar.png");
  await cdp.evaluate("document.getElementById('theme-toggle').click()");
  await screenshot(cdp, "dashboard-pi-radar-dark.png");
  await cdp.evaluate("document.getElementById('theme-toggle').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"pi-more\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.radar-card').length === 24");
  await cdp.evaluate("document.querySelector('.radar-card [data-action=\"compare-pi\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.compare-chip').length === 1");
  await cdp.evaluate("document.querySelector('.radar-card [data-action=\"compare-pi\"]:not(:checked)').click()");
  await waitFor(cdp, "document.querySelectorAll('.comparison-table thead th').length === 3");
  await cdp.evaluate("document.querySelector('.radar-card [data-action=\"compare-pi\"]:not(:checked)').click()");
  await waitFor(cdp, "document.querySelectorAll('.compare-chip').length === 3");
  await cdp.evaluate("document.querySelector('.radar-card [data-action=\"compare-pi\"]:not(:checked)').click()");
  await waitFor(cdp, "document.querySelectorAll('.compare-chip').length === 4");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.comparison-table thead th').length"), 5);
  assert.ok(await cdp.evaluate("document.querySelectorAll('.radar-card [data-action=\"compare-pi\"]:disabled').length > 0"));
  await cdp.evaluate("document.querySelector('.comparison-table [data-action=\"toggle-shortlist\"]').click()");
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.flatMap(s => s.target_pis).some(pi => pi.shortlisted && pi.shortlisted_on)");
  await screenshot(cdp, "dashboard-pi-comparison.png");
  await cdp.evaluate(`(() => {
    const input = document.querySelector('[data-filter="pi-shortlisted"]');
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(cdp, "document.querySelectorAll('.radar-card').length === 1");
  await cdp.evaluate(`(() => {
    const input = document.querySelector('[data-filter="pi-shortlisted"]');
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await cdp.evaluate("document.querySelector('[data-action=\"clear-compare\"]').click()");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.compare-chip').length"), 0);

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"lor\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.lor-toggle').length > 0");
  const initialMatrixState = await cdp.evaluate("document.querySelector('.lor-toggle').dataset.state");
  assert.equal(initialMatrixState, "pending");
  await cdp.evaluate("document.querySelector('.lor-toggle').click()");
  assert.equal(await cdp.evaluate("document.querySelector('.lor-toggle').dataset.state"), "submitted");
  assert.ok(await cdp.evaluate("document.querySelector('.matrix-date')?.textContent.length === 10"));
  await cdp.evaluate("document.querySelector('.lor-toggle').click()");
  assert.equal(await cdp.evaluate("document.querySelector('.lor-toggle').dataset.state"), "unassigned");
  await cdp.evaluate("document.querySelector('.lor-toggle').click()");
  assert.equal(await cdp.evaluate("document.querySelector('.lor-toggle').dataset.state"), "pending");

  await cdp.evaluate("document.querySelector('[data-action=\"add-recommender\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('recommender-form');
    const values = {
      name: 'Prof. Test', display_name: '测试推荐人', id: 'test-recommender',
      email: 'professor@example.edu', institution: 'Test University', relationship: 'Research supervision'
    };
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).recommenders.length === 5");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"outreach\"]').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"outreach-mode\"][data-mode=\"contacts\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('[data-action=\"mark-sent\"]').length > 0");
  await cdp.evaluate("document.querySelector('[data-action=\"mark-sent\"]').click()");
  assert.ok(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.flatMap(s => s.target_pis).some(p => p.contact.status === 'sent')"));

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"budget\"]').click()");
  await waitFor(cdp, "document.querySelector('.budget-total .amount')?.textContent.includes('$')");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('add-budget-form');
    form.elements.label.value = 'Test writing review';
    form.elements.amount.value = '50';
    form.elements.category.value = 'services';
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).budget_items.some(item => item.label === 'Test writing review' && item.amount_usd === 50)");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"assets\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('[data-action=\"asset-verified\"]').length >= 5");
  await cdp.evaluate("document.querySelector('[data-action=\"asset-verified\"]').click()");
  assert.equal(await cdp.evaluate("document.querySelector('[data-action=\"asset-verified\"]').checked"), true);
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).assets[0].verified"), true);
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).assets[0].last_checked.length"), 10);

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"tasks\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('#view-tasks [data-action=\"task-status\"]').length >= 140");
  await cdp.evaluate(`(() => {
    const select = document.querySelector('[data-filter="task-school"]');
    select.value = 'test-robotics';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(cdp, "document.querySelectorAll('#view-tasks [data-action=\"task-status\"]').length === 7");
  await cdp.evaluate(`(() => {
    const select = document.querySelector('[data-action="task-status"][data-id="test-robotics--task-verify"]');
    select.value = 'done';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).tasks.find(task => task.id === 'test-robotics--task-verify').status"), "done");
  await cdp.evaluate(`(() => {
    const select = document.querySelector('[data-action="task-status"][data-id="test-robotics--task-submit"]');
    select.value = 'done';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).tasks.find(task => task.id === 'test-robotics--task-submit').status"), "todo");
  await screenshot(cdp, "dashboard-tasks.png");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"materials\"]').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"add-document\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('document-form');
    const values = { label: 'Test CV', id: 'test-cv', category: 'cv', status: 'final', file_path: 'private/materials/test-cv-v1.pdf', version: 'v1', updated_on: '2026-11-04', notes: 'Browser smoke material' };
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.querySelector('input[name="school_id"][value="test-robotics"]').checked = true;
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).documents.some(document => document.id === 'test-cv' && document.school_ids.includes('test-robotics'))");
  await cdp.evaluate("document.querySelector('[data-action=\"toggle-pin\"][data-kind=\"document\"][data-id=\"test-cv\"]').click()");
  assert.ok(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).settings.pinned_items.includes('document:test-cv')"));
  await screenshot(cdp, "dashboard-materials.png");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"applications\"]').click()");
  await cdp.evaluate(`(() => {
    const input = document.querySelector('[data-filter="school-search"]');
    input.value = 'Test Robotics';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (!document.querySelector('[data-action="edit-checklist"][data-school="test-robotics"]')) document.querySelector('[data-action="toggle-school"][data-id="test-robotics"]').click();
  })()`);
  await waitFor(cdp, "document.querySelectorAll('[data-action=\"edit-checklist\"][data-school=\"test-robotics\"]').length === 9");
  await cdp.evaluate("document.querySelector('[data-action=\"edit-checklist\"][data-school=\"test-robotics\"][data-id=\"test-robotics--check-cv\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('checklist-form');
    form.elements.document_id.value = 'test-cv';
    form.elements.status.value = 'ready';
    form.elements.verified.checked = true;
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').application_checklist.find(item => item.id === 'test-robotics--check-cv').document_id === 'test-cv'");
  assert.ok(await cdp.evaluate("document.querySelector('.detail-row .score-total') !== null"));
  assert.equal(await cdp.evaluate("document.querySelectorAll('.detail-row .score-dimension').length"), 3);
  await screenshot(cdp, "dashboard-school-checklist.png");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"materials\"]').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"material-view\"][data-mode=\"matrix\"]').click()");
  await cdp.evaluate(`(() => {
    const select = document.querySelector('[data-filter="material-school"]');
    select.value = 'test-robotics';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await waitFor(cdp, "document.querySelectorAll('.material-matrix-table tbody tr').length === 1");
  assert.ok(await cdp.evaluate("document.querySelector('.matrix-document[data-state=\"ready\"]')?.textContent.includes('Test CV')"));
  await cdp.evaluate("document.querySelector('[data-action=\"add-matrix-item\"][data-column=\"research-proposal\"]').click()");
  assert.equal(await cdp.evaluate("document.getElementById('checklist-form').elements.id.value"), "test-robotics--check-research-proposal");
  await cdp.evaluate("document.getElementById('checklist-form').querySelector('button[type=\"submit\"]').click()");
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').application_checklist.some(item => item.id === 'test-robotics--check-research-proposal')");
  await screenshot(cdp, "dashboard-material-matrix.png");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"essays\"]').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"add-essay\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('essay-form');
    form.elements.school_id.value = 'test-robotics';
    form.elements.type.value = 'SoP';
    form.elements.title.value = 'Test Robotics SoP';
    form.elements.word_limit.value = '100';
    form.elements.status.value = 'draft';
    form.elements.content.value = 'I am applying to the Test Robotics University Ph.D. in ECE for 2028 Fall. My research focuses on humanoid control and careful physical-robot evaluation.';
    form.elements.version_note.value = 'Initial draft';
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).essays.length === 1");
  await cdp.evaluate("document.querySelector('[data-action=\"edit-essay\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('essay-form');
    form.elements.content.value += ' I revised the research fit paragraph.';
    form.elements.version_note.value = 'Expand research fit';
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).essays[0].versions.length === 2");
  await cdp.evaluate("document.querySelector('[data-action=\"essay-reviews\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('review-form');
    form.elements.reviewer.value = 'Test Reviewer';
    form.elements.comment.value = 'Verify the individual contribution claim.';
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).essays[0].reviews.length === 1");
  await cdp.evaluate("document.querySelector('[data-action=\"toggle-review\"]').click()");
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).essays[0].reviews[0].resolved"), true);
  await cdp.evaluate("document.querySelector('#review-dialog [data-action=\"close-dialog\"]').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"essay-versions\"]').click()");
  await cdp.evaluate(`(() => {
    const select = document.getElementById('essay-version-select');
    select.value = select.options[select.options.length - 1].value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  assert.ok(await cdp.evaluate("document.querySelectorAll('#essay-diff .diff-add').length > 0"));
  await screenshot(cdp, "dashboard-essay-versions.png");
  await cdp.evaluate("document.querySelector('#versions-dialog [data-action=\"close-dialog\"]').click()");
  await screenshot(cdp, "dashboard-essays.png");
  await cdp.evaluate("document.querySelector('[data-action=\"toggle-pin\"][data-kind=\"essay\"]').click()");
  assert.equal(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).settings.pinned_items.length"), 2);
  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"overview\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.living-card').length === 2");
  await screenshot(cdp, "dashboard-living-documents.png");

  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"outreach\"]').click()");
  await cdp.evaluate("document.querySelector('[data-action=\"outreach-mode\"][data-mode=\"contacts\"]').click()");
  await cdp.evaluate(`(() => {
    const input = document.querySelector('[data-filter="outreach-search"]');
    input.value = 'Test PI';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(cdp, "document.querySelectorAll('#view-outreach [data-action=\"mark-sent\"]').length === 1");
  await cdp.evaluate("document.querySelector('#view-outreach [data-action=\"edit-pi\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('pi-form');
    const values = { verification_status: 'verified_official', admissions_status: 'accepting', last_verified: '2026-11-04', paper_title: 'A Test Robotics Paper', paper_url: 'https://example.edu/paper', paper_notes: 'The evaluation method connects to my physical-robot experiments.', fit_note: 'Specific test fit argument.' };
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').target_pis[0].paper_title === 'A Test Robotics Paper'");
  await cdp.evaluate("document.querySelector('#view-outreach [data-action=\"email-draft\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('email-draft-form');
    form.elements.subject.value = 'Test research connection';
    form.elements.body.value = 'Dear Professor Test, this local draft will not be sent by GradPilot.';
    form.elements.note.value = 'Initial local draft';
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').target_pis[0].contact.draft_versions.length === 1");
  await cdp.evaluate("document.querySelector('#view-outreach [data-action=\"interactions\"]').click()");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('interaction-form');
    const values = { kind: 'call', date: '2026-11-05', questions: 'Is a separate funding application required?', outcomes: 'Yes, submit the fellowship form.', funding_notes: 'Departmental fellowship', next_action: 'Review the official fellowship form', follow_up_date: '2026-11-12' };
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').target_pis[0].contact.history.length === 1");
  await cdp.evaluate(`(() => {
    const form = document.getElementById('interaction-form');
    const values = { kind: 'meeting', date: '2026-11-08', questions: 'Which research project?', outcomes: 'Whole-body control evaluation.', funding_notes: 'No new funding promise', next_action: 'Read the suggested paper', follow_up_date: '2026-11-15' };
    for (const [name, value] of Object.entries(values)) form.elements[name].value = value;
    form.querySelector('button[type="submit"]').click();
  })()`);
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').target_pis[0].contact.history.length === 2");
  assert.ok(await cdp.evaluate(`(() => {
    const pi = JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').target_pis[0];
    return pi.contact.status === 'meeting' && pi.contact.next_follow_up === '2026-11-15' &&
      pi.contact.history.every(event => event.questions && event.outcomes && event.next_action);
  })()`));
  await cdp.evaluate(`(() => {
    const pi = JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.find(school => school.id === 'test-robotics').target_pis[0];
    const event = pi.contact.history.find(item => item.kind === 'call');
    document.querySelector('[data-action="interaction-to-task"][data-id="' + event.id + '"]').click();
  })()`);
  await waitFor(cdp, "document.getElementById('task-dialog').open");
  await cdp.evaluate("document.getElementById('task-form').querySelector('button[type=\"submit\"]').click()");
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).tasks.some(task => task.school_id === 'test-robotics' && task.title.includes('Review the official fellowship form'))");
  await screenshot(cdp, "dashboard-outreach-research.png");

  await cdp.send("Page.reload", { ignoreCache: true });
  await waitFor(cdp, "JSON.parse(localStorage.getItem('gradpilot.workspace.v1'))?.schools.length === 20 && !!document.querySelector('.hero-school')");
  assert.ok(await cdp.evaluate("JSON.parse(localStorage.getItem('gradpilot.workspace.v1')).schools.flatMap(s => s.target_pis).some(pi => pi.shortlisted && pi.shortlisted_on)"), "Shortlist did not survive a full page reload");
  await cdp.evaluate("document.querySelector('.nav-item[data-view=\"outreach\"]').click()");
  await waitFor(cdp, "document.querySelectorAll('.radar-card').length === 12");

  const exportedWorkspace = await cdp.evaluate("localStorage.getItem('gradpilot.workspace.v1')");
  await writeFile(join(OUT, "browser-smoke-export.json"), `${JSON.stringify(JSON.parse(exportedWorkspace), null, 2)}\n`, "utf8");
  execFileSync(process.env.PYTHON || "python", [
    "-I", join(ROOT, "scripts", "dashboard_sync.py"),
    "--import", join(OUT, "browser-smoke-export.json")
  ], { cwd: ROOT, stdio: "pipe" });

  const reviewDir = join(OUT, "gmail-review-smoke");
  await rm(reviewDir, { recursive: true, force: true });
  await mkdir(reviewDir, { recursive: true });
  execFileSync(process.env.PYTHON || "python", [
    "-I", join(ROOT, "scripts", "import_gmail.py"), "fetch",
    "--offline-messages", join(ROOT, "tests", "fixtures", "gmail_messages.json"),
    "--data", join(ROOT, "data", "applications.example.json"),
    "--output-dir", reviewDir
  ], { cwd: ROOT, stdio: "pipe" });
  const reviewFile = (await readdir(reviewDir)).find(name => name.endsWith(".review.html"));
  assert.ok(reviewFile, "Gmail review HTML was not generated");
  await cdp.send("Page.navigate", { url: pathToFileURL(join(reviewDir, reviewFile)).href });
  await waitFor(cdp, "document.querySelectorAll('.candidate').length === 4");
  assert.ok(await cdp.evaluate("performance.getEntriesByType('resource').every(entry => !/^https?:/.test(entry.name))"));
  assert.equal(await cdp.evaluate("document.querySelectorAll('.approve-input:checked').length"), 0);
  await screenshot(cdp, "gmail-review.png");

  await cdp.evaluate(`(() => {
    const card = [...document.querySelectorAll('.candidate')].find(item => item.querySelector('h2').textContent.includes('newsletter'));
    card.querySelector('.approve-input').checked = true;
    card.querySelector('.approve-input').dispatchEvent(new Event('change', { bubbles: true }));
    document.getElementById('export').click();
  })()`);
  assert.ok(await cdp.evaluate("!document.getElementById('error').hidden && document.getElementById('error').textContent.includes('选择项目')"));
  await cdp.evaluate("document.getElementById('clear').click()");
  await cdp.evaluate("document.getElementById('select-high').click()");
  assert.equal(await cdp.evaluate("document.querySelectorAll('.approve-input:checked').length"), 2);
  await cdp.evaluate(`(() => {
    const mit = [...document.querySelectorAll('.candidate')].find(item => item.querySelector('h2').textContent.includes('MIT'));
    mit.querySelector('.approve-input').checked = true;
    mit.querySelector('.approve-input').dispatchEvent(new Event('change', { bubbles: true }));
    const berkeley = [...document.querySelectorAll('.candidate')].find(item => item.querySelector('h2').textContent.includes('UC Berkeley'));
    const applicationId = berkeley.querySelector('.field-row[data-field="application_id"] .field-value');
    applicationId.value = 'EDITED-BERKELEY-001';
  })()`);
  assert.equal(await cdp.evaluate("document.querySelectorAll('.approve-input:checked').length"), 3);
  await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: reviewDir });
  await cdp.evaluate("document.getElementById('export').click()");
  let approvedFile;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    approvedFile = (await readdir(reviewDir)).find(name => name.startsWith("gradpilot-gmail-approved-") && name.endsWith(".json"));
    if (approvedFile) break;
    await wait(100);
  }
  assert.ok(approvedFile, "Review confirmation JSON was not downloaded");
  const approvedPath = join(reviewDir, approvedFile);
  const approved = JSON.parse(await readFile(approvedPath, "utf8"));
  assert.equal(approved.kind, "gradpilot-gmail-review");
  assert.equal(approved.approved.length, 3);
  assert.equal(approved.approved.find(item => item.school_id === "berkeley").fields.application_id, "EDITED-BERKELEY-001");
  const preview = execFileSync(process.env.PYTHON || "python", [
    "-I", join(ROOT, "scripts", "import_gmail.py"), "apply", approvedPath,
    "--data", join(ROOT, "data", "applications.example.json")
  ], { cwd: ROOT, encoding: "utf8" });
  assert.ok(preview.includes("Preview only"));
  assert.deepEqual(cdp.exceptions, [], `Browser exceptions: ${JSON.stringify(cdp.exceptions)}`);
  console.log("PASS: overview, charts, dark mode, six-stage season and mobile layout, PI radar/filtering/four-way comparison, persistent Shortlist, three-dimension scores, table/board/calendar views, application IDs and submission/interview dates, funding/policy persistence, school/PI/recommender/budget forms, LOR, dependent tasks, material cards/matrix, pinned documents/essays, checklists, essay versions/reviews, research notes, multiple interactions, interaction-to-task, email drafts, asset verification, schema-valid browser export, and offline Gmail review/export/apply-preview.");
  console.log(`Screenshots: ${OUT}`);
} finally {
  cdp?.close();
  browser.kill();
  await wait(200);
  await rm(profile, { recursive: true, force: true });
}
