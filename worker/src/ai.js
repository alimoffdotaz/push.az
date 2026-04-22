// Generator unikal'nykh tekstov uvedomleniy.
// Sperva fallback-biblioteka shablonov (besplatno, bystro, nadyozhno),
// potom Workers AI dlya maksimal'noy unikal'nosti.

// ============================================================================
// Shablony — srabatyvayut yesli AI nedostupen ili vyklyuchen
// ============================================================================

const TEMPLATES = {
  friendly: [
    (t) => `${t} — samoye vremya. 💜`,
    (t) => `Napominayu: ${t}`,
    (t) => `Ei, ne zabud': ${t}`,
    (t) => `${t} zhdyot tebya.`,
    (t) => `Pora: ${t}`,
    (t) => `Malen'koye napominaniye — ${t}.`,
    (t) => `Minutochka tvoyego vnimaniya: ${t}`,
    (t) => `✨ ${t}`,
    (t) => `${t}. Ty smozhesh'!`,
    (t) => `Privet! ${t} — seychas idealnoye vremya.`,
  ],
  urgent: [
    (t) => `⚡ ${t} — PRYAMO SEYCHAS`,
    (t) => `Stop. ${t}. Eto vazhno.`,
    (t) => `Ne otkladyvay: ${t}`,
    (t) => `${t} — vremya vyshlo.`,
    (t) => `Srochno! ${t}`,
    (t) => `Ei, ${t}. Seychas zhe.`,
    (t) => `Derzhis' plana: ${t}`,
    (t) => `⏰ ${t} — poslednee napominaniye.`,
  ],
  funny: [
    (t) => `Opyat' ya. ${t}?`,
    (t) => `Ya znayu chto ty zanyat, no ${t}`,
    (t) => `${t}. Ya zhdu. Mne skuchno.`,
    (t) => `Tvoi zadachi obizhayutsya. ${t}!`,
    (t) => `Eto ya, tvoy reminder. ${t}?`,
    (t) => `${t}. Obeshchayu, posle etogo ostavlyu v pokoye. (Net.)`,
    (t) => `Dorogoy dnevnik, oni snova zabyli pro ${t}.`,
    (t) => `🦥 Leen' govorit "potom". Ya govoryu: ${t}`,
  ],
  aggressive: [
    (t) => `${t}. Eto ne obsuzhdayetsya.`,
    (t) => `Khvatit tyanut'. ${t}.`,
    (t) => `Ty obeshchal sebe. ${t}.`,
    (t) => `${t}. Net otgovorok.`,
    (t) => `Kazhdaya sekunda bez "${t}" — prokrastinatsiya.`,
    (t) => `Prosnulsya? Teper' ${t}.`,
    (t) => `My uzhe obsuzhdali eto. ${t}.`,
  ],
};

// Eskalatsiya: chem bol'she popytok — tem ostrogee ton
const ESCALATION_TONES = ['friendly', 'friendly', 'urgent', 'urgent', 'aggressive'];

export function pickFallbackText(reminder, attempt) {
  const preferredTone = reminder.tone || 'friendly';
  const escalatedTone = attempt >= 3 ? ESCALATION_TONES[Math.min(attempt - 1, ESCALATION_TONES.length - 1)] : preferredTone;
  const pool = TEMPLATES[escalatedTone] || TEMPLATES.friendly;
  const idx = Math.floor(Math.random() * pool.length);
  const body = pool[idx](reminder.title);
  return body.length > 140 ? body.slice(0, 139) + '…' : body;
}

// ============================================================================
// Workers AI — generiruyem unikal'nyy tekst
// ============================================================================

const TONE_INSTRUCTIONS = {
  friendly: 'teplo, podderzhivayushche, bez pafosa',
  urgent: 'kratko, nastoychivo, s oshchushcheniyem srochnosti',
  funny: 's legkim yumorom, no po delu',
  aggressive: 'zhestko, bez sopel, kak strogiy trener',
};

export async function generateAIText(ai, reminder, attempt) {
  const tone = reminder.tone || 'friendly';
  const escalatedTone =
    attempt >= 3
      ? ESCALATION_TONES[Math.min(attempt - 1, ESCALATION_TONES.length - 1)]
      : tone;

  const hourLocal = new Date().getUTCHours(); // surrogate — pol'zovatel' mozhet peredavat' chasovoy poyas pozzhe
  const timeContext =
    hourLocal < 6 ? 'glubokaya noch' :
    hourLocal < 11 ? 'utro' :
    hourLocal < 17 ? 'den' :
    hourLocal < 22 ? 'vecher' : 'pozdniy vecher';

  const attemptContext =
    attempt === 1 ? 'Eto pervoye napominaniye.' :
    attempt === 2 ? 'Pol\u2019zovatel\u2019 propustil pervoye napominaniye.' :
    attempt === 3 ? 'Uzhe tret\u2019ye napominaniye, pol\u2019zovatel\u2019 ignoriruyet.' :
    `Eto uzhe ${attempt}-ye napominaniye, trebuyetsya rezkost\u2019.`;

  const messages = [
    {
      role: 'system',
      content:
        `Ty \u2014 dvizhok reminder-prilozheniya push.az. Tvoya zadacha: pisat' KOROTKIYE (do 100 simvolov), unikal'nyye teksty push-uvedomleniy, chtoby u pol'zovatelya NE bylo banner-slepoty. ` +
        `Kazhdoye soobshcheniye dolzhno byt' svezhim, raznym po formulirovke. Stil': ${TONE_INSTRUCTIONS[escalatedTone] || TONE_INSTRUCTIONS.friendly}. ` +
        `Mozhno emoji (1 shtuka maks.). Otvet: tol'ko sam tekst pusha, bez kavychek, bez prefiksov vrode "Push:" ili "Soobshcheniye:". Yazyk otveta \u2014 russkiy (latinitsey/translit yesli v ishodnom tak).`,
    },
    {
      role: 'user',
      content:
        `Zadacha pol'zovatelya: "${reminder.title}"` +
        (reminder.note ? `\nDop. zametka: "${reminder.note}"` : '') +
        `\nKontekst vremeni: ${timeContext}` +
        `\nNomer popytki: ${attempt}. ${attemptContext}` +
        `\nSdelay tekst, kakoy eshchyo ne byl by ocheviden. Ne ispol'zuy slovo "napominaniye" v pryamom smysle.`,
    },
  ];

  try {
    const response = await ai.run(
      '@cf/meta/llama-3.2-3b-instruct',
      { messages, max_tokens: 80, temperature: 0.9 },
    );
    let text = (response?.response || '').trim();
    // chistka: snimayem kavychki, prefiksy
    text = text.replace(/^["'«`]+|["'»`]+$/g, '');
    text = text.replace(/^(push|soobshcheniye|napominaniye|text)[:\-–]\s*/i, '');
    if (!text || text.length > 200) return null;
    return text;
  } catch (err) {
    console.warn('AI generation failed:', err?.message || err);
    return null;
  }
}

// ============================================================================
// Vykhodnaya funktsiya: poluchit' finаl'nyy tekst pusha
// ============================================================================

export async function buildPushBody(env, reminder, attempt) {
  if (env.ENABLE_AI_GENERATION === 'true' && env.AI) {
    const aiText = await generateAIText(env.AI, reminder, attempt);
    if (aiText) return aiText;
  }
  return pickFallbackText(reminder, attempt);
}
