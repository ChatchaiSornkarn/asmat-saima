// ─────────────────────────────────────────────────────────────────────────────
//  Site settings. Edit this file on github.com → Pages redeploys in ~1 minute.
//  Every value that may change after launch lives here (design Q19).
// ─────────────────────────────────────────────────────────────────────────────

export default {
  // Google Apps Script web-app URL (ends in /exec). Leave '' to run in DEMO mode:
  // RSVPs are then stored only in this browser so the site can be tried safely.
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbyVQlkXbJfbFLk9gyDPmAuWTDAphRe2g_HuGKrm7mRYXjKaGyX2IriCgPNh4Y7vivvsdQ/exec',

  // ISO date (YYYY-MM-DD) for "Please reply by …". null = line hidden (Q17).
  rsvpDeadline: null,

  // Public "N guests from M families" line appears once N reaches this (Q16).
  guestCountThreshold: 10,

  // Largest Party one RSVP may register, Main guest included (Q25).
  maxPartySize: 20,

  // Event date, and start/end time in local Göteborg time ('HH:MM').
  // eventStart null = all-day calendar entry (Q21).
  eventDate: '2026-12-06',
  eventStart: null,          // e.g. '14:00'
  eventEnd: null,            // e.g. '20:00' (defaults to start + 4h)
  timeZone: 'Europe/Stockholm',

  venue: {
    line1: 'Säve Flygplatsväg 26',
    line2: 'Göteborg',
    mapQuery: 'Säve Flygplatsväg 26, 423 73 Säve, Sweden',
  },

  // Optional contact shown for "Larger family? Contact us". '' = hidden.
  contactEmail: '',

  languages: ['en', 'sv', 'th', 'ur'],
  defaultLanguage: 'en',
};
