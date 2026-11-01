/* قراريط: طبقة القياس. تجمع أحداثًا مجمّعة لا تعرّف أحدًا، وترسلها إلى أداة تحليلات واحدة بلا ملفات تعريف (كوكيز).
   - لا تُرسل أسماء ولا نصوص يكتبها الزائر ولا معرّفات المجالس أو المشاركين: كل خاصية تمر بقائمة سماح (ALLOWED) وقيمها رموز قصيرة فقط.
   - لا تعمل حتى يُملأ websiteId أدناه، وتتوقف إن طلب الزائر عدم التتبع (Do Not Track / GPC) أو أوقفها من صفحة الخصوصية.
   - تعطّلها أو رفضها لا يمنع أي ميزة في الموقع: كل الدوال تعود بهدوء.
   تعريف كل حدث وخصائصه في docs/analytics/events.md. */
(function () {
  "use strict";

  var CONFIG = {
    provider: "umami",
    websiteId: "",                                  // يُملأ بعد إنشاء حساب الأداة. فارغ = لا يُرسل شيء
    scriptUrl: "https://cloud.umami.is/script.js",
    domains: ["aalmozaien-blip.github.io"]          // لا يُقاس إلا الموقع المنشور، فلا تدخل تجارب الفريق المحلية
  };

  var LS_OFF = "qararit.analytics";        // "off" = أوقفه الزائر على هذا الجهاز
  var LS_DEBUG = "qararit.analytics.debug"; // "1" = يُسجَّل في الذاكرة للاختبار ولا يُرسل
  var LS_SEEN = "qararit.analytics.seen";   // "1" بعد أول زيارة: يميّز الزائر العائد على الجهاز نفسه دون أي معرّف
  var MAX_ERRORS = 5;

  // الخصائص المسموحة فقط. أي خاصية أخرى تُحذف قبل الإرسال
  var ALLOWED = ["hadith_id", "lang", "from", "to", "via", "category_id", "source", "channel", "results", "on",
    "challenge_type", "question_level", "question_id", "correct", "attempt", "participants", "answered_pct", "correct_pct",
    "mode", "page", "device", "visitor", "ui_lang", "browser_lang", "browser_lang_supported", "entry",
    "kind", "file", "line", "part", "lcp", "load", "accepted",
    // خصائص مركّبة (قيمتان في رمز واحد) لأن تقارير الأداة تعدّ قيم خاصية واحدة: تتيح ترتيب الأحاديث لكل لغة ونسب الصواب لكل مستوى
    "hadith_lang", "answer_result", "level_result", "lcp_device", "where"];
  var VALUE = /^[a-z0-9_.\-]{1,48}$/i;

  function ls(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { return null; }
  }

  // أوامر في الرابط لأجهزة الفريق: ?analytics=off يستبعد الجهاز من القياس، ?analytics=on يعيده
  (function () {
    var m = /[?&]analytics=(on|off)\b/.exec(location.search);
    if (m) ls(LS_OFF, m[1] === "off" ? "off" : null);
  })();

  var debug = ls(LS_DEBUG) === "1";
  var dnt = navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;
  var optedOut = ls(LS_OFF) === "off";
  var hostOk = CONFIG.domains.indexOf(location.hostname) !== -1;
  var adminPage = /\/admin\/?$/.test(location.pathname); // لوحة الإدارة لا تُقاس ولا تحمّل أداة القياس
  var live = !!CONFIG.websiteId && hostOk && !dnt && !optedOut && !debug && !adminPage;
  var active = live || (debug && !optedOut && !dnt && !adminPage);

  var queue = [], sent = {}, log = [], errors = 0;

  function clean(props) {
    var out = {};
    if (!props) return out;
    ALLOWED.forEach(function (k) {
      var v = props[k];
      if (typeof v === "number" && isFinite(v)) out[k] = Math.round(v);
      else if (typeof v === "boolean") out[k] = v;
      else if (typeof v === "string" && VALUE.test(v)) out[k] = v;
    });
    return out;
  }

  function send(kind, name, data) {
    if (debug) { log.push({ kind: kind, name: name || null, data: data || null, at: Date.now() }); return; }
    var u = window.umami;
    if (!u || !u.track) { queue.push([kind, name, data]); return; }
    if (kind === "pageview") u.track(function (p) { return Object.assign({}, p, { url: pageUrl(), title: "" }); });
    else u.track(name, data);
  }
  function flush() { var q = queue; queue = []; q.forEach(function (x) { send(x[0], x[1], x[2]); }); }

  // مسار الصفحة بلا # (فيه رمز دعوة المجلس) ولا أي معامل غير معاملات الحملات
  var shareTag = null;
  function pageUrl() {
    var keep = [];
    var q = new URLSearchParams(location.search);
    q.forEach(function (v, k) { if (/^utm_(source|medium|campaign|content|term)$/.test(k) && VALUE.test(v)) keep.push(k + "=" + encodeURIComponent(v)); });
    if (shareTag && !q.has("utm_source")) keep.push("utm_source=share", "utm_medium=" + shareTag);
    return location.pathname + (keep.length ? "?" + keep.join("&") : "");
  }

  function track(name, props) {
    if (!active || !/^[a-z_]{3,40}$/.test(name)) return;
    try { send("event", name, clean(props)); } catch (e) { /* القياس لا يكسر الموقع */ }
  }
  // حدث واحد لكل مفتاح في هذه الصفحة: يمنع العدّ المكرر عند إعادة الرسم أو تبديل اللغة
  function once(key, name, props) {
    if (sent[key]) return false;
    sent[key] = true; track(name, props); return true;
  }

  function device() {
    var w = Math.min(screen.width || innerWidth, screen.height || innerHeight);
    var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
    return coarse ? (w >= 600 ? "tablet" : "mobile") : "desktop";
  }
  function page() {
    return /\/family\/?$/.test(location.pathname) ? "family" : /\/admin\/?$/.test(location.pathname) ? "admin" : /\/privacy\/?$/.test(location.pathname) ? "privacy" : "main";
  }
  function bucket(ms) {
    return ms < 1000 ? "lt1s" : ms < 2500 ? "1-2.5s" : ms < 4000 ? "2.5-4s" : ms < 8000 ? "4-8s" : "8s+";
  }

  // رابط مشاركة حديث: ?s=w|c|i|n يحدد القناة (واتساب، نسخ، صورة، مشاركة الجهاز). يُزال من شريط العنوان بعد قراءته
  (function () {
    var m = /[?&]s=([wcin])\b/.exec(location.search);
    if (!m) return;
    shareTag = { w: "whatsapp", c: "copy", i: "image", n: "native" }[m[1]];
    try {
      var u = new URL(location.href); u.searchParams.delete("s");
      history.replaceState(history.state, "", u.pathname + u.search + u.hash);
    } catch (e) { /* يبقى كما هو */ }
  })();

  function start() {
    if (!active) return;
    var returning = ls(LS_SEEN) === "1";
    ls(LS_SEEN, "1");
    send("pageview");
    var I = window.QI18N, bl = String((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase().split("-")[0];
    if (bl === "in") bl = "id";
    var ui = I ? I.initial() : document.documentElement.lang;
    var hash = (location.hash || "").slice(1);
    track("visit_start", {
      page: page(), device: device(), visitor: returning ? "returning" : "new",
      ui_lang: ui, browser_lang: /^[a-z]{2,3}$/.test(bl) ? bl : "unknown",
      browser_lang_supported: !!(I && I.supported(bl)),
      entry: shareTag ? "share_link" : (page() === "main" && hash && !/^\//.test(hash) ? "hadith_link" : page() === "family" ? "family" : document.documentElement.hasAttribute("data-lang-page") ? "lang_page" : "home")
    });
    if (shareTag && hash && page() === "main") track("hadith_share_landing", { hadith_id: hash, channel: shareTag });
    perf();
  }

  // أداء التحميل: مرة واحدة لكل صفحة، بفئات زمنية لا بأرقام دقيقة
  function perf() {
    var lcp = 0, done = false;
    try {
      new PerformanceObserver(function (l) { var e = l.getEntries(); if (e.length) lcp = e[e.length - 1].startTime; })
        .observe({ type: "largest-contentful-paint", buffered: true });
    } catch (e) { /* غير مدعوم */ }
    function report() {
      if (done) return; done = true;
      var nav = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      var load = nav && nav.loadEventEnd > 0 ? nav.loadEventEnd : 0;
      var lb = lcp ? bucket(lcp) : "unknown";
      track("page_perf", { page: page(), device: device(), lcp: lb, load: load ? bucket(load) : "unknown", lcp_device: device() + "." + lb });
    }
    addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") report(); });
    addEventListener("pagehide", report);
    setTimeout(report, 15000);
  }

  // الأخطاء: نوع الخطأ والملف والسطر فقط، دون نص الرسالة (قد يحوي ما كتبه الزائر)
  function base(f) { var m = /([a-z0-9_.\-]+\.(js|json|css|html))(?:[?#].*)?$/i.exec(String(f || "")); return m ? m[1] : "inline"; }
  function fail(kind, props) {
    if (errors >= MAX_ERRORS) return;
    var p = Object.assign({ page: page(), kind: kind }, props || {});
    if (p.file) p.where = p.file + "-" + (p.line || 0);
    if (once("err:" + kind + ":" + (p.file || "") + ":" + (p.line || "") + ":" + (p.lang || "") + ":" + (p.part || ""), "app_error", p)) errors++;
  }
  addEventListener("error", function (e) {
    var t = e.target;
    if (t && t !== window && (t.tagName === "SCRIPT" || t.tagName === "LINK" || t.tagName === "IMG")) {
      if (t.src && t.src.indexOf(CONFIG.scriptUrl) === 0) return; // مانع إعلانات حجب أداة القياس نفسها: لا نعدّه خطأ
      fail("resource_" + t.tagName.toLowerCase(), { file: base(t.src || t.href) });
      return;
    }
    fail((e.error && e.error.name) || "script_error", { file: base(e.filename), line: e.lineno || 0 });
  }, true);
  addEventListener("unhandledrejection", function () { fail("promise_rejection", {}); });

  function load() {
    if (!live) return;
    var s = document.createElement("script");
    s.defer = true;
    s.src = CONFIG.scriptUrl;
    s.setAttribute("data-website-id", CONFIG.websiteId);
    s.setAttribute("data-auto-track", "false");        // الصفحات نعدّها نحن: مرة لكل تحميل، لا مع كل بطاقة أو تبديل لغة
    s.setAttribute("data-do-not-track", "true");
    s.setAttribute("data-exclude-search", "true");
    s.setAttribute("data-exclude-hash", "true");
    s.setAttribute("data-domains", CONFIG.domains.join(","));
    s.onload = flush;
    document.head.appendChild(s);
  }

  window.QA = {
    track: track, once: once, fail: fail, device: device,
    get enabled() { return active; },
    get status() { return { live: live, debug: debug, dnt: dnt, optedOut: optedOut, configured: !!CONFIG.websiteId, hostOk: hostOk }; },
    log: log,
    optOut: function () { ls(LS_OFF, "off"); optedOut = true; live = active = false; queue = []; },
    optIn: function () { ls(LS_OFF, null); },
    config: { provider: CONFIG.provider, websiteId: CONFIG.websiteId }
  };

  load();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
