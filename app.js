/* ===========================
   DRAFTLINE — app.js
   =========================== */

'use strict';

// ── State ────────────────────────────────────────────────────────────────────

const state = {
  lat: null,
  lon: null,
  locationName: null,
  locationRegion: null,
  weatherData: null,
  hourly: null,
  model: 'gfs',
  loading: false,
  lastUpdated: null,
  isDemo: false,
};

// ── Constants ────────────────────────────────────────────────────────────────

const NOMINATIM = 'https://nominatim.openstreetmap.org';
let searchTimeout = null;

// ── Unit helpers ─────────────────────────────────────────────────────────────

const kToC = k => Math.round(k - 273.15);
const msToKmh = ms => Math.round(ms * 3.6);

function windFromUV(u, v) {
  const speed = Math.sqrt(u * u + v * v);
  let dir = Math.atan2(-u, -v) * (180 / Math.PI);
  if (dir < 0) dir += 360;
  return { speed, dir };
}

function compassDir(deg) {
  const dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
}

function beaufort(kmh) {
  if (kmh < 1)  return { force: 0, desc: 'Calm' };
  if (kmh < 6)  return { force: 1, desc: 'Light air' };
  if (kmh < 12) return { force: 2, desc: 'Light breeze' };
  if (kmh < 20) return { force: 3, desc: 'Gentle breeze' };
  if (kmh < 29) return { force: 4, desc: 'Moderate breeze' };
  if (kmh < 39) return { force: 5, desc: 'Fresh breeze' };
  if (kmh < 50) return { force: 6, desc: 'Strong breeze' };
  if (kmh < 62) return { force: 7, desc: 'Near gale' };
  if (kmh < 75) return { force: 8, desc: 'Gale' };
  if (kmh < 89) return { force: 9, desc: 'Strong gale' };
  if (kmh < 103) return { force: 10, desc: 'Storm' };
  if (kmh < 117) return { force: 11, desc: 'Violent storm' };
  return { force: 12, desc: 'Hurricane' };
}

function cyclingWindImpact(kmh) {
  if (kmh < 15) return 'Minimal drag';
  if (kmh < 25) return 'Noticeable resistance';
  if (kmh < 40) return 'Significant effort';
  if (kmh < 55) return 'Hard riding';
  return 'Dangerous conditions';
}

function formatTime(ts, opts = {}) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...opts });
}

// ── Weather icon SVGs ─────────────────────────────────────────────────────────

function weatherIcon({ cloudCover, precip, cape }) {
  const cloud = cloudCover || 0;
  const rain = precip || 0;
  const storm = cape || 0;

  if (rain > 3) return svgHeavyRain();
  if (rain > 0.5) return svgRain();
  if (rain > 0.05) return svgLightRain();
  if (storm > 600 && cloud > 60) return svgStorm();
  if (cloud > 80) return svgOvercast();
  if (cloud > 35) return svgPartlyCloudy();
  return svgSunny();
}

const s = (content, vb='0 0 28 28') => `<svg class="wx-icon" viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;

function svgSunny() {
  return s(`<circle cx="14" cy="14" r="5" fill="#ffc107" stroke="none"/>
  <path d="M14 3v2M14 23v2M3 14h2M23 14h2M6.2 6.2l1.4 1.4M20.4 20.4l1.4 1.4M6.2 21.8l1.4-1.4M20.4 7.6l1.4-1.4" stroke="#ffc107"/>`);
}

function svgPartlyCloudy() {
  return s(`<circle cx="10" cy="14" r="4" fill="#ffc107" stroke="none"/>
  <path d="M10 7v1.5M10 18.5V20M3.5 14H5M15 14h1.5M5.7 9.7l1 1M13.3 9.7l-1 1" stroke="#ffc107" stroke-width="1.2"/>
  <path d="M12 17a4 4 0 1 1 0-8 4 4 0 0 1 4 4h1a3 3 0 1 1 0 6H11a3 3 0 0 1-3-3v0" stroke="#9090a8" stroke-width="1.5"/>`);
}

function svgOvercast() {
  return s(`<path d="M8 18a4 4 0 0 1 0-8 4 4 0 0 1 7.8-1A3.5 3.5 0 1 1 21.5 12H8" stroke="#9090a8" stroke-width="1.5"/>`);
}

function svgLightRain() {
  return s(`<path d="M6 14a4 4 0 0 1 0-8 4 4 0 0 1 7.8-1A3.5 3.5 0 1 1 19.5 8H6" stroke="#9090a8" stroke-width="1.5"/>
  <path d="M8 19l-1 3M12 19v3M16 19l1 3" stroke="#5ba4ff" stroke-width="1.5"/>`);
}

function svgRain() {
  return s(`<path d="M5 13a4 4 0 0 1 0-8 4 4 0 0 1 7.8-1A3.5 3.5 0 1 1 18.5 7H5" stroke="#9090a8" stroke-width="1.5"/>
  <path d="M7 18l-2 5M11 17v5M15 18l2 5" stroke="#5ba4ff" stroke-width="2"/>`);
}

function svgHeavyRain() {
  return s(`<path d="M5 11a4 4 0 0 1 0-8 4 4 0 0 1 7.8-1A3.5 3.5 0 1 1 18.5 5H5" stroke="#5ba4ff" stroke-width="1.5"/>
  <path d="M6 16l-2 6M10 15v6M14 16l2 6M9 19l-2 6M13 18v6" stroke="#5ba4ff" stroke-width="2"/>`);
}

function svgStorm() {
  return s(`<path d="M5 11a4 4 0 0 1 0-8 4 4 0 0 1 7.8-1A3.5 3.5 0 1 1 18.5 5H5" stroke="#9090a8" stroke-width="1.5"/>
  <path d="M13 14l-4 6h5l-4 6" stroke="#ffc107" stroke-width="2"/>`);
}

// ── Data processing ───────────────────────────────────────────────────────────

function parseWindyResponse(raw) {
  const ts = raw.ts;
  const hourly = ts.map((t, i) => {
    const u = raw['wind_u-surface']?.[i] ?? 0;
    const v = raw['wind_v-surface']?.[i] ?? 0;
    const wind = windFromUV(u, v);
    const tempK = raw['temp-surface']?.[i] ?? 273;
    const dewK = raw['dewpoint-surface']?.[i] ?? 270;
    const gustMs = raw['gust-surface']?.[i] ?? wind.speed;
    const precip = raw['precip-surface']?.[i] ?? 0;
    const humidity = raw['humidity-surface']?.[i] ?? 0;
    const lc = raw['lclouds-surface']?.[i] ?? 0;
    const mc = raw['mclouds-surface']?.[i] ?? 0;
    const hc = raw['hclouds-surface']?.[i] ?? 0;
    const cape = raw['cape-surface']?.[i] ?? 0;

    const tempC = kToC(tempK);
    const dewC = kToC(dewK);
    const windKmh = msToKmh(wind.speed);
    const gustKmh = msToKmh(gustMs);
    const cloudCover = Math.round(Math.max(lc, mc, hc));

    return {
      ts: t,
      time: new Date(t),
      tempC,
      dewC,
      windKmh,
      windDir: wind.dir,
      windDirCompass: compassDir(wind.dir),
      gustKmh,
      precip: Math.max(0, precip),
      humidity: Math.round(humidity),
      cloudCover,
      cape: Math.round(cape),
    };
  });

  return hourly;
}

// ── Ride Decision Engine ──────────────────────────────────────────────────────

function rideDecision(hourly) {
  const window = hourly.slice(0, Math.min(3, hourly.length));
  let score = 100;
  const issues = new Map();

  const add = (key, label, level, penalty) => {
    if (!issues.has(key)) {
      issues.set(key, { label, level });
      score -= penalty;
    }
  };

  for (const h of window) {
    if (h.precip > 5)      add('heavy_rain',   'Heavy rain',      'danger', 40);
    else if (h.precip > 1.5) add('rain',        'Rain',            'warn',   25);
    else if (h.precip > 0.3) add('light_rain',  'Light rain',      'warn',   12);

    if (h.gustKmh > 70)    add('dangerous_gust', 'Dangerous gusts', 'danger', 35);
    else if (h.gustKmh > 50) add('strong_gust', 'Strong gusts',    'warn',   18);

    if (h.windKmh > 60)    add('strong_wind',   'Strong wind',     'danger', 30);
    else if (h.windKmh > 40) add('wind',        'Elevated wind',   'warn',   15);

    if (h.tempC < 2)       add('freezing',      'Near-freezing',   'danger', 20);
    else if (h.tempC < 6)  add('cold',          'Very cold',       'warn',   8);
    else if (h.tempC > 40) add('extreme_heat',  'Extreme heat',    'danger', 25);

    if (h.cape > 800)      add('storm_risk',    'Storm risk',      'danger', 35);
    else if (h.cape > 400) add('convective',    'Convective risk', 'warn',   15);
  }

  score = Math.max(0, score);

  let label, cls;
  if (score >= 82)      { label = 'GO'; cls = 'go'; }
  else if (score >= 62) { label = 'CAUTION'; cls = 'caution'; }
  else if (score >= 42) { label = 'WAIT'; cls = 'wait'; }
  else                  { label = 'SKIP'; cls = 'skip'; }

  const headlineMap = {
    go:      'Conditions look good to ride',
    caution: 'Ride but watch conditions',
    wait:    'Consider waiting for a better window',
    skip:    'Conditions not suitable today',
  };

  return { label, cls, score, issues: [...issues.values()], headline: headlineMap[cls] };
}

function windowScore(slice) {
  const d = rideDecision(slice);
  return d.score;
}

function departureWindows(hourly) {
  const slots = [];
  const limit = Math.min(12, hourly.length);
  for (let i = 0; i < limit; i++) {
    const slice = hourly.slice(i, i + Math.min(3, hourly.length - i));
    slots.push({ i, h: hourly[i], score: windowScore(slice) });
  }
  return slots.sort((a, b) => b.score - a.score).slice(0, 4);
}

// ── Road surface model ────────────────────────────────────────────────────────

function surfaceCondition(hourly) {
  const h0 = hourly[0];
  const recent3 = hourly.slice(0, 3);
  const totalRecent = recent3.reduce((s, h) => s + h.precip, 0);

  if (h0.precip > 1) {
    return { status: 'wet', label: 'Wet — actively raining', detail: `${h0.precip.toFixed(1)} mm/h falling now`, dryPct: 0 };
  }
  if (h0.precip > 0.1) {
    return { status: 'wet', label: 'Wet — light rain', detail: `${h0.precip.toFixed(1)} mm/h`, dryPct: 10 };
  }
  if (totalRecent > 0.5) {
    const temp = h0.tempC;
    const wind = h0.windKmh;
    const dryRate = (temp > 18 && wind > 15) ? 'fast' : (temp > 12 ? 'moderate' : 'slow');
    const dryTimeMap = { fast: '~30–45 min', moderate: '~1–2 h', slow: '~2–4 h' };
    const pct = dryRate === 'fast' ? 45 : dryRate === 'moderate' ? 65 : 80;
    return { status: 'damp', label: 'Damp — drying', detail: `Fully dry in ${dryTimeMap[dryRate]}`, dryPct: pct };
  }
  return { status: 'dry', label: 'Dry', detail: 'No recent precipitation', dryPct: 100 };
}

// ── Kit suggestion ────────────────────────────────────────────────────────────

function kitSuggestion(hourly) {
  const h = hourly[0];
  const items = [];

  const add = (icon, label, essential = false) => items.push({ icon, label, essential });

  // Base layer
  if (h.tempC < 8)  add('🧥', 'Thermal jacket', true);
  else if (h.tempC < 14) add('🧥', 'Light jacket');
  else if (h.tempC < 20) add('🦺', 'Gilet / vest');

  // Legs
  if (h.tempC < 10) add('🦵', 'Bib tights', true);
  else if (h.tempC < 16) add('🦵', 'Knee warmers');

  // Gloves
  if (h.tempC < 8)  add('🧤', 'Full-finger gloves', true);
  else if (h.tempC < 14) add('🧤', 'Light gloves');

  // Rain
  const willRain = hourly.slice(0, 4).some(h => h.precip > 0.3);
  if (willRain) {
    add('🌧️', 'Rain jacket', true);
    add('🥾', 'Overshoes', true);
  }

  // Wind
  if (h.windKmh > 35) add('🌬️', 'Windproof layer');

  // Visibility
  const now = new Date();
  const hour = now.getHours();
  if (h.cloudCover > 70 || hour < 7 || hour > 18) add('💡', 'Lights', true);

  // Sun
  if (h.cloudCover < 30 && h.tempC > 20) add('🕶️', 'Sunglasses');

  // Always
  add('🚴', 'Helmet', true);
  add('💧', 'Water bottles', true);

  return items;
}

// ── Demo data (used when API is unavailable) ──────────────────────────────────

function makeDemoData() {
  const now = Date.now();
  const step = 3 * 60 * 60 * 1000; // 3h intervals
  const ts = Array.from({ length: 16 }, (_, i) => now + i * step);

  const base = {
    temp: 289,    // ~16°C
    wind_u: -4,   // westerly
    wind_v: 2,
    gust: 8,
    precip: 0,
    humidity: 65,
    lclouds: 30,
    mclouds: 20,
    hclouds: 10,
    cape: 50,
    dewpoint: 282,
  };

  // Inject some rain mid-forecast so the UI is interesting
  const variations = ts.map((_, i) => ({
    temp: base.temp + Math.sin(i * 0.5) * 3,
    wind_u: base.wind_u + (Math.random() - 0.5) * 2,
    wind_v: base.wind_v + (Math.random() - 0.5) * 2,
    gust: base.gust + Math.random() * 4,
    precip: i >= 3 && i <= 5 ? 1.2 + Math.random() * 2 : Math.random() * 0.1,
    humidity: base.humidity + Math.random() * 10,
    lclouds: i >= 2 && i <= 6 ? 70 + Math.random() * 20 : 20 + Math.random() * 20,
    mclouds: 15 + Math.random() * 10,
    hclouds: 10 + Math.random() * 5,
    cape: i === 4 ? 450 : 30 + Math.random() * 50,
    dewpoint: base.dewpoint + Math.random() * 2,
  }));

  const pick = (key) => variations.map(v => v[key]);

  return {
    ts,
    units: { temp: 'K', 'wind_u-surface': 'm/s', 'wind_v-surface': 'm/s', 'gust-surface': 'm/s', 'precip-surface': 'mm/h' },
    'temp-surface': pick('temp'),
    'wind_u-surface': pick('wind_u'),
    'wind_v-surface': pick('wind_v'),
    'gust-surface': pick('gust'),
    'precip-surface': pick('precip'),
    'humidity-surface': pick('humidity'),
    'lclouds-surface': pick('lclouds'),
    'mclouds-surface': pick('mclouds'),
    'hclouds-surface': pick('hclouds'),
    'cape-surface': pick('cape'),
    'dewpoint-surface': pick('dewpoint'),
    _demo: true,
  };
}

// ── Fetch weather ─────────────────────────────────────────────────────────────

async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({ lat, lon, model: state.model });
  try {
    const resp = await fetch(`/api/weather?${params}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }
    return resp.json();
  } catch (err) {
    // Fall back to demo data when running without a proxy/API key
    console.warn('API unavailable, using demo data:', err.message);
    state.isDemo = true;
    return makeDemoData();
  }
}

// ── Geocoding ─────────────────────────────────────────────────────────────────

async function geocodeSearch(query) {
  const url = `${NOMINATIM}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  return resp.json();
}

async function reverseGeocode(lat, lon) {
  const url = `${NOMINATIM}/reverse?lat=${lat}&lon=${lon}&format=json`;
  const resp = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  return resp.json();
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function renderDecision(d) {
  const card = document.getElementById('ride-decision-card');
  const badge = document.getElementById('decision-badge');
  const headline = document.getElementById('decision-headline');
  const subline = document.getElementById('decision-subline');
  const issuesEl = document.getElementById('decision-issues');
  const arc = document.getElementById('score-arc');
  const scoreNum = document.getElementById('score-number');

  card.className = `ride-card ${d.cls}`;
  badge.className = `decision-badge ${d.cls}`;
  badge.textContent = d.label;
  headline.textContent = d.headline;
  subline.textContent = `Ride score: ${d.score}/100 · Next ${Math.min(3, state.hourly.length)} forecast slots`;

  // Arc circumference = 2π×18 ≈ 113.1
  const circumference = 113;
  arc.style.strokeDashoffset = circumference - (circumference * d.score / 100);
  const arcColor = { go: '#00d46a', caution: '#ffc107', wait: '#ff8c00', skip: '#ff3b30' }[d.cls];
  arc.setAttribute('stroke', arcColor);
  scoreNum.textContent = d.score;

  issuesEl.innerHTML = d.issues.map(iss =>
    `<span class="issue-tag level-${iss.level}">${iss.label}</span>`
  ).join('');
}

function renderCurrent(h) {
  document.getElementById('current-temp').textContent = `${h.tempC}°`;
  document.getElementById('feels-like').textContent = `Dew ${h.dewC}°C`;
  document.getElementById('current-wind').textContent = `${h.windKmh}`;
  document.getElementById('wind-dir-label').textContent = `km/h ${h.windDirCompass}`;
  document.getElementById('current-gust').textContent = `${h.gustKmh}`;
  document.getElementById('gust-label').textContent = 'km/h gusts';
  document.getElementById('current-precip').textContent = `${h.precip.toFixed(1)}`;
  document.getElementById('precip-sub').textContent = 'mm per hour';
  document.getElementById('current-humidity').textContent = `${h.humidity}%`;
  document.getElementById('current-cloud').textContent = `${h.cloudCover}%`;
}

function renderWind(h) {
  const arrow = document.getElementById('wind-arrow');
  arrow.style.transform = `rotate(${h.windDir}deg)`;
  document.getElementById('wind-from-text').textContent = `From ${h.windDirCompass} (${Math.round(h.windDir)}°)`;

  document.getElementById('ws-speed').textContent = `${h.windKmh} km/h`;
  document.getElementById('ws-gust').textContent = `${h.gustKmh} km/h`;
  const eff = Math.round(h.gustKmh * 1.05);
  document.getElementById('ws-effective').textContent = `~${eff} km/h`;
  const bf = beaufort(h.windKmh);
  document.getElementById('ws-beaufort').textContent = `F${bf.force} — ${bf.desc}`;
  document.getElementById('ws-impact').textContent = cyclingWindImpact(h.windKmh);
}

function renderSurface(hourly) {
  const surf = surfaceCondition(hourly);
  const dot = document.getElementById('surface-icon');
  dot.className = `surface-dot ${surf.status}`;
  document.getElementById('surface-label').textContent = surf.label;
  document.getElementById('surface-detail').textContent = surf.detail;

  const wrap = document.getElementById('drying-bar-wrap');
  if (surf.status === 'damp') {
    wrap.classList.remove('hidden');
    document.getElementById('drying-fill').style.width = `${surf.dryPct}%`;
  } else {
    wrap.classList.add('hidden');
  }
}

function renderHourly(hourly) {
  const el = document.getElementById('hourly-scroll');
  const now = Date.now();

  el.innerHTML = hourly.slice(0, 16).map((h, i) => {
    const isNow = i === 0;
    const timeStr = isNow ? 'NOW' : formatTime(h.ts);
    const icon = weatherIcon({ cloudCover: h.cloudCover, precip: h.precip, cape: h.cape });
    const precipStr = h.precip >= 0.1 ? `${h.precip.toFixed(1)}mm` : '';
    const precipClass = h.precip >= 0.1 ? 'h-precip has-rain' : 'h-precip';

    return `<div class="hourly-card${isNow ? ' now' : ''}">
      <div class="h-time">${timeStr}</div>
      <div class="h-icon">${icon}</div>
      <div class="h-temp">${h.tempC}°</div>
      <div class="h-wind">
        <span class="h-wind-arrow" style="transform:rotate(${h.windDir}deg)">↑</span>
        ${h.windKmh}
      </div>
      <div class="${precipClass}">${precipStr || '—'}</div>
    </div>`;
  }).join('');
}

function renderDepartureWindows(hourly) {
  const windows = departureWindows(hourly);
  const el = document.getElementById('departure-windows');

  el.innerHTML = windows.map((w, i) => {
    const h = w.h;
    const timeStr = i === 0 ? 'Best window' : formatTime(w.h.ts);
    const scoreLabel = w.score >= 82 ? '✓ Good' : w.score >= 62 ? '~ Acceptable' : '✗ Poor';

    return `<div class="dep-window">
      <div class="dep-time">${i === 0 ? '⭐ ' : ''}${formatTime(w.h.ts)}</div>
      <div class="dep-score">Score ${w.score}/100 · ${scoreLabel}</div>
      <div class="dep-details">
        <div class="dep-detail-row"><span class="dp-label">Temp</span> ${h.tempC}°C</div>
        <div class="dep-detail-row"><span class="dp-label">Wind</span> ${h.windKmh} km/h ${h.windDirCompass}</div>
        <div class="dep-detail-row"><span class="dp-label">Rain</span> ${h.precip.toFixed(1)} mm/h</div>
      </div>
    </div>`;
  }).join('');
}

function renderKit(hourly) {
  const items = kitSuggestion(hourly);
  const el = document.getElementById('kit-list');
  el.innerHTML = items.map(it =>
    `<div class="kit-item${it.essential ? ' essential' : ''}">
      <span class="kit-icon">${it.icon}</span>${it.label}
    </div>`
  ).join('');
}

function renderAll() {
  const hourly = state.hourly;
  const h0 = hourly[0];

  renderDecision(rideDecision(hourly));
  renderCurrent(h0);
  renderWind(h0);
  renderSurface(hourly);
  renderHourly(hourly);
  renderDepartureWindows(hourly);
  renderKit(hourly);

  document.getElementById('location-name').textContent = state.locationName || 'Unknown location';
  document.getElementById('location-region').textContent = state.locationRegion || '';
  document.getElementById('last-updated').textContent = state.lastUpdated
    ? `Updated ${formatTime(state.lastUpdated)}`
    : '';
  document.getElementById('model-badge').textContent = state.model.toUpperCase();

  const demoBanner = document.getElementById('demo-banner');
  if (demoBanner) demoBanner.classList.toggle('hidden', !state.isDemo);
}

// ── UI state management ───────────────────────────────────────────────────────

function showState(which) {
  ['loading-state','error-state','welcome-state','weather-content'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', id !== which);
  });
}

function setError(msg) {
  document.getElementById('error-message').textContent = msg;
  showState('error-state');
}

// ── Main load flow ────────────────────────────────────────────────────────────

async function loadWeather(lat, lon, name, region) {
  if (state.loading) return;
  state.loading = true;
  state.lat = lat;
  state.lon = lon;

  if (name) {
    state.locationName = name;
    state.locationRegion = region || '';
  }

  showState('loading-state');

  try {
    const raw = await fetchWeather(lat, lon);
    state.weatherData = raw;
    state.hourly = parseWindyResponse(raw);
    state.lastUpdated = Date.now();

    if (!name) {
      try {
        const geo = await reverseGeocode(lat, lon);
        const addr = geo.address || {};
        state.locationName = addr.city || addr.town || addr.village || addr.county || geo.display_name?.split(',')[0] || 'Unknown';
        state.locationRegion = [addr.state, addr.country].filter(Boolean).join(', ');
      } catch {
        state.locationName = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
      }
    }

    renderAll();
    showState('weather-content');
    sessionStorage.setItem('draftline_last', JSON.stringify({
      lat, lon, name: state.locationName, region: state.locationRegion,
    }));
  } catch (err) {
    console.error('Weather load error:', err);
    setError(err.message || 'Unable to load weather. Please check your connection.');
  } finally {
    state.loading = false;
  }
}

// ── Geolocation ───────────────────────────────────────────────────────────────

function requestGeolocation() {
  if (!navigator.geolocation) {
    setError('Geolocation is not supported by your browser. Please search for a location.');
    showState('error-state');
    return;
  }
  showState('loading-state');
  navigator.geolocation.getCurrentPosition(
    pos => loadWeather(pos.coords.latitude, pos.coords.longitude),
    err => {
      const msgs = {
        1: 'Location access denied. Please search for a location.',
        2: 'Location unavailable. Please search for a location.',
        3: 'Location request timed out. Please search for a location.',
      };
      setError(msgs[err.code] || 'Unable to get location.');
    },
    { timeout: 10000, maximumAge: 300000 }
  );
}

// ── Search UI ─────────────────────────────────────────────────────────────────

function showSearchResults(results) {
  const el = document.getElementById('search-results');
  if (!results.length) {
    el.classList.add('hidden');
    return;
  }

  el.innerHTML = results.slice(0, 5).map(r => {
    const addr = r.address || {};
    const main = addr.city || addr.town || addr.village || addr.county || r.display_name?.split(',')[0];
    const sub = [addr.state, addr.country].filter(Boolean).join(', ');
    return `<div class="search-result-item" tabindex="0"
      data-lat="${r.lat}" data-lon="${r.lon}"
      data-name="${encodeURIComponent(main)}" data-region="${encodeURIComponent(sub)}">
      <div class="sr-main">${main}</div>
      ${sub ? `<div class="sr-sub">${sub}</div>` : ''}
    </div>`;
  }).join('');

  el.classList.remove('hidden');

  el.querySelectorAll('.search-result-item').forEach(item => {
    const pick = () => {
      const lat = parseFloat(item.dataset.lat);
      const lon = parseFloat(item.dataset.lon);
      const name = decodeURIComponent(item.dataset.name);
      const region = decodeURIComponent(item.dataset.region);
      document.getElementById('location-input').value = '';
      el.classList.add('hidden');
      loadWeather(lat, lon, name, region);
    };
    item.addEventListener('click', pick);
    item.addEventListener('keydown', e => { if (e.key === 'Enter') pick(); });
  });
}

// ── Event listeners ───────────────────────────────────────────────────────────

function bindEvents() {
  const input = document.getElementById('location-input');

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const q = input.value.trim();
    if (q.length < 2) {
      document.getElementById('search-results').classList.add('hidden');
      return;
    }
    searchTimeout = setTimeout(async () => {
      try {
        const results = await geocodeSearch(q);
        showSearchResults(results);
      } catch { /* silent */ }
    }, 350);
  });

  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.getElementById('search-results').classList.add('hidden');
      input.blur();
    }
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.location-search-wrap')) {
      document.getElementById('search-results').classList.add('hidden');
    }
  });

  document.getElementById('locate-btn').addEventListener('click', requestGeolocation);
  document.getElementById('welcome-locate-btn').addEventListener('click', requestGeolocation);
  document.getElementById('retry-btn').addEventListener('click', () => {
    if (state.lat && state.lon) {
      loadWeather(state.lat, state.lon, state.locationName, state.locationRegion);
    } else {
      showState('welcome-state');
    }
  });
  document.getElementById('refresh-btn').addEventListener('click', () => {
    if (state.lat && state.lon) {
      loadWeather(state.lat, state.lon, state.locationName, state.locationRegion);
    }
  });
}

// ── PWA ───────────────────────────────────────────────────────────────────────

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* silent */ });
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  bindEvents();
  registerSW();

  // Try to restore last location from sessionStorage
  const saved = sessionStorage.getItem('draftline_last');
  if (saved) {
    try {
      const { lat, lon, name, region } = JSON.parse(saved);
      if (lat && lon) {
        loadWeather(lat, lon, name, region);
        return;
      }
    } catch { /* ignore */ }
  }

  showState('welcome-state');
}

document.addEventListener('DOMContentLoaded', init);
