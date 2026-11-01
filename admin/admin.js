/* لوحة الأثر والانتشار العالمي. تقرأ الأرقام من واجهة Umami البرمجية بمفتاح يدخله المسؤول، ولا تخزّن أي بيانات في الموقع.
   قواعد العرض:
   - لا أرقام مختلقة: ما لا تعيده الأداة يظهر «لا توجد بيانات حتى الآن» أو «غير متاح».
   - الزوار الفريدون يُطلبون للفترة كاملة من الأداة، ولا تُجمع أرقام الأيام لتقديمها عدد أشخاص.
   - الشرائح الجغرافية الصغيرة (أقل من MIN_SEGMENT زائرًا) لا تُعرض تفاصيلها حتى لا تكشف أفرادًا.
   تعريف كل مؤشر في DEFS أدناه وفي docs/analytics/kpis.md. */
(function () {
  "use strict";

  var MIN_SEGMENT = 5;      // أقل عدد زوار تُعرض عنده تفاصيل منطقة أو مدينة أو دولة
  var MIN_HADITH = 20;      // أقل عدد ظهور يُحكم عنده على تفاعل حديث
  var TZ = "Asia/Riyadh";
  var LANGS = { ar: "العربية", en: "English", ur: "اردو", id: "Bahasa Indonesia", fr: "Français" };
  var LS_SITE = "qararit.admin.site", LS_API = "qararit.admin.api", SS_KEY = "qararit.admin.key", LS_KEY = "qararit.admin.key";

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var nf = new Intl.NumberFormat("ar-SA-u-nu-latn");
  function num(n) { return n == null || isNaN(n) ? "—" : nf.format(Math.round(n)); }
  function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : null; }
  function pctTxt(v) { return v == null ? "—" : nf.format(v) + "٪"; }
  function store(k, v, local) { try { (local ? localStorage : sessionStorage)[v == null ? "removeItem" : "setItem"](k, v); } catch (e) {} }
  function read(k, local) { try { return (local ? localStorage : sessionStorage).getItem(k); } catch (e) { return null; } }

  // ------------------------------------------------------------------ تعريفات المؤشرات
  var DEFS = {
    visitors: ["الزوار المقدَّرون", "عدد الزوار الفريدين في الفترة كما تقدّره أداة التحليلات.", "Umami: stats.visitors", "تقدّره الأداة بلا كوكيز عبر بصمة يومية متغيرة لا تُخزَّن؛ فالزائر نفسه في يومين مختلفين قد يُعدّ مرتين. لا يُجمع من أرقام الأيام."],
    visits: ["الجلسات (الزيارات)", "عدد الزيارات المنفصلة. الزائر الواحد قد يزور مرات.", "Umami: stats.visits", "تبدأ زيارة جديدة بعد انقطاع النشاط وفق تعريف الأداة."],
    pageviews: ["مشاهدات الصفحات", "مرات تحميل صفحات الموقع (الرئيسية، صفحات اللغات، تحدي الأسرة، الخصوصية).", "Umami: stats.pageviews", "مرة لكل تحميل صفحة؛ تبديل البطاقات أو اللغة داخل الصفحة لا يضيف مشاهدة."],
    hadith_views: ["ظهور بطاقات الأحاديث", "مرات بقاء بطاقة حديث معروضة ثانيتين ونصفًا والصفحة ظاهرة.", "حدث hadith_view", "مرة واحدة لكل حديث في كل تحميل للصفحة. لا يثبت القراءة الكاملة."],
    countries: ["الدول التي وصل إليها المشروع", "عدد الدول التي جاء منها زائر واحد على الأقل في الفترة.", "Umami: metrics country", "الموقع تقريبي من عنوان الشبكة."],
    languages: ["لغات الواجهة المستخدمة", "عدد لغات الواجهة التي فُتح بها الموقع في الفترة.", "حدث visit_start (ui_lang)", "لغة الواجهة التي يعرضها الموقع عند الدخول، لا لغة المتصفح."],
    shares: ["ضغطات المشاركة", "ضغطات زر مشاركة حديث وصوره. الضغط لا يثبت أن الرسالة أُرسلت.", "أحداث hadith_share_click و hadith_share_image", "—"],
    landings: ["زيارات من روابط المشاركة", "زيارات فتحت رابط حديث شاركه أحدهم من الموقع.", "حدث hadith_share_landing", "تُعرف من رمز القناة في الرابط (?s=)؛ بعض التطبيقات تحذف الروابط أو تفتحها داخلها."],
    councils: ["المجالس الأسرية المنشأة", "مجالس تحدي الأسرة التي أُنشئت.", "حدث family_council_created", "نمط الجهاز الواحد فقط حاليًا."],
    completed: ["التحديات المكتملة", "تحديات أنهاها مسؤول المجلس.", "حدث family_challenge_completed", "—"],
    completion_rate: ["معدل إكمال التحدي", "التحديات المكتملة ÷ التحديات التي بدأت فعليًا × 100.", "family_challenge_completed ÷ family_challenge_started", "«بدأ فعليًا» = سُجّلت فيه إجابة واحدة على الأقل."],
    correct_rate: ["نسبة الإجابات الصحيحة", "الإجابات الصحيحة ÷ كل الإجابات المسجلة × 100.", "حدث family_question_answered", "تقيس الأداء على أسئلة المشروع فقط، لا التديّن ولا الأثر الروحي."],
    returning: ["الزوار العائدون (تقريبي)", "نسبة الزيارات من أجهزة زارت الموقع من قبل.", "visit_start (visitor = returning)", "تعتمد على علامة في متصفح الزائر بلا معرّف؛ تُفقد بمسح البيانات أو تغيير الجهاز أو المتصفح، فالنسبة الحقيقية أعلى غالبًا."],
    meaning_rate: ["نسبة فتح المعنى", "فتح المعنى ÷ ظهور البطاقات × 100.", "hadith_meaning_open ÷ hadith_view", "—"],
    per_visit: ["أحاديث لكل زيارة", "ظهور البطاقات ÷ الزيارات.", "hadith_view ÷ visits", "متوسط تقريبي."],
    share_rate: ["معدل المشاركة", "ضغطات المشاركة ÷ ظهور البطاقات × 100.", "hadith_share_click ÷ hadith_view", "—"],
    error_rate: ["معدل الأخطاء التقنية", "أحداث الأخطاء ÷ مشاهدات الصفحات × 100.", "app_error ÷ pageviews", "حد أقصى خمسة أخطاء لكل تحميل صفحة."]
  };
  function info(k) { var d = DEFS[k]; return d ? '<span class="info" title="' + esc(d[1] + "\nالمصدر: " + d[2] + "\n" + d[3]) + '">؟</span>' : ""; }

  // ------------------------------------------------------------------ الاتصال بـ Umami
  var C = { site: read(LS_SITE, true) || "", api: read(LS_API, true) || "https://api.umami.is/v1", key: read(SS_KEY) || read(LS_KEY, true) || "" };
  function api(path, params) {
    var q = new URLSearchParams();
    Object.keys(params || {}).forEach(function (k) { if (params[k] !== "" && params[k] != null) q.set(k, params[k]); });
    var url = C.api.replace(/\/$/, "") + "/websites/" + encodeURIComponent(C.site) + path + (q.toString() ? "?" + q : "");
    return fetch(url, { headers: { Authorization: "Bearer " + C.key, Accept: "application/json" } }).then(function (r) {
      if (r.status === 401 || r.status === 403) throw new Error("auth");
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    });
  }
  // لا يكسر الصفحة إن لم تدعم الأداة طلبًا معيّنًا: يعيد null فيظهر «غير متاح»
  function soft(p) { return p.then(function (x) { return x; }, function (e) { if (e.message === "auth") throw e; return null; }); }

  // ------------------------------------------------------------------ الفترة والمرشحات
  var F = { days: 30, from: null, to: null, country: "", device: "", lang: "" };
  function range(prev) {
    var end, start;
    if (F.days === "custom" && F.from && F.to) {
      start = new Date(F.from + "T00:00:00+03:00").getTime();
      end = new Date(F.to + "T23:59:59+03:00").getTime();
    } else {
      end = Date.now(); start = end - (F.days === "custom" ? 30 : F.days) * 86400000;
    }
    if (prev) { var len = end - start; end = start - 1; start = end - len; }
    return { startAt: start, endAt: end };
  }
  function filt(extra) { return Object.assign({}, { country: F.country, device: F.device, timezone: TZ }, extra || {}); }
  function periodLabel() {
    var r = range(), f = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
    return f.format(r.startAt) + " – " + f.format(r.endAt);
  }

  // ------------------------------------------------------------------ تحميل البيانات
  function stats(r, extra) { return soft(api("/stats", Object.assign(filt(extra), r))); }
  function metrics(type, r, extra) { return soft(api("/metrics", Object.assign(filt(extra), r, { type: type, limit: 500 }))); }
  function values(event, prop, r, extra) {
    return soft(api("/event-data/values", Object.assign(filt(extra), r, { event: event, propertyName: prop }))).then(function (rows) {
      return rows ? rows.map(function (x) { return { x: String(x.value), y: +x.total || 0 }; }) : null;
    });
  }
  function v(x) { return x == null ? null : typeof x === "object" ? (x.value != null ? +x.value : null) : +x; }
  function sNorm(s) {
    if (!s) return null;
    return { visitors: v(s.visitors), visits: v(s.visits), pageviews: v(s.pageviews), bounces: v(s.bounces), totaltime: v(s.totaltime) };
  }
  function map(rows) { var m = {}; (rows || []).forEach(function (r) { m[r.x] = (m[r.x] || 0) + r.y; }); return m; }
  function sum(rows) { return (rows || []).reduce(function (a, r) { return a + r.y; }, 0); }

  var D = null, base = null; // D: بيانات الفترة الحالية، base: الأحاديث والترجمات من ملفات الموقع
  function loadBase() {
    if (base) return Promise.resolve(base);
    return fetch("../data/hadiths.json").then(function (r) { return r.json(); }).then(function (d) {
      var pub = (d.site && d.site.publish_statuses) || ["approved"];
      var hs = d.hadiths.filter(function (h) { return pub.indexOf(h.status) !== -1; });
      var cats = {}; (d.categories || []).forEach(function (c) { cats[c.id] = c.name; });
      return Promise.all(Object.keys(LANGS).filter(function (l) { return l !== "ar"; }).map(function (l) {
        return fetch("../data/content/" + l + ".json").then(function (r) { return r.json(); }).then(function (c) { return [l, c]; }, function () { return [l, null]; });
      })).then(function (tr) {
        var cov = { ar: { approved: hs.length, draft: 0, total: hs.length } };
        tr.forEach(function (x) {
          var a = 0, dr = 0, H = (x[1] && x[1].hadiths) || {};
          hs.forEach(function (h) { var t = H[h.id]; if (!t) return; if (t.status === "approved") a++; else dr++; });
          cov[x[0]] = { approved: a, draft: dr, total: hs.length };
        });
        base = { hadiths: hs, cats: cats, coverage: cov, byId: hs.reduce(function (m, h) { m[h.id] = h; return m; }, {}) };
        return base;
      });
    });
  }

  var HEV = ["hadith_view", "hadith_meaning_open", "reflection_view", "hadith_more_open", "hadith_favorite", "hadith_share_click", "hadith_share_image", "hadith_next"];
  function loadAll() {
    var r = range(), rp = range(true), now = Date.now();
    var jobs = {
      cur: stats(r), prev: stats(rp),
      d1: stats({ startAt: now - 86400000, endAt: now }), d7: stats({ startAt: now - 7 * 86400000, endAt: now }), d30: stats({ startAt: now - 30 * 86400000, endAt: now }),
      events: metrics("event", r), eventsPrev: metrics("event", rp),
      country: metrics("country", r), countryPrev: metrics("country", rp),
      region: metrics("region", r), city: metrics("city", r),
      browserLang: metrics("language", r), device: metrics("device", r), browser: metrics("browser", r), os: metrics("os", r),
      referrer: metrics("referrer", r), channel: metrics("channel", r),
      utmSource: metrics("utm_source", r), utmMedium: metrics("utm_medium", r), utmCampaign: metrics("utm_campaign", r),
      uiLang: values("visit_start", "ui_lang", r), visitor: values("visit_start", "visitor", r), entry: values("visit_start", "entry", r),
      blang: values("visit_start", "browser_lang", r), blangSup: values("visit_start", "browser_lang_supported", r),
      langChange: values("language_change", "to", r), langFrom: values("language_change", "from", r), langVia: values("language_change", "via", r),
      viewSource: values("hadith_view", "source", r),
      landing: values("hadith_share_landing", "hadith_id", r), landingCh: values("hadith_share_landing", "channel", r),
      famType: values("family_challenge_completed", "challenge_type", r), famLevel: values("family_challenge_completed", "question_level", r),
      famStartType: values("family_challenge_started", "challenge_type", r), famCreatedType: values("family_challenge_created", "challenge_type", r),
      famParts: values("family_challenge_completed", "participants", r), famAnswered: values("family_challenge_completed", "answered_pct", r),
      famCorrectPct: values("family_challenge_completed", "correct_pct", r),
      levelResult: values("family_question_answered", "level_result", r), answerResult: values("family_question_answered", "answer_result", r),
      errKind: values("app_error", "kind", r), errWhere: values("app_error", "where", r), errLang: values("app_error", "lang", r),
      perf: values("page_perf", "lcp_device", r), search: values("search_performed", "results", r), topics: values("topic_open", "category_id", r)
    };
    HEV.forEach(function (e) { jobs["h:" + e] = values(e, F.lang ? "hadith_lang" : "hadith_id", r); jobs["l:" + e] = values(e, "lang", r); });
    var keys = Object.keys(jobs);
    return Promise.all(keys.map(function (k) { return jobs[k]; })).then(function (res) {
      var out = {}; keys.forEach(function (k, i) { out[k] = res[i]; });
      out.cur = sNorm(out.cur); out.prev = sNorm(out.prev); out.d1 = sNorm(out.d1); out.d7 = sNorm(out.d7); out.d30 = sNorm(out.d30);
      out.ev = map(out.events); out.evPrev = map(out.eventsPrev);
      // مرشح اللغة في جداول الأحاديث: hadith_lang = <id>__<lang>
      HEV.forEach(function (e) {
        var rows = out["h:" + e];
        if (rows && F.lang) rows = rows.filter(function (x) { return x.x.slice(-(F.lang.length + 2)) === "__" + F.lang; }).map(function (x) { return { x: x.x.slice(0, -(F.lang.length + 2)), y: x.y }; });
        out["h:" + e] = rows ? map(rows) : null;
      });
      return out;
    });
  }

  // ------------------------------------------------------------------ أدوات العرض
  function change(cur, prev) {
    if (cur == null || prev == null) return '<span class="chg flat">لا مقارنة</span>';
    if (!prev) return cur ? '<span class="chg up">جديد في هذه الفترة</span>' : '<span class="chg flat">—</span>';
    var p = Math.round(100 * (cur - prev) / prev);
    return '<span class="chg ' + (p > 0 ? "up" : p < 0 ? "down" : "flat") + '">' + (p > 0 ? "▲ " : p < 0 ? "▼ " : "") + nf.format(Math.abs(p)) + "٪ عن الفترة السابقة</span>";
  }
  function kpi(key, val, prev, fmt) {
    var d = DEFS[key] || [key];
    return '<div class="kpi"><div class="lbl"><span>' + esc(d[0]) + "</span>" + info(key) + '</div><div class="val">' + (val == null ? "—" : fmt ? fmt(val) : num(val)) + "</div>" + (prev === undefined ? "" : change(val, prev)) + "</div>";
  }
  // جدول قابل للتصدير: كل جدول يحمل بياناته ليُصدَّر CSV
  var tables = {};
  function table(id, title, cols, rows, opts) {
    opts = opts || {};
    tables[id] = { title: title, cols: cols.map(function (c) { return c[0]; }), rows: rows.map(function (r) { return cols.map(function (c) { return c[2] ? c[2](r) : r[c[1]]; }); }) };
    if (!rows.length) return (title ? "<h2>" + esc(title) + "</h2>" : "") + '<p class="empty">لا توجد بيانات حتى الآن.</p>';
    var max = opts.bar ? Math.max.apply(null, rows.map(function (r) { return +r[opts.bar] || 0; })) || 1 : 0;
    return (title ? "<h2>" + esc(title) + "</h2>" : "") + (opts.note ? '<p class="muted">' + opts.note + "</p>" : "") +
      '<table data-table="' + id + '"><thead><tr>' + cols.map(function (c) { return '<th class="' + (c[3] || "") + '">' + esc(c[0]) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.slice(0, opts.limit || 500).map(function (r, i) {
        return "<tr" + (opts.click ? ' class="click" data-row="' + esc(opts.click(r)) + '"' : "") + ">" + cols.map(function (c, j) {
          var raw = c[2] ? c[2](r) : r[c[1]];
          var shown = c[4] ? c[4](raw, r) : (c[3] === "n" ? (typeof raw === "number" ? num(raw) : esc(raw == null ? "—" : raw)) : esc(raw == null ? "—" : raw));
          var bar = opts.bar && c[1] === opts.bar ? '<i style="width:' + Math.round(100 * (+r[opts.bar] || 0) / max) + '%"></i>' : "";
          return '<td class="' + (c[3] || "") + (bar ? " barcell" : "") + '">' + bar + '<span style="position:relative">' + shown + "</span></td>";
        }).join("") + "</tr>";
      }).join("") + "</tbody></table>";
  }
  function na(title, why) { return "<h2>" + esc(title) + '</h2><p class="empty">' + esc(why || "غير متاح من أداة التحليلات بهذا الطلب.") + "</p>"; }
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(["ar"], { type: "region" }); } catch (e) {}
  function cname(code) { try { return (regionNames && regionNames.of(code)) || code; } catch (e) { return code; } }
  var langNames = null;
  try { langNames = new Intl.DisplayNames(["ar"], { type: "language" }); } catch (e) {}
  function lname(code) { if (LANGS[code]) return LANGS[code]; try { return (langNames && langNames.of(code)) || code; } catch (e) { return code; } }
  function hname(id) { var h = base && base.byId[id]; return h ? h.title : id; }
  function evc(name) { return D.ev[name] || 0; }

  // ------------------------------------------------------------------ نظرة عامة
  function renderOverview() {
    var c = D.cur || {}, p = D.prev || {}, ev = D.ev, pe = D.evPrev;
    var views = evc("hadith_view"), visits = c.visits;
    var ret = map(D.visitor), retTotal = (ret.returning || 0) + (ret["new"] || 0);
    var started = evc("family_challenge_started"), done = evc("family_challenge_completed");
    var lr = map(D.levelResult), ok = 0, all = 0; Object.keys(lr).forEach(function (k) { all += lr[k]; if (/-ok$/.test(k)) ok += lr[k]; });
    var html = '<div class="kpis">' +
      kpi("visitors", c.visitors, p.visitors) + kpi("visits", c.visits, p.visits) + kpi("pageviews", c.pageviews, p.pageviews) +
      kpi("hadith_views", D.events ? views : null, D.eventsPrev ? (pe.hadith_view || 0) : null) +
      kpi("countries", D.country ? D.country.length : null, D.countryPrev ? D.countryPrev.length : null) +
      kpi("languages", D.uiLang ? D.uiLang.length : null) +
      kpi("shares", D.events ? evc("hadith_share_click") + evc("hadith_share_image") : null, D.eventsPrev ? (pe.hadith_share_click || 0) + (pe.hadith_share_image || 0) : null) +
      kpi("landings", D.events ? evc("hadith_share_landing") : null, D.eventsPrev ? (pe.hadith_share_landing || 0) : null) +
      kpi("councils", D.events ? evc("family_council_created") : null, D.eventsPrev ? (pe.family_council_created || 0) : null) +
      kpi("completed", D.events ? done : null, D.eventsPrev ? (pe.family_challenge_completed || 0) : null) +
      kpi("meaning_rate", pct(evc("hadith_meaning_open"), views), undefined, pctTxt) +
      kpi("per_visit", visits ? Math.round(10 * views / visits) / 10 : null, undefined, function (x) { return nf.format(x); }) +
      kpi("returning", retTotal ? pct(ret.returning || 0, retTotal) : null, undefined, pctTxt) +
      kpi("completion_rate", started ? pct(done, started) : null, undefined, pctTxt) +
      kpi("correct_rate", all ? pct(ok, all) : null, undefined, pctTxt) +
      "</div>";
    html += '<div class="panel"><h2>الزوار في نوافذ زمنية ثابتة ' + info("visitors") + '</h2><div class="kpis">' +
      '<div class="kpi"><div class="lbl">آخر 24 ساعة</div><div class="val">' + num(D.d1 && D.d1.visitors) + "</div></div>" +
      '<div class="kpi"><div class="lbl">آخر 7 أيام</div><div class="val">' + num(D.d7 && D.d7.visitors) + "</div></div>" +
      '<div class="kpi"><div class="lbl">آخر 30 يومًا</div><div class="val">' + num(D.d30 && D.d30.visitors) + "</div></div></div>" +
      '<p class="muted">كل رقم تقدّره الأداة لنافذته كاملة؛ لذلك لا يساوي رقم الشهر مجموع أرقام الأيام. المقارنة في البطاقات أعلاه مع الفترة السابقة المساوية في الطول. التوقيت: الرياض (UTC+3).</p></div>';
    var top = topHadiths(10);
    html += '<div class="grid2"><div class="panel">' + table("ov_countries", "أكثر الدول زيارة", [["الدولة", "x", function (r) { return cname(r.x); }], ["الزوار", "y", null, "n"]], (D.country || []).slice(0, 8), { bar: "y" }) +
      '</div><div class="panel">' + table("ov_hadiths", "أكثر الأحاديث تفاعلًا", [["الحديث", "id", function (r) { return hname(r.id); }], ["الظهور", "views", null, "n"], ["فتح المعنى", "rate", function (r) { return r.rate; }, "n", pctTxt]], top) + "</div></div>";
    if (!c.visits) html = '<div class="notice">لا توجد بيانات حتى الآن لهذه الفترة. إن كانت الأداة رُبطت حديثًا فانتظر حتى تصل أول الزيارات.</div>' + html;
    $("tab-overview").innerHTML = html;
  }

  // ------------------------------------------------------------------ الأحاديث
  function hadithRows() {
    var H = function (e) { return D["h:" + e] || {}; };
    var landing = map(D.landing);
    return (base ? base.hadiths : []).map(function (h) {
      var vws = H("hadith_view")[h.id] || 0, m = H("hadith_meaning_open")[h.id] || 0;
      return { id: h.id, n: h.n, title: h.title, cat: base.cats[h.categories[0]] || h.categories[0], views: vws, meaning: m, rate: pct(m, vws),
        reflect: H("reflection_view")[h.id] || 0, more: H("hadith_more_open")[h.id] || 0, fav: H("hadith_favorite")[h.id] || 0,
        share: (H("hadith_share_click")[h.id] || 0) + (H("hadith_share_image")[h.id] || 0), next: H("hadith_next")[h.id] || 0, landing: landing[h.id] || 0 };
    });
  }
  function score(r) { return r.views ? (r.meaning + 2 * r.fav + 3 * r.share + r.reflect) / r.views : 0; }
  function topHadiths(n) {
    return hadithRows().filter(function (r) { return r.views >= MIN_HADITH; }).sort(function (a, b) { return score(b) - score(a); }).slice(0, n);
  }
  function renderHadiths() {
    var rows = hadithRows(), enough = rows.filter(function (r) { return r.views >= MIN_HADITH; });
    var rates = enough.map(function (r) { return r.rate || 0; }).sort(function (a, b) { return a - b; });
    var median = rates.length ? rates[Math.floor(rates.length / 2)] : null;
    var low = enough.filter(function (r) { return (r.rate || 0) < (median || 0) / 2; }).sort(function (a, b) { return b.views - a.views; });
    var rare = rows.filter(function (r) { return r.views < MIN_HADITH; }).sort(function (a, b) { return a.views - b.views; });
    var cols = [["#", "n", null, "n"], ["الحديث", "title"], ["الموضوع", "cat"], ["الظهور", "views", null, "n"], ["فتح المعنى", "meaning", null, "n"], ["نسبة الانتقال للمعنى", "rate", null, "n", pctTxt],
      ["الوقفة الإيمانية", "reflect", null, "n"], ["المزيد", "more", null, "n"], ["المفضلة", "fav", null, "n"], ["المشاركة", "share", null, "n"], ["التالي", "next", null, "n"], ["زيارات من مشاركته", "landing", null, "n"]];
    var none = !D["h:hadith_view"];
    $("tab-hadiths").innerHTML =
      (F.lang ? '<div class="notice">الجدول مقصور على لغة الواجهة: ' + esc(lname(F.lang)) + ".</div>" : "") +
      '<div class="panel"><p class="muted">الأرقام تقيس التفاعل لا جودة الحديث ولا قيمته الشرعية. لا يُحكم على حديث ظهر أقل من ' + num(MIN_HADITH) + " مرة. «الظهور» بقاء البطاقة ثانيتين ونصفًا على الشاشة، ولا يثبت القراءة.</p></div>" +
      '<div class="grid2"><div class="panel">' + table("h_top", "أكثر 10 أحاديث تفاعلًا", [["الحديث", "title"], ["الظهور", "views", null, "n"], ["فتح المعنى", "rate", null, "n", pctTxt], ["المفضلة", "fav", null, "n"], ["المشاركة", "share", null, "n"]], topHadiths(10), { note: "ترتيب بمؤشر مركب: (فتح المعنى + الوقفة + 2×المفضلة + 3×المشاركة) ÷ الظهور." }) +
      '</div><div class="panel">' + table("h_low", "ظهرت كثيرًا وتفاعل معها قليل", [["الحديث", "title"], ["الظهور", "views", null, "n"], ["فتح المعنى", "rate", null, "n", pctTxt]], low.slice(0, 10), { note: "نسبة فتح المعنى أقل من نصف الوسيط (" + pctTxt(median) + "). مرشحة لتحسين العنوان أو المقدمة." }) + "</div></div>" +
      '<div class="panel">' + table("h_rare", "أحاديث قليلة الظهور", [["الحديث", "title"], ["الظهور", "views", null, "n"]], rare.slice(0, 20), { note: "قلة الظهور تعني أن الزوار لم يصلوا إليها بعد، لا أنها أقل أثرًا." }) + "</div>" +
      '<div class="panel">' + (none ? na("كل الأحاديث", "لا توجد بيانات أحداث حتى الآن.") : table("h_all", "كل الأحاديث", cols, rows.slice().sort(function (a, b) { return b.views - a.views; }), { bar: "views" })) + "</div>";
  }

  // ------------------------------------------------------------------ الانتشار العالمي
  var mapObj = null, selCountry = null;
  function renderGeo() {
    var rows = D.country || [], total = sum(rows), prev = map(D.countryPrev);
    var data = {}; rows.forEach(function (r) { data[r.x] = r.y; });
    $("geo-table").innerHTML = table("geo", "الدول", [["الدولة", "x", function (r) { return cname(r.x); }], ["الزوار", "y", null, "n"], ["النسبة", "p", function (r) { return pct(r.y, total); }, "n", pctTxt]], rows, { bar: "y", click: function (r) { return r.x; } });
    var growth = rows.filter(function (r) { return r.y >= 20; }).map(function (r) { return { x: r.x, y: r.y, p: prev[r.x] || 0, g: prev[r.x] ? Math.round(100 * (r.y - prev[r.x]) / prev[r.x]) : null }; })
      .sort(function (a, b) { return (b.g == null ? 1e9 : b.g) - (a.g == null ? 1e9 : a.g); });
    $("geo-growth").innerHTML = table("geo_growth", "مقارنة الدول: أين ينمو الاستخدام؟", [["الدولة", "x", function (r) { return cname(r.x); }], ["الفترة الحالية", "y", null, "n"], ["الفترة السابقة", "p", null, "n"], ["التغير", "g", function (r) { return r.g == null ? "جديد" : r.g + "٪"; }, "n"]], growth, { note: "دول فيها 20 زائرًا على الأقل في الفترة الحالية." });
    var el = $("map");
    if (!window.jsVectorMap) { el.innerHTML = '<p class="empty">تعذّر تحميل مكتبة الخريطة. الجدول يعرض البيانات نفسها.</p>'; }
    else {
      if (mapObj && mapObj.destroy) try { mapObj.destroy(); } catch (e) {}
      el.innerHTML = "";
      try {
        mapObj = new jsVectorMap({
          selector: "#map", map: "world", zoomButtons: true, regionStyle: { initial: { fill: "#d9d4c7" } },
          visualizeData: rows.length ? { scale: ["#cfe5da", "#1d4f40"], values: data } : undefined,
          onRegionTooltipShow: function (e, tip, code) { tip.text(cname(code) + ": " + (data[code] ? num(data[code]) + " زائر" : "لا زيارات"), true); },
          onRegionClick: function (e, code) { if (data[code]) countryDetail(code); }
        });
      } catch (e) { el.innerHTML = '<p class="empty">تعذّر رسم الخريطة.</p>'; }
    }
    if (selCountry && data[selCountry]) countryDetail(selCountry);
  }
  function countryDetail(code) {
    selCountry = code;
    var box = $("geo-detail");
    var rows = D.country || [], total = sum(rows), cv = map(rows)[code] || 0;
    box.innerHTML = "<h2>" + esc(cname(code)) + '</h2><p class="loading">جارٍ التحميل…</p>';
    if (cv < MIN_SEGMENT) { box.innerHTML = "<h2>" + esc(cname(code)) + '</h2><p class="muted">عدد الزوار أقل من ' + MIN_SEGMENT + "؛ لا تُعرض التفاصيل حماية للخصوصية.</p>"; return; }
    var r = range(), rp = range(true), ex = { country: code };
    Promise.all([stats(r, ex), stats(rp, ex), values("visit_start", "ui_lang", r, ex), values("hadith_view", "hadith_id", r, ex), metrics("referrer", r, ex),
      metrics("region", r, ex), metrics("city", r, ex), metrics("event", r, ex)]).then(function (x) {
      var s = sNorm(x[0]) || {}, sp = sNorm(x[1]) || {}, langs = (x[2] || []).sort(function (a, b) { return b.y - a.y; }),
        hs = (x[3] || []).sort(function (a, b) { return b.y - a.y; }), refs = x[4] || [], ev = map(x[7]);
      var reg = (x[5] || []).filter(function (q) { return q.y >= MIN_SEGMENT; }), city = (x[6] || []).filter(function (q) { return q.y >= MIN_SEGMENT; });
      box.innerHTML = "<h2>" + esc(cname(code)) + "</h2>" +
        '<div class="kpis">' + kpi("visitors", s.visitors, sp.visitors) + kpi("visits", s.visits, sp.visits) +
        '<div class="kpi"><div class="lbl">نسبة الدولة من الزوار</div><div class="val">' + pctTxt(pct(cv, total)) + "</div></div>" +
        '<div class="kpi"><div class="lbl">أحاديث لكل زيارة</div><div class="val">' + (s.visits ? nf.format(Math.round(10 * (ev.hadith_view || 0) / s.visits) / 10) : "—") + "</div></div></div>" +
        "<h3>اللغة الأكثر استخدامًا</h3><p>" + (langs[0] ? esc(lname(langs[0].x)) + " (" + num(langs[0].y) + ")" : "لا توجد بيانات") + "</p>" +
        table("geo_c_h", "أكثر الأحاديث ظهورًا", [["الحديث", "x", function (q) { return hname(q.x); }], ["الظهور", "y", null, "n"]], hs.slice(0, 5)) +
        table("geo_c_ref", "أبرز مصادر الزيارات", [["المصدر", "x", function (q) { return q.x || "مباشر أو غير معروف"; }], ["الزيارات", "y", null, "n"]], refs.slice(0, 5)) +
        table("geo_c_reg", "المناطق", [["المنطقة", "x"], ["الزوار", "y", null, "n"]], reg.slice(0, 10), { note: "لا تظهر المناطق والمدن التي فيها أقل من " + MIN_SEGMENT + " زوار." }) +
        table("geo_c_city", "المدن", [["المدينة", "x"], ["الزوار", "y", null, "n"]], city.slice(0, 10));
    }, function () { box.innerHTML = "<h2>" + esc(cname(code)) + '</h2><p class="error">تعذّر تحميل التفاصيل.</p>'; });
  }

  // ------------------------------------------------------------------ اللغات
  function renderLangs() {
    var ui = map(D.uiLang), uiTotal = sum(D.uiLang), L = function (e) { return map(D["l:" + e]); };
    var views = L("hadith_view"), mean = L("hadith_meaning_open"), share = L("hadith_share_click"), fav = L("hadith_favorite");
    var rows = Object.keys(LANGS).map(function (l) {
      var c = base.coverage[l] || {};
      return { l: l, name: LANGS[l], visits: ui[l] || 0, share_of: pct(ui[l] || 0, uiTotal), views: views[l] || 0, mrate: pct(mean[l] || 0, views[l] || 0),
        shares: share[l] || 0, srate: pct(share[l] || 0, views[l] || 0), fav: fav[l] || 0, cov: c.approved + " معتمد · " + c.draft + " مسودة من " + c.total };
    });
    var bl = (D.blang || []).slice().sort(function (a, b) { return b.y - a.y; });
    var unsupported = bl.filter(function (r) { return !LANGS[r.x] && r.x !== "unknown"; });
    var to = map(D.langChange), from = map(D.langFrom);
    $("tab-langs").innerHTML =
      '<div class="panel">' + table("langs", "الانتشار حسب لغة الواجهة", [["اللغة", "name"], ["زيارات بدأت بها", "visits", null, "n"], ["نسبتها", "share_of", null, "n", pctTxt], ["ظهور البطاقات", "views", null, "n"],
        ["فتح المعنى", "mrate", null, "n", pctTxt], ["المشاركة", "shares", null, "n"], ["معدل المشاركة", "srate", null, "n", pctTxt], ["المفضلة", "fav", null, "n"], ["حالة الترجمة", "cov"]], rows, { bar: "visits",
        note: "«زيارات بدأت بها» لغة الواجهة عند فتح الصفحة. حالة الترجمة من ملفات الموقع الآن، لا من أداة التحليلات. أكثر الأحاديث قراءة لكل لغة: اختر اللغة من المرشح أعلى الصفحة ثم افتح «أداء الأحاديث»." }) + "</div>" +
      '<div class="grid2"><div class="panel">' + table("blang", "لغة متصفح الزوار", [["اللغة", "x", function (r) { return lname(r.x); }], ["زيارات", "y", null, "n"], ["مدعومة؟", "x", function (r) { return LANGS[r.x] ? "نعم" : "لا"; }]], bl.slice(0, 15), { bar: "y", note: "لغة المتصفح لا تحدد لغة الزائر ولا ديانته؛ كثير من قراء العربية متصفحاتهم بالإنجليزية." }) +
      '</div><div class="panel">' + table("blang_un", "طلب على لغات غير مدعومة", [["اللغة", "x", function (r) { return lname(r.x); }], ["زيارات", "y", null, "n"]], unsupported.slice(0, 10), { note: "مؤشر أولي لأولويات الترجمة: زيارات متصفحها بلغة لا يدعمها الموقع. يُدرس مع الدول ومصادر الزيارات قبل أي قرار." }) + "</div></div>" +
      '<div class="panel">' + table("lchange", "تغيير اللغة", [["اللغة", "l", function (r) { return LANGS[r.l] || r.l; }], ["تحوّل إليها", "to", null, "n"], ["تحوّل منها", "from", null, "n"]],
        Object.keys(LANGS).map(function (l) { return { l: l, to: to[l] || 0, from: from[l] || 0 }; }).filter(function (r) { return r.to || r.from; }), { note: "عدد مرات تغيير اللغة دون أي تتبع لهوية من غيّرها." }) + "</div>";
  }

  // ------------------------------------------------------------------ رحلة الزائر
  function renderJourney() {
    var c = D.cur || {};
    var steps = [["زيارة الموقع", c.visits], ["ظهور بطاقة حديث", evc("hadith_view")], ["فتح المعنى", evc("hadith_meaning_open")], ["الاطلاع على الوقفة الإيمانية", evc("reflection_view")],
      ["الانتقال لحديث آخر", evc("hadith_next")], ["الحفظ أو المشاركة", evc("hadith_favorite") + evc("hadith_share_click") + evc("hadith_share_image")]];
    var top = steps[0][1] || 0;
    var html = '<div class="panel"><h2>مسار التفاعل</h2><p class="muted">نسب تقريبية مبنية على مجموع الأحداث في الفترة، لا على تتبع أشخاص بعينهم. لا يُعدّ تحميل البطاقة قراءة: «الظهور» بقاؤها على الشاشة ثانيتين ونصفًا، و«الوقفة» ظهورها ثانية كاملة بعد قلب البطاقة.</p><div class="funnel">' +
      steps.map(function (s, i) {
        var w = top ? Math.min(100, Math.round(100 * (s[1] || 0) / top)) : 0, conv = i ? pct(s[1] || 0, steps[i - 1][1] || 0) : null;
        return '<div class="step"><span>' + esc(s[0]) + '</span><div class="track"><div class="fill" style="width:' + w + '%"></div></div><span class="n">' + num(s[1]) + (conv != null ? " · " + pctTxt(conv) + " من السابقة" : "") + "</span></div>";
      }).join("") + "</div></div>";
    var drops = [];
    for (var i = 1; i < steps.length; i++) if (steps[i - 1][1]) drops.push({ s: steps[i - 1][0] + " ← " + steps[i][0], k: pct(steps[i][1] || 0, steps[i - 1][1]) });
    drops.sort(function (a, b) { return a.k - b.k; });
    var src = (D.viewSource || []).slice().sort(function (a, b) { return b.y - a.y; });
    var SRC = { home: "الصفحة الرئيسية", link: "رابط حديث مباشر", next: "الانتقال للتالي", prev: "الرجوع للسابق", random: "اكتشف أجرًا جديدًا", search: "البحث", saved: "المفضلة", topic: "الموضوعات", unread: "لم أقرأها بعد" };
    var ent = (D.entry || []).slice().sort(function (a, b) { return b.y - a.y; });
    var ENT = { home: "الصفحة الرئيسية", hadith_link: "رابط حديث", share_link: "رابط مشاركة من الموقع", lang_page: "صفحة لغة", family: "تحدي الأسرة" };
    html += '<div class="grid2"><div class="panel">' + table("j_drops", "أكبر نقاط الانقطاع", [["المرحلة", "s"], ["نسبة الاستمرار", "k", null, "n", pctTxt]], drops) +
      '</div><div class="panel">' + table("j_src", "كيف وصل الزائر إلى البطاقة؟", [["الطريق", "x", function (r) { return SRC[r.x] || r.x; }], ["مرات الظهور", "y", null, "n"]], src, { bar: "y" }) + "</div></div>" +
      '<div class="grid2"><div class="panel">' + table("j_entry", "من أين بدأت الزيارة؟", [["المدخل", "x", function (r) { return ENT[r.x] || r.x; }], ["زيارات", "y", null, "n"]], ent, { bar: "y" }) +
      '</div><div class="panel">' + table("j_device", "الأجهزة", [["الجهاز", "x"], ["الزوار", "y", null, "n"]], D.device || [], { bar: "y", note: "للمقارنة بين الجوال والكمبيوتر اختر الجهاز من المرشح أعلى الصفحة؛ يتغير المسار كله." }) + "</div></div>" +
      '<div class="grid2"><div class="panel">' + table("j_search", "نتائج البحث", [["النتائج", "x", function (r) { return { none: "بلا نتائج", "1-5": "١–٥", "6+": "٦ فأكثر" }[r.x] || r.x; }], ["مرات", "y", null, "n"]], D.search || [], { note: "لا تُرسل عبارات البحث نفسها." }) +
      '</div><div class="panel">' + table("j_topics", "الموضوعات المفتوحة", [["الموضوع", "x", function (r) { return (base.cats[r.x]) || r.x; }], ["مرات", "y", null, "n"]], (D.topics || []).sort(function (a, b) { return b.y - a.y; })) + "</div></div>";
    $("tab-journey").innerHTML = html;
  }

  // ------------------------------------------------------------------ الأثر الأسري
  var TYPE = { c3: "تحدي ٣ أحاديث", c5: "تحدي ٥ أحاديث", c10: "تحدي ١٠ أحاديث", week: "تحدي الأسبوع" }, LEVEL = { kids: "أطفال", general: "عام", advanced: "متقدم" };
  function avg(rows) { var s = 0, n = 0; (rows || []).forEach(function (r) { var x = +r.x; if (!isNaN(x)) { s += x * r.y; n += r.y; } }); return n ? Math.round(10 * s / n) / 10 : null; }
  function renderFamily() {
    var created = evc("family_challenge_created"), started = evc("family_challenge_started"), done = evc("family_challenge_completed");
    var lr = map(D.levelResult), levels = Object.keys(LEVEL).map(function (l) { var o = lr[l + "-ok"] || 0, n = lr[l + "-no"] || 0; return { l: l, ok: o, all: o + n, rate: pct(o, o + n) }; });
    var ar = map(D.answerResult), qs = {};
    Object.keys(ar).forEach(function (k) { var m = /^(.*)-(ok|no)$/.exec(k); if (!m) return; var q = qs[m[1]] = qs[m[1]] || { q: m[1], ok: 0, no: 0 }; q[m[2]] += ar[k]; });
    var hard = Object.keys(qs).map(function (k) { var q = qs[k]; q.all = q.ok + q.no; q.rate = pct(q.ok, q.all); q.h = k.split(".")[0]; return q; }).filter(function (q) { return q.all >= 5; }).sort(function (a, b) { return a.rate - b.rate; });
    var ct = map(D.famCreatedType), st = map(D.famStartType), dt = map(D.famType);
    var types = Object.keys(TYPE).map(function (t) { return { t: t, c: ct[t] || 0, s: st[t] || 0, d: dt[t] || 0, r: pct(dt[t] || 0, st[t] || 0) }; });
    $("tab-family").innerHTML =
      '<div class="panel"><p class="muted">بيانات مجمعة لا تحمل أسماء الأسر ولا معرّفاتها ولا إجابات أفرادها. نسبة الإجابات الصحيحة تقيس الأداء على أسئلة المشروع فقط، لا التديّن ولا الأثر الروحي. النتائج الفردية تبقى داخل المجلس على جهاز الأسرة.</p></div>' +
      '<div class="kpis">' + kpi("councils", D.events ? evc("family_council_created") : null) +
      '<div class="kpi"><div class="lbl">تحديات أُنشئت</div><div class="val">' + num(D.events ? created : null) + "</div></div>" +
      '<div class="kpi"><div class="lbl">بدأت فعليًا</div><div class="val">' + num(D.events ? started : null) + "</div></div>" +
      kpi("completed", D.events ? done : null) + kpi("completion_rate", started ? pct(done, started) : null, undefined, pctTxt) +
      '<div class="kpi"><div class="lbl">متوسط المشاركين في التحدي المكتمل</div><div class="val">' + (avg(D.famParts) == null ? "—" : nf.format(avg(D.famParts))) + "</div></div>" +
      '<div class="kpi"><div class="lbl">نسبة إكمال الأسئلة (متوسط)</div><div class="val">' + pctTxt(avg(D.famAnswered)) + "</div></div>" +
      kpi("correct_rate", (function () { var o = 0, a = 0; levels.forEach(function (x) { o += x.ok; a += x.all; }); return a ? pct(o, a) : null; })(), undefined, pctTxt) + "</div>" +
      '<div class="grid2"><div class="panel">' + table("f_types", "التحديات حسب عدد الأحاديث", [["النوع", "t", function (r) { return TYPE[r.t]; }], ["أُنشئ", "c", null, "n"], ["بدأ", "s", null, "n"], ["اكتمل", "d", null, "n"], ["معدل الإكمال", "r", null, "n", pctTxt]], types.filter(function (r) { return r.c || r.s || r.d; })) +
      '</div><div class="panel">' + table("f_levels", "مقارنة مستويات الأسئلة", [["المستوى", "l", function (r) { return LEVEL[r.l]; }], ["الإجابات", "all", null, "n"], ["الصحيحة", "ok", null, "n"], ["نسبة الصواب", "rate", null, "n", pctTxt]], levels.filter(function (r) { return r.all; })) + "</div></div>" +
      '<div class="panel">' + table("f_hard", "أسئلة يكثر الخطأ فيها", [["الحديث", "h", function (r) { return hname(r.h); }], ["السؤال", "q"], ["الإجابات", "all", null, "n"], ["نسبة الصواب", "rate", null, "n", pctTxt]], hard.slice(0, 15),
        { note: "أسئلة أُجيب عنها 5 مرات على الأقل، مرتبة من الأقل صوابًا. انخفاض الصواب قد يعني سؤالًا غامضًا أو خيارات متقاربة، فيُراجع السؤال قبل الحكم." }) + "</div>";
  }

  // ------------------------------------------------------------------ قنوات الوصول
  function renderSources() {
    var CH = { whatsapp: "واتساب", copy: "نسخ الرابط", image: "صورة البطاقة", native: "مشاركة الجهاز" };
    var html = '<div class="panel"><p class="muted">الزيارات «المباشرة» ليست كلها من واتساب: بعض التطبيقات لا تمرر مصدر الزيارة. روابط المشاركة من الموقع تحمل رمز قناة قصيرًا (?s=) يُعدّ ثم يُحذف. للحملات والشراكات استخدم روابط UTM (انظر docs/analytics/campaigns.md).</p></div>';
    html += '<div class="grid2"><div class="panel">' + (D.channel ? table("s_channel", "القنوات", [["القناة", "x"], ["الزيارات", "y", null, "n"]], D.channel, { bar: "y" }) : na("القنوات", "تصنيف القنوات غير متاح في هذه النسخة من الأداة؛ راجع المصادر.")) +
      '</div><div class="panel">' + table("s_ref", "المواقع المُحيلة", [["المصدر", "x", function (r) { return r.x || "مباشر أو غير معروف"; }], ["الزيارات", "y", null, "n"]], D.referrer || [], { bar: "y", limit: 25 }) + "</div></div>";
    html += '<div class="grid2"><div class="panel">' + (D.utmSource ? table("s_utm", "مصادر الحملات (utm_source)", [["المصدر", "x"], ["الزيارات", "y", null, "n"]], D.utmSource, { bar: "y" }) : na("مصادر الحملات")) +
      '</div><div class="panel">' + (D.utmCampaign ? table("s_camp", "الحملات (utm_campaign)", [["الحملة", "x"], ["الزيارات", "y", null, "n"]], D.utmCampaign, { bar: "y" }) : na("الحملات")) + "</div></div>";
    var land = (D.landing || []).slice().sort(function (a, b) { return b.y - a.y; });
    html += '<div class="grid2"><div class="panel">' + table("s_share_ch", "زيارات من روابط المشاركة حسب القناة", [["القناة", "x", function (r) { return CH[r.x] || r.x; }], ["زيارات", "y", null, "n"]], D.landingCh || [], { bar: "y" }) +
      '</div><div class="panel">' + table("s_share_h", "أحاديث تدفع الآخرين لاكتشاف المشروع", [["الحديث", "x", function (r) { return hname(r.x); }], ["زيارات جاءت من مشاركته", "y", null, "n"]], land.slice(0, 10), { note: "الضغط على المشاركة لا يثبت الإرسال؛ هذا الجدول يعدّ الزيارات التي وصلت فعلًا عبر الرابط." }) + "</div></div>";
    $("tab-sources").innerHTML = html;
  }

  // ------------------------------------------------------------------ جودة التشغيل
  function renderQuality() {
    var KIND = { translation_load_failed: "فشل تحميل ترجمة", language_switch_failed: "فشل تغيير اللغة", data_load_failed: "فشل تحميل الأحاديث", family_sync_failed: "تعطل مزامنة المجلس", promise_rejection: "وعد مرفوض (Promise)", resource_script: "تعذّر تحميل ملف برمجي", resource_link: "تعذّر تحميل ملف تنسيق", resource_img: "تعذّر تحميل صورة" };
    var errs = evc("app_error"), pv = (D.cur || {}).pageviews;
    var perf = map(D.perf), dev = {};
    Object.keys(perf).forEach(function (k) { var m = /^(\w+)\.(.+)$/.exec(k); if (!m) return; (dev[m[1]] = dev[m[1]] || {})[m[2]] = perf[k]; });
    var B = ["lt1s", "1-2.5s", "2.5-4s", "4-8s", "8s+"];
    var perfRows = Object.keys(dev).map(function (d) { var o = dev[d], t = 0; B.forEach(function (b) { t += o[b] || 0; }); return { d: d, good: pct((o.lt1s || 0) + (o["1-2.5s"] || 0), t), mid: pct(o["2.5-4s"] || 0, t), bad: pct((o["4-8s"] || 0) + (o["8s+"] || 0), t), t: t }; });
    $("tab-quality").innerHTML =
      '<div class="kpis">' + kpi("error_rate", pv ? pct(errs, pv) : null, undefined, pctTxt) + '<div class="kpi"><div class="lbl">أحداث الأخطاء</div><div class="val">' + num(D.events ? errs : null) + "</div></div></div>" +
      '<div class="grid2"><div class="panel">' + table("q_kind", "الأخطاء حسب النوع", [["النوع", "x", function (r) { return KIND[r.x] || r.x; }], ["مرات", "y", null, "n"]], (D.errKind || []).sort(function (a, b) { return b.y - a.y; }), { note: "لا تحمل سجلات الأخطاء نص الرسالة ولا أي إدخال للزائر: النوع والملف والسطر فقط." }) +
      '</div><div class="panel">' + table("q_where", "أكثر مواضع الأخطاء تكرارًا (أولوية الإصلاح)", [["الملف-السطر", "x"], ["مرات", "y", null, "n"]], (D.errWhere || []).sort(function (a, b) { return b.y - a.y; }).slice(0, 15)) + "</div></div>" +
      '<div class="panel">' + table("q_perf", "سرعة ظهور المحتوى الرئيسي (LCP)", [["الجهاز", "d"], ["سريع (أقل من 2.5ث)", "good", null, "n", pctTxt], ["متوسط", "mid", null, "n", pctTxt], ["بطيء (4ث فأكثر)", "bad", null, "n", pctTxt], ["قياسات", "t", null, "n"]], perfRows,
        { note: "قياس من متصفحات الزوار الحقيقيين، مرة لكل تحميل صفحة، بفئات زمنية. المتصفحات التي لا تدعم القياس لا تظهر." }) + "</div>" +
      '<div class="grid2"><div class="panel">' + table("q_browser", "المتصفحات", [["المتصفح", "x"], ["الزوار", "y", null, "n"]], D.browser || [], { bar: "y", limit: 12 }) +
      '</div><div class="panel">' + table("q_os", "أنظمة التشغيل", [["النظام", "x"], ["الزوار", "y", null, "n"]], D.os || [], { bar: "y", limit: 12 }) + "</div></div>";
  }

  // ------------------------------------------------------------------ التقارير والتوصيات
  function recommendations() {
    var out = [], c = D.cur || {};
    var visits = c.visits || 0;
    var bl = (D.blang || []).filter(function (r) { return !LANGS[r.x] && r.x !== "unknown"; }).sort(function (a, b) { return b.y - a.y; });
    var blTotal = sum(D.blang);
    if (bl[0] && bl[0].y >= 30 && pct(bl[0].y, blTotal) >= 5)
      out.push(["ادرس إضافة " + lname(bl[0].x), num(bl[0].y) + " زيارة (" + pctTxt(pct(bl[0].y, blTotal)) + ") متصفحها بهذه اللغة غير المدعومة.", "لغة المتصفح ليست بالضرورة لغة القراءة المفضلة؛ تُقارن بالدول ومصادر الزيارات أولًا."]);
    var rows = hadithRows().filter(function (r) { return r.views >= MIN_HADITH; });
    var rates = rows.map(function (r) { return r.rate || 0; }).sort(function (a, b) { return a - b; }), med = rates.length ? rates[Math.floor(rates.length / 2)] : 0;
    var weak = rows.filter(function (r) { return (r.rate || 0) < med / 2; }).sort(function (a, b) { return b.views - a.views; })[0];
    if (weak) out.push(["راجع عنوان «" + weak.title + "» ومقدمته", "ظهر " + num(weak.views) + " مرة وفُتح معناه بنسبة " + pctTxt(weak.rate) + " مقابل وسيط " + pctTxt(med) + ".", "انخفاض الفتح قد يعني أن المقدمة كافية، لا ضعف العنوان؛ يُقرأ مع المفضلة والمشاركة."]);
    var steps = [["ظهور البطاقة", evc("hadith_view")], ["فتح المعنى", evc("hadith_meaning_open")], ["الانتقال لحديث آخر", evc("hadith_next")]];
    if (visits >= 50 && evc("hadith_view")) {
      var mr = pct(steps[1][1], steps[0][1]);
      if (mr < 30) out.push(["اجعل زر «اكتشف المعنى» أوضح", "نسبة فتح المعنى " + pctTxt(mr) + " من ظهور البطاقات.", "الظهور يُعدّ بعد ثانيتين ونصف فقط، وبعض الزوار يقرؤون الوجه الأول ويكتفون."]);
    }
    var started = evc("family_challenge_started"), done = evc("family_challenge_completed");
    if (started >= 10 && pct(done, started) < 50) out.push(["بسّط تحدي الأسرة أو ذكّر بإنهائه", "اكتمل " + num(done) + " من " + num(started) + " تحديًا بدأ فعليًا (" + pctTxt(pct(done, started)) + ").", "تحدي الأسبوع يمتد سبعة أيام، فقد يكون غير مكتمل لأنه ما زال جاريًا."]);
    var we = (D.errWhere || []).sort(function (a, b) { return b.y - a.y; })[0];
    if (we && we.y >= 5) out.push(["أصلح الخطأ المتكرر في " + we.x, "تكرر " + num(we.y) + " مرة في الفترة.", "قد يكون من إضافة في متصفح الزائر لا من كود الموقع؛ يُتحقق بإعادة إنتاجه."]);
    var prev = map(D.countryPrev), grow = (D.country || []).filter(function (r) { return r.y >= 20 && prev[r.x]; }).map(function (r) { return { x: r.x, g: Math.round(100 * (r.y - prev[r.x]) / prev[r.x]), y: r.y }; }).sort(function (a, b) { return b.g - a.g; })[0];
    if (grow && grow.g >= 50) out.push(["تابع النمو في " + cname(grow.x), "الزوار " + num(grow.y) + " بزيادة " + grow.g + "٪ عن الفترة السابقة.", "قد تكون قفزة مؤقتة من مشاركة واحدة؛ تُراجع المصادر قبل الاستثمار فيها."]);
    return out;
  }
  function renderReports() {
    var c = D.cur || {}, p = D.prev || {};
    var recs = recommendations(), small = (c.visits || 0) < 200;
    var langs = (D.uiLang || []).slice().sort(function (a, b) { return b.y - a.y; }), countries = (D.country || []).slice(0, 5), top = topHadiths(5);
    $("tab-reports").innerHTML =
      '<div class="toolbar"><button class="btn" type="button" data-report="7">تقرير أسبوعي</button><button class="btn" type="button" data-report="30">تقرير شهري تنفيذي</button><button class="btn" type="button" data-report="90">تقرير ربع سنوي</button>' +
      '<button class="btn primary" type="button" id="btn-csv">تصدير الجداول CSV</button><button class="btn" type="button" id="btn-pdf">طباعة / حفظ PDF</button></div>' +
      '<div class="panel"><h2>ملخص الفترة: ' + esc(periodLabel()) + "</h2>" +
      (small ? '<p class="notice">البيانات قليلة (أقل من 200 زيارة)؛ أي استنتاج أدناه أولي ويحتاج مزيدًا من الوقت.</p>' : "") +
      "<ul><li>الزوار المقدَّرون: " + num(c.visitors) + " · " + change(c.visitors, p.visitors) + "</li><li>الزيارات: " + num(c.visits) + " · " + change(c.visits, p.visits) + "</li>" +
      "<li>ظهور البطاقات: " + num(evc("hadith_view")) + " · فتح المعنى: " + pctTxt(pct(evc("hadith_meaning_open"), evc("hadith_view"))) + "</li>" +
      "<li>أهم الدول: " + (countries.length ? countries.map(function (r) { return esc(cname(r.x)) + " (" + num(r.y) + ")"; }).join("، ") : "لا توجد بيانات") + "</li>" +
      "<li>اللغات: " + (langs.length ? langs.map(function (r) { return esc(lname(r.x)) + " (" + num(r.y) + ")"; }).join("، ") : "لا توجد بيانات") + "</li>" +
      "<li>أكثر الأحاديث تفاعلًا: " + (top.length ? top.map(function (r) { return esc(r.title); }).join("، ") : "لا توجد بيانات كافية") + "</li>" +
      "<li>تحدي الأسرة: " + num(evc("family_challenge_started")) + " بدأ · " + num(evc("family_challenge_completed")) + " اكتمل</li>" +
      "<li>أحداث الأخطاء: " + num(evc("app_error")) + "</li></ul></div>" +
      '<div class="panel"><h2>قرارات مقترحة للمراجعة</h2><p class="muted">استنتاجات آلية من البيانات، تُعرض مع دليلها وحدودها. ليست حقائق مؤكدة، وتُراجع قبل التنفيذ.</p>' +
      (recs.length ? recs.slice(0, 5).map(function (r) { return '<div class="rec"><b>' + esc(r[0]) + "</b><span>الدليل: " + esc(r[1]) + '</span><br><span class="muted">القيد: ' + esc(r[2]) + "</span></div>"; }).join("") :
        '<p class="empty">لا توجد إشارات كافية لاقتراح قرار في هذه الفترة.</p>') + "</div>";
    Array.prototype.forEach.call(document.querySelectorAll("[data-report]"), function (b) {
      b.onclick = function () { $("f-period").value = b.getAttribute("data-report"); F.days = +b.getAttribute("data-report"); refresh("reports"); };
    });
    $("btn-csv").onclick = exportCSV;
    $("btn-pdf").onclick = function () { printAll(); };
  }
  function exportCSV() {
    var lines = ["﻿" + csvRow(["لوحة الأثر والانتشار", periodLabel(), "التوقيت: الرياض"])];
    Object.keys(tables).forEach(function (k) {
      var t = tables[k]; if (!t.rows.length) return;
      lines.push(""); lines.push(csvRow([t.title || k])); lines.push(csvRow(t.cols));
      t.rows.forEach(function (r) { lines.push(csvRow(r)); });
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    a.download = "qararit-analytics-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }
  function csvRow(r) { return r.map(function (x) { x = x == null ? "" : String(x); return /[",\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }).join(","); }
  function printAll() {
    var hidden = Array.prototype.filter.call(document.querySelectorAll(".tab"), function (t) { return t.hidden; });
    hidden.forEach(function (t) { t.hidden = false; });
    setTimeout(function () { window.print(); hidden.forEach(function (t) { t.hidden = true; }); }, 50);
  }

  // ------------------------------------------------------------------ التعريفات
  function renderDefs() {
    $("tab-defs").innerHTML = '<div class="panel">' + table("defs", "تعريفات المؤشرات وطريقة حسابها", [["المؤشر", "a"], ["التعريف", "b"], ["المصدر", "c"], ["ملاحظات وحدود", "d"]],
      Object.keys(DEFS).map(function (k) { var d = DEFS[k]; return { a: d[0], b: d[1], c: d[2], d: d[3] }; })) +
      '<p class="muted">التعريفات الكاملة للأحداث وخصائصها في docs/analytics/events.md في مستودع المشروع.</p></div>';
  }

  // ------------------------------------------------------------------ التشغيل
  var current = "overview";
  var RENDER = { overview: renderOverview, geo: renderGeo, langs: renderLangs, hadiths: renderHadiths, journey: renderJourney, family: renderFamily, sources: renderSources, quality: renderQuality, reports: renderReports, defs: renderDefs };
  function show(tab) {
    current = tab;
    Array.prototype.forEach.call(document.querySelectorAll("#tabs button"), function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === tab)); });
    Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (s) { s.hidden = s.id !== "tab-" + tab; });
    if (D) try { RENDER[tab](); } catch (e) { $("tab-" + tab).innerHTML = '<p class="error">تعذّر عرض هذا القسم.</p>'; if (window.console) console.error(e); }
  }
  // الخريطة تُرسم فقط وقسمها ظاهر (رسمها في عنصر مخفي يعطيها مقاسًا صفريًا)
  function renderAll() { tables = {}; Object.keys(RENDER).forEach(function (k) { if (k === current || k === "geo") return; try { RENDER[k](); } catch (e) { if (window.console) console.error(e); } }); show(current); }
  function refresh(tab) {
    $("period-label").textContent = periodLabel();
    $("notice").hidden = false; $("notice").textContent = "جارٍ تحميل البيانات…";
    return Promise.all([loadBase(), loadAll()]).then(function (r) {
      D = r[1];
      $("notice").hidden = true;
      var sel = $("f-country"), keep = sel.value;
      if (!F.country) { sel.innerHTML = '<option value="">كل الدول</option>' + (D.country || []).map(function (c) { return '<option value="' + esc(c.x) + '">' + esc(cname(c.x)) + "</option>"; }).join(""); sel.value = keep; }
      if (tab) current = tab;
      renderAll();
    }, function (e) {
      if (e && e.message === "auth") { logout(); $("connect-error").hidden = false; $("connect-error").textContent = "المفتاح أو رقم الموقع غير صحيح، أو لا يملك المفتاح صلاحية القراءة."; return; }
      $("notice").hidden = false;
      $("notice").innerHTML = "تعذّر الاتصال بواجهة Umami البرمجية من هذا المتصفح. تأكد من العنوان والمفتاح، أو افتح لوحة Umami نفسها مؤقتًا: <a href=\"https://cloud.umami.is\" target=\"_blank\" rel=\"noopener\">cloud.umami.is</a>";
    });
  }
  function enter() {
    $("connect").hidden = true; $("tabs").hidden = false; $("main").hidden = false; $("bar-tools").hidden = false;
    document.documentElement.style.setProperty("--barh", document.querySelector(".bar").offsetHeight + "px");
    refresh();
  }
  function logout() {
    store(SS_KEY, null); store(LS_KEY, null, true); C.key = "";
    $("connect").hidden = false; $("tabs").hidden = true; $("main").hidden = true; $("bar-tools").hidden = true;
  }

  $("tz-label").textContent = "التوقيت: الرياض (UTC+3)";
  $("f-lang").innerHTML = '<option value="">كل اللغات</option>' + Object.keys(LANGS).map(function (l) { return '<option value="' + l + '">' + LANGS[l] + "</option>"; }).join("");
  $("c-site").value = C.site; $("c-api").value = C.api;
  $("connect-form").onsubmit = function (e) {
    e.preventDefault();
    C.site = $("c-site").value.trim(); C.key = $("c-key").value.trim(); C.api = $("c-api").value.trim() || "https://api.umami.is/v1";
    store(LS_SITE, C.site, true); store(LS_API, C.api, true);
    store(SS_KEY, C.key); if ($("c-remember").checked) store(LS_KEY, C.key, true);
    $("connect-error").hidden = true;
    enter();
  };
  $("btn-logout").onclick = logout;
  $("btn-refresh").onclick = function () { refresh(); };
  $("f-period").onchange = function () {
    var v = this.value; $("custom-range").hidden = v !== "custom";
    if (v !== "custom") { F.days = +v; refresh(); } else F.days = "custom";
  };
  ["f-from", "f-to"].forEach(function (id) { $(id).onchange = function () { F.from = $("f-from").value; F.to = $("f-to").value; if (F.from && F.to) refresh(); }; });
  $("f-country").onchange = function () { F.country = this.value; refresh(); };
  $("f-device").onchange = function () { F.device = this.value; refresh(); };
  $("f-lang").onchange = function () { F.lang = this.value; refresh(); };
  $("tabs").addEventListener("click", function (e) { var b = e.target.closest("button[data-tab]"); if (b) show(b.getAttribute("data-tab")); });
  $("main").addEventListener("click", function (e) { var tr = e.target.closest("tr.click"); if (tr && tr.closest("#geo-table")) countryDetail(tr.getAttribute("data-row")); });
  if (C.site && C.key) enter();
})();
