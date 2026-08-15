// Local-only screenshot capture for the Emergent review pack.
// Drives the locally-running dev server (http://localhost:3000) with headless
// Chrome. Uses ONLY synthetic values — no real names, emails, tenant IDs,
// passwords, tokens or production data.
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const OUT = process.argv[2] || "/app/docs/screenshots";
const BASE = "http://localhost:3000";
mkdirSync(OUT, { recursive: true });

const CHROME = "/usr/bin/google-chrome";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 402, height: 860, isMobile: true, hasTouch: true };

const shot = async (page, name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log("captured", name);
};

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

async function open(path, viewport) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 800));
  return page;
}

try {
  // ---- Login (desktop) ----
  let page = await open("/login", DESKTOP);
  await shot(page, "login-01-default");
  // Validation: submit empty (if the form exists in this version)
  const submit = await page.$('[data-testid="login-submit-button"], form button');
  if (submit) { await submit.click(); await new Promise((r) => setTimeout(r, 400)); }
  await shot(page, "login-02-validation");
  // Synthetic creds + reveal + help (only if redesigned controls exist)
  const email = await page.$('[data-testid="login-email-input"], input[type="email"]');
  const pwd = await page.$('[data-testid="login-password-input"], input[type="password"]');
  if (email) await email.type("teacher@demo-school.test");
  if (pwd) await pwd.type("synthetic-password-123");
  const toggle = await page.$('[data-testid="login-password-toggle"]');
  if (toggle) await toggle.click();
  const help = await page.$('[data-testid="login-help-toggle"]');
  if (help) await help.click();
  await new Promise((r) => setTimeout(r, 400));
  await shot(page, "login-03-help-reveal");
  await page.close();

  // ---- Login (mobile) ----
  page = await open("/login", MOBILE);
  await shot(page, "login-04-mobile");
  await page.close();

  // ---- Forgot password ----
  page = await open("/password/forgot", DESKTOP);
  await shot(page, "forgot-01-default");
  await page.close();

  // ---- Reset password ----
  page = await open("/password/reset?token=synthetic-demo-token", DESKTOP);
  await shot(page, "reset-01-default");
  await page.close();

  // ---- Invitation accept ----
  page = await open("/invitation/accept?token=synthetic-demo-token", DESKTOP);
  await shot(page, "accept-01-default");
  await page.close();

  console.log("ALL_DONE");
} catch (e) {
  console.error("SCREENSHOT_ERROR", e.message);
} finally {
  await browser.close();
}
