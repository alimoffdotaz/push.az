// Generator tekstov dlya anti-banner-blindness push notifications.
// Podderzhka yazykov: ru (kirillitsa), az (Azerbaijani, latin), en (English).

// ============================================================================
// Shabloni-fallback po yazyku
// ============================================================================

const TEMPLATES = {
  ru: {
    friendly: [
      (t) => `${t} — самое время.`,
      (t) => `Напоминаю: ${t}`,
      (t) => `Эй, не забудь: ${t}`,
      (t) => `${t} ждёт тебя.`,
      (t) => `Пора: ${t}`,
      (t) => `Маленькое напоминание — ${t}.`,
      (t) => `Минутку твоего внимания: ${t}`,
      (t) => `Привет! ${t} — идеальное время.`,
    ],
    urgent: [
      (t) => `${t} — прямо сейчас.`,
      (t) => `Стоп. ${t}. Это важно.`,
      (t) => `Не откладывай: ${t}`,
      (t) => `${t} — время вышло.`,
      (t) => `Срочно! ${t}`,
      (t) => `Держись плана: ${t}`,
      (t) => `${t} — последнее напоминание.`,
    ],
    funny: [
      (t) => `Опять я. ${t}?`,
      (t) => `Знаю, что ты занят, но ${t}`,
      (t) => `${t}. Я жду, мне скучно.`,
      (t) => `Твои задачи обижаются. ${t}!`,
      (t) => `Это я, твой reminder. ${t}?`,
      (t) => `${t}. Обещаю, после этого оставлю в покое.`,
      (t) => `Лень говорит «потом». Я говорю: ${t}`,
    ],
    aggressive: [
      (t) => `${t}. Это не обсуждается.`,
      (t) => `Хватит тянуть. ${t}.`,
      (t) => `Ты обещал себе. ${t}.`,
      (t) => `${t}. Никаких отговорок.`,
      (t) => `Проснулся? Теперь ${t}.`,
      (t) => `Мы уже это обсуждали. ${t}.`,
    ],
  },
  az: {
    friendly: [
      (t) => `${t} — tam vaxtıdır.`,
      (t) => `Xatırladıram: ${t}`,
      (t) => `Hey, unutma: ${t}`,
      (t) => `${t} səni gözləyir.`,
      (t) => `Vaxtıdır: ${t}`,
      (t) => `Kiçik xatırlatma — ${t}.`,
      (t) => `Bir dəqiqə diqqətini: ${t}`,
      (t) => `Salam! ${t} — ideal vaxtdır.`,
    ],
    urgent: [
      (t) => `${t} — elə indi.`,
      (t) => `Dayan. ${t}. Bu vacibdir.`,
      (t) => `Təxirə salma: ${t}`,
      (t) => `${t} — vaxt bitdi.`,
      (t) => `Təcili! ${t}`,
      (t) => `Planına sadiq qal: ${t}`,
      (t) => `${t} — son xatırlatma.`,
    ],
    funny: [
      (t) => `Yenə mən. ${t}?`,
      (t) => `Bilirəm məşğulsan, amma ${t}`,
      (t) => `${t}. Gözləyirəm, darıxıram.`,
      (t) => `Tapşırıqların küsüb. ${t}!`,
      (t) => `Bu mənəm, reminderin. ${t}?`,
      (t) => `${t}. Söz verirəm, sonra səni rahat buraxacağam.`,
      (t) => `Tənbəllik "sonra" deyir. Mən deyirəm: ${t}`,
    ],
    aggressive: [
      (t) => `${t}. Müzakirə olunmur.`,
      (t) => `Uzatmağı burax. ${t}.`,
      (t) => `Özünə söz vermişdin. ${t}.`,
      (t) => `${t}. Heç bir bəhanə yox.`,
      (t) => `Oyandın? İndi ${t}.`,
      (t) => `Bunu artıq müzakirə etmişdik. ${t}.`,
    ],
  },
  en: {
    friendly: [
      (t) => `${t} — perfect time.`,
      (t) => `Reminder: ${t}`,
      (t) => `Hey, don't forget: ${t}`,
      (t) => `${t} is waiting for you.`,
      (t) => `Time for: ${t}`,
      (t) => `Tiny nudge — ${t}.`,
      (t) => `A minute of your attention: ${t}`,
      (t) => `Hi! ${t} — right on time.`,
    ],
    urgent: [
      (t) => `${t} — right now.`,
      (t) => `Stop. ${t}. This matters.`,
      (t) => `Don't postpone: ${t}`,
      (t) => `${t} — time's up.`,
      (t) => `Urgent! ${t}`,
      (t) => `Stick to the plan: ${t}`,
      (t) => `${t} — last reminder.`,
    ],
    funny: [
      (t) => `Me again. ${t}?`,
      (t) => `I know you're busy, but ${t}`,
      (t) => `${t}. I'm waiting, bored.`,
      (t) => `Your tasks are sulking. ${t}!`,
      (t) => `It's me, your reminder. ${t}?`,
      (t) => `${t}. Promise I'll leave you alone after.`,
      (t) => `Laziness says "later". I say: ${t}`,
    ],
    aggressive: [
      (t) => `${t}. Not up for debate.`,
      (t) => `Stop stalling. ${t}.`,
      (t) => `You made a promise. ${t}.`,
      (t) => `${t}. No excuses.`,
      (t) => `Awake? Now ${t}.`,
      (t) => `We already talked about this. ${t}.`,
    ],
  },
};

const ESCALATION_TONES = ['friendly', 'friendly', 'urgent', 'urgent', 'aggressive'];

function pickLang(lang) {
  return TEMPLATES[lang] ? lang : 'ru';
}

export function pickFallbackText(reminder, attempt, lang = 'ru') {
  const L = pickLang(lang);
  const preferredTone = reminder.tone || 'friendly';
  const tone =
    attempt >= 3
      ? ESCALATION_TONES[Math.min(attempt - 1, ESCALATION_TONES.length - 1)]
      : preferredTone;
  const pool = (TEMPLATES[L][tone]) || TEMPLATES[L].friendly;
  const idx = Math.floor(Math.random() * pool.length);
  let body = pool[idx](reminder.title);
  return sanitizeText(body);
}

// ============================================================================
// Sanitiziruyem AI-otvet
// ============================================================================

function sanitizeText(s) {
  if (!s) return '';
  s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'«`]+|["'»`]+$/g, '');
  s = s.replace(/^(push|сообщение|напоминание|текст|ответ|message|reminder|bildiris|xatirlatma|mesaj)[:\-–]\s*/i, '');
  // Ubirayem "burst-caps" tipa "О Т Ч Ё Т" (otdelьnye bukvy s probelami)
  s = s.replace(/\b([\p{L}\p{N}])(?:\s+([\p{L}\p{N}])){3,}\b/gu, (m) =>
    m.replace(/\s+/g, ''),
  );
  if (s.length > 140) s = s.slice(0, 137) + '…';
  return s;
}

function hasCyrillic(s) {
  return /[\u0400-\u04FF]/.test(s || '');
}

function hasLatin(s) {
  return /[A-Za-zÇçƏəĞğİıÖöŞşÜü]/.test(s || '');
}

function looksOK(s, lang) {
  if (!s || s.length < 3) return false;
  if (lang === 'ru') {
    if (!hasCyrillic(s)) return false;
    const letters = s.match(/[\u0400-\u04FF]/g) || [];
    const upper = s.match(/[\u0400-\u042F]/g) || [];
    if (letters.length > 10 && upper.length / letters.length > 0.5) return false;
  } else {
    if (!hasLatin(s)) return false;
    if (hasCyrillic(s)) return false;
    const letters = s.match(/[A-Za-zÇçƏəĞğİıÖöŞşÜü]/g) || [];
    const upper = s.match(/[A-ZÇƏĞİÖŞÜ]/g) || [];
    if (letters.length > 10 && upper.length / letters.length > 0.5) return false;
  }
  if (/[!?]{3,}/.test(s)) return false;
  return true;
}

// ============================================================================
// Workers AI
// ============================================================================

const TONE_INSTRUCTIONS = {
  ru: {
    friendly: 'тепло, без пафоса, без восклицательных знаков',
    urgent: 'кратко, просто, с ощущением срочности, без CAPS LOCK',
    funny: 'с лёгким юмором, но по делу, без клоунады',
    aggressive: 'жёстко, без соплей, как строгий тренер',
  },
  az: {
    friendly: 'mülayim, təntənəsiz, nida işarəsi olmadan',
    urgent: 'qısa, sadə, təcili hissi ilə, CAPS LOCK olmadan',
    funny: 'yüngül yumorla, amma iş üçün, oyun-oyuncaq olmadan',
    aggressive: 'sərt, yazıq olmadan, sərt məşqçi kimi',
  },
  en: {
    friendly: 'warm, not cheesy, no exclamation marks',
    urgent: 'short, simple, sense of urgency, no CAPS LOCK',
    funny: 'light humor but on-topic, no clowning',
    aggressive: 'tough, no whining, like a strict coach',
  },
};

const SYSTEM_PROMPTS = {
  ru: (toneInstr) =>
    'Ты пишешь короткие тексты push-уведомлений на русском языке. СТРОГИЕ ПРАВИЛА:\n' +
    '1. ВЫДАВАЙ ТОЛЬКО ТЕКСТ УВЕДОМЛЕНИЯ. Никаких объяснений, кавычек, префиксов.\n' +
    '2. Одна строка. БЕЗ переносов. БЕЗ \\n.\n' +
    '3. БЕЗ пробелов между буквами в слове. Пиши «отчёт», НЕ «О Т Ч Ё Т».\n' +
    '4. Макс 80 символов, включая пробелы.\n' +
    '5. ТОЛЬКО русский язык (кириллица). Никакой транслитерации, никакого английского.\n' +
    '6. Без эмодзи, без CAPS LOCK, без тройных восклицательных знаков.\n' +
    '7. Стиль: ' + toneInstr + '.\n' +
    '8. Разнообразие. НЕ начинай всегда с «Напоминаю:».\n' +
    'ПРИМЕРЫ:\n' +
    '  «Твоя задача отчёт ждёт тебя.»\n' +
    '  «Эй, пора начать отчёт.»\n' +
    '  «Отчёт — самое время.»',
  az: (toneInstr) =>
    'Sən qısa push-bildiriş mətnləri yazırsan. Azərbaycan dilində (latın əlifbası). SƏRT QAYDALAR:\n' +
    '1. YALNIZ bildiriş mətnini yaz. Heç bir izah, dırnaq, prefiks yox.\n' +
    '2. Bir sətir. Sətir bölməsi YOXDUR. \\n YOXDUR.\n' +
    '3. Sözün hərfləri arasında boşluq OLMASIN. "hesabat" yaz, "H E S A B A T" yox.\n' +
    '4. Maksimum 80 simvol, boşluqlar daxil.\n' +
    '5. YALNIZ Azərbaycan dili (latın). Kiril, ingilis və rus sözləri yoxdur.\n' +
    '6. Emoji yoxdur, CAPS LOCK yoxdur, üçlü nida işarəsi yoxdur.\n' +
    '7. Ton: ' + toneInstr + '.\n' +
    '8. Fərqli ol. Həmişə "Xatırladıram:" ilə başlama.\n' +
    'NÜMUNƏLƏR:\n' +
    '  "Sənin hesabat tapşırığın səni gözləyir."\n' +
    '  "Hey, hesabata başlamaq vaxtıdır."\n' +
    '  "Hesabat — tam vaxtıdır."',
  en: (toneInstr) =>
    'You write short push notification texts in English. STRICT RULES:\n' +
    '1. OUTPUT ONLY the notification text. No explanations, quotes, prefixes.\n' +
    '2. One line. NO line breaks. NO \\n.\n' +
    '3. NO spaces between letters in a word. Write "report", NOT "R E P O R T".\n' +
    '4. Max 80 characters including spaces.\n' +
    '5. ENGLISH ONLY. No other languages, no transliteration.\n' +
    '6. No emoji, no CAPS LOCK, no triple exclamation marks.\n' +
    '7. Style: ' + toneInstr + '.\n' +
    '8. Be varied. Do NOT always start with "Reminder:".\n' +
    'EXAMPLES:\n' +
    '  "Your report is waiting for you."\n' +
    '  "Hey, time to start the report."\n' +
    '  "Report — perfect time."',
};

const USER_PROMPTS = {
  ru: (reminder, attempt) =>
    `Задача: ${reminder.title}` +
    (reminder.note ? `. Контекст: ${reminder.note}` : '') +
    `. Попытка: ${attempt}. Напиши одну свежую строку-напоминание на русском.`,
  az: (reminder, attempt) =>
    `Tapşırıq: ${reminder.title}` +
    (reminder.note ? `. Kontekst: ${reminder.note}` : '') +
    `. Cəhd: ${attempt}. Azərbaycan dilində bir yeni xatırlatma sətri yaz.`,
  en: (reminder, attempt) =>
    `Task: ${reminder.title}` +
    (reminder.note ? `. Context: ${reminder.note}` : '') +
    `. Attempt: ${attempt}. Write one fresh reminder line in English.`,
};

export async function generateAIText(ai, reminder, attempt, lang = 'ru') {
  const L = pickLang(lang);
  const tone = reminder.tone || 'friendly';
  const escalatedTone =
    attempt >= 3
      ? ESCALATION_TONES[Math.min(attempt - 1, ESCALATION_TONES.length - 1)]
      : tone;

  const toneInstr = (TONE_INSTRUCTIONS[L] && TONE_INSTRUCTIONS[L][escalatedTone]) || TONE_INSTRUCTIONS[L].friendly;
  const systemPrompt = (SYSTEM_PROMPTS[L] || SYSTEM_PROMPTS.ru)(toneInstr);
  const userPrompt = (USER_PROMPTS[L] || USER_PROMPTS.ru)(reminder, attempt);

  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];

  try {
    const response = await ai.run(
      '@cf/meta/llama-3.2-3b-instruct',
      { messages, max_tokens: 60, temperature: 0.6 },
    );
    const raw = response?.response || '';
    const clean = sanitizeText(raw);
    if (!looksOK(clean, L)) {
      console.warn('AI output rejected:', JSON.stringify(raw).slice(0, 200));
      return null;
    }
    return clean;
  } catch (err) {
    console.warn('AI generation failed:', err?.message || err);
    return null;
  }
}

// ============================================================================
// Finalьnaya sborka pusha
// ============================================================================

const OPEN_HINTS = {
  ru: [
    'Тап → в app введи первые буквы названия',
    'Открой push.az — подтверждение по буквам названия',
    'Тап, чтобы завершить в приложении',
    'Подтверди в приложении первыми буквами названия',
    'Открой push.az → ввод букв из названия',
  ],
  az: [
    'Tap → tətbiqdə adın ilk hərflərini yaz',
    'push.az aç — adın hərfləri ilə təsdiq',
    'Bitirmək üçün tətbiqi aç',
    'Tətbiqdə başlığın ilk hərfləri ilə təsdiqlə',
    'push.az → başlıqdakı hərflər',
  ],
  en: [
    'Tap → type first letters of the title in the app',
    'Open push.az — confirm with letters from the title',
    'Tap to finish in the app',
    'Confirm in the app using the first letters of the title',
    'Open push.az → type letters from the title',
  ],
};

export async function buildPushBody(env, reminder, attempt, lang = 'ru') {
  const L = pickLang(lang);
  let baseText = null;
  if (env.ENABLE_AI_GENERATION === 'true' && env.AI) {
    baseText = await generateAIText(env.AI, reminder, attempt, L);
  }
  if (!baseText) baseText = pickFallbackText(reminder, attempt, L);

  if (attempt >= 2) {
    const hints = OPEN_HINTS[L] || OPEN_HINTS.ru;
    const hint = hints[Math.floor(Math.random() * hints.length)];
    baseText = `${baseText} → ${hint}`;
  }

  if (baseText.length > 140) baseText = baseText.slice(0, 137) + '…';

  return { text: baseText, challenge: null };
}
