// DRAFT — to be proofread by a native speaker before launch (issue 12)
// Svenska. Mirrors en.js exactly (same keys, same {placeholders}). Plurals: one / other.
// Register: the invitation addresses the household ("ni"); the form addresses the
// person filling it in ("du"). "OSA" (om svar anhålles) is the Swedish wedding term for RSVP.
// The couple's names stay in Latin script and are never translated.

export default {
  meta: {
    title: 'Asmat & Saima · Nikah · 6 december 2026',
    description: 'Varmt välkomna till Asmat & Saimas nikah – söndagen den 6 december 2026 i Göteborg.',
  },

  switcher: {
    label: 'Språk',
  },

  opening: {
    envelopeLine: 'har glädjen att bjuda in er',
    tapToOpen: 'Tryck för att öppna',
    ariaOpen: 'Öppna inbjudan',
    skip: 'Hoppa över',
  },

  postcard: {
    invitedTo: 'Ni är varmt välkomna till',
    nikah: 'Nikah',
    of: 'mellan',
    date: 'Söndagen den 6 december 2026',
    time: 'kl. {time}',
    mapAria: 'Visa adressen på kartan',
  },

  cue: {
    rsvp: 'OSA',
    aria: 'Skrolla ned för att svara',
  },

  actions: {
    heading: 'Spara datumet',
    directions: 'Vägbeskrivning',
    directionsSub: 'Öppna i kartappen',
    calendar: 'Lägg till i kalendern',
    calendarSub: 'Söndag 6 december',
    calendarApple: 'Apple Kalender / Outlook',
    calendarAppleSub: 'Ladda ned .ics-fil',
    calendarGoogle: 'Google Kalender',
    calendarGoogleSub: 'Öppnas i en ny flik',
    close: 'Stäng',
    eventTitle: 'Asmat & Saimas nikah',
    eventDetails: 'Varmt välkomna till Asmat & Saimas nikah. Vi ser fram emot att få fira tillsammans med er.',
    allDay: 'Heldag',
  },

  rsvp: {
    heading: 'OSA',
    subheading: 'Berätta gärna om ni har möjlighet att komma',
    deadline: 'OSA senast {date}',
    count: {
      one: '{guests} gäster från {households} familj',
      other: '{guests} gäster från {households} familjer',
    },
    countLead: 'Redan anmälda',
    tabs: {
      attend: 'Vi kommer',
      cancel: 'Avboka / kan inte komma',
    },
    hint: 'Vill du lägga till någon? Skicka bara ett nytt svar – det ersätter ditt tidigare.',
    demo: 'Demoläge – svaren sparas bara i den här webbläsaren.',
  },

  form: {
    mainHeading: 'Dina uppgifter',
    mainNote: 'Du svarar för hela familjen.',
    firstName: 'Förnamn',
    lastName: 'Efternamn',
    email: 'E-post',
    phone: 'Telefon',
    phoneHint: 't.ex. 070 123 45 67 eller +46 70 123 45 67',
    emailHint: 'Hit skickar vi din bekräftelse.',
    membersHeading: 'Familjemedlemmar',
    membersNote: 'Lägg till alla som kommer med dig – bara för- och efternamn.',
    memberLabel: 'Gäst {n}',
    addMember: 'Lägg till familjemedlem',
    removeMember: 'Ta bort gäst {n}',
    counter: {
      one: 'Du har lagt till {count} person',
      other: 'Du har lagt till {count} personer',
    },
    maxReached: 'Större familj? Kontakta oss',
    maxReachedEmail: 'Större familj? Kontakta oss på {email}',
    message: 'Meddelande',
    messageHint: 'Allergier, specialkost eller några varma ord',
    optional: 'valfritt',
    submit: 'Skicka svar',
    sending: 'Skickar…',
    honeypot: 'Lämna det här fältet tomt',
  },

  validation: {
    required: 'Fyll i det här fältet.',
    email: 'Ange en giltig e-postadress.',
    phone: 'Ange ett telefonnummer som börjar med 07 eller +.',
    tooLong: 'Det här blev lite för långt.',
    fixErrors: 'Kontrollera de markerade fälten.',
  },

  success: {
    attendTitle: 'Tack!',
    attendBody: 'Vi längtar efter att få fira tillsammans med er.',
    partyHeading: {
      one: 'Ert sällskap · {count} person',
      other: 'Ert sällskap · {count} personer',
    },
    replaced: 'Det här ersätter ditt tidigare svar.',
    emailNote: 'En bekräftelse är på väg till {email}.',
    another: 'Skicka ett nytt svar',
  },

  cancel: {
    step1Title: 'Hitta ditt svar',
    step1Body: 'Ange e-postadressen och telefonnumret som du använde när du svarade.',
    find: 'Hitta mitt svar',
    finding: 'Söker…',
    notFound: 'Vi hittade inget svar med de här uppgifterna.',
    step2Title: 'Vem kan inte komma?',
    step2Body: 'Markera alla som inte längre kan komma.',
    cancelAll: 'Avboka alla',
    message: 'Meddelande',
    submit: 'Bekräfta avbokningen',
    sending: 'Uppdaterar…',
    nothingSelected: 'Välj minst en person.',
    back: 'Tillbaka',
    successTitle: 'Ditt svar är uppdaterat',
    successAll: 'Vad synd att ni inte kan komma – ert svar är nu avbokat. Ni kommer att saknas.',
    cancelledHeading: 'Kommer inte',
    remainingHeading: 'Kommer fortfarande',
    emailNote: 'En bekräftelse är på väg till {email}.',
  },

  errors: {
    network: 'Vi kunde inte nå servern. Kontrollera din anslutning och försök igen.',
    server: 'Något gick fel hos oss. Försök igen om en liten stund.',
    invalid: 'Några uppgifter verkar inte stämma. Kontrollera formuläret och försök igen.',
    partyTooLarge: 'Det är fler gäster än ett svar kan omfatta. Kontakta oss, så löser vi det.',
  },

  footer: {
    signoff: 'Med kärlek,',
    names: 'Asmat & Saima',
    dua: 'Må Allah välsigna detta äktenskap',
  },
};
