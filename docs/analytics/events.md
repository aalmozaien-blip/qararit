# خطة التتبع: الأحداث وخصائصها

## قواعد عامة

- كل حدث يمر بـ `analytics.js`، الذي يحذف أي خاصية خارج قائمة السماح `ALLOWED`، ويقبل القيم النصية القصيرة المكونة من حروف لاتينية وأرقام و`_ . -` فقط (حتى 48 حرفًا). فلا يمكن أن يتسرب اسم عربي أو نص يكتبه الزائر حتى لو أُرسل خطأً.
- **لا يُرسل أبدًا**: أسماء الأشخاص أو المجالس، `family_id`، `participant_id`، رموز الدعوة، عبارات البحث، الخيار المختار في سؤال، نص رسائل الأخطاء، الموقع الدقيق.
- **منع التكرار**: `QA.once(key, …)` يرسل الحدث مرة واحدة لكل مفتاح في تحميل الصفحة. فلا يتكرر الظهور عند إعادة رسم البطاقة أو تبديل اللغة أو القلب المتكرر.
- **مشاهدة الصفحة** تُرسل يدويًا مرة لكل تحميل (التتبع التلقائي في الأداة معطّل)، وعنوانها مسار الصفحة بلا `#` وبلا أي معامل غير معاملات `utm_*`.
- الأحداث تُجمَّع في الأداة حسب اليوم والأسبوع والشهر بتوقيت تختاره اللوحة (الرياض UTC+3).

## الأحداث

### الزيارة

| الحدث | متى يُسجَّل | الخصائص |
| --- | --- | --- |
| `pageview` | مرة لكل تحميل صفحة (الرئيسية، صفحات اللغات، الأسرة، الخصوصية) | المسار ومعاملات الحملة |
| `visit_start` | مع كل تحميل صفحة | `page` (main/family/privacy)، `device` (mobile/tablet/desktop)، `visitor` (new/returning)، `ui_lang` لغة الواجهة، `browser_lang` لغة المتصفح الأساسية، `browser_lang_supported`، `entry` (home/hadith_link/share_link/lang_page/family) |
| `page_perf` | مرة لكل صفحة عند مغادرتها أو بعد 15 ثانية | `lcp` و`load` بفئات زمنية (lt1s، 1-2.5s، 2.5-4s، 4-8s، 8s+)، `device`، `lcp_device` |

### الأحاديث

كل أحداث الحديث تحمل: `hadith_id`، `lang` (لغة الواجهة)، `category_id` (الموضوع الأول)، `hadith_lang` (`<hadith_id>__<lang>` لترتيب الأحاديث لكل لغة).

| الحدث | متى يُسجَّل | خصائص إضافية |
| --- | --- | --- |
| `hadith_view` | بقيت البطاقة معروضة **ثانيتين ونصفًا** والصفحة ظاهرة. مرة لكل حديث في الزيارة. تحميل البطاقة وحده لا يُعدّ | `source`: home/link/next/prev/random/search/saved/topic/unread |
| `hadith_meaning_open` | قلب البطاقة إلى وجه المعنى. مرة لكل حديث | — |
| `reflection_view` | ظهور الوقفة الإيمانية على الشاشة (60٪ منها) ثانية كاملة بعد القلب | — |
| `hadith_more_open` | فتح «للمزيد من التأمل» | — |
| `hadith_favorite` / `hadith_unfavorite` | إضافة إلى المفضلة أو إزالة منها | — |
| `hadith_next` | الانتقال إلى الحديث التالي من هذا الحديث. مرة لكل حديث | — |
| `hadith_share_click` | فتح نافذة المشاركة | — |
| `hadith_share_image` | مشاركة صورة البطاقة أو تنزيلها | `channel`: native/download |
| `hadith_share_landing` | فتح الموقع من رابط مشاركة صادر منه (`?s=`) | `channel`: whatsapp/copy/image/native |

### التصفح واللغة

| الحدث | متى يُسجَّل | الخصائص |
| --- | --- | --- |
| `language_change` | نجاح تغيير لغة الواجهة | `from`، `to`، `via` (picker/offer/read_ar) |
| `language_offer` | ردّ الزائر على اقتراح لغة متصفحه | `lang`، `accepted` |
| `search_performed` | توقف الكتابة 1.5 ثانية وفي البحث حرفان فأكثر | `lang`، `results` (none/1-5/6+). **عبارة البحث لا تُرسل** |
| `topic_open` | فتح موضوع | `category_id`، `lang` |
| `discover_click` | «اكتشف أجرًا جديدًا» | `lang` |
| `family_open` | الانتقال من الصفحة الرئيسية إلى تحدي الأسرة | `lang` |
| `tashkeel_toggle` | إظهار التشكيل أو إخفاؤه | `on` |

### تحدي الأسرة

تُرسل من منطق المجلس نفسه (`family/local.js`) بعد نجاح العملية، فلا يُعدّ ما فشل.

| الحدث | متى يُسجَّل | الخصائص |
| --- | --- | --- |
| `family_council_created` | إنشاء مجلس | `mode` (local) |
| `family_challenge_created` | إنشاء تحدٍّ | `challenge_type` (c3/c5/c10/week)، `question_level` (kids/general/advanced)، `mode` |
| `family_challenge_started` | **أول إجابة مسجلة** في التحدي (البدء الفعلي) | مثل السابق |
| `family_question_answered` | تسجيل إجابة | `question_id`، `hadith_id`، `question_level`، `correct`، `attempt`، `answer_result` (`<question_id>-ok|no`)، `level_result` (`<level>-ok|no`). **الخيار المختار لا يُرسل، ولا من أجاب** |
| `family_challenge_completed` | إنهاء المسؤول للتحدي | `challenge_type`، `question_level`، `participants` (عدد)، `answered_pct`، `correct_pct` (نسب المجلس كله) |

### الأخطاء

| الحدث | متى يُسجَّل | الخصائص |
| --- | --- | --- |
| `app_error` | خطأ برمجي، أو تعذّر تحميل ملف، أو فشل معروف في الموقع. حد أقصى 5 لكل تحميل صفحة، ولا يتكرر الخطأ نفسه | `kind` (نوع الخطأ أو: translation_load_failed، language_switch_failed، data_load_failed، family_sync_failed، resource_script…)، `file`، `line`، `where` (`file-line`)، `page`، و`lang` أو `part` حين تنطبق. **نص الرسالة لا يُرسل** |

حجب مانع الإعلانات لأداة القياس نفسها لا يُعدّ خطأ.

## إضافة حدث جديد

1. اختر اسمًا بحروف إنجليزية صغيرة و`_`، واستدعِ `QA.track(name, props)` أو `QA.once(key, name, props)`.
2. أي خاصية جديدة تُضاف إلى `ALLOWED` في `analytics.js` بعد التأكد أنها لا تعرّف أحدًا.
3. أضف الحدث إلى هذا الملف، وإلى اختبار في `tests/analytics.test.mjs`.
