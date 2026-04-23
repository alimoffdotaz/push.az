// Telegram bot integration.
// Docs: https://core.telegram.org/bots/api

const TG_API = 'https://api.telegram.org';

// ============================================================================
// Utility
// ============================================================================

function escMd(s) {
  // MarkdownV2 requires escaping these characters.
  return String(s || '').replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

function randomCode(len = 6) {
  // User-friendly: no 0/O, 1/I, no lowercase
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

function tgUsername(env) {
  return env.TELEGRAM_BOT_USERNAME || 'push_az_bot';
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

export function formatReminderMessage(reminder, bodyText, attempt, maxAttempts) {
  const emoji = TONE_EMOJI[reminder.tone] || '🔔';
  const title = escMd(reminder.title);
  const body = escMd(bodyText);
  const note = reminder.note ? `\n\n_${escMd(reminder.note)}_` : '';
  const attemptLine = attempt > 1
    ? `\n\n_${escMd(`Popytka ${attempt}/${maxAttempts}`)}_`
    : '';
  return `${emoji} *${title}*\n\n${body}${note}${attemptLine}`;
}

export function reminderInlineKeyboard(reminderId) {
  return {
    inline_keyboard: [
      [
        { text: '✅ Gotovo', callback_data: `ack:${reminderId}` },
        { text: '⏰ +10 min', callback_data: `snooze:${reminderId}:10` },
      ],
      [
        { text: '⏰ +30 min', callback_data: `snooze:${reminderId}:30` },
        { text: '⏰ +1 ch', callback_data: `snooze:${reminderId}:60` },
      ],
    ],
  };
}

// ============================================================================
// Send reminder notification to all linked Telegram chats of a user
// Returns { sent, failed }
// ============================================================================

export async function tgSendReminderToUser(env, userId, reminder, bodyText, attempt, maxAttempts) {
  const chats = await env.DB.prepare(
    `SELECT chat_id FROM telegram_links WHERE user_id = ?1`,
  )
    .bind(userId)
    .all();

  const list = chats.results || [];
  if (!list.length) return { sent: 0, failed: 0 };

  const text = formatReminderMessage(reminder, bodyText, attempt, maxAttempts);
  const keyboard = reminderInlineKeyboard(reminder.id);

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
        // Esli bot zablokirovan ili chat udalёn — убираем privyazku
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
  // Do 5 popytok sgenerirovat' unikalnyy kod
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
      // kod uzhe zanyat (ochen malovероyatno) — povtoryaem
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
  // Verify secret
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

  // Telegram always expects 200 quickly
  return new Response('ok');
}

async function handleMessage(env, message) {
  const chat = message.chat;
  if (!chat) return;
  const chatId = chat.id;
  const text = (message.text || '').trim();

  // /start <code>  — privyazka
  const startMatch = text.match(/^\/start(?:@\w+)?(?:\s+([A-Z0-9]+))?/i);
  if (startMatch) {
    const code = (startMatch[1] || '').toUpperCase();
    if (!code) {
      await tgSendMessage(env, chatId, escMd(
        `Privet! Ya bot push.az — budu dublirovat' tvoi reminder'y syuda.\n\n` +
        `Chtob privyazat' akkaunt, otkroi push.az v brauzere → Nastroyki → "Privyazat' Telegram", ` +
        `poluchish' kod i otpravь ego syuda komandoy:\n\n/link KOD`,
      ));
      return;
    }
    await linkChat(env, chatId, message.from, code);
    return;
  }

  // /link <code>
  const linkMatch = text.match(/^\/link(?:@\w+)?\s+([A-Z0-9]+)/i);
  if (linkMatch) {
    const code = linkMatch[1].toUpperCase();
    await linkChat(env, chatId, message.from, code);
    return;
  }

  // /unlink
  if (/^\/unlink(?:@\w+)?$/i.test(text)) {
    await env.DB.prepare(`DELETE FROM telegram_links WHERE chat_id = ?1`).bind(chatId).run();
    await tgSendMessage(env, chatId, escMd('Otvyazal. Bolshe ne budu bespokoit\u2019.'));
    return;
  }

  // /help
  if (/^\/help(?:@\w+)?$/i.test(text)) {
    await tgSendMessage(env, chatId, escMd(
      `push.az bot — komandy:\n\n` +
      `/link KOD — privyazat' Telegram k akkauntu push.az\n` +
      `/unlink — otvyazat'\n` +
      `/status — pokazat' tekuschuyu privyazku\n` +
      `/help — eta spravka\n\n` +
      `Kogda nastupit vremya reminder'a — prishlyu syuda s knopkami Gotovo/Otlozhit'.`,
    ));
    return;
  }

  // /status
  if (/^\/status(?:@\w+)?$/i.test(text)) {
    const row = await env.DB.prepare(
      `SELECT * FROM telegram_links WHERE chat_id = ?1`,
    )
      .bind(chatId)
      .first();
    if (!row) {
      await tgSendMessage(env, chatId, escMd('Etot chat ne privyazan. Otprav\u2019 /link KOD.'));
    } else {
      const since = new Date(row.linked_at).toISOString().slice(0, 10);
      await tgSendMessage(env, chatId, escMd(`Privyazan k akkauntu push.az s ${since}.`));
    }
    return;
  }

  // Prosто tekst — otvechayem spravkoy yesli chat ne privyazan
  const linked = await env.DB.prepare(`SELECT 1 FROM telegram_links WHERE chat_id = ?1`)
    .bind(chatId)
    .first();
  if (!linked) {
    await tgSendMessage(env, chatId, escMd('Ne ponyal. Otprav\u2019 /help dlya spiska komand.'));
  }
}

async function linkChat(env, chatId, from, code) {
  const row = await consumeLinkCode(env, code);
  if (!row) {
    await tgSendMessage(env, chatId, escMd('Kod nevernyy ili protuchen (zhivyot 10 minut). Sgenerируй novyy v push.az.'));
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

  await tgSendMessage(env, chatId, escMd(
    `\u2705 Gotovo, privyazal!\n\n` +
    `Teper' ya budu dublirovat' tvoi reminder'y v etot chat. ` +
    `Mozhesh' podtverzhdat'/otkladyvat' pryamo knopkami v soobsheniyakh.\n\n` +
    `Otpiska — /unlink.`,
  ));
}

async function handleCallbackQuery(env, cq) {
  const data = cq.data || '';
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  if (!chatId || !messageId) {
    await tgAnswerCallback(env, cq.id, 'Oshibka');
    return;
  }

  const link = await env.DB.prepare(`SELECT user_id FROM telegram_links WHERE chat_id = ?1`)
    .bind(chatId)
    .first();
  if (!link) {
    await tgAnswerCallback(env, cq.id, 'Chat ne privyazan');
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
    await tgAnswerCallback(env, cq.id, 'Gotovo \u2714');
    // Edit soobsheniye — ubираem knopки
    const origText = cq.message?.text || '';
    const safe = escMd(origText);
    await tgEditMessage(env, chatId, messageId, safe + '\n\n\u2705 *' + escMd('podtverzhdeno') + '*', {
      reply_markup: { inline_keyboard: [] },
    });
    return;
  }

  if (action === 'snooze') {
    const minutes = Number(parts[2]) || 10;
    await snoozeReminderFromTelegram(env, link.user_id, reminderId, minutes);
    await tgAnswerCallback(env, cq.id, `Otlozheno na ${minutes} min`);
    const origText = cq.message?.text || '';
    const safe = escMd(origText);
    await tgEditMessage(env, chatId, messageId, safe + '\n\n\u23f0 *' + escMd(`otlozheno +${minutes} min`) + '*', {
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

// Duplikat logiki iz index.js (proposhe chem import)
function computeNextFireAt(currentFireAt, repeat, now) {
  const d = new Date(currentFireAt);
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
