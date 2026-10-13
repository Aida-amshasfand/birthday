const defaultSettings = {
  recipient: { en: 'Deniz', fa: 'دنیز' },
  birthdayDate: { en: 'October 30', fa: '۳۰ اکتبر' },
  theme: 'rose',
  eyebrow: {
    en: 'FOR THE WOMAN WHO FEELS LIKE HOME',
    fa: 'برای زنی که حسِ خانه را دارد',
  },
  title: {
    en: 'The world is lovelier with you in it.',
    fa: 'با تو، دنیا زیباتر است.',
  },
  subtitle: {
    en: 'A whole heart, made from the little things I love about you.',
    fa: 'یک قلبِ پر از همان چیزهای کوچکی که عاشقشان هستم.',
  },
  letter: {
    en: 'You make everything feel more beautiful—from your effortless style and your impossible-to-beat makeup to the kindness you give so freely. You are clever, steady, and the person who always knows how to be there for me. I love your delicious kitchen experiments, your colorful sparkle and gloriously mysterious side, our true-crime documentary nights, and the songs that sound like home: Googoosh, Ebi, Namjoo, and all the old favorites. May every bit of love you give find its way back to you. Happy birthday, my Deniz. October 30 is brighter because it brought you into the world.',
    fa: 'تو با سلیقه‌ی بی‌نظیرت، آرایش‌های فوق‌العاده و مهربانی‌ای که بی‌دریغ می‌بخشی، همه‌چیز را زیباتر می‌کنی. باهوش و همراهِ همیشگیِ منی؛ همان کسی که همیشه می‌داند چطور کنارم باشد. هم برقِ رنگارنگِ تو را دوست دارم، هم آن رویِ مرموز و جذابت را؛ از غذاهای خوشمزه‌ای که درست می‌کنی و شب‌های مستندِ جنایی‌مان، تا آهنگ‌هایی که حسِ خانه دارند: از گوگوش و ابی تا نامجو و همه‌ی آهنگ‌های قدیمیِ دوست‌داشتنی. کاش هر ذره عشقی که به دیگران می‌بخشی، چند برابر به خودت برگردد. تولدت مبارک، دنیزِ من. ۳۰ اکتبر، روزی است که دنیا با آمدنت زیباتر شد.',
  },
  reveal: {
    en: 'Somehow even “نردولک” sounds like a love song when it comes from you. Thank you for making ordinary days feel a little magical. I love you, my favorite person.',
    fa: 'وقتی تو می‌گویی «نردولک»، حتی همین کلمه هم برایم شبیه یک ترانه‌ی عاشقانه می‌شود. ممنون که روزهای معمولی را کمی جادویی می‌کنی. دوستت دارم، عزیزترین آدمِ دنیایم.',
  },
  phrases: {
    en: [
      'My favorite person', 'You make life softer', 'Kindness looks like you',
      'Brilliant, always', 'The best kind of beautiful', 'Your laugh is home',
      'A heart that shows up', 'Made of midnight songs', 'The loveliest eyeliner',
      'I choose you, always', 'A little more magic', 'My Deniz',
    ],
    fa: [
      'دنیزِ عزیزم', 'عشقِ من', 'مهربانیِ تو', 'تو دنیای منی',
      'کنارِ تو، آرامم', 'لبخندت حالِ دلم است', 'زیبایِ باهوشِ من',
      'دلم پیشِ توست', 'دوستت دارم', 'صدایِ خنده‌ات خانه است',
      'نردولکِ تو', 'همیشه انتخابِ من',
    ],
  },
};

const themes = new Set(['rose', 'midnight', 'golden']);
const stripControls = (value) => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();

function localized(input, fallback, maximum) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  return {
    en: stripControls(source.en || fallback.en).slice(0, maximum),
    fa: stripControls(source.fa || fallback.fa).slice(0, maximum),
  };
}

function phraseList(input, fallback) {
  if (!Array.isArray(input)) return [...fallback];
  return input
    .filter((item) => typeof item === 'string')
    .map((item) => stripControls(item).slice(0, 80))
    .filter(Boolean)
    .slice(0, 40);
}

export function makeDefaultSettings() {
  return structuredClone(defaultSettings);
}

export function normalizeSettings(input) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const sourcePhrases = source.phrases && typeof source.phrases === 'object' ? source.phrases : {};
  return {
    recipient: localized(source.recipient, defaultSettings.recipient, 48),
    birthdayDate: structuredClone(defaultSettings.birthdayDate),
    theme: themes.has(source.theme) ? source.theme : defaultSettings.theme,
    eyebrow: localized(source.eyebrow, defaultSettings.eyebrow, 100),
    title: localized(source.title, defaultSettings.title, 120),
    subtitle: localized(source.subtitle, defaultSettings.subtitle, 240),
    letter: localized(source.letter, defaultSettings.letter, 1200),
    reveal: localized(source.reveal, defaultSettings.reveal, 700),
    phrases: {
      en: phraseList(sourcePhrases.en, defaultSettings.phrases.en),
      fa: phraseList(sourcePhrases.fa, defaultSettings.phrases.fa),
    },
  };
}
