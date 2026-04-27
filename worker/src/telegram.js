// Telegram bot integration.
// Docs: https://core.telegram.org/bots/api

const TG_API = 'https://api.telegram.org';

// ============================================================================
// i18n dlya bot message'ey
// ============================================================================

const BOT_I18N = {
  ru: {
    start_no_code:
      'Привет! Я бот push.az — буду дублировать твои напоминания сюда.\n\n' +
      'Чтобы привязать аккаунт, открой push.az в браузере → Настройки → «Привязать Telegram», ' +
      'получи код и отправь его сюда командой:\n\n/link КОД',
    unlink_ok: 'Отвязал. Больше не буду беспокоить.',
    help:
      'push.az bot — команды:\n\n' +
      '/link КОД — привязать Telegram к аккаунту push.az\n' +
      '/unlink — отвязать\n' +
      '/status — показать текущую привязку\n' +
      '/help — эта справка\n\n' +
      'Когда наступит время напоминания — пришлю сюда с кнопками Готово/Отложить.',
    status_not_linked: 'Этот чат не привязан. Отправь /link КОД.',
    status_linked: (since) => `Привязан к аккаунту push.az с ${since}.`,
    unknown: 'Не понял. Отправь /help для списка команд.',
    bad_code: 'Код неверный или просрочен (живёт 10 минут). Сгенерируй новый в push.az.',
    linked:
      '✅ Готово, привязал!\n\n' +
      'Теперь я буду дублировать твои напоминания в этот чат. ' +
      'Можешь подтверждать/откладывать прямо кнопками в сообщениях.\n\n' +
      'Отписка — /unlink.',
    cb_error: 'Ошибка',
    cb_not_linked: 'Чат не привязан',
    cb_done: 'Готово ✔',
    cb_snoozed: (m) => `Отложено на ${m} мин`,
    confirmed: 'подтверждено',
    snoozed_line: (m) => `отложено +${m} мин`,
    final_prefix: (title) => `ПОСЛЕДНИЙ ЗВОНОК — ${title}`,
    final_hint: 'Больше пушей не будет. Открой push.az и подтверди.',
    attempt_line: (a, m) => `Попытка ${a}/${m}`,
    news_hook: 'Между делом',
    news_hooks: ['Между делом', 'На пару секунд в сторону', 'Короткая заметка', 'Факт дня'],
    btn_done: '✅ Готово',
    btn_10: '⏰ +10 мин',
    btn_30: '⏰ +30 мин',
    btn_60: '⏰ +1 ч',
  },
  az: {
    start_no_code:
      'Salam! Mən push.az botuyam — xatırladıcılarını buraya dublyaj edəcəyəm.\n\n' +
      'Hesabı bağlamaq üçün push.az-ı brauzerdə aç → Parametrlər → "Telegram-ı bağla", ' +
      'kodu götür və bura göndər:\n\n/link KOD',
    unlink_ok: 'Ayırdım. Daha narahat etməyəcəyəm.',
    help:
      'push.az bot — əmrlər:\n\n' +
      '/link KOD — Telegram-ı push.az hesabına bağla\n' +
      '/unlink — ayır\n' +
      '/status — cari bağlantını göstər\n' +
      '/help — bu köməkçi\n\n' +
      'Xatırlatma vaxtı gələndə — Edildi/Təxirə sal düymələri ilə göndərəcəyəm.',
    status_not_linked: 'Bu chat bağlı deyil. /link KOD göndər.',
    status_linked: (since) => `push.az hesabına ${since}-dən bağlıdır.`,
    unknown: 'Başa düşmədim. Əmrlərin siyahısı üçün /help göndər.',
    bad_code: 'Kod səhvdir və ya vaxtı keçib (10 dəq işləyir). push.az-da yenisini yarat.',
    linked:
      '✅ Hazır, bağlandı!\n\n' +
      'İndi xatırladıcılarını bu chat-a dublyaj edəcəyəm. ' +
      'Mesajlardakı düymələrlə birbaşa təsdiq edə və təxirə sala bilərsən.\n\n' +
      'Ayırmaq — /unlink.',
    cb_error: 'Xəta',
    cb_not_linked: 'Chat bağlı deyil',
    cb_done: 'Hazır ✔',
    cb_snoozed: (m) => `${m} dəq təxirə salındı`,
    confirmed: 'təsdiqləndi',
    snoozed_line: (m) => `təxirə salındı +${m} dəq`,
    final_prefix: (title) => `SON ZƏNG — ${title}`,
    final_hint: 'Artıq push gəlməyəcək. push.az-ı aç və təsdiq et.',
    attempt_line: (a, m) => `Cəhd ${a}/${m}`,
    news_hook: 'Qısa xəbər',
    news_hooks: ['Qısa xəbər', 'Bir dəqiqəlik fasilə', 'Kiçik müşahidə', 'Günün faktı'],
    btn_done: '✅ Edildi',
    btn_10: '⏰ +10 dəq',
    btn_30: '⏰ +30 dəq',
    btn_60: '⏰ +1 saat',
  },
  en: {
    start_no_code:
      "Hi! I'm the push.az bot — I'll mirror your reminders here.\n\n" +
      'To link your account, open push.az in the browser → Settings → "Link Telegram", ' +
      'grab the code and send it here:\n\n/link CODE',
    unlink_ok: "Unlinked. I won't bother you again.",
    help:
      'push.az bot — commands:\n\n' +
      '/link CODE — link Telegram to your push.az account\n' +
      '/unlink — unlink\n' +
      '/status — show current link\n' +
      '/help — this help\n\n' +
      "When it's reminder time — I'll send a message with Done/Snooze buttons.",
    status_not_linked: 'This chat is not linked. Send /link CODE.',
    status_linked: (since) => `Linked to push.az account since ${since}.`,
    unknown: "Didn't get that. Send /help for command list.",
    bad_code: 'Code is wrong or expired (lives 10 min). Generate a new one in push.az.',
    linked:
      "✅ Done, linked!\n\n" +
      "I'll mirror your reminders to this chat. " +
      'You can confirm/snooze right from the message buttons.\n\n' +
      'To unsubscribe — /unlink.',
    cb_error: 'Error',
    cb_not_linked: 'Chat not linked',
    cb_done: 'Done ✔',
    cb_snoozed: (m) => `Snoozed for ${m} min`,
    confirmed: 'confirmed',
    snoozed_line: (m) => `snoozed +${m} min`,
    final_prefix: (title) => `FINAL CALL — ${title}`,
    final_hint: "No more pushes. Open push.az and confirm.",
    attempt_line: (a, m) => `Attempt ${a}/${m}`,
    news_hook: 'Quick read',
    news_hooks: ['Quick read', 'Side note', 'Tiny fact', 'Worth peeking'],
    btn_done: '✅ Done',
    btn_10: '⏰ +10 min',
    btn_30: '⏰ +30 min',
    btn_60: '⏰ +1 h',
  },
};

function dict(lang) {
  return BOT_I18N[lang] || BOT_I18N.ru;
}

// ============================================================================
// Utility
// ============================================================================

function escMd(s) {
  // MarkdownV2 requires escaping these characters.
  return String(s || '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function randomCode(len = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

function tgToken(env) {
  return env.TELEGRAM_BOT_TOKEN;
}

// ============================================================================
// Telegram API helpers
// ============================================================================

async function tgCall(env, method, payload) {
  const token = tgToken(env);
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not configured');
  const res = await fetch(`${TG_API}/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) {
    console.warn('[tg] API error', method, data);
  }
  return data;
}

export async function tgSendMessage(env, chatId, text, extra = {}) {
  return tgCall(env, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    ...extra,
  });
}

export async function tgAnswerCallback(env, callbackQueryId, text = '', showAlert = false) {
  return tgCall(env, 'answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

async function tgEditMessage(env, chatId, messageId, text, extra = {}) {
  return tgCall(env, 'editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'MarkdownV2',
    disable_web_page_preview: true,
    ...extra,
  });
}

// ============================================================================
// Reminder -> Telegram message
// ============================================================================

const TONE_EMOJI = { friendly: '💜', urgent: '⚡️', funny: '😆', aggressive: '🔥' };

function tgMixHash(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function formatReminderMessage(reminder, bodyText, attempt, maxAttempts, lang = 'ru', newsText = null) {
  const L = dict(lang);
  const isFinal = attempt >= maxAttempts;
  const emoji = isFinal ? '🚨' : (TONE_EMOJI[reminder.tone] || '🔔');
  const rawTitle = isFinal ? L.final_prefix(reminder.title) : reminder.title;
  const title = escMd(rawTitle);
  const body = escMd(bodyText);
  let hookHead = L.news_hook;
  if (newsText && Array.isArray(L.news_hooks) && L.news_hooks.length) {
    const ix = tgMixHash(`${reminder.id}|${attempt}|${newsText}|${bodyText}`) % L.news_hooks.length;
    hookHead = L.news_hooks[ix];
  }
  const newsBlock = newsText
    ? `\n\n*${escMd(hookHead)}*\n_${escMd(newsText)}_`
    : '';
  const note = reminder.note ? `\n\n_${escMd(reminder.note)}_` : '';
  const header = isFinal ? `\n\n${escMd(L.final_hint)}` : '';
  const attemptLine = attempt > 1 ? `\n\n_${escMd(L.attempt_line(attempt, maxAttempts))}_` : '';
  return `${emoji} *${title}*\n\n${body}${newsBlock}${note}${header}${attemptLine}`;
}

export function reminderInlineKeyboard(reminderId, lang = 'ru') {
  const L = dict(lang);
  return {
    inline_keyboard: [
      [
        { text: L.btn_done, callback_data: `ack:${reminderId}` },
        { text: L.btn_10, callback_data: `snooze:${reminderId}:10` },
      ],
      [
        { text: L.btn_30, callback_data: `snooze:${reminderId}:30` },
        { text: L.btn_60, callback_data: `snooze:${reminderId}:60` },
      ],
    ],
  };
}

// ============================================================================
// Send reminder notification to all linked Telegram chats of a user
// ============================================================================

async function getUserLang(env, userId) {
  try {
    const row = await env.DB.prepare(`SELECT lang FROM users WHERE id = ?1`).bind(userId).first();
    return row?.lang || 'ru';
  } catch {
    return 'ru';
  }
}

async function getChatLang(env, chatId) {
  try {
    const row = await env.DB.prepare(
      `SELECT u.lang AS lang FROM telegram_links tl JOIN users u ON u.id = tl.user_id WHERE tl.chat_id = ?1`,
    ).bind(chatId).first();
    return row?.lang || 'ru';
  } catch {
    return 'ru';
  }
}

export async function tgSendReminderToUser(env, userId, reminder, bodyText, attempt, maxAttempts, newsText = null) {
  const chats = await env.DB.prepare(
    `SELECT chat_id FROM telegram_links WHERE user_id = ?1`,
  )
    .bind(userId)
    .all();

  const list = chats.results || [];
  if (!list.length) return { sent: 0, failed: 0 };

  const lang = await getUserLang(env, userId);
  const text = formatReminderMessage(reminder, bodyText, attempt, maxAttempts, lang, newsText);
  const keyboard = reminderInlineKeyboard(reminder.id, lang);

  let sent = 0;
  let failed = 0;
  for (const row of list) {
    try {
      const res = await tgSendMessage(env, row.chat_id, text, {
        reply_markup: keyboard,
      });
      if (res.ok) sent++;
      else {
        failed++;
        const code = res.error_code;
        if (code === 403 || code === 400) {
          if (res.description?.includes('bot was blocked') || res.description?.includes('chat not found')) {
            await env.DB.prepare(`DELETE FROM telegram_links WHERE chat_id = ?1`).bind(row.chat_id).run();
          }
        }
      }
    } catch (err) {
      console.warn('[tg] send error', err?.message || err);
      failed++;
    }
  }
  return { sent, failed };
}

// ============================================================================
// Link-flow: generate code, consume code
// ============================================================================

export async function createLinkCode(env, userId) {
  const now = Date.now();
  const expires = now + 10 * 60_000;
  for (let i = 0; i < 5; i++) {
    const code = randomCode(6);
    try {
      await env.DB.prepare(
        `INSERT INTO telegram_link_codes (code, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)`,
      )
        .bind(code, userId, now, expires)
        .run();
      return { code, expiresAt: expires };
    } catch (err) {
      continue;
    }
  }
  throw new Error('cannot generate unique link code');
}

async function consumeLinkCode(env, code) {
  const row = await env.DB.prepare(
    `SELECT * FROM telegram_link_codes WHERE code = ?1 AND consumed_at IS NULL AND expires_at > ?2`,
  )
    .bind(code, Date.now())
    .first();
  if (!row) return null;
  await env.DB.prepare(
    `UPDATE telegram_link_codes SET consumed_at = ?1 WHERE code = ?2`,
  )
    .bind(Date.now(), code)
    .run();
  return row;
}

// ============================================================================
// Webhook: process incoming updates
// ============================================================================

export async function handleTelegramWebhook(request, env) {
  const expectedSecret = env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
    if (got !== expectedSecret) {
      return new Response('forbidden', { status: 403 });
    }
  }

  let update;
  try { update = await request.json(); } catch { return new Response('bad json', { status: 400 }); }

  try {
    if (update.message) {
      await handleMessage(env, update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(env, update.callback_query);
    }
  } catch (err) {
    console.error('[tg] webhook error', err?.message || err, err?.stack);
  }

  return new Response('ok');
}

// Pytayemsya vybrat' yazik po: (1) uzhe privyazannomu user.lang, (2) Telegram language_code, (3) 'ru'
function pickChatLangForMessage(existingLang, from) {
  if (existingLang && BOT_I18N[existingLang]) return existingLang;
  const code = (from?.language_code || '').toLowerCase();
  if (code.startsWith('az')) return 'az';
  if (code.startsWith('en')) return 'en';
  if (code.startsWith('ru')) return 'ru';
  return 'ru';
}

async function handleMessage(env, message) {
  const chat = message.chat;
  if (!chat) return;
  const chatId = chat.id;
  const text = (message.text || '').trim();

  const linkedLang = await getChatLang(env, chatId);
  const lang = pickChatLangForMessage(linkedLang, message.from);
  const L = dict(lang);

  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+([A-Z0-9]+))?/i);
  if (startMatch) {
    const code = (startMatch[1] || '').toUpperCase();
    if (!code) {
      await tgSendMessage(env, chatId, escMd(L.start_no_code));
      return;
    }
    await linkChat(env, chatId, message.from, code, lang);
    return;
  }

  const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Z0-9]+)/i);
  if (linkMatch) {
    const code = linkMatch[1].toUpperCase();
    await linkChat(env, chatId, message.from, code, lang);
    return;
  }

  if (/^\/unlink(?:@\w+)?$/i.test(text)) {
    await env.DB.prepare(`DELETE FROM telegram_links WHERE chat_id = ?1`).bind(chatId).run();
    await tgSendMessage(env, chatId, escMd(L.unlink_ok));
    return;
  }

  if (/^\/help(?:@\w+)?$/i.test(text)) {
    await tgSendMessage(env, chatId, escMd(L.help));
    return;
  }

  if (/^\/status(?:@\w+)?$/i.test(text)) {
    const row = await env.DB.prepare(
      `SELECT * FROM telegram_links WHERE chat_id = ?1`,
    )
      .bind(chatId)
      .first();
    if (!row) {
      await tgSendMessage(env, chatId, escMd(L.status_not_linked));
    } else {
      const since = new Date(row.linked_at).toISOString().slice(0, 10);
      await tgSendMessage(env, chatId, escMd(L.status_linked(since)));
    }
    return;
  }

  const linked = await env.DB.prepare(`SELECT 1 FROM telegram_links WHERE chat_id = ?1`)
    .bind(chatId)
    .first();
  if (!linked) {
    await tgSendMessage(env, chatId, escMd(L.unknown));
  }
}

async function linkChat(env, chatId, from, code, lang) {
  const L = dict(lang);
  const row = await consumeLinkCode(env, code);
  if (!row) {
    await tgSendMessage(env, chatId, escMd(L.bad_code));
    return;
  }

  const now = Date.now();
  const username = from?.username || null;
  const firstName = from?.first_name || null;

  await env.DB.prepare(
    `INSERT INTO telegram_links (chat_id, user_id, username, first_name, linked_at, last_msg_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?5)
     ON CONFLICT(chat_id) DO UPDATE SET
       user_id = excluded.user_id,
       username = excluded.username,
       first_name = excluded.first_name,
       linked_at = excluded.linked_at,
       last_msg_at = excluded.last_msg_at`,
  )
    .bind(chatId, row.user_id, username, firstName, now)
    .run();

  // Berem yazyk iz user zapisi (on mog bit' nastroen v PWA)
  const userLang = await getUserLang(env, row.user_id);
  const LL = dict(userLang);
  await tgSendMessage(env, chatId, escMd(LL.linked));
}

async function handleCallbackQuery(env, cq) {
  const data = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const lang = await getChatLang(env, chatId);
  const L = dict(lang);

  if (!chatId || !messageId) {
    await tgAnswerCallback(env, cq.id, L.cb_error);
    return;
  }

  const link = await env.DB.prepare(`SELECT user_id FROM telegram_links WHERE chat_id = ?1`)
    .bind(chatId)
    .first();
  if (!link) {
    await tgAnswerCallback(env, cq.id, L.cb_not_linked);
    return;
  }

  const parts = data.split(':');
  const action = parts[0];
  const reminderId = parts[1];
  if (!reminderId) {
    await tgAnswerCallback(env, cq.id);
    return;
  }

  if (action === 'ack') {
    await ackReminderFromTelegram(env, link.user_id, reminderId);
    await tgAnswerCallback(env, cq.id, L.cb_done);
    const origText = cq.message?.text || '';
    const safe = escMd(origText);
    await tgEditMessage(env, chatId, messageId, safe + '\n\n✅ *' + escMd(L.confirmed) + '*', {
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  if (action === 'snooze') {
    const minutes = Number(parts[2]) || 10;
    await snoozeReminderFromTelegram(env, link.user_id, reminderId, minutes);
    await tgAnswerCallback(env, cq.id, L.cb_snoozed(minutes));
    const origText = cq.message?.text || '';
    const safe = escMd(origText);
    await tgEditMessage(env, chatId, messageId, safe + '\n\n⏰ *' + escMd(L.snoozed_line(minutes)) + '*', {
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  await tgAnswerCallback(env, cq.id);
}

// ============================================================================
// Ack / Snooze vnutri Workera (bez HTTP)
// ============================================================================

async function ackReminderFromTelegram(env, userId, reminderId) {
  const reminder = await env.DB.prepare(
    `SELECT * FROM reminders WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(reminderId, userId)
    .first();
  if (!reminder) return;

  const now = Date.now();
  if (reminder.repeat && reminder.repeat !== 'none') {
    const nextFire = computeNextFireAt(reminder.fire_at, reminder.repeat, now);
    await env.DB.prepare(
      `UPDATE reminders
       SET fire_at = ?1, next_attempt_at = ?1, send_count = 0, last_sent_at = NULL, status = 'active', acked_at = NULL, updated_at = ?2
       WHERE id = ?3`,
    ).bind(nextFire, now, reminderId).run();
    return;
  }

  await env.DB.prepare(
    `UPDATE reminders SET status = 'acked', acked_at = ?1, updated_at = ?1 WHERE id = ?2`,
  ).bind(now, reminderId).run();
}

async function snoozeReminderFromTelegram(env, userId, reminderId, minutes) {
  const reminder = await env.DB.prepare(
    `SELECT id FROM reminders WHERE id = ?1 AND user_id = ?2`,
  )
    .bind(reminderId, userId)
    .first();
  if (!reminder) return;

  const now = Date.now();
  const nextFire = now + Math.max(1, minutes) * 60_000;
  await env.DB.prepare(
    `UPDATE reminders
     SET fire_at = ?1, next_attempt_at = ?1, send_count = 0, last_sent_at = NULL, status = 'active', acked_at = NULL, updated_at = ?2
     WHERE id = ?3`,
  ).bind(nextFire, now, reminderId).run();
}

function computeNextFireAt(currentFireAt, repeat, now) {
  let next = currentFireAt;
  while (next <= now) {
    const nd = new Date(next);
    if (repeat === 'daily') nd.setDate(nd.getDate() + 1);
    else if (repeat === 'weekly') nd.setDate(nd.getDate() + 7);
    else if (repeat === 'monthly') nd.setMonth(nd.getMonth() + 1);
    else break;
    next = nd.getTime();
  }
  return next;
}

// ============================================================================
// Set webhook (admin utility)
// ============================================================================

export async function setTelegramWebhook(env, webhookUrl) {
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  return tgCall(env, 'setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message', 'callback_query'],
    ...(secret ? { secret_token: secret } : {}),
  });
}

export async function getTelegramWebhookInfo(env) {
  return tgCall(env, 'getWebhookInfo', {});
}
