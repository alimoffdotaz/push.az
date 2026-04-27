// Kuriruemыye faktovыye strоki dlya push i Telegram (pо vybrannыm kategoriyam polzovatelya).

/** Dostupnыye kategorii — to zhe, chto v UI. */
export const NEWS_CATEGORY_IDS = [
  'tech',
  'science',
  'space',
  'health',
  'nature',
  'culture',
  'business',
  'world',
];

const ID_SET = new Set(NEWS_CATEGORY_IDS);

const POOL = {
  ru: {
    tech: [
      'Нейросети уже ускоряют поиск молекул для новых лекарств.',
      'Квантовые чипы в лабораториях сокращают время крупных вычислений.',
      'Спутник и 5G меняют логистику в отдалённых районах.',
      'Очки с «умным» ИИ вновь обещают слой AR поверх улицы.',
      'Новые схемы зарядки в телефонах снижают тепло и берегут срок батареи.',
      'Open-source модели сокращают стоимость внутренних ботов в компаниях.',
    ],
    science: [
      'Гравитационные волны дали космосу «второй канал» помимо света.',
      'Редакция генома спорит с этикой сильнее, чем с техникой.',
      'Микробиом влияет на иммунитет сильнее, чем казалось раньше.',
      'Синтетическая биология выходит на мелкосерийное производство ферментов.',
      'Лазеры для охлаждения атомов — часть пути к квантовой памяти.',
      'Статистика клиник всё чаще проверяется независимыми ревью-группами.',
    ],
    space: [
      'Телескопы находят планеты, где «год» короче суток.',
      'Лунная пыль портит технику — ищут новые защитные материалы.',
      'С орбиты видно лесные пожары и таяние льда в реальном времени.',
      'Планеры на других планетах снова обсуждают рекультивацию грунта.',
      'Миссии к астероидам сравнивают химию породы с древними метеоритами на Земле.',
      'Ракетные «рефлайты» пытаются снижать цену за килограмм на орбиту.',
    ],
    health: [
      '10–15 минут ходьбы после еды снижают пик сахара в крови.',
      'Сон в одно время выравнивает гормоны лучше, чем «догнать в выходной».',
      'Стакан воды до кофе иногда снимает пиковую усталость к обеду.',
      'Сила тренажёра полезна, но прогулка спасает суставы в долгом горизонте.',
      'Свет вечером теплее снижает влияние на мелатонин сильнее, чем яркие LED.',
      'Перерыв в 5 минут от экрана каждые 50 мин снижает сухость глаз у многих.',
    ],
    nature: [
      'Аллеи деревьев реально снижают уличную жару в городе.',
      'Пчёлы ориентируются по запаху и по магнитному полю Земли.',
      'Кораллы создают рифы, но боятся перегрева воды.',
      'Влажные луга удерживают воду в засушливом сезоне дольше, чем газоны.',
      'Совы и ястребы в городах снова сигнализируют о чистом воздухе.',
      'Восстановление мангров спасает побережья от волн в шторм.',
    ],
    culture: [
      'Стриминг и кинозалы всё чаще делят зрителя, а не борются в ноль.',
      'Виртуальные музеи открыли шедевры людям без перелёта.',
      'Подкасты забирают вечернее время у радио в крупных городах.',
      'Сериал на неделю стал важнее кинорелиза пятницы в потоковом мире.',
      'Букмекерские площадки спорят с фестивалями о правах на прямой эфир.',
      'Самиздат обгоняет часть ниши по скорости выхода романов.',
    ],
    business: [
      'Инвесторы снова смотрят на прибыль раньше, чем пять лет назад.',
      'Офисы перестраивают под встречи, а не ряды кабинетов.',
      'ESG-данные влияют на условия кредитов у среднего бизнеса.',
      'B2B-маркетплейсы сокращают сроки поиска поставщиков в регионе.',
      'Стартапные акселераторы чаще меряют unit-экономику в первом квартале.',
      'Собственникам важнее страховка сбоев поставок, чем скидка 3%.',
    ],
    world: [
      'Мегаполисы соревнуются за кадры с навыками ИИ.',
      'Умные сети воды и света экономят миллиарды в год в регионах.',
      'Туризм смещается: меньше чек-листов, больше длинного отдыха.',
      'Городам выгоднее субсидии на велоинфраструктуру, чем развороты под авто.',
      'Тепловые волны заставляют соседние районы договариваться о пике мощностей.',
      'Маленькие аэропорты спорят с хабами о прямых рейсах в сезон.',
    ],
  },
  az: {
    tech: [
      'Neural şəbəkələr yeni dərman molekullarını axtarışı sürətləndirir.',
      'Kvant çipləri laboratoriyalarda böyük hesablamaların vaxtını qısaldır.',
      '5G və peyk uzaq rayonlarda logistikanı dəyişir.',
      'Açıq modellər şirkət daxili botların qiymətini aşağı salır.',
      'Ağıllı eynək AR təbəqəsi haqqında yenidən danışılır.',
      'Yeni şarj sxemləri telefon batareyasını yumşaq istilədir.',
    ],
    science: [
      'Cazibə dalğaları kosmosa işıqdan əlavə "ikinci kanal" açdı.',
      'Genom redaksiyası texnikadan çox etika mübahisəsi doğurur.',
      'Mikrobiom immun sistemə əvvəlkindən güclü təsir göstərir.',
      'Sintetik biologiya fermentləri kiçik seriyalarda istehsal edir.',
      'Klinika statistikası müstəqil nəzər heyətləri ilə yoxlanır.',
      'Atomları soyutmaq üçün lazerlər kvant yaddaşının parçasıdır.',
    ],
    space: [
      'Teleskoplar "ili" 24 saatdan qısa olan planetalar tapır.',
      'Ay tozu texnikanı korlayır — yeni qoruyucu materiallar axtarılır.',
      "Orbitdən meşə yanğınları buz ərimesini real vaxtda izləməyə imkan verir.",
      'Planet qleyderləri torpaq bərpasını müzakirə edir.',
      'Asteroid missiyaları meteoritlərlə müqayisə üçün nümunə gətirir.',
      'Təkrar uçuş raketləri orbitə çatdırma qiymətini ucaldır.',
    ],
    health: [
      'Yeməkdən sonra 10–15 dəqiqə gəzinti qan şəkərinin pikini azaldır.',
      'Hər gün eyni vaxtda yatmaq hormonları "çıxartmaqdan" yaxşı tənzimləyir.',
      'Qəhvədən əvvəl stəkan su günortaya yaxın yorğunluğu azalda bilər.',
      'Çəki qaldırmaq faydalıdır, uzun məsafə gəzişi oynaqları qoruyur.',
      'Axşamın isti işığı melatonini aparıcı soyuqdan güclü təsir edir.',
      'Ekrana 50 dəqiqədə 5 dəqiqə fasilə qurunu azaldır.',
    ],
    nature: [
      'Şəhərdə ağac sıra küçə istisini aşağı salır.',
      'Arılar qoxu və yerin maqnit sahəsi ilə istiqamət tutur.',
      'Mərcan rifləri həyat "fabrikası"dır, lakin suyun qızmasına həssasdır.',
      'Yaş çəmənlər quru mövsümdə suyu daha uzun saxlayır.',
      'Şəhər bayquşları təmiz havaya işarə verir.',
      'Maqrov əkilməsi dalğa zərbəsini yumşaldır.',
    ],
    culture: [
      'Striminq və zallar izləyicini bölür, sıfırla yarışmır.',
      'Virtual muzeylər şah əsərləri uçuşsuz açır.',
      'Podkastlar böyük şəhərlarda axşam FM-ə vaxt aparır.',
      'Həftəlik serial cümə kinodan daha vacib ola bilər.',
      'Festival canlı yayım hüquqları platformalarla mübahisəlidir.',
      'Self-publishing bəzi mövzularda ən sürətli buraxılışdır.',
    ],
    business: [
      'İnvestorlar illər əvvəldən tez mənfəətə baxır.',
      'Ofislər kabinə sıralarından görüşlərə qədər təzələnir.',
      'ESG məlumatı kredit şərtlərinə təsir göstərir.',
      'B2B bazar yerləşməçilər üçün axtarışı qısaldır.',
      'Akseleratorlar ilk rübdə vahid iqtisadiyyatı ölçür.',
      'Sahibkarlara dayanıqlıqda gecikmə endirimi qədər vacib deyil.',
    ],
    world: [
      'Meqapollisler AI bacarıqlı kadr uğrunda yarışır.',
      'Ağıllı su və işıq şəbəkəsi regionlarda milyardlar qənaət edir.',
      'Turizm çək-çək siyahıdan uzun istirahata qayıdır.',
      'Veloinfrastruktura avtomobil dönüşündən bəzən ucuz başa gəlir.',
      'İstilik dalğaları qonşu rayonlar arasında güc bölüşdürür.',
      'Kiçik aeroportlar mövsümdə birbaşa reys uğrunda mübarizə aparır.',
    ],
  },
  en: {
    tech: [
      'Neural nets already speed the hunt for new drug molecules.',
      'Lab quantum chips are shrinking time for big simulations.',
      '5G plus satellites are changing logistics in remote areas.',
      'Open models are cutting the cost of internal company bots.',
      'Smart glasses with AR are back in “maybe this year” mode.',
      'New charging schemes run phones cooler and age batteries slower.',
    ],
    science: [
      'Gravitational waves added a second “channel” to the cosmos beyond light.',
      'Gene editing still sparks more ethics debate than pure tech talk.',
      'The gut microbiome shapes immunity more than we used to think.',
      'Synthetic biology scales small-batch enzyme production.',
      'Clinic trials get more third-party stats reviews than a decade ago.',
      'Lasers that cool atoms inch toward practical quantum memory.',
    ],
    space: [
      'Telescopes keep finding planets where a “year” is shorter than a day.',
      'Moondust is brutal on hardware—engineers test new protective layers.',
      'Orbit data tracks wildfires and ice melt in near real time.',
      'Planetary rovers talk regolith recycling for long stays.',
      'Asteroid missions bring samples to compare with old meteorites.',
      'Reflight rockets still push down $/kg-to-orbit fights.',
    ],
    health: [
      'A 10–15 minute walk after eating can blunt a blood-sugar spike.',
      'A steady sleep window beats “catching up” on the weekend.',
      'A glass of water before coffee can ease the mid-morning crash.',
      'Strength matters, but steady walking is kinder to joints long-term.',
      'Warm evening bulbs hit melatonin harder than cool blue dimmers.',
      'A 5‑minute screen pause every 50 minutes cuts dry-eye grumbles.',
    ],
    nature: [
      'City tree cover measurably lowers summer street heat.',
      'Bees navigate by scent and by Earth’s magnetic field.',
      'Coral builds reefs that anchor marine life if waters stay cool.',
      'Wet meadows hold storm water longer than thirsty turf.',
      'Urban raptors signal cleaner air if they stick around.',
      'Mangrove replanting absorbs storm surge better than bare sand.',
    ],
    culture: [
      'Streaming and theatres increasingly split the audience, not a zero game.',
      'Virtual museums open masterpieces to people who can’t travel.',
      'Podcasts are eating drive-time from FM in many big cities.',
      'A week of episodes can matter more than Friday’s film drop.',
      'Festivals and streams still fight over live-broadcast rights.',
      'Self-publishers sometimes beat trad houses to niche topics.',
    ],
    business: [
      'Investors are asking for profit sooner than a few years ago.',
      'Offices are remixed for meetings, not long rows of cubicles.',
      'ESG data now sways terms for many mid-sized exporters’ loans.',
      'B2B marketplaces shorten vendor searches across regions.',
      'Accelerators push for unit economics clarity in month one.',
      'Supply-disruption insurance beats a 3% invoice discount for SMBs.',
    ],
    world: [
      'Megacities race to hire talent with real AI skills.',
      'Smarter water and power grids save billions a year in regions.',
      'Travel is shifting: fewer checklists, more slow trips.',
      'Bike lanes beat car turn-lane budgets in some midsize cities.',
      'Heatwaves push neighboring districts to share peak power.',
      'Small airports fight hub carriers for seasonal directs.',
    ],
  },
};

function hash32(s) {
  let h = 0;
  const str = String(s);
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return h;
}

/**
 * Odna stroka dlya polzovatelya po vybrannыm kategoriyam. Raznoobrazie — `seed` (npr. reminder+attempt+time).
 * @param {string} lang  ru|az|en
 * @param {string[]|null|undefined} categoryIds
 * @param {string} seed
 * @returns {string|null}
 */
export function pickNewsLine(lang, categoryIds, seed) {
  const L = lang === 'az' || lang === 'en' ? lang : 'ru';
  const arr = (categoryIds || []).filter((id) => typeof id === 'string' && ID_SET.has(id));
  if (!arr.length) return null;
  const h0 = hash32(seed);
  const cat = arr[Math.abs(h0) % arr.length];
  const lines = POOL[L]?.[cat];
  if (!lines || !lines.length) return null;
  // dva prohoda smeshivania, chto indeks ne zalipal na odni i te zhe 1–2 stroki
  const h1 = hash32(`${seed}::${cat}::a`);
  const h2 = hash32(`${cat}::b::${seed.slice(-24)}`);
  const idx = (Math.abs(h1) + Math.abs(h2) * 19 + lines.length) % lines.length;
  return lines[idx];
}

export function normalizeNewsCategoryIds(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const x of input) {
    if (typeof x === 'string' && ID_SET.has(x) && !out.includes(x)) out.push(x);
    if (out.length >= 6) break;
  }
  return out;
}
