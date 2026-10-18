// DRAFT — to be proofread by a native speaker before launch (issue 12)
// ภาษาไทย. Mirrors en.js exactly (same keys, same {placeholders}). Thai has no plural
// forms, so plural objects use `other` only.
// Register: formal and polite — guests are addressed as ท่าน, the event is งานมงคลสมรส,
// years follow the Buddhist Era (พ.ศ.) as on Thai wedding cards. Thai sentences take no
// full stop; a space separates clauses. The couple's names stay in Latin script.

export default {
  meta: {
    title: 'Asmat & Saima · งานมงคลสมรส · 13 ธันวาคม 2569',
    description: 'ขอเรียนเชิญร่วมเป็นเกียรติในงานมงคลสมรสของ Asmat & Saima วันอาทิตย์ที่ 13 ธันวาคม พ.ศ. 2569 ณ เมืองโกเธนเบิร์ก ประเทศสวีเดน',
  },

  switcher: {
    label: 'ภาษา',
  },

  opening: {
    envelopeLine: 'มีความยินดีขอเรียนเชิญท่าน',
    tapToOpen: 'แตะเพื่อเปิด',
    ariaOpen: 'เปิดการ์ดเชิญ',
    skip: 'ข้าม',
  },

  postcard: {
    invitedTo: 'ขอเรียนเชิญร่วมเป็นเกียรติในงาน',
    wedding: 'มงคลสมรส',
    of: 'ระหว่าง',
    date: 'วันอาทิตย์ที่ 13 ธันวาคม พ.ศ. 2569',
    time: 'เวลา {time} น.',
    mapAria: 'เปิดที่อยู่ในแผนที่',
  },

  cue: {
    rsvp: 'ตอบรับ',
    aria: 'เลื่อนลงเพื่อตอบรับการเชิญ',
  },

  actions: {
    heading: 'โปรดบันทึกวันสำคัญ',
    directions: 'เส้นทาง',
    directionsSub: 'เปิดในแผนที่',
    calendar: 'เพิ่มลงในปฏิทิน',
    calendarSub: 'วันอาทิตย์ที่ 13 ธันวาคม',
    calendarApple: 'Apple Calendar / Outlook',
    calendarAppleSub: 'ดาวน์โหลดไฟล์ .ics',
    calendarGoogle: 'Google ปฏิทิน',
    calendarGoogleSub: 'เปิดในแท็บใหม่',
    close: 'ปิด',
    eventTitle: 'งานมงคลสมรสของ Asmat & Saima',
    eventDetails: 'ขอเรียนเชิญร่วมเป็นเกียรติในงานมงคลสมรสของ Asmat & Saima เรารอคอยที่จะได้ร่วมฉลองวันสำคัญนี้กับท่าน',
    allDay: 'ตลอดวัน',
  },

  rsvp: {
    heading: 'ตอบรับการเชิญ',
    subheading: 'กรุณาแจ้งให้เราทราบว่าท่านจะสามารถมาร่วมงานได้หรือไม่',
    deadline: 'กรุณาตอบรับภายในวันที่ {date}',
    late: 'ตอบรับหลังกำหนด: เราจะติดต่อกลับเพื่อยืนยันว่ายังสามารถรับรองท่านได้หรือไม่',
    count: {
      other: 'แขก {guests} ท่าน จาก {households} ครอบครัว',
    },
    countLead: 'ตอบรับแล้ว',
    tabs: {
      attend: 'ยินดีไปร่วมงาน',
      cancel: 'ยกเลิก / ไม่สามารถไปได้',
    },
    hint: 'ต้องการเพิ่มผู้ร่วมงานใช่ไหม เพียงส่งการตอบรับใหม่ ระบบจะแทนที่การตอบรับเดิมให้',
    demo: 'โหมดทดลอง — การตอบรับจะถูกบันทึกไว้ในเบราว์เซอร์นี้เท่านั้น',
  },

  // Side choice on a link without ?side= (2_main_idea issue 16). Names stay in Latin script.
  sideChoice: {
    label: 'ท่านเป็นแขกของฝ่ายใด',
    asmat: 'แขกของ Asmat',
    saima: 'แขกของ Saima',
    required: 'กรุณาเลือกว่าท่านเป็นแขกของฝ่ายใด',
  },

  form: {
    mainHeading: 'ข้อมูลของท่าน',
    mainNote: 'ท่านตอบรับในนามของทั้งครอบครัว',
    firstName: 'ชื่อ',
    lastName: 'นามสกุล',
    email: 'อีเมล',
    phone: 'หมายเลขโทรศัพท์',
    phoneHint: 'เช่น 070 123 45 67 หรือ +46 70 123 45 67',
    emailHint: 'เราจะส่งอีเมลยืนยันไปที่อีเมลนี้',
    membersHeading: 'สมาชิกในครอบครัว',
    membersNote: 'กรุณาเพิ่มทุกท่านที่มาร่วมงานกับท่าน ระบุเพียงชื่อและนามสกุล',
    memberLabel: 'ผู้ร่วมงานท่านที่ {n}',
    addMember: 'เพิ่มสมาชิกในครอบครัว',
    removeMember: 'ลบผู้ร่วมงานท่านที่ {n}',
    counter: {
      other: 'เพิ่มผู้ร่วมงานแล้ว {count} ท่าน',
    },
    maxReached: 'มีสมาชิกมากกว่านี้ใช่ไหม กรุณาติดต่อเรา',
    maxReachedEmail: 'มีสมาชิกมากกว่านี้ใช่ไหม กรุณาติดต่อเราที่ {email}',
    message: 'ข้อความ',
    messageHint: 'การแพ้อาหาร ข้อจำกัดด้านอาหาร หรือคำอวยพร',
    optional: 'ไม่บังคับ',
    submit: 'ส่งการตอบรับ',
    sending: 'กำลังส่ง…',
    category: {
      legend: 'ชาย หญิง หรือเด็กอายุ 0–3 ปี',
      man: 'ชาย',
      woman: 'หญิง',
      infant: 'เด็ก 0–3 ปี',
      hint: 'เด็กอายุตั้งแต่ 4 ปีขึ้นไป กรุณาเลือกชายหรือหญิง',
    },
    honeypot: 'กรุณาเว้นช่องนี้ว่างไว้',
  },

  validation: {
    required: 'กรุณากรอกข้อมูลในช่องนี้',
    email: 'กรุณากรอกอีเมลให้ถูกต้อง',
    phone: 'กรุณากรอกหมายเลขโทรศัพท์ที่ขึ้นต้นด้วย 07 หรือ +',
    tooLong: 'ข้อความยาวเกินไปเล็กน้อย',
    category: 'กรุณาเลือก ชาย หญิง หรือเด็กอายุ 0–3 ปี',
    fixErrors: 'กรุณาตรวจสอบช่องที่มีการทำเครื่องหมายไว้',
  },

  success: {
    attendTitle: 'ขอบพระคุณ',
    attendBody: 'เรารอคอยที่จะได้ร่วมฉลองวันสำคัญนี้กับท่าน',
    partyHeading: {
      other: 'ผู้ร่วมงานของท่าน · {count} ท่าน',
    },
    replaced: 'การตอบรับนี้แทนที่การตอบรับครั้งก่อนของท่านแล้ว',
    emailNote: 'เราได้ส่งอีเมลยืนยันไปที่ {email} แล้ว',
    another: 'ส่งการตอบรับอีกครั้ง',
  },

  cancel: {
    step1Title: 'ค้นหาการตอบรับของท่าน',
    step1Body: 'กรุณากรอกอีเมลและหมายเลขโทรศัพท์ที่ท่านใช้เมื่อตอบรับ',
    find: 'ค้นหาการตอบรับ',
    finding: 'กำลังค้นหา…',
    notFound: 'ไม่พบการตอบรับที่ตรงกับข้อมูลนี้',
    step2Title: 'ท่านใดไม่สามารถมาร่วมงานได้',
    step2Body: 'กรุณาเลือกทุกท่านที่ไม่สามารถมาร่วมงานได้แล้ว',
    cancelAll: 'ยกเลิกทั้งหมด',
    message: 'ข้อความ',
    submit: 'ยืนยันการยกเลิก',
    sending: 'กำลังบันทึก…',
    nothingSelected: 'กรุณาเลือกอย่างน้อยหนึ่งท่าน',
    back: 'ย้อนกลับ',
    successTitle: 'ปรับปรุงการตอบรับของท่านเรียบร้อยแล้ว',
    successAll: 'เสียดายที่ท่านไม่สามารถมาร่วมงานได้ การตอบรับของท่านถูกยกเลิกแล้ว เราจะคิดถึงท่าน',
    cancelledHeading: 'ไม่ได้มาร่วมงาน',
    remainingHeading: 'ยังคงมาร่วมงาน',
    emailNote: 'เราได้ส่งอีเมลยืนยันไปที่ {email} แล้ว',
  },

  errors: {
    network: 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ตแล้วลองอีกครั้ง',
    server: 'ขออภัย เกิดข้อผิดพลาดในระบบของเรา กรุณาลองใหม่อีกครั้งในอีกสักครู่',
    invalid: 'ข้อมูลบางส่วนไม่ถูกต้อง กรุณาตรวจสอบแบบฟอร์มแล้วลองอีกครั้ง',
    partyTooLarge: 'จำนวนผู้ร่วมงานเกินกว่าที่ตอบรับได้ในครั้งเดียว กรุณาติดต่อเรา',
  },

  footer: {
    signoff: 'ด้วยรักและขอบคุณ',
    names: 'Asmat & Saima',
    dua: 'ขออัลลอฮ์ทรงประทานพรแก่ชีวิตคู่นี้',
  },
};
