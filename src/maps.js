// Map links for the venue (design Q21). Apple Maps on iPhone/iPad/Mac Safari, Google Maps elsewhere.

export function isApplePlatform() {
  const ua = navigator.userAgent || '';
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}

/** Directions URL to the venue. Opens the native Maps app on phones. */
export function mapsUrl(config) {
  const q = encodeURIComponent(config.venue.mapQuery);
  return isApplePlatform()
    ? `https://maps.apple.com/?daddr=${q}&q=${q}`
    : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
}
