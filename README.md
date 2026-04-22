# push.az

**Osobyy reminder dlya iPhone s push-uvedomleniyami, kotoryye ne nadoyedayut.**

Glavnoye otlichiye ot obychnykh reminderov: kazhdoye napominaniye prikhodit s **unikal'nym tekstom** (generiruyem cherez Cloudflare Workers AI), **trebuyet knopku "Gotovo"**, a yesli ignoriruyesh' \u2014 push prikhodit **snova s narastayushchey srochnost'yu**. Plyus pri otkrytii prilozheniya s neotvechennym reminder'om pokazyvayetsya polnoekrannyy "takeover" ekran.

## Arkhitektura

```
+-----------+         +---------------------+         +------------------+
|   PWA     |  sync   |  Cloudflare Worker  |  cron   |                  |
| (browser) | <-----> |  + D1  + Workers AI | every 1 |  FCM / Apple APN |
|           |         |  + VAPID push       |   min   |    push service  |
+-----------+         +---------------------+         +------------------+
      ^                                                         |
      +---------------------------------------------------------+
                         web push (p256dh encrypted)
```

## Struktura proekta

```
push.az/
+- index.html              # glavnyy UI
+- styles.css              # stili + takeover screen
+- app.js                  # logika PWA, podpiska na push, sync
+- db.js                   # IndexedDB (reminderu + config store)
+- sw.js                   # Service Worker: push event + notification actions + ack
+- manifest.webmanifest    # PWA metadata
+- icons/                  # SVG ikonki
+- tools/
|  +- vapid-gen.html       # lokal'nyy generator VAPID klyuchey
+- worker/                 # Cloudflare Worker (backend)
   +- wrangler.toml        # konfig Worker'a (D1, AI, cron bindings)
   +- package.json         # npm skripty
   +- schema.sql           # D1 skhema (devices, reminders, push_log)
   +- src/
      +- index.js          # API endpoints + scheduler
      +- push.js           # VAPID + ECE encryption (Web Crypto API)
      +- ai.js             # Workers AI + fallback shablony
```

## Deploy (polnyy flow)

### 1. Sgenerируй VAPID klyuchi

Otkroy v brauzere fayl `tools/vapid-gen.html` (dvoynoy klik ili `python3 -m http.server` potom zaydi na `http://localhost:8000/tools/vapid-gen.html`). Nazhmi **"Sgenerirovat\u2019 novyye VAPID klyuchi"**. Sokhrani **public** i **private** klyuchi \u2014 oni ponadobyatsya nizhe.

### 2. Sozday D1 bazu

V Cloudflare dashboard:
1. **Workers & Pages -> D1 -> Create database**, imya `push-az-db`
2. Posle sozdaniya skopiruy **Database ID**
3. V fayle `worker/wrangler.toml` zameni `REPLACE_WITH_D1_ID_FROM_DASHBOARD` na etot ID
4. V dashboard otkroy baznu -> tab **Console** -> vstav' soderzhimoye `worker/schema.sql` -> **Execute**

### 3. Zadeploy Worker

V Cloudflare dashboard:
1. **Workers & Pages -> Create -> Workers -> Import a repository**
2. Vyberi repo `alimoffdotaz/push.az`
3. **Root directory: `worker`**
4. Build command: pustoy (ili `npm install`)
5. Deploy command: `npx wrangler deploy`
6. Zhmi **Create and deploy**

Posle pervogo deploya zapish'i Worker URL (vid `https://push-az-worker.xxxxxxxx.workers.dev`).

### 4. Dobav' secrets v Worker

V dashboard: otkroy svoy Worker -> **Settings -> Variables and Secrets -> Add**:

| Name                  | Type   | Value                                           |
|-----------------------|--------|-------------------------------------------------|
| `VAPID_PUBLIC_KEY`    | Secret | (public klyuch iz shaga 1)                      |
| `VAPID_PRIVATE_KEY`   | Secret | (private klyuch iz shaga 1)                     |
| `VAPID_SUBJECT`       | Secret | `mailto:ayxan.a@gmail.com`                      |

Posle dobavleniya secrets Worker avtomatom peredeploy'itsya.

### 5. Podklyuchi PWA k Worker'u

Otkroy `https://push-az.pages.dev` (ili tvoy Pages URL), nazhmi ikonku **Nastroyki (shesteryonka)** v vernhem uglu, vstav' Worker URL (iz shaga 3) i sokhrani. App proverit `/api/health`, soberet VAPID public key, podpishetsya na push.

### 6. Razreshi uvedomleniya na iPhone

**Vazhno dlya iOS 16.4+:**
1. Otkroy push.az v Safari
2. Share -> **Add to Home Screen**
3. Zapusti **imenno ikonku s Home Screen**
4. Otkroy **Nastroyki** v prilozhenii -> Worker URL uzhe tam
5. Nazhmi **"Razreshit\u2019 uvedomleniya"**
6. Razreshi push v iOS dialogе

Testovy push: v futere app nazhmi **"Test-uvedomleniye"** \u2014 pridyot real'nyy push cherez Worker.

## Kak rabotayut "ne-banner-blindness" pushi

Scheduler v Worker'e kazhduyu minutu prokhodit po vsem `active` reminderam i dlya tekh, u kotorykh `next_attempt_at <= now`, delayet:

1. Generiruyet **unikal'nyy tekst** cherez Workers AI (`@cf/meta/llama-3.2-3b-instruct`) ili fallback shablony.
2. Otpravlyaet push cherez VAPID (p256dh + aes128gcm).
3. Zapisyvaet popytku v `push_log`.
4. Stavit sleduyushchuyu popytku: **2, 5, 10, 20 minut** \u2014 eskalatsiya.
5. Posle **5 popytok** bez ack perekhodit v status `cancelled` (ili na sleduyushchiy tsikl yesli `repeat`).
6. Pri nazhatiy knopki **"Gotovo"** Service Worker stuchit v `/api/ack` \u2014 reminder zakryvayetsya nemedlenno.

Ton pusha mozhno vybrat' pri sozdanii (`friendly`, `urgent`, `funny`, `aggressive`). S narastaniem nomerom popytki ton avtomaticheski stanovitsya bolee srochnym.

## iOS osobennosti

- Push rabotayet tol'ko posle **"Add to Home Screen"** \u2014 eto ogranicheniye Apple dlya PWA.
- `requireInteraction: true` na iOS ignoriruyetsya \u2014 push skryvayetsya sam. Kompensiruyem eskalatsiey (sleduyushchaya popytka cherez 2 min) + takeover-ekranom pri otkrytii app.
- Kastomnyye zvuki i vibratsiya dlya push na iOS ne rabotayut (tol'ko sistemnyy zvuk). Mozhno zadat' `interruption-level: time-sensitive` dlya proryva cherez Focus mode.
- `TimestampTrigger` ne podderzhivayetsya v Safari \u2014 poetomu obyazatelen backend dlya push.

## Lokal'naya razrabotka

### Frontend
```bash
cd ~/Projects/push.az
python3 -m http.server 8000
# otkroy http://localhost:8000
```
Dlya testa na telefone cherez HTTPS tunnel:
```bash
brew install cloudflared
cloudflared tunnel --url http://localhost:8000
```

### Worker
```bash
cd worker
npm install
npx wrangler d1 create push-az-db
# skopiruy database_id v wrangler.toml
npx wrangler d1 execute push-az-db --local --file=./schema.sql
# zapis' VAPID secrets v .dev.vars:
echo 'VAPID_PRIVATE_KEY="..."' > .dev.vars
echo 'VAPID_PUBLIC_KEY="..."' >> .dev.vars
echo 'VAPID_SUBJECT="mailto:..."' >> .dev.vars
npx wrangler dev
```

## Feature checklist

- [x] PWA s offline cache (Service Worker)
- [x] IndexedDB dlya reminderov i config
- [x] TimestampTrigger dlya brauzerov, kotoryye yego podderzhivayut
- [x] VAPID Web Push (RFC 8291) \u2014 chistyy Web Crypto API, bez vneshnikh bibliotek
- [x] Workers AI dlya unikal'nykh tekstov kazhdogo pusha
- [x] Cron scheduler (kazhduyu minutu) s eskalatsiey 2 -> 5 -> 10 -> 20 min
- [x] Action knopki v push (Gotovo / Otlozhit\u2019)
- [x] Full-screen takeover pri neotvechennykh reminderakh
- [x] Ton uvedomleniy: friendly / urgent / funny / aggressive
- [x] D1 log vsekh otpravlennykh pushey (dlya debugga)
- [ ] Badge counter na ikonke (App Badge API \u2014 poka ogranichenno na iOS)
- [ ] Rasshirennyy Workers AI prompt s uchyotom vremeni pol'zovatelya
- [ ] Ratings pushey ("etot tekst byl poleznym?") dlya dozhimki modeli

## Litsenziya

Private project. (c) 2026
