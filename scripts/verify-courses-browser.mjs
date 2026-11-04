import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";

const [baseUrlInput] = process.argv.slice(2);
if (!baseUrlInput) throw new Error("Pass the Development Server URL shown in its startup output.");
const baseUrl = new URL(baseUrlInput).origin;
const username = process.env.ITKMS_TEST_USERNAME;
const password = process.env.ITKMS_TEST_PASSWORD;
if (!username || !password) throw new Error("Set ITKMS_TEST_USERNAME and ITKMS_TEST_PASSWORD for an authorized test account.");

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const tmpRoot = path.resolve("tmp");
const profilePath = path.resolve(tmpRoot, `chrome-cdp-${randomUUID()}`);
if (!profilePath.startsWith(`${tmpRoot}${path.sep}`)) throw new Error("Refusing to create a browser profile outside the task temp folder.");
await mkdir(tmpRoot, { recursive: true });

const cookies = new Map();
function recordCookies(response) {
  for (const header of response.headers.getSetCookie?.() ?? []) {
    const [pair] = header.split(";", 1);
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

let chrome;
let chromeLogs = "";
let cdpSocket;
const pending = new Map();
const eventListeners = new Map();
let commandId = 0;
function connectCdp(url) {
  cdpSocket = new WebSocket(url);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out connecting to Chrome DevTools.")), 10000);
    cdpSocket.addEventListener("open", () => {
      clearTimeout(timer);
      cdpSocket.addEventListener("message", (message) => {
        const event = JSON.parse(String(message.data));
        if (event.id && pending.has(event.id)) {
          const request = pending.get(event.id);
          pending.delete(event.id);
          if (event.error) request.reject(new Error(event.error.message));
          else request.resolve(event.result ?? {});
        } else if (event.method) {
          for (const listener of eventListeners.get(event.method) ?? []) listener(event);
        }
      });
      resolve();
    }, { once: true });
    cdpSocket.addEventListener("error", (error) => {
      clearTimeout(timer);
      reject(error);
    }, { once: true });
  });
}
function send(method, params = {}, sessionId) {
  const id = ++commandId;
  const message = { id, method, params, ...(sessionId ? { sessionId } : {}) };
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Timed out waiting for Chrome DevTools command ${method}.`));
    }, 10000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    cdpSocket.send(JSON.stringify(message));
  });
}
function on(method, listener) {
  const listeners = eventListeners.get(method) ?? [];
  listeners.push(listener);
  eventListeners.set(method, listeners);
}
async function evaluate(expression, sessionId) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? "Browser evaluation failed.");
  return result.result?.value;
}
async function waitFor(sessionId, expression, timeoutMs = 15000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const value = await evaluate(expression, sessionId);
    if (value) return value;
    await delay(200);
  }
  const detail = await evaluate("JSON.stringify({url:location.href,text:document.body?.innerText?.slice(0,500)})", sessionId);
  throw new Error(`Timed out waiting for browser state: ${detail}`);
}

try {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  recordCookies(csrfResponse);
  assert.equal(csrfResponse.status, 200);
  const { csrfToken } = await csrfResponse.json();
  const callback = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ csrfToken, callbackUrl: `${baseUrl}/courses`, json: "true", username, password }),
  });
  recordCookies(callback);
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") },
  });
  recordCookies(sessionResponse);
  const session = await sessionResponse.json();
  assert.ok(session.user?.id && ["ADMIN", "TEACHER"].includes(session.user.role), "Test login must yield an authorized session.");

  const port = 9327;
  chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-gpu-sandbox",
    "--disable-extensions",
    "--disable-background-networking",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-address=127.0.0.1",
    "--remote-allow-origins=*",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profilePath}`,
    "about:blank",
  ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
  chrome.stderr.on("data", (chunk) => { chromeLogs += String(chunk); });

  let browserVersion;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) { browserVersion = await response.json(); break; }
    } catch { /* Chrome is still starting. */ }
    await delay(200);
  }
  if (!browserVersion?.webSocketDebuggerUrl) throw new Error("Chrome headless DevTools did not start.");
  await connectCdp(browserVersion.webSocketDebuggerUrl);
  const target = await send("Target.createTarget", { url: "about:blank" });
  const attached = await send("Target.attachToTarget", { targetId: target.targetId, flatten: true });
  const sessionId = attached.sessionId;
  assert.ok(sessionId, "Chrome did not attach to the page target.");

  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Network.enable", {}, sessionId);
  await send("Page.navigate", {
    url: "data:text/html,%3Chtml%3E%3Cbody%3E%3Ch1%3EBrowser%20automation%20smoke%20test%3C%2Fh1%3E%3C%2Fbody%3E%3C%2Fhtml%3E",
  }, sessionId);
  await waitFor(sessionId, "document.body?.innerText.includes('Browser automation smoke test')");
  const blankPageSmoke = await evaluate("document.body.innerText", sessionId);
  assert.equal(blankPageSmoke, "Browser automation smoke test");
  const consoleErrors = [];
  const courseApiStatuses = [];
  on("Runtime.exceptionThrown", (event) => {
    consoleErrors.push(event.params.exceptionDetails.text ?? "Uncaught browser exception");
  });
  on("Runtime.consoleAPICalled", (event) => {
    if (event.params.type === "error") {
      consoleErrors.push(event.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
    }
  });
  on("Network.responseReceived", (event) => {
    if (/\/api\/courses\?courseCode=21910-2021/.test(event.params.response.url)) {
      courseApiStatuses.push(event.params.response.status);
    }
  });

  for (const [name, value] of cookies) {
    const result = await send("Network.setCookie", { name, value, url: baseUrl, sameSite: "Lax", httpOnly: true }, sessionId);
    assert.notEqual(result.success, false, `Could not set auth cookie ${name}.`);
  }

  async function visitPage() {
    await send("Page.navigate", { url: `${baseUrl}/courses` }, sessionId);
    return waitFor(sessionId, "document.readyState === 'complete' && !!document.querySelector('input[aria-label=\\\"รหัสวิชา\\\"]')");
  }
  async function searchCourse(courseCode = "21910-2021", expectedText = "สื่อโมชันกราฟิก") {
    const found = await evaluate(`(() => {
      const input = document.querySelector('input[aria-label="รหัสวิชา"]');
      const button = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === "ค้นหา");
      if (!input || !button) return false;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(courseCode)});
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: ${JSON.stringify(courseCode)} }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      button.click();
      return true;
    })()`, sessionId);
    assert.equal(found, true, "Course search controls must be available after page load.");
    await waitFor(sessionId, `document.body.innerText.includes(${JSON.stringify(expectedText)})`);
    const details = await evaluate(`JSON.stringify({
      heading: [...document.querySelectorAll('h1,h2,h3')].map((item) => item.innerText).find((text) => text.includes("สื่อโมชันกราฟิก")) ?? null,
      inputValue: document.querySelector('input[aria-label="รหัสวิชา"]')?.value ?? null,
      courseVisible: document.body.innerText.includes("สื่อโมชันกราฟิก")
    })`, sessionId);
    return JSON.parse(details);
  }

  await visitPage();
  const beforeRefresh = await searchCourse();
  await send("Page.reload", { ignoreCache: true }, sessionId);
  await waitFor(sessionId, "document.readyState === 'complete' && !!document.querySelector('input[aria-label=\\\"รหัสวิชา\\\"]')");
  const afterRefresh = await searchCourse();
  const unknownCourse = await searchCourse("99999-9999", "ไม่พบรหัสวิชาในฐานข้อมูล");
  await delay(500);
  assert.equal(beforeRefresh.courseVisible, true);
  assert.equal(afterRefresh.courseVisible, true);
  assert.ok(courseApiStatuses.length >= 2 && courseApiStatuses.every((status) => status === 200));

  console.info(JSON.stringify({
    browser: "Chrome headless (DevTools Protocol)",
    page: `${baseUrl}/courses`,
    authenticatedRole: session.user.role,
    blankPageSmoke,
    beforeRefresh,
    afterRefresh,
    unknownCourse,
    courseApiStatuses,
    consoleErrors,
  }, null, 2));
  if (consoleErrors.length) throw new Error("Browser console reported errors during the course search test.");
} catch (error) {
  console.error(`Browser test error: ${error instanceof Error ? error.stack : String(error)}`);
  if (chromeLogs) console.error(`Chrome output: ${chromeLogs}`);
  throw error;
} finally {
  if (cdpSocket?.readyState === WebSocket.OPEN) cdpSocket.close();
  if (chrome && chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([new Promise((resolve) => chrome.once("exit", resolve)), delay(2000)]);
    if (chrome.exitCode === null && chrome.pid) {
      try { execFileSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }); } catch { /* Process may already have exited. */ }
      await Promise.race([new Promise((resolve) => chrome.once("exit", resolve)), delay(2000)]);
    }
  }
  try {
    await rm(profilePath, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
  } catch (error) {
    console.error(`Temporary Chrome profile cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
