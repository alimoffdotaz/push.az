// Generator tekstov + challenge-knopok dlya anti-banner-blindness.

// ============================================================================
// Shablony-fallback
// ============================================================================

const TEMPLATES = {
  friendly: [
    (t) => `${t} — samoye vremya.`,
    (t) => `Napominayu: ${t}`,
    (t) => `Ei, ne zabud': ${t}`,
    (t) => `${t} zhdyot tebya.`,
    (t) => `Pora: ${t}`,
    (t) => `Malen'koye napominaniye — ${t}.`,
    (t) => `Minutochka tvoyego vnimaniya: ${t}`,
    (t) => `Privet! ${t} — idealnoye vremya.`,
  ],
  urgent: [
    (t) => `${t} — PRYAMO SEYCHAS`,
    (t) => `Stop. ${t}. Eto vazhno.`,
    (t) => `Ne otkladyvay: ${t}`,
    (t) => `${t} — vremya vyshlo.`,
    (t) => `Srochno! ${t}`,
    (t) => `Derzhis' plana: ${t}`,
    (t) => `${t} — poslednee napominaniye.`,
  ],
  funny: [
    (t) => `Opyat' ya. ${t}?`,
    (t) => `Znayu chto ty zanyat, no ${t}`,
    (t) => `${t}. Ya zhdu, mne skuchno.`,
    (t) => `Tvoi zadachi obizhayutsya. ${t}!`,
    (t) => `Eto ya, tvoy reminder. ${t}?`,
    (t) => `${t}. Obeshchayu, posle etogo ostavlyu v pokoye.`,
    (t) => `Leen' govorit "potom". Ya govoryu: ${t}`,
  ],
  aggressive: [
    (t) => `${t}. Eto ne obsuzhdayetsya.`,
    (t) => `Khvatit tyanut'. ${t}.`,
    (t) => `Ty obeshchal sebe. ${t}.`,
    (t) => `${t}. Net otgovorok.`,
    (t) => `Prosnulsya? Teper' ${t}.`,
    (t) => `My uzhe obsuzhdali eto. ${t}.`,
  ],
};

const ESCALATION_TONES = ['friendly', 'friendly', 'urgent', 'urgent', 'aggressive'];

export function pickFallbackText(reminder, attempt) {
  const preferredTone = reminder.tone || 'friendly';
  const tone =
    attempt >= 3
      ? ESCALATION_TONES[Math.min(attempt - 1, ESCALATION_TONES.length - 1)]
      : preferredTone;
  const pool = TEMPLATES[tone] || TEMPLATES.friendly;
  const idx = Math.floor(Math.random() * pool.length);
  let body = pool[idx](reminder.title);
  return sanitizeText(body);
}

// ============================================================================
// Sanitiziruyem AI-otvet: ubirayem perenosy, drama-formatirovaniye,
// kavychki, prefiksy, lishniye probelы mezhdu bukvami.
// ============================================================================

function sanitizeText(s) {
  if (!s) return '';
  s = s.replace(/[\r\n\t]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^["'«`]+|["'»`]+$/g, '');
  s = s.replace(/^(push|soobshcheniye|napominaniye|text|otvet)[:\-–]\s*/i, '');
  // Ubirayem "burst-caps" tipa "О Т Ч Е Т" (otdel'nyye bukvy s probelami).
  s = s.replace(/\b([\p{L}\p{N}])(?:\s+([\p{L}\p{N}])){3,}\b/gu, (m) =>
    m.replace(/\s+/g, ''),
  );
  if (s.length > 140) s = s.slice(0, 137) + '...';
  return s;
}

function hasCyrillic(s) {
  return /[\u0400-\u04FF]/.test(s || '');
}

function looksOK(s) {
  if (!s || s.length < 3) return false;
  if (hasCyrillic(s)) return false;
  // Otkazyvayem yesli bol'she 40% simvolov v UPPERCASE (krichащий AI)
  const letters = s.match(/[a-z]/gi) || [];
  const upper = s.match(/[A-Z]/g) || [];
  if (letters.length > 10 && upper.length / letters.length > 0.5) return false;
  // Otkazyvayem yesli mnozhestvo vosklicatel'nyh/voprositelьnyh podryad
  if (/[!?]{3,}/.test(s)) return false;
  return true;
}

// ============================================================================
// Workers AI
// ============================================================================

const TONE_INSTRUCTIONS = {
  friendly: 'teplo, bez pafosa, bez vosklicatel\u2019nykh znakov',
  urgent: 'kratko, prosto, s oshchushcheniyem srochnosti, bez ALL CAPS',
  funny: 's legkim yumorom, no po delu, bez klounov',
  aggressive: 'zhestko, bez sopel, kak strogiy trener',
};

export async function generateAIText(ai, reminder, attempt) {
  const tone = reminder.tone || 'friendly';
  const escalatedTone =
    attempt >= 3
      ? ESCALATION_TONES[Math.min(attempt - 1, ESCALATION_TONES.length - 1)]
      : tone;

  const messages = [
    {
      role: 'system',
      content:
        'You write short push notification texts in transliterated Russian ' +
        '(Latin alphabet only, NO Cyrillic letters). STRICT RULES:\n' +
        '1. OUTPUT ONLY THE NOTIFICATION TEXT. No explanations, no quotes, no prefixes.\n' +
        '2. One single line. NO line breaks. NO \\n.\n' +
        '3. NO spaces between letters inside a word. Write "otchet", NOT "O T C H E T".\n' +
        '4. Max 80 characters including spaces.\n' +
        '5. LATIN letters only. NEVER use Cyrillic (а, б, в, г, д, etc). ' +
        'Use transliteration: "Pora nachat\u2019 otchet", NOT "Пора начать отчет".\n' +
        '6. No emoji, no all-caps shouting, no triple exclamation marks.\n' +
        '7. Style: ' + (TONE_INSTRUCTIONS[escalatedTone] || TONE_INSTRUCTIONS.friendly) + '.\n' +
        '8. Be varied. Do NOT always start with "Napominayu:".\n' +
        'EXAMPLES of good output:\n' +
        '  "Tvoya zadacha otchet zhdyot tebya."\n' +
        '  "Ey, pora nachat\u2019 otchet."\n' +
        '  "Otchet \u2014 samoye vremya."',
    },
    {
      role: 'user',
      content:
        `Task: ${reminder.title}` +
        (reminder.note ? `. Context: ${reminder.note}` : '') +
        `. Attempt: ${attempt}. Write one fresh reminder line in transliterated Russian.`,
    },
  ];

  try {
    const response = await ai.run(
      '@cf/meta/llama-3.2-3b-instruct',
      { messages, max_tokens: 50, temperature: 0.6 },
    );
    const raw = response?.response || '';
    const clean = sanitizeText(raw);
    if (!looksOK(clean)) {
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
// Challenge-knopki (anti-avtomatizm)
// ============================================================================
//
// Generiruyem challenge: "Podtverdi: nazhmi kvadrat s cifroy 7"
// i dve action-knopki [3] [7]. iOS Web Push podderzhivayet max 2 actions.
// Yesli pol\u2019zovatel\u2019 zhmyot pravil\u2019nuyu \u2014 ack.
// Yesli nepravil\u2019nuyu \u2014 ne akaem, push re-fire'itsya cherez 1-2 min.
// ============================================================================

const CHALLENGE_PHRASES = [
  (n) => `Hold push \u2192 nazhmi knopku [${n}]`,
  (n) => `Long-press \u2192 [${n}]`,
  (n) => `Chtoby zakryt': long-press i [${n}]`,
  (n) => `Derzhi push, nazhmi [${n}]`,
  (n) => `Long-press i tap [${n}] \u2014 i svoboden`,
];

export function makeChallenge() {
  const digits = [2, 3, 4, 5, 6, 7, 8, 9];
  const correct = digits[Math.floor(Math.random() * digits.length)];
  let distractor;
  do {
    distractor = digits[Math.floor(Math.random() * digits.length)];
  } while (distractor === correct);

  const swapOrder = Math.random() < 0.5;
  const buttons = swapOrder ? [distractor, correct] : [correct, distractor];

  const phrase = CHALLENGE_PHRASES[Math.floor(Math.random() * CHALLENGE_PHRASES.length)](correct);

  return {
    correct,
    buttons,
    phrase,
  };
}

// ============================================================================
// Finalьnaya sborka pusha
// ============================================================================

export async function buildPushBody(env, reminder, attempt) {
  let baseText = null;
  if (env.ENABLE_AI_GENERATION === 'true' && env.AI) {
    baseText = await generateAIText(env.AI, reminder, attempt);
  }
  if (!baseText) baseText = pickFallbackText(reminder, attempt);

  // Challenge vklyuchayem nachinaya so vtorogo pusha — pervoye napominaniye
  // dayom prosto s Gotovo/Otlozhit'. Yesli proignorival \u2014 dal'she uzhe challenge.
  const useChallenge = attempt >= 2 && env.ENABLE_CHALLENGE !== 'false';

  if (!useChallenge) {
    return { text: baseText, challenge: null };
  }

  const challenge = makeChallenge();
  const text = `${baseText} \u2192 ${challenge.phrase}`;
  return {
    text: text.length > 140 ? text.slice(0, 137) + '...' : text,
    challenge,
  };
}
