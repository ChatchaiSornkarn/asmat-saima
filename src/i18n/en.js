// English strings — the reference table. sv.js, th.js and ur.js mirror these keys exactly.
// Interpolation: {name}. Plurals: an object keyed by Intl.PluralRules category
// ({ one, other } — Thai uses only `other`), selected by the `count` variable.
// The couple's names are NOT translated: they stay in the Latin script calligraphy.

export default {
  meta: {
    title: 'Asmat & Saima · Wedding · 13 December 2026',
    description: 'You are warmly invited to the Wedding of Asmat & Saima — Sunday, 13 December 2026, Göteborg.',
  },

  switcher: {
    label: 'Language',
  },

  opening: {
    envelopeLine: 'request the pleasure of your company',
    tapToOpen: 'Tap to open',
    ariaOpen: 'Open the invitation',
    skip: 'Skip',
  },

  postcard: {
    invitedTo: 'You are warmly invited to the',
    wedding: 'Wedding',
    of: 'of',
    date: 'Sunday, 13 December 2026',
    time: 'at {time}',
    mapAria: 'Open the address in maps',
  },

  cue: {
    rsvp: 'RSVP',
    aria: 'Scroll down to reply',
  },

  actions: {
    heading: 'Save the date',
    directions: 'Directions',
    directionsSub: 'Open in Maps',
    calendar: 'Add to calendar',
    calendarSub: 'Sunday, 13 December',
    calendarApple: 'Apple Calendar / Outlook',
    calendarAppleSub: 'Download .ics file',
    calendarGoogle: 'Google Calendar',
    calendarGoogleSub: 'Opens in a new tab',
    close: 'Close',
    eventTitle: 'Wedding of Asmat & Saima',
    eventDetails: 'You are warmly invited to the Wedding of Asmat & Saima. We look forward to celebrating with you.',
    allDay: 'All day',
  },

  rsvp: {
    heading: 'RSVP',
    subheading: 'Kindly let us know if you can join us',
    deadline: 'Please reply by {date}',
    late: 'Late reply: we will confirm with you whether we can still fit you in.',
    count: {
      one: '{guests} guests from {households} family',
      other: '{guests} guests from {households} families',
    },
    countLead: 'Already coming',
    tabs: {
      attend: "We're coming",
      cancel: "Cancel / can't come",
    },
    hint: 'Adding someone? Just send a new RSVP — it replaces your earlier one.',
    demo: 'Demo mode — RSVPs are saved only in this browser.',
  },

  // Side choice on a link without ?side= (2_main_idea issue 16). Names stay in Latin script.
  sideChoice: {
    label: 'Whose guest are you?',
    asmat: "Asmat's guest",
    saima: "Saima's guest",
    required: 'Please choose whose guest you are.',
  },

  form: {
    mainHeading: 'Your details',
    mainNote: 'You reply for your whole family.',
    firstName: 'First name',
    lastName: 'Surname',
    email: 'Email',
    phone: 'Phone',
    phoneHint: 'e.g. 070 123 45 67 or +46 70 123 45 67',
    emailHint: "We'll send your confirmation here.",
    membersHeading: 'Family members',
    membersNote: 'Add everyone coming with you — name and surname only.',
    memberLabel: 'Guest {n}',
    addMember: 'Add family member',
    removeMember: 'Remove guest {n}',
    counter: {
      one: "You've added {count} person",
      other: "You've added {count} people",
    },
    maxReached: 'Larger family? Contact us',
    maxReachedEmail: 'Larger family? Contact us at {email}',
    message: 'Message',
    messageHint: 'Allergies, dietary needs, or a few kind words',
    optional: 'optional',
    submit: 'Send RSVP',
    sending: 'Sending…',
    category: {
      legend: 'Man, woman or child 0–3',
      man: 'Man',
      woman: 'Woman',
      infant: 'Child 0–3',
      hint: 'Children aged 4 and up: choose man or woman.',
    },
    honeypot: 'Leave this field empty',
  },

  validation: {
    required: 'Please fill this in.',
    email: 'Please enter a valid email address.',
    phone: 'Please enter a phone number starting with 07 or +.',
    tooLong: 'This is a little too long.',
    category: 'Choose man, woman or child 0–3.',
    fixErrors: 'Please check the highlighted fields.',
  },

  success: {
    attendTitle: 'Thank you!',
    attendBody: "We can't wait to celebrate with you.",
    partyHeading: {
      one: 'Your party · {count} person',
      other: 'Your party · {count} people',
    },
    replaced: 'This replaces your earlier RSVP.',
    emailNote: 'A confirmation is on its way to {email}.',
    another: 'Send another RSVP',
  },

  cancel: {
    step1Title: 'Find your RSVP',
    step1Body: 'Enter the email and phone number you used when you replied.',
    find: 'Find my RSVP',
    finding: 'Searching…',
    notFound: "We couldn't find an RSVP with these details.",
    step2Title: "Who can't come?",
    step2Body: 'Tick everyone who can no longer join us.',
    cancelAll: 'Cancel everyone',
    message: 'Message',
    submit: 'Confirm cancellation',
    sending: 'Updating…',
    nothingSelected: 'Please choose at least one person.',
    back: 'Back',
    successTitle: 'Your RSVP has been updated',
    successAll: "We're sorry you can't make it — your RSVP has been cancelled. You'll be missed.",
    cancelledHeading: 'No longer coming',
    remainingHeading: 'Still coming',
    emailNote: 'A confirmation is on its way to {email}.',
  },

  errors: {
    network: "We couldn't reach the server. Please check your connection and try again.",
    server: 'Something went wrong on our side. Please try again in a moment.',
    invalid: 'Some details look incorrect. Please check the form and try again.',
    partyTooLarge: 'That is more guests than one reply can hold. Please contact us.',
  },

  footer: {
    signoff: 'With love,',
    names: 'Asmat & Saima',
    dua: 'May Allah bless this union',
  },
};
