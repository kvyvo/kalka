// Two languages. Russian static text lives in index.html; English overrides by data-i18n key.
// Dynamic strings are functions or templates with {name} placeholders.

const EN_STATIC = {
  commands: 'Commands', heroTitle: 'Your screen as a light&nbsp;table',
  heroLead: 'Any picture on paper at true size. The screen shows it part by part — lay the sheet on top and trace.',
  s1: 'Picture', fileNone: 'Drop a file here', fileFormats: 'JPG, PNG, SVG, PDF · or paste from clipboard', fileChoose: 'Choose',
  privacy: 'The file stays on your device and is never uploaded.',
  viewLabel: 'Look', viewOriginal: 'As is', viewOutline: 'Outline', viewBw: 'B/W', strength: 'Lines',
  transform: 'Turn', rotate: '90°', mirror: 'Mirror',
  s2: 'Sheet and size', sheet: 'Sheet', custom: 'Custom', sheetSize: 'Size, mm', orient: 'Orientation',
  landscape: 'Landscape', portrait: 'Portrait', drawing: 'Drawing', fit: 'Fit', byWidth: 'By width', fromFile: 'From file',
  margin: 'Margins, mm', widthCm: 'Width, cm',
  s3: 'Screen', screen: 'Your screen', diag: 'Diagonal, ″',
  cardHint: 'Hold any plastic card to the frame: bank card, transit pass, ID badge — they are all the same size. Frame bigger than the card — press “Smaller”, smaller — “Bigger”.',
  smaller: 'Smaller', bigger: 'Bigger', calibOk: 'It matches', reset: 'Reset',
  s4: 'Parts and tracing', parts: 'Parts', auto: 'Auto',
  markTitle: 'How to line the sheet up with the screen',
  markEdge: 'No marking needed: the screen shows a grey zone beyond the sheet edge. For edge parts, align the paper edge with the edge of the white field; after that align to lines you have already traced.',
  markCross: 'More precise: pencil small crosses at the grid nodes using these distances from the sheet edges and match them with the red crosses.',
  coordX: 'Horizontally, from the left edge', coordY: 'Vertically, from the top edge',
  print: 'Print on A4', export: 'Save project', import: 'Open project', restart: 'Start over',
  tipsTitle: 'Tips: what shows through and how not to scratch the screen',
  tip1: 'Tracing paper, office paper and thin fabric show through well; heavy drawing paper — in a dim room. Cardboard and dark fabric don’t: print those on A4 sheets instead.',
  tip2: 'Brightness to max, room lights low. Soft pencil, light hand: don’t press on the screen. Tape goes on the lid, never on the screen.',
  tip3: 'Look straight down at the sheet: from an angle the line shifts by a millimetre.',
  tip4: 'Sheet moved? No problem: align this part again. The error doesn’t add up.',
  foot: 'Kalka — open source, MIT.', done: 'Done', color: 'Colour', gridBtn: 'Grid', dimBtn: 'Fade around',
  exit: 'Exit', unlock: 'Hold to unlock', cancel: 'Cancel', dropHere: 'Drop to open',
};

const DYN = {
  ru: {
    title: 'Kalka — световой стол из экрана',
    demoName: 'Пример: ветка',
    fileMeta: '{w} × {h} пикс · {size}',
    pdfPages: ' · взята 1-я страница из {n}',
    sizeRes: 'Рисунок {w} × {h} мм на листе {sw} × {sh} мм',
    tooBig: 'Рисунок шире листа. Уменьши ширину или возьми лист больше.',
    lowRes: 'Картинка маленькая для такого размера: {ppm} точки на мм, на бумаге будут видны квадратики. Найди картинку крупнее или уменьши рисунок до {max} см.',
    screenUnknown: 'Другой экран…',
    screenDiag: 'Знаю диагональ…',
    calibChecked: 'Проверено', calibNot: 'Не проверено',
    adj: '{p} %',
    zoomMac: 'Масштаб страницы изменён — размеры сейчас неверные. Нажми ⌘ 0.',
    zoomWin: 'Масштаб страницы изменён — размеры сейчас неверные. Нажми Ctrl 0.',
    newScreen: 'Похоже, это другой экран. Проверь размер картой ещё раз — это 30 секунд.',
    fitOne: 'Рисунок целиком помещается на экран — делить не нужно.',
    fitMany: 'Часть {cw} × {ch} мм, экран {sw} × {sh} мм: вокруг видно по {m} мм соседних частей.',
    fitNo: 'Часть {cw} × {ch} мм не помещается на экран {sw} × {sh} мм. Раздели мельче.',
    start: 'Начать обводку', cont: 'Продолжить — часть {n}',
    progress: 'Обведено {d} из {n}',
    part: 'Часть {n} из {N}', pos: 'ряд {r} · колонка {c}',
    allDone: 'Все части обведены. Сотри крестики и проверь стыки.',
    noFit: 'Часть не влезает целиком — раздели мельче.',
    goFull: 'Разверни на весь экран: клавиша F.',
    wakeOn: 'Экран не погаснет, пока страница открыта.',
    lockOn: 'Замок включён: клавиши и касания не работают.',
    confirmReset: 'Снять все отметки «Готово»? Это нельзя отменить.', confirmYes: 'Снять',
    badFile: 'Этот файл не открывается. Сохрани картинку как JPG или PNG и попробуй ещё раз.',
    heic: 'Фото HEIC этот браузер не открывает. Отправь фото себе как JPG или открой в Safari.',
    pdfFail: 'PDF не открылся: для него нужен интернет при первом открытии.',
    opening: 'Открываю…', processing: 'Готовлю контур…',
    saved: 'Проект сохранён в файл', loaded: 'Проект открыт',
    printInfo: 'Печать: {n} листов A4, масштаб 100 %, без полей. Склеивай по пунктиру.',
    sleepMac: 'Если экран гаснет: Системные настройки → Экран блокировки → «Отключать дисплей» → «Никогда».',
    sleepWin: 'Если экран гаснет: Параметры → Система → Питание → «Отключать экран» → «Никогда».',
    sleepIpad: 'Если экран гаснет: Настройки → Экран и яркость → Автоблокировка → «Никогда».',
    cmdOpen: 'Открыть картинку', cmdDemo: 'Пример', cmdSheet: 'Лист {s}', cmdTrace: 'Начать обводку',
    cmdGo: 'Перейти к части {n}', cmdOutline: 'Вид: контур', cmdOriginal: 'Вид: как есть', cmdBw: 'Вид: чёрно-белый',
    cmdMirror: 'Зеркало', cmdRotate: 'Повернуть на 90°', cmdPrint: 'Печать на A4', cmdExport: 'Сохранить проект',
    cmdLang: 'English', cmdTheme: 'Тёмная / светлая тема', cmdNothing: 'Ничего не нашлось', palPh: 'Команда или номер части…',
    ctl: '100 мм',
  },
  en: {
    title: 'Kalka — your screen as a light table',
    demoName: 'Sample: branch',
    fileMeta: '{w} × {h} px · {size}',
    pdfPages: ' · page 1 of {n}',
    sizeRes: 'Drawing {w} × {h} mm on a {sw} × {sh} mm sheet',
    tooBig: 'The drawing is wider than the sheet. Reduce the width or pick a bigger sheet.',
    lowRes: 'The picture is small for this size: {ppm} pixels per mm, you will see blocks on paper. Find a bigger picture or shrink the drawing to {max} cm.',
    screenUnknown: 'Other screen…',
    screenDiag: 'I know the diagonal…',
    calibChecked: 'Checked', calibNot: 'Not checked',
    adj: '{p} %',
    zoomMac: 'Page zoom is changed — sizes are wrong now. Press ⌘ 0.',
    zoomWin: 'Page zoom is changed — sizes are wrong now. Press Ctrl 0.',
    newScreen: 'Looks like a different screen. Check the size with a card again — it takes 30 seconds.',
    fitOne: 'The whole drawing fits on the screen — no need to split.',
    fitMany: 'Part {cw} × {ch} mm, screen {sw} × {sh} mm: {m} mm of neighbouring parts visible around.',
    fitNo: 'Part {cw} × {ch} mm doesn’t fit the {sw} × {sh} mm screen. Split finer.',
    start: 'Start tracing', cont: 'Continue — part {n}',
    progress: '{d} of {n} traced',
    part: 'Part {n} of {N}', pos: 'row {r} · column {c}',
    allDone: 'All parts traced. Erase the crosses and check the seams.',
    noFit: 'The part doesn’t fit — split finer.',
    goFull: 'Go full screen: press F.',
    wakeOn: 'The screen stays on while this page is open.',
    lockOn: 'Locked: keys and touches are ignored.',
    confirmReset: 'Clear all “Done” marks? This can’t be undone.', confirmYes: 'Clear',
    badFile: 'This file can’t be opened. Save the picture as JPG or PNG and try again.',
    heic: 'This browser can’t open HEIC photos. Send it to yourself as JPG or open in Safari.',
    pdfFail: 'PDF didn’t open: the first PDF needs an internet connection.',
    opening: 'Opening…', processing: 'Preparing outline…',
    saved: 'Project saved to a file', loaded: 'Project opened',
    printInfo: 'Printing: {n} A4 pages, scale 100 %, no margins. Glue along the dashed lines.',
    sleepMac: 'If the screen turns off: System Settings → Lock Screen → “Turn display off” → “Never”.',
    sleepWin: 'If the screen turns off: Settings → System → Power → “Turn off my screen” → “Never”.',
    sleepIpad: 'If the screen turns off: Settings → Display & Brightness → Auto-Lock → “Never”.',
    cmdOpen: 'Open picture', cmdDemo: 'Sample', cmdSheet: 'Sheet {s}', cmdTrace: 'Start tracing',
    cmdGo: 'Go to part {n}', cmdOutline: 'Look: outline', cmdOriginal: 'Look: as is', cmdBw: 'Look: black & white',
    cmdMirror: 'Mirror', cmdRotate: 'Rotate 90°', cmdPrint: 'Print on A4', cmdExport: 'Save project',
    cmdLang: 'Русский', cmdTheme: 'Dark / light theme', cmdNothing: 'Nothing found', palPh: 'Command or part number…',
    ctl: '100 mm',
  },
};

let lang = 'ru';
const RU_STATIC = {};

export function setLang(l) {
  lang = l === 'en' ? 'en' : 'ru';
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.dataset.i18n;
    if (!(k in RU_STATIC)) RU_STATIC[k] = el.innerHTML;
    el.innerHTML = lang === 'en' ? EN_STATIC[k] ?? RU_STATIC[k] : RU_STATIC[k];
  });
  document.title = t('title');
}

export const getLang = () => lang;

/** Dynamic string with {placeholders}. Numbers are formatted for the language. */
export function t(key, vars = {}) {
  const s = DYN[lang][key] ?? DYN.ru[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (typeof vars[k] === 'number' ? fmt(vars[k]) : vars[k] ?? ''));
}

export const fmt = (n, d = 1) => Number(n.toFixed(d)).toLocaleString(lang === 'en' ? 'en-US' : 'ru-RU', { maximumFractionDigits: d });
