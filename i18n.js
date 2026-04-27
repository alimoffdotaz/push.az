// Intl / translations for push.az
// Yazыki: ru (kirillitsa), az (Azeri, latin), en (English)

export const SUPPORTED_LANGS = ['ru', 'az', 'en'];
export const DEFAULT_LANG = 'ru';

const DICT = {
  ru: {
    // Meta
    'meta.title': 'push.az — особое напоминание',
    'meta.description': 'push.az — напоминание, которое точно донесёт уведомление',

    // Header
    'header.tagline': 'Особое напоминание · каждый раз новый текст пуша',
    'header.offline': 'Оффлайн',
    'header.permission': 'Разрешить',
    'header.settings': 'Настройки',
    'header.close': 'Закрыть',

    // Install banner
    'install.title': 'Установи push.az',
    'install.hint': 'Чтобы пуши работали надёжно и в списке уведомлений появился push.az.',
    'install.btn': 'Установить',
    'install.how': 'Как?',
    'install.ok_toast': 'Установлено ✓',
    'install.done_toast': 'push.az установлен ✓',

    // Install instructions per platform
    'install.iphone.title': 'iPhone / iPad — Safari',
    'install.iphone.1': 'Внизу (или справа сверху) нажми <kbd>Поделиться</kbd> — квадратик со стрелкой вверх.',
    'install.iphone.2': 'В меню пролистай и выбери <kbd>На экран «Домой»</kbd>.',
    'install.iphone.3': 'Нажми <kbd>Добавить</kbd>.',
    'install.iphone.4': 'Открой push.az с экрана «Домой» (не из Safari).',

    'install.mac_safari.title': 'Mac — Safari (macOS 14+)',
    'install.mac_safari.1': 'В меню сверху: <kbd>Файл</kbd> → <kbd>Добавить в Dock…</kbd>',
    'install.mac_safari.2': 'Нажми <kbd>Добавить</kbd>.',
    'install.mac_safari.3': 'Открой push.az из Dock.',
    'install.mac_safari.4': 'В «Системные настройки» → «Уведомления» появится push.az.',

    'install.mac_chrome.title': 'Mac — Chrome / Brave / Edge / Arc',
    'install.mac_chrome.1': 'В адресной строке справа нажми иконку <kbd>Установить</kbd> (монитор со стрелкой вниз).',
    'install.mac_chrome.2': 'Или — меню <kbd>…</kbd> → <kbd>Установить push.az</kbd>.',
    'install.mac_chrome.3': 'Нажми <kbd>Установить</kbd>.',
    'install.mac_chrome.4': 'Открой push.az из Launchpad или папки «Программы».',

    'install.android.title': 'Android — Chrome',
    'install.android.1': 'Меню <kbd>⋮</kbd> сверху справа.',
    'install.android.2': 'Выбери <kbd>Установить приложение</kbd> или <kbd>Добавить на главный экран</kbd>.',
    'install.android.3': 'Подтверди.',

    'install.firefox.title': 'Firefox',
    'install.firefox.1': 'Firefox пока не поддерживает PWA на десктопе полностью.',
    'install.firefox.2': 'Используй Chrome, Brave, Edge или Safari для установки.',

    'install.other.title': 'Установка',
    'install.other.1': 'В твоём браузере появится иконка «Установить» в адресной строке или в меню.',
    'install.other.2': 'Нажми её, потом <kbd>Установить</kbd>.',
    'install.other.3': 'Открой push.az как отдельное приложение.',

    // Reminders list
    'reminders.active': 'Активные',
    'reminders.create': 'Создать напоминание',
    'reminders.empty_title': 'Пока пусто',
    'reminders.empty_hint': 'Нажми «Создать напоминание» — пуш придёт вовремя и каждый раз с другим текстом.',
    'reminders.archive': 'Архив',
    'reminders.delete': 'Удалить',

    // Composer
    'composer.new': 'Новое напоминание',
    'composer.title_label': 'Название',
    'composer.title_ph': 'Например: Принять лекарство',
    'composer.note_label': 'Заметка (необязательно)',
    'composer.note_ph': 'Подробности, ссылка, контекст…',
    'composer.when': 'Дата и время',
    'composer.repeat': 'Повтор',
    'composer.repeat.none': 'Без повтора',
    'composer.repeat.daily': 'Каждый день',
    'composer.repeat.weekly': 'Каждую неделю',
    'composer.repeat.monthly': 'Каждый месяц',
    'composer.tone': 'Тон уведомлений',
    'composer.tone.friendly': '💜 Тепло — поддерживающе, без давления',
    'composer.tone.urgent': '⚡ Срочно — кратко и напористо',
    'composer.tone.funny': '😆 Смешно — с юмором',
    'composer.tone.aggressive': '🔥 Жёстко — как строгий тренер',
    'composer.cancel': 'Отмена',
    'composer.submit': 'Создать',

    // Repeat tags
    'repeat.daily': 'каждый день',
    'repeat.weekly': 'каждую неделю',
    'repeat.monthly': 'каждый месяц',

    // Tone tags
    'tone.friendly': 'тепло',
    'tone.urgent': 'срочно',
    'tone.funny': 'с юмором',
    'tone.aggressive': 'жёстко',

    // Relative time
    'rel.now': 'прямо сейчас',
    'rel.min': '{n} мин',
    'rel.hour': '{n} ч',
    'rel.day': '{n} дн.',
    'rel.overdue': 'просрочено · {label} назад',
    'rel.in': 'через {label}',

    // Takeover
    'takeover.label': 'НАПОМИНАНИЕ',
    'takeover.snooze10': 'Отложить на 10 мин',
    'takeover.more': '+{n} ещё',
    'takeover.challenge.1': 'Нажми <strong>{n}</strong>, чтобы закрыть',
    'takeover.challenge.2': 'Чтобы подтвердить — нажми <strong>{n}</strong>',
    'takeover.challenge.3': 'Прочёл? Нажми <strong>{n}</strong>',
    'takeover.challenge.4': 'Цифра <strong>{n}</strong> — и свободен',
    'takeover.challenge_letters_html':
      'Введи первые <strong>{n}</strong> буквы <strong>названия</strong> задачи (без пробелов, регистр не важен).',
    'takeover.challenge_confirm': 'Подтвердить',
    'takeover.challenge_input_aria': 'Первые буквы названия напоминания',
    'takeover.wrong': 'Не то. Прочти название и попробуй снова.',

    // Settings
    'settings.title': 'Настройки',
    'settings.lang': 'Язык',
    'settings.theme': 'Тема',
    'settings.theme_dark': 'Тёмная',
    'settings.theme_light': 'Светлая',
    'settings.cancel': 'Отмена',
    'settings.save': 'Сохранить',
    'settings.news_title': 'Короткие заметки в пушах',
    'settings.news_hint':
      'Отметь темы — к пушу и Telegram мы добавим ещё одну строку (подборка интересных фактов), чтобы чаще хотелось заглянуть в приложение.',
    'settings.news_aria': 'Категории коротких новостей',
    'settings.news_cat.tech': 'Технологии',
    'settings.news_cat.science': 'Наука',
    'settings.news_cat.space': 'Космос',
    'settings.news_cat.health': 'Здоровье',
    'settings.news_cat.nature': 'Природа',
    'settings.news_cat.culture': 'Культура',
    'settings.news_cat.business': 'Бизнес',
    'settings.news_cat.world': 'В мире',

    // Telegram
    'tg.title': 'Telegram',
    'tg.chip': 'дублирование',
    'tg.hint': 'Привяжи Telegram — напоминания будут приходить и в чат с ботом. Работает даже если браузер/iPhone недоступен.',
    'tg.link_btn': 'Привязать Telegram',
    'tg.your_code': 'Твой код:',
    'tg.open_bot': 'Открыть бота в Telegram',
    'tg.manual_hint': 'Или вручную: открой Telegram, найди бота',
    'tg.manual_send': 'отправь ему:',
    'tg.check': 'Я отправил — проверить',
    'tg.cancel': 'Отменить',
    'tg.add_more': 'Привязать ещё чат',
    'tg.unlink': 'Отвязать',
    'tg.linked_since': 'привязан {date}',
    'tg.toast_linked': 'Telegram привязан ✓',
    'tg.toast_not_yet': 'Пока нет — убедись, что отправил /link боту',
    'tg.toast_unlinked': 'Отвязан',

    // Account
    'acc.title': 'Аккаунт',
    'acc.add_passkey': 'Добавить ключ доступа на другом устройстве',
    'acc.logout': 'Выйти из аккаунта',
    'acc.logout_confirm': 'Выйти из аккаунта? Локальные напоминания будут очищены на этом устройстве (на сервере они сохранятся).',
    'acc.logout_toast': 'Вышли из аккаунта',
    'acc.passkey_added': 'Ключ доступа добавлен ✓',
    'acc.hello': 'Привет, {name}!',

    // Auth screen
    'auth.tagline': 'Войди, чтобы напоминания синхронизировались на всех твоих устройствах',
    'auth.login': 'Войти по ключу доступа',
    'auth.or': 'или',
    'auth.name_label': 'Имя (любое)',
    'auth.name_ph': 'Например: Айхан',
    'auth.register': 'Создать аккаунт',
    'auth.hint': 'Ключ доступа (passkey) — безопасный вход по Face ID, Touch ID или Windows Hello. Без пароля. Аккаунт привязан к ключу на этом устройстве. На других устройствах войди через связку ключей iCloud или Google или добавь новый ключ в настройках.',
    'auth.checking_passkey': 'Проверяю ключ доступа…',
    'auth.welcome': 'Добро пожаловать',
    'auth.creating': 'Создаю ключ доступа…',
    'auth.created': 'Аккаунт создан',

    // Errors
    'err.worker_not_configured': 'Worker не настроен',
    'err.passkey_unsupported': 'Ключ доступа не поддерживается в этом браузере',
    'err.passkey_cancelled': 'Вход по ключу отменён',
    'err.unauthorized': 'Не авторизован',
    'err.generic': 'Ошибка: {err}',

    // Toasts
    'toast.created': 'Напоминание создано',
    'toast.deleted': 'Удалено',
    'toast.snoozed': 'Отложено на {n} мин',
    'toast.done': 'Выполнено ✓',
    'toast.bad_date': 'Некорректная дата',
    'toast.time_passed': 'Время уже прошло',
    'toast.compose_title': 'Введи название напоминания',
    'toast.compose_when': 'Выбери дату и время',
    'toast.notifications_on': 'Уведомления включены',
    'toast.failed': 'Не удалось: {err}',
    'toast.settings_saved': 'Настройки сохранены',

    // Status pill
    'status.offline': 'Оффлайн',
    'status.active': '● Push активен',
    'status.not_configured': '● Push не настроен',
    'status.permission_denied': '● Уведомления запрещены',
    'status.prompt_pill': '● Нужно разрешение',
    'status.no_api_pill': '● Нет API уведомлений',

    // Banner
    'banner.no_notification_api': 'Твой браузер не поддерживает уведомления.',
    'banner.connecting_push': 'Уведомления разрешены. Подключаю push…',
    'banner.notifications_blocked': 'Уведомления заблокированы. Разреши их в настройках сайта.',
    'banner.need_permission': 'Для работы нужно разрешить уведомления.',

    // Текст локального уведомления, если у напоминания нет заметки
    'notify.default_body': 'Пора!',

    // Notification actions (sw)
    'push.action.open': 'Открыть и подтвердить',
    'push.action.snooze': 'Отложить 10 мин',
    'push.final_prefix': '🚨 ПОСЛЕДНИЙ ЗВОНОК — ',

    // Language names
    'lang.ru': 'Русский',
    'lang.az': 'Azərbaycan',
    'lang.en': 'English',
  },

  az: {
    'meta.title': 'push.az — Xüsusi reminder',
    'meta.description': 'push.az — xatırladıcı, hansı ki bildirişi mütləq çatdırır',

    'header.tagline': 'Xüsusi reminder · hər dəfə fərqli push',
    'header.offline': 'Oflayn',
    'header.permission': 'İcazə ver',
    'header.settings': 'Parametrlər',
    'header.close': 'Bağla',

    'install.title': 'push.az-ı quraşdır',
    'install.hint': 'Push etibarlı işləsin və bildiriş siyahısında push.az görünsün deyə.',
    'install.btn': 'Quraşdır',
    'install.how': 'Necə?',
    'install.ok_toast': 'Quraşdırıldı ✓',
    'install.done_toast': 'push.az quraşdırıldı ✓',

    'install.iphone.title': 'iPhone / iPad — Safari',
    'install.iphone.1': 'Aşağıda (və ya sağ yuxarıda) <kbd>Paylaş</kbd> düyməsini bas — yuxarı oxlu kvadrat.',
    'install.iphone.2': 'Menyunu sürüşdür və <kbd>Home-Ekrana əlavə et</kbd> seç.',
    'install.iphone.3': '<kbd>Əlavə et</kbd> bas.',
    'install.iphone.4': 'push.az-ı home screen-dən aç (Safari-dən yox).',

    'install.mac_safari.title': 'Mac — Safari (macOS 14+)',
    'install.mac_safari.1': 'Yuxarı menyuda: <kbd>File</kbd> → <kbd>Add to Dock…</kbd>',
    'install.mac_safari.2': '<kbd>Add</kbd> bas.',
    'install.mac_safari.3': 'push.az-ı Dock-dan aç.',
    'install.mac_safari.4': 'Sistem parametrlərində → Bildirişlər bölməsində push.az görünəcək.',

    'install.mac_chrome.title': 'Mac — Chrome / Brave / Edge / Arc',
    'install.mac_chrome.1': 'Ünvan sətrində sağda <kbd>Install</kbd> ikonuna bas (aşağı oxlu monitor).',
    'install.mac_chrome.2': 'Və ya menyu <kbd>…</kbd> → <kbd>Install push.az</kbd>.',
    'install.mac_chrome.3': '<kbd>Install</kbd> bas.',
    'install.mac_chrome.4': 'push.az-ı Launchpad / Applications-dan aç.',

    'install.android.title': 'Android — Chrome',
    'install.android.1': 'Sağ yuxarıda <kbd>⋮</kbd> menyusu.',
    'install.android.2': '<kbd>Install app</kbd> və ya <kbd>Add to Home screen</kbd> seç.',
    'install.android.3': 'Təsdiqlə.',

    'install.firefox.title': 'Firefox',
    'install.firefox.1': 'Firefox desktop-da PWA-nı hələ tam dəstəkləmir.',
    'install.firefox.2': 'Quraşdırmaq üçün Chrome, Brave, Edge və ya Safari istifadə et.',

    'install.other.title': 'Quraşdırma',
    'install.other.1': 'Brauzerində ünvan sətrində və ya menyuda "Install" ikonu görünəcək.',
    'install.other.2': 'Basıb sonra <kbd>Install</kbd>.',
    'install.other.3': 'push.az-ı ayrı tətbiq kimi aç.',

    'reminders.active': 'Aktiv',
    'reminders.create': 'Xatırladıcı yarat',
    'reminders.empty_title': 'Hələ boşdur',
    'reminders.empty_hint': '"Xatırladıcı yarat"-a bas — push vaxtında və hər dəfə fərqli mətnlə gələcək.',
    'reminders.archive': 'Arxiv',
    'reminders.delete': 'Sil',

    'composer.new': 'Yeni xatırladıcı',
    'composer.title_label': 'Ad',
    'composer.title_ph': 'Məsələn: Dərman qəbul et',
    'composer.note_label': 'Qeyd (məcburi deyil)',
    'composer.note_ph': 'Təfərrüatlar, link, kontekst…',
    'composer.when': 'Tarix və vaxt',
    'composer.repeat': 'Təkrar',
    'composer.repeat.none': 'Təkrarsız',
    'composer.repeat.daily': 'Hər gün',
    'composer.repeat.weekly': 'Hər həftə',
    'composer.repeat.monthly': 'Hər ay',
    'composer.tone': 'Bildiriş tonu',
    'composer.tone.friendly': '💜 Mülayim — dəstəkləyici, təzyiqsiz',
    'composer.tone.urgent': '⚡ Təcili — qısa və sərt',
    'composer.tone.funny': '😆 Yumorlu — zarafatla',
    'composer.tone.aggressive': '🔥 Sərt — sərt məşqçi kimi',
    'composer.cancel': 'İmtina',
    'composer.submit': 'Yarat',

    'repeat.daily': 'gündəlik',
    'repeat.weekly': 'həftəlik',
    'repeat.monthly': 'aylıq',

    'tone.friendly': 'mülayim',
    'tone.urgent': 'təcili',
    'tone.funny': 'yumorlu',
    'tone.aggressive': 'sərt',

    'rel.now': 'indi',
    'rel.min': '{n} dəq',
    'rel.hour': '{n} saat',
    'rel.day': '{n} gün',
    'rel.overdue': 'gecikib · {label} əvvəl',
    'rel.in': '{label} sonra',

    'takeover.label': 'XATIRLATMA',
    'takeover.snooze10': '10 dəq təxirə sal',
    'takeover.more': '+{n} daha',
    'takeover.challenge.1': 'Bağlamaq üçün <strong>{n}</strong> düyməsinə bas',
    'takeover.challenge.2': 'Təsdiq üçün — <strong>{n}</strong>-ə tap',
    'takeover.challenge.3': 'Oxudun? <strong>{n}</strong>-ə bas',
    'takeover.challenge.4': 'Rəqəm <strong>{n}</strong> — azadsan',
    'takeover.challenge_letters_html':
      'Tapşırığın <strong>adının</strong> ilk <strong>{n}</strong> hərfini yaz (boşluqsuz, böyük/kiçik fərq etmir).',
    'takeover.challenge_confirm': 'Təsdiqlə',
    'takeover.challenge_input_aria': 'Tapşırıq adının ilk hərfləri',
    'takeover.wrong': 'Yox. Adı diqqətlə oxu və yenidən yoxla.',

    'settings.title': 'Parametrlər',
    'settings.lang': 'Dil',
    'settings.theme': 'Tema',
    'settings.theme_dark': 'Tünd',
    'settings.theme_light': 'Açıq',
    'settings.cancel': 'İmtina',
    'settings.save': 'Yadda saxla',
    'settings.news_title': 'Pushda qısa xəbərlər',
    'settings.news_hint':
      'Mövzuları seç — hər bildirişə (və Telegrama) maraqlı fakt cərgəsi əlavə edəcəyik, tətbiqə baxmağı daha cəlbedici etsin.',
    'settings.news_aria': 'Qısa xəbər kateqoriyaları',
    'settings.news_cat.tech': 'Texnologiya',
    'settings.news_cat.science': 'Elm',
    'settings.news_cat.space': 'Kosmos',
    'settings.news_cat.health': 'Sağlamlıq',
    'settings.news_cat.nature': 'Təbiət',
    'settings.news_cat.culture': 'Mədəniyyət',
    'settings.news_cat.business': 'Biznes',
    'settings.news_cat.world': 'Dünyada',

    'tg.title': 'Telegram',
    'tg.chip': 'dublyaj',
    'tg.hint': 'Telegram-ı bağla — xatırladıcılar bot chat-ına da gələcək. Brauzer/iPhone əlçatmaz olsa belə işləyir.',
    'tg.link_btn': 'Telegram-ı bağla',
    'tg.your_code': 'Kodun:',
    'tg.open_bot': 'Botu Telegram-da aç',
    'tg.manual_hint': 'Və ya əllə: Telegram-ı aç, botu tap',
    'tg.manual_send': 'ona göndər:',
    'tg.check': 'Göndərdim — yoxla',
    'tg.cancel': 'İmtina',
    'tg.add_more': 'Daha bir chat bağla',
    'tg.unlink': 'Ayır',
    'tg.linked_since': 'bağlıdır {date}-dən',
    'tg.toast_linked': 'Telegram bağlandı ✓',
    'tg.toast_not_yet': 'Hələ yox — bota /link göndərdiyinə əmin ol',
    'tg.toast_unlinked': 'Ayrıldı',

    'acc.title': 'Hesab',
    'acc.add_passkey': 'Başqa cihazda passkey əlavə et',
    'acc.logout': 'Hesabdan çıx',
    'acc.logout_confirm': 'Hesabdan çıxaq? Bu cihazdakı lokal xatırladıcılar silinəcək (serverdə qalır).',
    'acc.logout_toast': 'Çıxış edildi',
    'acc.passkey_added': 'Passkey əlavə olundu ✓',
    'acc.hello': 'Salam, {name}!',

    'auth.tagline': 'Xatırladıcıların bütün cihazlarında sinxron olsun deyə daxil ol',
    'auth.login': 'Passkey ilə daxil ol',
    'auth.or': 'və ya',
    'auth.name_label': 'Ad (istənilən)',
    'auth.name_ph': 'Məsələn: Ayxan',
    'auth.register': 'Hesab yarat',
    'auth.hint': 'Passkey — Face ID / Touch ID / Windows Hello ilə təhlükəsiz giriş. Şifrə yoxdur. Hesab bu cihazdakı passkey-ə bağlıdır. Digər cihazlarda iCloud Keychain / Google Password Manager ilə daxil ol və ya parametrlərdən yeni passkey əlavə et.',
    'auth.checking_passkey': 'Passkey-i yoxlayıram…',
    'auth.welcome': 'Xoş gəldin',
    'auth.creating': 'Passkey yaradıram…',
    'auth.created': 'Hesab yaradıldı',

    'err.worker_not_configured': 'Worker təyin olunmayıb',
    'err.passkey_unsupported': 'Bu brauzerdə passkey dəstəklənmir',
    'err.passkey_cancelled': 'Passkey ləğv edildi',
    'err.unauthorized': 'İcazəsiz',
    'err.generic': 'Xəta: {err}',

    'toast.created': 'Xatırladıcı yaradıldı',
    'toast.deleted': 'Silindi',
    'toast.snoozed': '{n} dəq təxirə salındı',
    'toast.done': 'Edildi ✓',
    'toast.bad_date': 'Səhv tarix',
    'toast.time_passed': 'Vaxt keçib',
    'toast.compose_title': 'Xatırladıcının adını daxil et',
    'toast.compose_when': 'Tarix və vaxtı seç',
    'toast.notifications_on': 'Bildirişlər aktivdir',
    'toast.failed': 'Alınmadı: {err}',
    'toast.settings_saved': 'Parametrlər yadda saxlandı',

    'status.offline': 'Oflayn',
    'status.active': '● Push aktivdir',
    'status.not_configured': '● Push təyin olunmayıb',
    'status.permission_denied': '● Bildirişlər qadağandır',
    'status.prompt_pill': '● İcazə lazımdır',
    'status.no_api_pill': '● Bildiriş API yoxdur',

    'banner.no_notification_api': 'Brauzerin bildirişləri dəstəkləmir.',
    'banner.connecting_push': 'Bildirişlərə icazə var. Push qoşulur…',
    'banner.notifications_blocked': 'Bildirişlər bloklanıb. Sayt parametrlərində icazə ver.',
    'banner.need_permission': 'İşləməsi üçün bildirişlərə icazə ver.',

    'notify.default_body': 'Vaxtıdır!',

    'push.action.open': 'Aç və təsdiq et',
    'push.action.snooze': '10 dəq təxirə',
    'push.final_prefix': '🚨 SON ZƏNG — ',

    'lang.ru': 'Русский',
    'lang.az': 'Azərbaycan',
    'lang.en': 'English',
  },

  en: {
    'meta.title': 'push.az — Special reminder',
    'meta.description': 'push.az — a reminder that actually reaches you',

    'header.tagline': 'Special reminder · unique push every time',
    'header.offline': 'Offline',
    'header.permission': 'Allow',
    'header.settings': 'Settings',
    'header.close': 'Close',

    'install.title': 'Install push.az',
    'install.hint': 'So push works reliably and push.az appears in OS notifications.',
    'install.btn': 'Install',
    'install.how': 'How?',
    'install.ok_toast': 'Installed ✓',
    'install.done_toast': 'push.az installed ✓',

    'install.iphone.title': 'iPhone / iPad — Safari',
    'install.iphone.1': 'At the bottom (or top right), tap <kbd>Share</kbd> — square with up arrow.',
    'install.iphone.2': 'Scroll the menu and pick <kbd>Add to Home Screen</kbd>.',
    'install.iphone.3': 'Tap <kbd>Add</kbd>.',
    'install.iphone.4': 'Open push.az from the home screen (not from Safari).',

    'install.mac_safari.title': 'Mac — Safari (macOS 14+)',
    'install.mac_safari.1': 'Top menu: <kbd>File</kbd> → <kbd>Add to Dock…</kbd>',
    'install.mac_safari.2': 'Click <kbd>Add</kbd>.',
    'install.mac_safari.3': 'Open push.az from the Dock.',
    'install.mac_safari.4': 'push.az will appear in System Settings → Notifications.',

    'install.mac_chrome.title': 'Mac — Chrome / Brave / Edge / Arc',
    'install.mac_chrome.1': 'In the address bar on the right, click the <kbd>Install</kbd> icon (monitor with down arrow).',
    'install.mac_chrome.2': 'Or — menu <kbd>…</kbd> → <kbd>Install push.az</kbd>.',
    'install.mac_chrome.3': 'Click <kbd>Install</kbd>.',
    'install.mac_chrome.4': 'Open push.az from Launchpad / Applications.',

    'install.android.title': 'Android — Chrome',
    'install.android.1': 'Top-right menu <kbd>⋮</kbd>.',
    'install.android.2': 'Pick <kbd>Install app</kbd> or <kbd>Add to Home screen</kbd>.',
    'install.android.3': 'Confirm.',

    'install.firefox.title': 'Firefox',
    'install.firefox.1': 'Firefox does not fully support PWAs on desktop yet.',
    'install.firefox.2': 'Use Chrome, Brave, Edge or Safari to install.',

    'install.other.title': 'Install',
    'install.other.1': 'Your browser will show an "Install" icon in the address bar or menu.',
    'install.other.2': 'Click it, then <kbd>Install</kbd>.',
    'install.other.3': 'Open push.az as a standalone app.',

    'reminders.active': 'Active',
    'reminders.create': 'Create reminder',
    'reminders.empty_title': 'Nothing yet',
    'reminders.empty_hint': 'Tap "Create reminder" — push arrives on time, with a fresh text every time.',
    'reminders.archive': 'Archive',
    'reminders.delete': 'Delete',

    'composer.new': 'New reminder',
    'composer.title_label': 'Title',
    'composer.title_ph': 'Example: Take meds',
    'composer.note_label': 'Note (optional)',
    'composer.note_ph': 'Details, link, context…',
    'composer.when': 'Date and time',
    'composer.repeat': 'Repeat',
    'composer.repeat.none': 'No repeat',
    'composer.repeat.daily': 'Every day',
    'composer.repeat.weekly': 'Every week',
    'composer.repeat.monthly': 'Every month',
    'composer.tone': 'Notification tone',
    'composer.tone.friendly': '💜 Warm — supportive, no pressure',
    'composer.tone.urgent': '⚡ Urgent — short and direct',
    'composer.tone.funny': '😆 Funny — with humor',
    'composer.tone.aggressive': '🔥 Tough — like a strict coach',
    'composer.cancel': 'Cancel',
    'composer.submit': 'Create',

    'repeat.daily': 'daily',
    'repeat.weekly': 'weekly',
    'repeat.monthly': 'monthly',

    'tone.friendly': 'warm',
    'tone.urgent': 'urgent',
    'tone.funny': 'funny',
    'tone.aggressive': 'tough',

    'rel.now': 'right now',
    'rel.min': '{n} min',
    'rel.hour': '{n} h',
    'rel.day': '{n} d',
    'rel.overdue': 'overdue · {label} ago',
    'rel.in': 'in {label}',

    'takeover.label': 'REMINDER',
    'takeover.snooze10': 'Snooze 10 min',
    'takeover.more': '+{n} more',
    'takeover.challenge.1': 'Tap <strong>{n}</strong> to dismiss',
    'takeover.challenge.2': 'To confirm — tap <strong>{n}</strong>',
    'takeover.challenge.3': 'Read it? Tap <strong>{n}</strong>',
    'takeover.challenge.4': 'Digit <strong>{n}</strong> — and you are free',
    'takeover.challenge_letters_html':
      'Type the first <strong>{n}</strong> letters of the task <strong>title</strong> (no spaces, case does not matter).',
    'takeover.challenge_confirm': 'Confirm',
    'takeover.challenge_input_aria': 'First letters of the reminder title',
    'takeover.wrong': 'Not quite. Read the title and try again.',

    'settings.title': 'Settings',
    'settings.lang': 'Language',
    'settings.theme': 'Theme',
    'settings.theme_dark': 'Dark',
    'settings.theme_light': 'Light',
    'settings.cancel': 'Cancel',
    'settings.save': 'Save',
    'settings.news_title': 'Short reads in notifications',
    'settings.news_hint':
      'Pick topics and we will add a second line to each push (and Telegram) with a curated fact—so there is a reason to open the app.',
    'settings.news_aria': 'Short news topic categories',
    'settings.news_cat.tech': 'Tech',
    'settings.news_cat.science': 'Science',
    'settings.news_cat.space': 'Space',
    'settings.news_cat.health': 'Health',
    'settings.news_cat.nature': 'Nature',
    'settings.news_cat.culture': 'Culture',
    'settings.news_cat.business': 'Business',
    'settings.news_cat.world': 'World',

    'tg.title': 'Telegram',
    'tg.chip': 'mirror',
    'tg.hint': 'Link Telegram — reminders will also arrive in the bot chat. Works even when browser/iPhone is offline.',
    'tg.link_btn': 'Link Telegram',
    'tg.your_code': 'Your code:',
    'tg.open_bot': 'Open bot in Telegram',
    'tg.manual_hint': 'Or manually: open Telegram, find the bot',
    'tg.manual_send': 'send it:',
    'tg.check': 'I sent it — check',
    'tg.cancel': 'Cancel',
    'tg.add_more': 'Link another chat',
    'tg.unlink': 'Unlink',
    'tg.linked_since': 'linked on {date}',
    'tg.toast_linked': 'Telegram linked ✓',
    'tg.toast_not_yet': 'Not yet — make sure you sent /link to the bot',
    'tg.toast_unlinked': 'Unlinked',

    'acc.title': 'Account',
    'acc.add_passkey': 'Add passkey on another device',
    'acc.logout': 'Sign out',
    'acc.logout_confirm': 'Sign out? Local reminders on this device will be cleared (they remain on the server).',
    'acc.logout_toast': 'Signed out',
    'acc.passkey_added': 'Passkey added ✓',
    'acc.hello': 'Hi, {name}!',

    'auth.tagline': 'Sign in so your reminders sync across all your devices',
    'auth.login': 'Sign in with passkey',
    'auth.or': 'or',
    'auth.name_label': 'Name (anything)',
    'auth.name_ph': 'Example: Alex',
    'auth.register': 'Create account',
    'auth.hint': 'Passkey is a secure sign-in with Face ID / Touch ID / Windows Hello. No passwords. The account is tied to the passkey on this device. On other devices sign in via iCloud Keychain / Google Password Manager or add a new passkey from settings.',
    'auth.checking_passkey': 'Checking passkey…',
    'auth.welcome': 'Welcome',
    'auth.creating': 'Creating passkey…',
    'auth.created': 'Account created',

    'err.worker_not_configured': 'Worker is not configured',
    'err.passkey_unsupported': 'Passkeys are not supported in this browser',
    'err.passkey_cancelled': 'Passkey cancelled',
    'err.unauthorized': 'Unauthorized',
    'err.generic': 'Error: {err}',

    'toast.created': 'Reminder created',
    'toast.deleted': 'Deleted',
    'toast.snoozed': 'Snoozed for {n} min',
    'toast.done': 'Done ✓',
    'toast.bad_date': 'Invalid date',
    'toast.time_passed': 'Time has passed',
    'toast.compose_title': 'Enter a reminder title',
    'toast.compose_when': 'Pick date and time',
    'toast.notifications_on': 'Notifications enabled',
    'toast.failed': 'Failed: {err}',
    'toast.settings_saved': 'Settings saved',

    'status.offline': 'Offline',
    'status.active': '● Push active',
    'status.not_configured': '● Push not configured',
    'status.permission_denied': '● Notifications blocked',
    'status.prompt_pill': '● Permission needed',
    'status.no_api_pill': '● No notification API',

    'banner.no_notification_api': 'Your browser does not support notifications.',
    'banner.connecting_push': 'Notifications allowed. Connecting push…',
    'banner.notifications_blocked': 'Notifications are blocked. Allow them in site settings.',
    'banner.need_permission': 'Please allow notifications for the app to work.',

    'notify.default_body': 'Time!',

    'push.action.open': 'Open and confirm',
    'push.action.snooze': 'Snooze 10 min',
    'push.final_prefix': '🚨 FINAL CALL — ',

    'lang.ru': 'Russian',
    'lang.az': 'Azerbaijani',
    'lang.en': 'English',
  },
};

let currentLang = DEFAULT_LANG;
const listeners = new Set();

export function getLang() { return currentLang; }

export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = DEFAULT_LANG;
  currentLang = lang;
  try { document.documentElement.setAttribute('lang', lang); } catch {}
  for (const fn of listeners) { try { fn(lang); } catch {} }
}

export function onLangChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function detectBrowserLang() {
  const nav = (navigator.language || 'ru').toLowerCase();
  if (nav.startsWith('az')) return 'az';
  if (nav.startsWith('en')) return 'en';
  return 'ru';
}

export function localeFor(lang) {
  if (lang === 'az') return 'az-AZ';
  if (lang === 'en') return 'en-US';
  return 'ru-RU';
}

function format(str, params) {
  if (str == null) return '';
  if (!params) return String(str);
  return String(str).replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : '{' + k + '}'));
}

export function t(key, params) {
  if (key == null || key === '') return '';
  const dict = DICT[currentLang] || DICT[DEFAULT_LANG];
  const fallback = DICT[DEFAULT_LANG];
  const raw = (dict && dict[key]) || (fallback && fallback[key]) || String(key);
  return format(raw, params);
}

function readI18nAttr(el, name) {
  const v = el.getAttribute(name);
  return (v != null && v !== '') ? v : '';
}

// Walks DOM and populates every [data-i18n*] attribute.
// getAttribute: Safari надёжнее, чем dataset, для <option> и имён вроде data-i18n.
//  - data-i18n="key"              → textContent
//  - data-i18n-html="key"         → innerHTML (use for <kbd>, <strong>)
//  - data-i18n-placeholder="key"  → placeholder
//  - data-i18n-title="key"        → title
//  - data-i18n-aria-label="key"   → aria-label
export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = readI18nAttr(el, 'data-i18n');
    if (!key) return;
    el.textContent = t(key);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = readI18nAttr(el, 'data-i18n-html');
    if (!key) return;
    el.innerHTML = t(key);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = readI18nAttr(el, 'data-i18n-placeholder');
    if (!key) return;
    el.setAttribute('placeholder', t(key));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = readI18nAttr(el, 'data-i18n-title');
    if (!key) return;
    el.setAttribute('title', t(key));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = readI18nAttr(el, 'data-i18n-aria-label');
    if (!key) return;
    el.setAttribute('aria-label', t(key));
  });
  // meta description + title
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) metaDesc.setAttribute('content', t('meta.description'));
  if (document.title !== undefined) document.title = t('meta.title');
}
