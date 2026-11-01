// اختبارات منظومة القياس: تشغّل الموقع في متصفح حقيقي (Chromium) وتتحقق من صحة الأحداث وخلوّها من البيانات الشخصية.
// التشغيل: node tests/analytics.test.mjs   (يحتاج Playwright مثبتًا. يمكن تحديد مساره بـ PLAYWRIGHT_PATH)
// كل البيانات هنا تجريبية، ولا يُرسل أي شيء إلى أداة التحليلات الحقيقية: طلباتها تُعترض داخل المتصفح.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = "https://aalmozaien-blip.github.io/qararit/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };

// خادم محلي بسيط، والرابط المنشور يُحوَّل إليه داخل المتصفح حتى يكون اسم النطاق مطابقًا للإنتاج
async function serve(path) {
  const p = normalize(join(ROOT, decodeURIComponent(path.split("?")[0])));
  if (!p.startsWith(ROOT)) return null;
  try { return await readFile(p.endsWith("/") ? join(p, "index.html") : p); } catch { try { return await readFile(join(p, "index.html")); } catch { return null; } }
}
const server = createServer(async (req, res) => {
  const body = await serve(req.url);
  if (!body) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(req.url.split("?")[0])] || "text/html; charset=utf-8" }); res.end(body);
}).listen(0);
const PORT = server.address().port;

let failures = 0, passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failures++; console.log("  ✗ " + name + (detail ? "\n      " + JSON.stringify(detail).slice(0, 600) : "")); }
}

const ALLOWED = new Set(["hadith_id", "lang", "from", "to", "via", "category_id", "source", "channel", "results", "on", "challenge_type", "question_level", "question_id", "correct", "attempt",
  "participants", "answered_pct", "correct_pct", "mode", "page", "device", "visitor", "ui_lang", "browser_lang", "browser_lang_supported", "entry", "kind", "file", "line", "part", "lcp", "load",
  "accepted", "hadith_lang", "answer_result", "level_result", "lcp_device", "where"]);
const SECRETS = ["فاطمة الاختبار", "آل الاختبار", "صلاة الضحى سرًا", "local-"];

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });

// سياق متصفح: debug = الأحداث تُسجَّل في الذاكرة. live = يُحاكى الإنتاج وأداة القياس تُستبدل بنسخة تسجّل ما يصلها
async function context({ debug = true, live = false, dnt = false, blockTracker = false } = {}) {
  const ctx = await browser.newContext({ locale: "ar-SA" });
  await ctx.addInitScript(([d, n]) => {
    if (d) localStorage.setItem("qararit.analytics.debug", "1");
    if (n) Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1" });
  }, [debug, dnt]);
  await ctx.route(SITE + "**", async (route) => {
    const u = new URL(route.request().url());
    const r = await fetch(`http://127.0.0.1:${PORT}${u.pathname.replace(/^\/qararit/, "")}${u.search}`);
    let body = Buffer.from(await r.arrayBuffer());
    if (live && u.pathname.endsWith("/analytics.js")) body = Buffer.from(body.toString().replace('websiteId: ""', 'websiteId: "test-website"'));
    // الأسئلة كلها بانتظار اعتماد المراجع، فنفعّل أسئلة المعاينة في الاختبار فقط حتى يمكن إنشاء تحدٍّ
    await route.fulfill({ status: r.status, body, headers: { "content-type": r.headers.get("content-type") || "text/html" } });
  });
  await ctx.route("https://cloud.umami.is/**", (route) => {
    if (blockTracker) return route.abort();
    route.fulfill({ status: 200, contentType: "text/javascript",
      body: "window.__sent=[];window.umami={track:function(a,b){window.__sent.push(typeof a==='function'?{pageview:a({url:'/x',title:'t'})}:{name:a,data:b});}};" });
  });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|cdn\.jsdelivr\.net/, (r) => r.abort());
  return ctx;
}
const log = (page) => page.evaluate(() => (window.QA && window.QA.log) || []);
const names = (l) => l.map((e) => e.kind === "pageview" ? "pageview" : e.name);
const count = (l, n) => names(l).filter((x) => x === n).length;
function clean(l) {
  const bad = [];
  l.forEach((e) => {
    Object.keys(e.data || {}).forEach((k) => { if (!ALLOWED.has(k)) bad.push(k); });
    const s = JSON.stringify(e.data || {});
    SECRETS.forEach((x) => { if (s.includes(x)) bad.push(x); });
  });
  return bad;
}

// ---------------------------------------------------------------- 1. المتصفح الرئيسي
console.log("المتصفح الرئيسي");
{
  const ctx = await context();
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(SITE);
  await page.waitForSelector("#card");
  let l = await log(page);
  check("زيارة الصفحة تُعدّ مرة واحدة", count(l, "pageview") === 1 && count(l, "visit_start") === 1, names(l));
  check("الزائر الأول يُصنَّف جديدًا", l.find((e) => e.name === "visit_start").data.visitor === "new");
  check("تحميل البطاقة وحده لا يُعدّ ظهورًا", count(l, "hadith_view") === 0);
  await page.waitForTimeout(2800);
  l = await log(page);
  const view = l.find((e) => e.name === "hadith_view");
  check("ظهور البطاقة بعد ثانيتين ونصف يُسجَّل مرة", count(l, "hadith_view") === 1 && view.data.source === "home" && /__ar$/.test(view.data.hadith_lang), view);
  await page.click("#btn-flip");
  await page.waitForTimeout(1500);
  await page.click("#btn-unflip"); await page.waitForTimeout(400); await page.click("#btn-flip"); await page.waitForTimeout(300);
  l = await log(page);
  check("فتح المعنى يُسجَّل مرة واحدة رغم تكرار القلب", count(l, "hadith_meaning_open") === 1, names(l));
  check("الوقفة الإيمانية تُسجَّل بعد ظهورها", count(l, "reflection_view") === 1, names(l));
  await page.click("#btn-unflip"); await page.waitForTimeout(400);
  const first = view.data.hadith_id;
  // تبديل اللغة ثم العودة: لا زيارة جديدة ولا ظهور مكرر لنفس الحديث
  await page.click("#lang-picker .lang-btn"); await page.click('#lang-picker button[data-lang="en"]');
  await page.waitForTimeout(3200);
  l = await log(page);
  const lc = l.find((e) => e.name === "language_change");
  check("تغيير اللغة يُسجَّل بمصدره ووجهته", lc && lc.data.from === "ar" && lc.data.to === "en", lc);
  check("تغيير اللغة لا يضاعف الزيارات", count(l, "pageview") === 1 && count(l, "visit_start") === 1);
  check("الحديث نفسه بعد تغيير اللغة لا يُعدّ ظهورًا ثانيًا", l.filter((e) => e.name === "hadith_view" && e.data.hadith_id === first).length === 1);
  await page.click("#btn-next"); await page.waitForTimeout(2900);
  l = await log(page);
  check("الانتقال للتالي يُسجَّل، وظهور الحديث الجديد بمصدر next", count(l, "hadith_next") === 1 && l.filter((e) => e.name === "hadith_view").pop().data.source === "next");
  await page.click("#btn-save"); await page.waitForTimeout(200);
  await page.click("#btn-share"); await page.waitForTimeout(500);
  const url = await page.inputValue("#share-url"), wa = await page.getAttribute("#share-wa", "href");
  check("رابط النسخ يحمل رمز القناة c فقط", /[?&]s=c(#|$)/.test(url) && !/analytics|utm_/.test(url), url);
  check("رابط واتساب يحمل رمز القناة w", decodeURIComponent(wa).includes("s=w"), wa);
  l = await log(page);
  check("المفضلة والمشاركة تُسجَّلان", count(l, "hadith_favorite") === 1 && count(l, "hadith_share_click") === 1, names(l));
  await page.click("#btn-search"); await page.fill("#search-input", "صلاة الضحى سرًا"); await page.waitForTimeout(1800);
  l = await log(page);
  const sp = l.find((e) => e.name === "search_performed");
  check("البحث يُعدّ بفئة النتائج دون عبارة البحث", sp && ["none", "1-5", "6+"].includes(sp.data.results) && !JSON.stringify(sp).includes("الضحى"), sp);
  check("كل الخصائص من قائمة السماح ولا بيانات شخصية", clean(l).length === 0, clean(l));
  check("لا أخطاء برمجية في الصفحة", errors.length === 0, errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 2. الوصول من رابط مشاركة
console.log("روابط المشاركة");
{
  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(SITE + "?s=w#janaza");
  await page.waitForSelector("#card"); await page.waitForTimeout(300);
  const l = await log(page);
  const land = l.find((e) => e.name === "hadith_share_landing"), vs = l.find((e) => e.name === "visit_start");
  check("زيارة من رابط واتساب تُسجَّل مع الحديث والقناة", land && land.data.hadith_id === "janaza" && land.data.channel === "whatsapp", land);
  check("مدخل الزيارة share_link", vs && vs.data.entry === "share_link");
  check("رمز القناة يُحذف من شريط العنوان", !(await page.evaluate(() => location.search)).includes("s="));
  await page.reload(); await page.waitForSelector("#card"); await page.waitForTimeout(300);
  const l2 = await log(page);
  check("إعادة التحميل بعد الحذف لا تُعدّ وصولًا ثانيًا من المشاركة", count(l2, "hadith_share_landing") === 0);
  check("الزيارة الثانية من الجهاز نفسه تُصنَّف عائدة", l2.find((e) => e.name === "visit_start").data.visitor === "returning");
  await ctx.close();
}

// ---------------------------------------------------------------- 3. تحدي الأسرة
console.log("تحدي الأسرة");
{
  const ctx = await context();
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(SITE + "family/");
  await page.waitForSelector("main .btn, main a.btn");
  await page.goto(SITE + "family/#/here");
  await page.waitForSelector("#fname");
  await page.fill("#fname", "آل الاختبار"); await page.fill("#dname", "فاطمة الاختبار");
  await page.click("form button[type=submit]");
  await page.waitForFunction(() => /#\/f\//.test(location.hash));
  const fid = await page.evaluate(() => location.hash.split("/")[2]);
  await page.locator(".dlg summary").waitFor(); await page.keyboard.press("Escape"); // نموذج إضافة الأفراد يُفتح تلقائيًا: نكتفي بمشارك واحد
  await page.goto(SITE + "family/#/f/" + fid + "/new");
  await page.waitForSelector("text=ابدأ التحدي");
  await page.getByRole("button", { name: /تحدي ٣ أحاديث/ }).click(); await page.getByRole("button", { name: /^أطفال/ }).click();
  await page.getByRole("button", { name: "ابدأ التحدي" }).click();
  await page.waitForFunction(() => /\/c\//.test(location.hash));
  // نجيب عن كل الأسئلة ثم ننهي التحدي
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(200);
    if (await page.getByText("اكتشف المعنى").count()) await page.getByText("اكتشف المعنى").click();
    if (await page.getByText("إلى السؤال").count()) await page.getByText("إلى السؤال").click();
    for (;;) {
      const choice = await page.$("section.question .choice:not([disabled])");
      if (!choice) break;
      await choice.click(); await page.getByRole("button", { name: "تأكيد" }).click(); await page.waitForTimeout(200);
    }
    if (await page.getByRole("button", { name: "الحديث التالي" }).count()) { await page.getByRole("button", { name: "الحديث التالي" }).click(); await page.waitForTimeout(200); }
  }
  await page.getByRole("button", { name: "إنهاء التحدي وعرض النتائج" }).click();
  await page.waitForFunction(() => /\/board$/.test(location.hash));
  const l = await log(page);
  check("إنشاء المجلس والتحدي يُسجَّلان", count(l, "family_council_created") === 1 && count(l, "family_challenge_created") === 1, names(l));
  check("بداية التحدي تُسجَّل مرة عند أول إجابة", count(l, "family_challenge_started") === 1);
  const done = l.find((e) => e.name === "family_challenge_completed");
  check("اكتمال التحدي بنسب المجلس كله", done && done.data.challenge_type === "c3" && done.data.question_level === "kids" && done.data.participants === 1 && done.data.answered_pct === 100 && typeof done.data.correct_pct === "number", done);
  const qa = l.filter((e) => e.name === "family_question_answered");
  check("كل إجابة تُسجَّل بنتيجتها ومستواها دون الخيار المختار", qa.length >= 3 && qa.every((e) => /-(ok|no)$/.test(e.data.answer_result) && /^kids-(ok|no)$/.test(e.data.level_result) && !("choice" in e.data)), qa[0]);
  check("لا أسماء ولا معرّفات مجالس في أي حدث", clean(l).length === 0, clean(l));
  check("لا أخطاء برمجية في صفحة الأسرة", errors.length === 0, errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 4. الإيقاف وعدم التتبع
console.log("الخصوصية والإيقاف");
{
  const ctx = await context({ dnt: true });
  const page = await ctx.newPage();
  await page.goto(SITE); await page.waitForSelector("#card"); await page.waitForTimeout(2700);
  check("طلب «عدم التتبع» يوقف القياس كليًا", (await log(page)).length === 0 && !(await page.evaluate(() => QA.enabled)));
  await ctx.close();
}
{
  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(SITE + "?analytics=off"); await page.waitForSelector("#card"); await page.waitForTimeout(2700);
  check("?analytics=off يستبعد الجهاز (لأجهزة الفريق)", (await log(page)).length === 0);
  await page.goto(SITE + "privacy/"); await page.waitForSelector("#ctl-btn");
  check("صفحة الخصوصية تعرض أن القياس متوقف", (await page.textContent("#ctl-status")).includes("متوقف"));
  await page.click("#ctl-btn"); await page.waitForLoadState("load");
  await page.goto(SITE); await page.waitForSelector("#card"); await page.waitForTimeout(300);
  check("إعادة التفعيل من صفحة الخصوصية تعيد القياس", count(await log(page), "pageview") === 1);
  for (const l of ["en", "ur", "id", "fr"]) {
    await page.goto(SITE + "privacy/?lang=" + l); await page.waitForSelector("#title");
    check("صفحة الخصوصية متاحة بلغة " + l, (await page.getAttribute("html", "lang")) === l && (await page.$$("#body section")).length >= 6);
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 5. محاكاة الإنتاج
console.log("محاكاة الإنتاج");
{
  const ctx = await context({ debug: false, live: true });
  const page = await ctx.newPage();
  const reqs = []; page.on("request", (r) => { if (r.url().includes("umami")) reqs.push(r.url()); });
  await page.goto(SITE + "?utm_source=partner&utm_campaign=ramadan&lang=en#janaza");
  await page.waitForSelector("#card"); await page.waitForTimeout(3000);
  const sent = await page.evaluate(() => window.__sent || []);
  const pv = sent.find((x) => x.pageview);
  check("أداة القياس تُحمَّل مرة في الإنتاج", reqs.filter((u) => u.endsWith("/script.js")).length === 1, reqs);
  check("الأحداث المنتظرة تُرسل بعد تحميل الأداة", sent.some((x) => x.name === "visit_start") && sent.some((x) => x.name === "hadith_view"), sent.map((x) => x.name || "pageview"));
  check("عنوان الزيارة بلا # وبلا lang ويحتفظ بمعاملات الحملة", pv && pv.pageview.url === "/qararit/?utm_source=partner&utm_campaign=ramadan", pv);
  const attrs = await page.evaluate(() => { const s = document.querySelector('script[src*="cloud.umami.is"]'); return s && { auto: s.dataset.autoTrack, dnt: s.dataset.doNotTrack }; });
  check("التتبع التلقائي معطل واحترام عدم التتبع مفعّل في الأداة", attrs && attrs.auto === "false" && attrs.dnt === "true", attrs);
  await page.goto(SITE + "family/"); await page.waitForTimeout(800);
  const fsent = await page.evaluate(() => window.__sent || []);
  check("صفحة الأسرة تُقاس رغم سياسة أمان المحتوى", fsent.some((x) => x.pageview), fsent);
  await ctx.close();
}
{
  const ctx = await context({ debug: false, live: true, blockTracker: true });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(SITE); await page.waitForSelector("#card");
  await page.click("#btn-flip"); await page.waitForTimeout(500);
  check("حجب أداة القياس (مانع إعلانات) لا يعطّل الموقع", errors.length === 0 && (await page.evaluate(() => document.getElementById("card").classList.contains("is-flipped"))), errors);
  await ctx.close();
}

// ---------------------------------------------------------------- 6. لوحة الإدارة
console.log("لوحة الإدارة");
{
  const ctx = await context({ debug: false });
  const calls = [];
  // بيانات تجريبية صريحة لاختبار العرض فقط
  await ctx.route("https://api.umami.is/**", (route) => {
    const u = new URL(route.request().url()); calls.push(u);
    const auth = route.request().headers()["authorization"];
    if (auth !== "Bearer test-key") return route.fulfill({ status: 401, body: "{}" });
    const p = u.pathname, t = u.searchParams.get("type"), e = u.searchParams.get("event"), prop = u.searchParams.get("propertyName");
    let body = [];
    if (p.endsWith("/stats")) body = +u.searchParams.get("endAt") < Date.now() - 86400000
      ? { visitors: { value: 100 }, visits: { value: 110 }, pageviews: { value: 150 } }   // الفترة السابقة
      : { visitors: { value: 120 }, visits: { value: 150 }, pageviews: { value: 200 }, bounces: { value: 30 }, totaltime: { value: 9000 } };
    else if (p.endsWith("/metrics") && t === "country") body = [{ x: "SA", y: 80 }, { x: "EG", y: 30 }, { x: "ID", y: 3 }];
    else if (p.endsWith("/metrics") && t === "event") body = [{ x: "hadith_view", y: 300 }, { x: "hadith_meaning_open", y: 90 }, { x: "family_challenge_started", y: 4 }, { x: "family_challenge_completed", y: 3 }, { x: "app_error", y: 2 }];
    else if (p.endsWith("/metrics") && t === "channel") return route.fulfill({ status: 400, body: "{}" });
    else if (p.endsWith("/event-data/values") && e === "hadith_view" && prop === "hadith_id") body = [{ value: "janaza", total: 40 }, { value: "tahlil-100", total: 25 }];
    else if (p.endsWith("/event-data/values") && e === "hadith_meaning_open" && prop === "hadith_id") body = [{ value: "janaza", total: 20 }, { value: "tahlil-100", total: 2 }];
    else if (p.endsWith("/event-data/values") && e === "visit_start" && prop === "ui_lang") body = [{ value: "ar", total: 100 }, { value: "en", total: 20 }];
    else if (p.endsWith("/event-data/values") && e === "family_question_answered" && prop === "level_result") body = [{ value: "kids-ok", total: 8 }, { value: "kids-no", total: 2 }];
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(SITE + "admin/");
  check("اللوحة لا تعرض بيانات قبل الدخول", await page.isVisible("#connect") && !(await page.isVisible("#main")));
  check("صفحة الإدارة لا تحمّل أداة القياس", !(await page.$('script[src*="umami"]')));
  await page.fill("#c-site", "site-1"); await page.fill("#c-key", "wrong"); await page.click("#connect-form button[type=submit]");
  await page.waitForSelector("#connect-error:not([hidden])");
  check("المفتاح الخاطئ يُرفض ويعيد إلى شاشة الدخول", await page.isVisible("#connect"));
  await page.fill("#c-key", "test-key"); await page.click("#connect-form button[type=submit]");
  await page.waitForSelector(".kpi .val");
  const vals = await page.$$eval("#tab-overview .kpi .val", (n) => n.map((x) => x.textContent));
  check("المؤشرات تُعرض من بيانات الأداة", vals[0] === "120" && vals[1] === "150", vals);
  check("نسبة التغير تُحسب مقابل الفترة السابقة", (await page.textContent("#tab-overview")).includes("20٪ عن الفترة السابقة"));
  check("الطلبات تحمل التوقيت ونطاق الفترة", calls.some((u) => u.searchParams.get("timezone") === "Asia/Riyadh" && u.searchParams.get("startAt")));
  await page.click('[data-tab="geo"]'); await page.waitForSelector("#geo-table table");
  await page.click('#geo-table tr.click[data-row="ID"]'); await page.waitForTimeout(300);
  check("دولة فيها أقل من 5 زوار لا تُعرض تفاصيلها", (await page.textContent("#geo-detail")).includes("لا تُعرض التفاصيل"));
  await page.click('[data-tab="hadiths"]');
  check("جدول الأحاديث يعرض نسبة الانتقال للمعنى", (await page.textContent("#tab-hadiths")).includes("50٪"));
  await page.click('[data-tab="family"]');
  check("نسبة الصواب في الأسرة 80٪ ومعدل الإكمال 75٪", (await page.textContent("#tab-family")).includes("80٪") && (await page.textContent("#tab-family")).includes("75٪"));
  await page.click('[data-tab="sources"]');
  check("ما لا تدعمه الأداة يظهر «غير متاح» لا رقمًا", (await page.textContent("#tab-sources")).includes("غير متاح"));
  await page.click('[data-tab="reports"]');
  check("التقرير ينبه إلى قلة البيانات", (await page.textContent("#tab-reports")).includes("البيانات قليلة"));
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-csv")]);
  check("تصدير CSV يعمل", /\.csv$/.test(dl.suggestedFilename()));
  check("لا أخطاء برمجية في اللوحة", errors.length === 0, errors);
  await ctx.close();
}
{
  const ctx = await context({ debug: false });
  await ctx.route("https://api.umami.is/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: route.request().url().includes("/stats") ? JSON.stringify({ visitors: 0, visits: 0, pageviews: 0 }) : "[]" }));
  const page = await ctx.newPage();
  await page.addInitScript(() => { sessionStorage.setItem("qararit.admin.key", "k"); localStorage.setItem("qararit.admin.site", "s"); });
  await page.goto(SITE + "admin/"); await page.waitForSelector(".kpi .val");
  check("بلا بيانات تظهر «لا توجد بيانات حتى الآن»", (await page.textContent("#tab-overview")).includes("لا توجد بيانات حتى الآن"));
  await ctx.close();
}

await browser.close(); server.close();
console.log(`\n${passed} نجح، ${failures} فشل`);
process.exit(failures ? 1 : 0);
