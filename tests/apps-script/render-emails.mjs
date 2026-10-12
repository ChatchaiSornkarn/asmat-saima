// Renders every email variant to standalone HTML files for visual review.
//   node tests/apps-script/render-emails.mjs [outDir]      (default: ./email-previews in the current folder)
import fs from 'node:fs';
import path from 'node:path';
import { createBackend } from './harness.mjs';

const out = path.resolve(process.argv[2] || 'email-previews');
fs.mkdirSync(out, { recursive: true });

const b = createBackend();
b.setup();
const cfg = b.context.getConfig_();
const files = [];
const write = (name, mail) => {
  fs.writeFileSync(path.join(out, name + '.html'), mail.html);
  fs.writeFileSync(path.join(out, name + '.txt'), 'Subject: ' + mail.subject + '\n\n' + mail.text);
  files.push(name);
};

for (const ev of b.context.sampleEvents_()) {
  const variant = ev.kind === 'attend' ? 'attend' : ev.status === 'cancelled' ? 'cancelled' : 'partial';
  write(`guest-${ev.lang}-${variant}`, b.context.renderGuestEmail_(ev, cfg));
  if (ev.lang === 'en') write(`owner-${variant}`, b.context.renderOwnerEmail_(ev, cfg));
}
// An updated RSVP (replaces an earlier one) for the owner view.
const upd = { ...b.context.sampleEvents_()[0], replaces: '7', previous: [{ rowNum: 7, names: ['Amina Rahman'] }], note: 'row 7 matched on phone only (its email: amina.r@example.com)' };
write('owner-attend-updated', b.context.renderOwnerEmail_(upd, cfg));
write('guest-en-attend-updated', b.context.renderGuestEmail_(upd, cfg));
// A late reply (after RSVP_DEADLINE, issue 14): owner subject starts with LATE, guest gets the late line.
const late = { ...b.context.sampleEvents_()[0], late: true, deadline: cfg.rsvpDeadline };
write('owner-attend-late', b.context.renderOwnerEmail_(late, cfg));
for (const ev of b.context.sampleEvents_().filter((e) => e.kind === 'attend')) {
  write(`guest-${ev.lang}-attend-late`, b.context.renderGuestEmail_({ ...ev, late: true }, cfg));
}

console.log(`Wrote ${files.length} emails to ${out}:\n  ` + files.join('\n  '));
