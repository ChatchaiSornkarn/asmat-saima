// DRAFT — to be proofread by a native speaker before launch (issue 12)
// اردو. Mirrors en.js exactly (same keys, same {placeholders}). Plurals: one / other.
// Register: formal, graceful invitation Urdu (آپ، براہِ کرم، تشریف آوری), Urdu punctuation
// (۔ ، ؟). Digits stay Latin, as on most Pakistani cards. The couple's names stay in
// Latin script. Phone numbers and e-mail placeholders are wrapped in Unicode bidi
// isolates (⁦ … ⁩ = LTR isolate, ⁨ … ⁩ = first-strong isolate) so
// they keep their left-to-right order inside right-to-left text.

const LTR = (s) => `⁦${s}⁩`;
const ISO = (s) => `⁨${s}⁩`;

export default {
  meta: {
    title: 'Asmat & Saima · نکاح · 6 دسمبر 2026ء',
    description: 'آپ کو Asmat & Saima کی تقریبِ نکاح میں بصد مسرت مدعو کیا جاتا ہے — بروز اتوار، 6 دسمبر 2026ء، گوتھنبرگ۔',
  },

  switcher: {
    label: 'زبان',
  },

  opening: {
    envelopeLine: 'آپ کی تشریف آوری کے متمنی ہیں',
    tapToOpen: 'کھولنے کے لیے چھوئیں',
    ariaOpen: 'دعوت نامہ کھولیں',
    skip: 'آگے بڑھیں',
  },

  postcard: {
    invitedTo: 'آپ کو بصد مسرت مدعو کیا جاتا ہے',
    nikah: 'تقریبِ نکاح',
    of: 'مابین',
    date: 'بروز اتوار، 6 دسمبر 2026ء',
    time: 'بوقت {time}',
    mapAria: 'پتا نقشے میں کھولیں',
  },

  cue: {
    rsvp: 'جواب دیں',
    aria: 'جواب دینے کے لیے نیچے جائیں',
  },

  actions: {
    heading: 'تاریخ یاد رکھیے',
    directions: 'راستہ',
    directionsSub: 'نقشے میں کھولیں',
    calendar: 'کیلنڈر میں شامل کریں',
    calendarSub: 'اتوار، 6 دسمبر',
    calendarApple: 'Apple Calendar / Outlook',
    calendarAppleSub: 'کیلنڈر فائل ڈاؤن لوڈ کریں',
    calendarGoogle: 'Google Calendar',
    calendarGoogleSub: 'نئے ٹیب میں کھلے گا',
    close: 'بند کریں',
    eventTitle: 'Asmat & Saima کا نکاح',
    eventDetails: 'آپ کو Asmat & Saima کی تقریبِ نکاح میں بصد مسرت مدعو کیا جاتا ہے۔ ہم آپ کے ساتھ یہ خوشی منانے کے منتظر ہیں۔',
    allDay: 'سارا دن',
  },

  rsvp: {
    heading: 'شرکت کی اطلاع',
    subheading: 'براہِ کرم ہمیں اپنی شرکت سے آگاہ فرمائیں',
    deadline: 'براہِ کرم {date} تک جواب دیں',
    count: {
      one: '{households} خاندان کے {guests} مہمان',
      other: '{households} خاندانوں کے {guests} مہمان',
    },
    countLead: 'اب تک تشریف لانے والے',
    tabs: {
      attend: 'ہم آئیں گے',
      cancel: 'منسوخ کریں / نہیں آ سکتے',
    },
    hint: 'کسی کو شامل کرنا ہے؟ بس نیا جواب بھیج دیجیے — یہ آپ کے پچھلے جواب کی جگہ لے لے گا۔',
    demo: 'ڈیمو موڈ — جوابات صرف اسی براؤزر میں محفوظ ہوتے ہیں۔',
  },

  form: {
    mainHeading: 'آپ کی تفصیلات',
    mainNote: 'آپ اپنے پورے خاندان کی طرف سے جواب دے رہے ہیں۔',
    firstName: 'نام',
    lastName: 'خاندانی نام',
    email: 'ای میل',
    phone: 'فون نمبر',
    phoneHint: `مثلاً ${LTR('070 123 45 67')} یا ${LTR('+46 70 123 45 67')}`,
    emailHint: 'آپ کی تصدیق اسی پتے پر بھیجی جائے گی۔',
    membersHeading: 'اہلِ خانہ',
    membersNote: 'اپنے ساتھ آنے والے سب افراد کو شامل کریں — صرف نام اور خاندانی نام۔',
    memberLabel: 'مہمان {n}',
    addMember: 'خاندان کا فرد شامل کریں',
    removeMember: 'مہمان {n} کو ہٹائیں',
    counter: {
      one: 'آپ نے {count} فرد شامل کیا ہے',
      other: 'آپ نے {count} افراد شامل کیے ہیں',
    },
    maxReached: 'بڑا خاندان؟ ہم سے رابطہ کریں',
    maxReachedEmail: `بڑا خاندان؟ ہم سے ${ISO('{email}')} پر رابطہ کریں`,
    message: 'پیغام',
    messageHint: 'الرجی، کھانے پینے کی پابندیاں، یا چند محبت بھرے الفاظ',
    optional: 'اختیاری',
    submit: 'جواب بھیجیں',
    sending: 'بھیجا جا رہا ہے…',
    honeypot: 'یہ خانہ خالی چھوڑ دیں',
  },

  validation: {
    required: 'براہِ کرم یہ خانہ پُر کریں۔',
    email: 'براہِ کرم درست ای میل پتا درج کریں۔',
    phone: `براہِ کرم ایسا فون نمبر درج کریں جو ${LTR('07')} یا ${LTR('+')} سے شروع ہو۔`,
    tooLong: 'یہ کچھ زیادہ طویل ہے۔',
    fixErrors: 'براہِ کرم نشان زدہ خانے دیکھ لیں۔',
  },

  success: {
    attendTitle: 'بہت شکریہ!',
    attendBody: 'ہم آپ کے ساتھ یہ خوشی منانے کے لیے بے تاب ہیں۔',
    partyHeading: {
      one: 'آپ کا گروپ · {count} فرد',
      other: 'آپ کا گروپ · {count} افراد',
    },
    replaced: 'یہ جواب آپ کے پچھلے جواب کی جگہ لے چکا ہے۔',
    emailNote: `تصدیقی ای میل ${ISO('{email}')} پر بھیجی جا رہی ہے۔`,
    another: 'ایک اور جواب بھیجیں',
  },

  cancel: {
    step1Title: 'اپنا جواب تلاش کریں',
    step1Body: 'وہی ای میل اور فون نمبر درج کریں جو آپ نے جواب دیتے وقت استعمال کیا تھا۔',
    find: 'میرا جواب تلاش کریں',
    finding: 'تلاش جاری ہے…',
    notFound: 'ان تفصیلات کے ساتھ کوئی جواب نہیں ملا۔',
    step2Title: 'کون تشریف نہیں لا سکے گا؟',
    step2Body: 'ان سب کو منتخب کریں جو اب شریک نہیں ہو سکیں گے۔',
    cancelAll: 'سب کی شرکت منسوخ کریں',
    message: 'پیغام',
    submit: 'منسوخی کی تصدیق کریں',
    sending: 'محفوظ کیا جا رہا ہے…',
    nothingSelected: 'براہِ کرم کم از کم ایک فرد منتخب کریں۔',
    back: 'واپس',
    successTitle: 'آپ کا جواب تبدیل کر دیا گیا ہے',
    successAll: 'ہمیں افسوس ہے کہ آپ تشریف نہیں لا سکیں گے — آپ کا جواب منسوخ کر دیا گیا ہے۔ آپ کی کمی محسوس ہوگی۔',
    cancelledHeading: 'اب شریک نہیں ہوں گے',
    remainingHeading: 'اب بھی شریک ہوں گے',
    emailNote: `تصدیقی ای میل ${ISO('{email}')} پر بھیجی جا رہی ہے۔`,
  },

  errors: {
    network: 'سرور سے رابطہ نہیں ہو سکا۔ براہِ کرم اپنا انٹرنیٹ کنکشن دیکھ کر دوبارہ کوشش کریں۔',
    server: 'معذرت، ہماری طرف کوئی خرابی پیش آ گئی۔ براہِ کرم تھوڑی دیر بعد دوبارہ کوشش کریں۔',
    invalid: 'کچھ تفصیلات درست معلوم نہیں ہوتیں۔ براہِ کرم فارم دیکھ کر دوبارہ کوشش کریں۔',
    partyTooLarge: 'ایک جواب میں اتنے مہمان شامل نہیں ہو سکتے۔ براہِ کرم ہم سے رابطہ کریں۔',
  },

  footer: {
    signoff: 'محبتوں کے ساتھ،',
    names: 'Asmat & Saima',
    dua: 'اللہ تعالیٰ اس رشتے کو بابرکت بنائے',
  },
};
