# push.az

Personal'nyy PWA-reminder s push-uvedomleniyami. Bez build-step, bez zavisimostey — chistyy HTML/CSS/JS, ustanavlivayetsya kak prilozheniye, rabotayet offline.

## Chto umeyet

- Sozdavat' reminderu s nazvaniyem, zametkoy, datoy/vremenem i povtorom (den'/nedelya/mesyats)
- Khranit' vsyo v `IndexedDB` pryamo na ustroystve (nichego ne otpravlyayetsya v oblako)
- Pokazyvat' lokal'nyye uvedomleniya cherez Service Worker
- Na Chromium (Chrome, Edge, Brave, Opera) ispol'zuyet `TimestampTrigger` — uvedomleniya prikhodyat dazhe kogda vkladka zakryta
- Na Safari/Firefox rabotayet v «zhivom» rezhime (poka app otkryt ili ustanovlen kak PWA)
- Otkladyvat' na 10 minut odnoy knopkoy
- Rabotayet offline, ustanavlivayetsya na homescreen

## Struktura

```
push.az/
├── index.html              # UI
├── styles.css              # stili (dark theme, glassmorphism)
├── app.js                  # logika (CRUD, planirovaniye)
├── db.js                   # IndexedDB wrapper
├── sw.js                   # Service Worker (cache + push)
├── manifest.webmanifest    # PWA manifest
└── icons/
    ├── icon.svg
    └── icon-maskable.svg
```

## Lokal'nyy zapusk

PWA trebuyet HTTPS ili localhost. Samyy prostoy variant — vstroyennyy Python:

```bash
cd ~/Projects/push.az
python3 -m http.server 8000
```

Otkroy http://localhost:8000 v Chrome. Razreshi uvedomleniya, i mozhesh' ustanovit' kak prilozheniye (ikonka «+» v adresnoy stroke).

Alternativno, cherez `npx` (yesli stoit Node):

```bash
npx serve .
```

## Deploy na push.az

Lyuboy staticheskiy khosting podoydyot:

- **Netlify / Vercel / Cloudflare Pages** — prosto drag-n-drop papku ili podklyuchi git
- **GitHub Pages** — push v `gh-pages` branch
- **Svoy server** — nginx s `try_files $uri /index.html;`

Glavnoye — HTTPS (bez nego Service Worker i uvedomleniya rabotat' ne budut).

### Privyazka domena push.az

1. Kupi/obnovi domen push.az
2. V DNS postav' CNAME/A-zapis' na khosting
3. Dozhdis' vydachi SSL-sertifikata (avtomaticheski u Netlify/Vercel/Cloudflare)

## Ogranicheniya

- **iOS Safari**: trebuyet dobavit' v Home Screen dlya poluсheniya push-ov. Versii do iOS 16.4 uvedomleniya ne podderzhivayut.
- **TimestampTrigger** poka ne v stable Safari/Firefox. Bez nego reminderu srabatyvayut pri otkrytom app / esli Service Worker jivoy.
- Dlya nastoyashchikh server-side push-ov (kogda brauzer sovsem zakryt) nuzhno dobavit' VAPID-servery i `pushManager.subscribe`. Na MVP etogo net — yesli nuzhno, rasshirim.

## Dal'nyeyshiye idei

- Web Push s VAPID + malen'kiy backend (Cloudflare Worker)
- Eksport/import reminderov (JSON)
- Teggi/kategorii + fil'try
- Tekhstovoye raspoznavaniye («zavtra v 9» → data) cherez `chrono-node`
- Sinkhronizatsiya mezhdu ustroystvami (Supabase/Firebase)
