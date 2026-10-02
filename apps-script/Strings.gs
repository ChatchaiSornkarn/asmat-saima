/**
 * Wording of the guest confirmation emails, in the four site languages.
 *
 *   ┌───────────────────────────────────────────────────────────────────────────┐
 *   │ DRAFT — Swedish, Thai and Urdu must be proofread by a native speaker      │
 *   │ before launch (design Q20). To proofread: Sheet menu → Wedding RSVP →     │
 *   │ "Email me sample confirmations" sends every variant to OWNER_EMAIL.       │
 *   └───────────────────────────────────────────────────────────────────────────┘
 *
 * Placeholders: {name}, {time}. guests(n) returns the Party size phrase.
 * The couple's names "Asmat & Saima" are never translated (Latin calligraphy in every language).
 */
var EMAIL_STRINGS = {
  en: {
    dir: 'ltr',
    subject: {
      attend: 'Your RSVP is confirmed · Nikah of Asmat & Saima',
      attendUpdated: 'Your updated RSVP is confirmed · Nikah of Asmat & Saima',
      partial: 'Your RSVP has been updated · Nikah of Asmat & Saima',
      cancelled: 'Your RSVP has been cancelled · Nikah of Asmat & Saima',
    },
    kicker: { attend: 'RSVP confirmed', partial: 'RSVP updated', cancelled: 'RSVP cancelled' },
    nikahOf: 'The Nikah of',
    greeting: 'Dear {name},',
    intro: {
      attend: 'Thank you for your reply. We are overjoyed that you will be joining us to celebrate our Nikah.',
      partial: 'Thank you for letting us know. We have updated your RSVP as follows.',
      cancelled: 'We are so sorry you can’t be with us — your RSVP has been cancelled. You will be dearly missed.',
    },
    replaced: 'This replaces your earlier RSVP.',
    partyHeading: 'Your party',
    guests: function (n) { return n === 1 ? '1 guest' : n + ' guests'; },
    cancelledHeading: 'No longer coming',
    remainingHeading: 'Still coming',
    messageHeading: 'Your message',
    whenWhere: 'When & where',
    time: 'at {time}',
    maps: 'Open in Google Maps',
    button: 'View the invitation',
    addHint: 'Need to add someone? Simply send a new RSVP with everyone in your party — it replaces this one.',
    cancelHint: 'Plans changed? You can cancel for some or all of your party on the invitation.',
    comeBackHint: 'If your plans change, you are always welcome — simply send a new RSVP.',
    signoff: 'With love,',
    dua: 'May Allah bless this union',
    footer: 'You are receiving this email because this address was used to reply to the invitation to the Nikah of Asmat & Saima. Questions? Simply reply to this email.',
  },

  // DRAFT — native speaker proofread before launch.
  sv: {
    dir: 'ltr',
    subject: {
      attend: 'Ditt OSA är bekräftat · Asmat & Saimas nikah',
      attendUpdated: 'Ditt uppdaterade OSA är bekräftat · Asmat & Saimas nikah',
      partial: 'Ditt OSA har uppdaterats · Asmat & Saimas nikah',
      cancelled: 'Ditt OSA har avbokats · Asmat & Saimas nikah',
    },
    kicker: { attend: 'OSA bekräftat', partial: 'OSA uppdaterat', cancelled: 'OSA avbokat' },
    nikahOf: 'Nikah för',
    greeting: 'Kära {name},',
    intro: {
      attend: 'Tack för ditt svar! Det värmer våra hjärtan att du vill fira vår nikah tillsammans med oss.',
      partial: 'Tack för att du hör av dig. Vi har uppdaterat ditt OSA enligt nedan.',
      cancelled: 'Vad tråkigt att du inte kan komma – ditt OSA är nu avbokat. Du kommer att vara saknad.',
    },
    replaced: 'Detta ersätter ditt tidigare OSA.',
    partyHeading: 'Ditt sällskap',
    guests: function (n) { return n === 1 ? '1 gäst' : n + ' gäster'; },
    cancelledHeading: 'Kan inte komma',
    remainingHeading: 'Kommer fortfarande',
    messageHeading: 'Ditt meddelande',
    whenWhere: 'När & var',
    time: 'kl. {time}',
    maps: 'Öppna i Google Maps',
    button: 'Öppna inbjudan',
    addHint: 'Vill du lägga till någon? Skicka bara ett nytt OSA med hela ditt sällskap – det ersätter det här.',
    cancelHint: 'Har planerna ändrats? Du kan avboka för någon i sällskapet, eller alla, via inbjudan.',
    comeBackHint: 'Om planerna ändras är du alltid välkommen – skicka bara ett nytt OSA.',
    signoff: 'Med kärlek,',
    dua: 'Må Allah välsigna denna förening',
    footer: 'Du får det här mejlet eftersom adressen användes för att svara på inbjudan till Asmat & Saimas nikah. Har du frågor? Svara bara på det här mejlet.',
  },

  // DRAFT — native speaker proofread before launch. Formal written register (no ค่ะ/ครับ particles).
  th: {
    dir: 'ltr',
    subject: {
      attend: 'ยืนยันการตอบรับ · พิธีนิกะห์ของ Asmat & Saima',
      attendUpdated: 'ยืนยันการตอบรับฉบับใหม่ · พิธีนิกะห์ของ Asmat & Saima',
      partial: 'ปรับปรุงการตอบรับเรียบร้อยแล้ว · พิธีนิกะห์ของ Asmat & Saima',
      cancelled: 'ยกเลิกการตอบรับเรียบร้อยแล้ว · พิธีนิกะห์ของ Asmat & Saima',
    },
    kicker: { attend: 'ยืนยันการตอบรับ', partial: 'ปรับปรุงการตอบรับ', cancelled: 'ยกเลิกการตอบรับ' },
    nikahOf: 'พิธีนิกะห์ของ',
    greeting: 'เรียน คุณ {name}',
    intro: {
      attend: 'ขอบพระคุณที่ตอบรับคำเชิญ เรามีความยินดีเป็นอย่างยิ่งที่ท่านจะมาร่วมเป็นเกียรติและร่วมแสดงความยินดีในพิธีนิกะห์ของเรา',
      partial: 'ขอบพระคุณที่แจ้งให้เราทราบ เราได้ปรับปรุงการตอบรับของท่านดังนี้',
      cancelled: 'เสียดายอย่างยิ่งที่ท่านไม่สามารถมาร่วมงานได้ เราได้ยกเลิกการตอบรับของท่านเรียบร้อยแล้ว และจะคิดถึงท่านเสมอ',
    },
    replaced: 'การตอบรับนี้ใช้แทนการตอบรับก่อนหน้าของท่าน',
    partyHeading: 'คณะของท่าน',
    guests: function (n) { return n + ' ท่าน'; },
    cancelledHeading: 'ไม่สามารถมาร่วมงานได้',
    remainingHeading: 'ยังคงมาร่วมงาน',
    messageHeading: 'ข้อความของท่าน',
    whenWhere: 'วันและสถานที่',
    time: 'เวลา {time} น.',
    maps: 'เปิดใน Google Maps',
    button: 'เปิดบัตรเชิญ',
    addHint: 'หากต้องการเพิ่มผู้ร่วมงาน เพียงส่งการตอบรับใหม่พร้อมรายชื่อทุกท่านในคณะ การตอบรับใหม่จะใช้แทนฉบับนี้',
    cancelHint: 'หากมีการเปลี่ยนแปลง ท่านสามารถยกเลิกบางท่านหรือทั้งคณะได้ที่หน้าบัตรเชิญ',
    comeBackHint: 'หากท่านเปลี่ยนใจ เรายินดีต้อนรับเสมอ เพียงส่งการตอบรับใหม่',
    signoff: 'ด้วยรักและขอบคุณ',
    dua: 'ขออัลลอฮ์ทรงประทานความจำเริญแก่การครองคู่นี้',
    footer: 'ท่านได้รับอีเมลฉบับนี้เนื่องจากมีการใช้อีเมลนี้ตอบรับคำเชิญพิธีนิกะห์ของ Asmat & Saima หากมีข้อสงสัย สามารถตอบกลับอีเมลฉบับนี้ได้',
  },

  // DRAFT — native speaker proofread before launch. Formal Urdu, right-to-left.
  ur: {
    dir: 'rtl',
    subject: {
      attend: 'آپ کی شرکت کی تصدیق · Asmat & Saima کا نکاح',
      attendUpdated: 'آپ کے نئے جواب کی تصدیق · Asmat & Saima کا نکاح',
      partial: 'آپ کا جواب تبدیل کر دیا گیا · Asmat & Saima کا نکاح',
      cancelled: 'آپ کا جواب منسوخ کر دیا گیا · Asmat & Saima کا نکاح',
    },
    kicker: { attend: 'تصدیقِ شرکت', partial: 'جواب میں تبدیلی', cancelled: 'جواب منسوخ' },
    nikahOf: 'تقریبِ نکاح',
    greeting: 'محترم {name}،',
    intro: {
      attend: 'آپ کے جواب کا تہِ دل سے شکریہ۔ ہمیں بے حد خوشی ہے کہ آپ ہمارے نکاح کی تقریب میں شرکت فرما کر ہماری خوشیوں کو دوبالا کریں گے۔',
      partial: 'اطلاع دینے کا بہت شکریہ۔ ہم نے آپ کے جواب میں درج ذیل تبدیلی کر دی ہے۔',
      cancelled: 'یہ جان کر بہت افسوس ہوا کہ آپ تشریف نہیں لا سکیں گے۔ آپ کا جواب منسوخ کر دیا گیا ہے۔ آپ کی کمی شدت سے محسوس ہوگی۔',
    },
    replaced: 'یہ جواب آپ کے پچھلے جواب کی جگہ لے لیتا ہے۔',
    partyHeading: 'آپ کے ہمراہ مہمان',
    guests: function (n) { return n + ' مہمان'; },
    cancelledHeading: 'شرکت نہیں کر سکیں گے',
    remainingHeading: 'شرکت کریں گے',
    messageHeading: 'آپ کا پیغام',
    whenWhere: 'تاریخ و مقام',
    time: 'بوقت {time}',
    maps: 'Google Maps میں دیکھیں',
    button: 'دعوت نامہ دیکھیں',
    addHint: 'کسی کو شامل کرنا ہو تو اپنے تمام مہمانوں کے ناموں کے ساتھ بس نیا جواب بھیج دیجیے — وہ اس جواب کی جگہ لے لے گا۔',
    cancelHint: 'اگر پروگرام بدل جائے تو دعوت نامے پر جا کر چند یا تمام مہمانوں کی شرکت منسوخ کی جا سکتی ہے۔',
    comeBackHint: 'اگر آپ کا پروگرام بدل جائے تو آپ کا ہمیشہ خیرمقدم ہے — بس نیا جواب بھیج دیجیے۔',
    signoff: 'محبتوں کے ساتھ،',
    dua: 'اللہ تعالیٰ اس رشتے کو بابرکت فرمائے',
    footer: 'آپ کو یہ ای میل اس لیے موصول ہوئی ہے کہ اس پتے سے Asmat & Saima کی تقریبِ نکاح کے دعوت نامے کا جواب دیا گیا تھا۔ کوئی سوال ہو تو اسی ای میل کا جواب دیجیے۔',
  },
};

var WEEKDAYS_ = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  sv: ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'],
  th: ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'],
  ur: ['اتوار', 'پیر', 'منگل', 'بدھ', 'جمعرات', 'جمعہ', 'ہفتہ'],
};
var MONTHS_ = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  sv: ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'],
  th: ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'],
  ur: ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'],
};

/**
 * '2026-12-06' → the date written out in the guest's language:
 *   en 'Sunday, 6 December 2026'      sv 'Söndag 6 december 2026'
 *   th 'วันอาทิตย์ที่ 6 ธันวาคม พ.ศ. 2569'  ur 'بروز اتوار، 6 دسمبر 2026ء'
 */
function formatEventDate_(iso, lang) {
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso));
  if (!m) return String(iso);
  var y = +m[1], mo = +m[2], d = +m[3];
  var wd = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
  if (lang === 'sv') { var w = WEEKDAYS_.sv[wd]; return w.charAt(0).toUpperCase() + w.slice(1) + ' ' + d + ' ' + MONTHS_.sv[mo - 1] + ' ' + y; }
  if (lang === 'th') return 'วัน' + WEEKDAYS_.th[wd] + 'ที่ ' + d + ' ' + MONTHS_.th[mo - 1] + ' พ.ศ. ' + (y + 543);
  if (lang === 'ur') return 'بروز ' + WEEKDAYS_.ur[wd] + '، ' + d + ' ' + MONTHS_.ur[mo - 1] + ' ' + y + 'ء';
  return WEEKDAYS_.en[wd] + ', ' + d + ' ' + MONTHS_.en[mo - 1] + ' ' + y;
}

function fill_(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, function (all, k) { return vars && vars[k] !== undefined ? String(vars[k]) : all; });
}
