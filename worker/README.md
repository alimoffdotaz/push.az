# push.az Worker

Cloudflare Worker dlya push.az — otpravlyayet Web Push uvedomleniya po raspisaniyu, generiruyet unikal'nyye teksty cherez Workers AI, khranit vsyo v D1.

## Arkhitektura

```
PWA (browser) ──sync──> Worker ──cron every 1 min──> Web Push ──> APN/FCM ──> iPhone
                         │
                         ├── D1 (devices, reminders, push_log)
                         └── Workers AI (generatsiya unikal'nykh tekstov)
```

## Endpoints

| Method | Path                    | Chto delayet                              |
|--------|-------------------------|-------------------------------------------|
| GET    | `/api/vapid-public-key` | Vernot public VAPID klyuch dlya PWA       |
| POST   | `/api/subscribe`        | Sokhranyayet push subscription            |
| POST   | `/api/unsubscribe`      | Udalyayet podpisku                        |
| GET    | `/api/reminders`        | Spisok reminderov ustroystva              |
| POST   | `/api/reminders`        | Sozdat' ili obnovit' reminder             |
| DELETE | `/api/reminders/:id`    | Udalit' reminder                          |
| POST   | `/api/ack`              | Podtverdit' reminder (ostanovka eskaltsy) |
| GET    | `/api/health`           | Proverka chto Worker zhiv                 |

## Cron

Triggerится kazhduyu minutu (`* * * * *`). Delayet:
1. Berit reminderu s `status='active' AND next_attempt_at <= now`
2. Generiruyet tekst pusha cherez Workers AI (s uchyotom `tone` i `send_count`)
3. Otpravlyayet Web Push cherez VAPID
4. Obnovlyayet `send_count`, `last_sent_at`, `next_attempt_at` (eskalatsiya: 2, 5, 10, 20 min)
5. Posle 5 popytok bez ack — ostanavlivayet (mozhno podkrutit')

## Deploy

### 1. Sozday D1 bazu
V dashboard: **Workers & Pages → D1 → Create database → `push-az-db`**.
Skopiruy `database_id` i vstav' v `wrangler.toml`.

### 2. Primeni schema
- Otkroy svoyu D1 bazu v dashboard → **Console** → vstav' soderzhimoye `schema.sql` → **Execute**

### 3. Sgenerируй VAPID klyuchi
Otkroy `tools/vapid-gen.html` v brauzere (napryamuyu fayl:// ili `python3 -m http.server`). Sgeneriruy klyuchi.

### 4. Zapisi secrets v Worker
V dashboard: **tvoy Worker → Settings → Variables and Secrets → Add → Encrypt**:
- `VAPID_PRIVATE_KEY` = private klyuch
- `VAPID_PUBLIC_KEY` = public klyuch
- `VAPID_SUBJECT` = `mailto:tvoy-email@example.com`

### 5. Podklyuchi git v Workers Builds
V dashboard: **Workers & Pages → Create application → Connect to Git**.
Vyberi `push.az` repo, **Root directory = `worker`**. Deploy avtomatom.

## Lokal'naya razrabotka

```bash
cd worker
npm install
wrangler d1 create push-az-db          # odin raz
# (skopiruy id v wrangler.toml)
npm run db:init:local
wrangler dev                           # lokal'nyy server na localhost:8787
```
