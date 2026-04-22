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
  // Yesli bolee 4 podryad odnosymvol'nykh "slov" — sklеyivaem.
  s = s.replace(/\b([\p{L}\p{N}])(?:\s+([\p{L}\p{N}])){3,}\b/gu, (m) =>
    m.replace(/\s+/g, ''),
  );
  if (s.length > 140) s = s.slice(0, 137) + '...';
  return s;
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
        'Ty pishesh\u2019 teksty push-uvedomleniy. Zhestkiye pravila:\n' +
        '1. OTVET \u2014 TOL\u2019KO SAM TEKST PUSHA, nichego bol\u2019she.\n' +
        '2. Odna stroka. BEZ perenosov stroki, BEZ \\n.\n' +
        '3. BEZ probеlov mezhdu bukvami (ne "O T C H E T", a "otchet").\n' +
        '4. Maksimum 90 simvolov vklyuchaya probel.\n' +
        '5. BEZ kavychek, bez "Push:", bez emoji v stile smaylov lits.\n' +
        '6. Yazyk: russkiy transliteratsiya (latinitsey), chtoby sovpadal' +
        ' so stilem vkhoda.\n' +
        '7. Stil: ' + (TONE_INSTRUCTIONS[escalatedTone] || TONE_INSTRUCTIONS.friendly) + '.\n' +
        '8. Kazhdyy raz formuliruy po-drugomu. NE povtoryai shablon "Napominayu: X".',
    },
    {
      role: 'user',
      content:
        `Zadacha pol'zovatelya: ${reminder.title}` +
        (reminder.note ? `\nKontekst: ${reminder.note}` : '') +
        `\nPopytka nomer: ${attempt}.` +
        `\nNapishi odnu svezhuyu fraza-napominaniye, kotoraya tsepit vnimaniye.`,
    },
  ];

  try {
    const response = await ai.run(
      '@cf/meta/llama-3.2-3b-instruct',
      { messages, max_tokens: 60, temperature: 0.7 },
    );
    const raw = response?.response || '';
    const clean = sanitizeText(raw);
    if (!clean || clean.length < 3) return null;
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
  (n) => `Podtverdi: nazhmi ${n}`,
  (n) => `Chtoby zakryt' \u2014 ${n}`,
  (n) => `Vvedi podtverzhdеniye: ${n}`,
  (n) => `Tap na ${n} chtoby zavershit'`,
  (n) => `Dokazhi chto prochel. Nazhmi ${n}`,
  (n) => `Podpisь: ${n}`,
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
