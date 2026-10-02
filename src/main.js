// Entry point — wires the feature modules together. Each module owns its own DOM.
import config from '../config.js';
import { initI18n, applyTranslations } from './i18n/index.js';
import { mountSwitcher } from './switcher.js';
import { mountPostcard } from './postcard.js';
import { mountLayout } from './layout.js';
import { mountRsvp } from './rsvp/index.js';
import { mountOpening } from './opening.js';

const $ = (id) => document.getElementById(id);

async function start() {
  await initI18n(config);

  mountSwitcher($('lang-switcher'), config);
  mountPostcard($('postcard'), config);
  mountLayout({ actions: $('actions'), cue: $('rsvp-cue'), footer: $('footer') }, config);
  mountRsvp($('rsvp'), config);
  applyTranslations(document);

  const site = $('site');
  site.setAttribute('aria-hidden', 'true');
  site.inert = true;

  await mountOpening($('opening'), config); // resolves once the guest has opened the invitation

  site.removeAttribute('aria-hidden');
  site.inert = false;
  document.documentElement.classList.add('is-open');
  document.dispatchEvent(new CustomEvent('invite:opened'));
}

start().catch((err) => {
  console.error(err);
  // Never leave a guest stuck behind the doors.
  document.documentElement.classList.add('is-open');
  const site = $('site');
  site.removeAttribute('aria-hidden');
  site.inert = false;
  $('opening')?.remove();
});
