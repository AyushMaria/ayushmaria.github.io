/**
 * project-card.js — the inside of each project's card (§3.2)
 *
 * The card opens on what the project does, in four tabs:
 *   What it does   — a one-line summary and a five-frame story (input → output)
 *                    that plays once, then the longer description
 *   Try it         — a small scripted version of the project to play with
 *                    (hidden where there isn't one)
 *   Results        — real numbers from the project, with where they came from
 *   Under the hood — the tools, and how the parts connect
 *
 * index.html's openModal() calls ProjectCards.render(id, el, project) for any
 * project listed here and ProjectCards.stop() on close. ←/→ (or the gamepad
 * bumpers) switch tabs. Toys are scripted: nothing here calls a server.
 */

const reduceMotion = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const esc = (v) => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ════════════════════════════════════════════════════════════════
// CARD DATA (facts from each project's repository; Vortex from its paper)
// ════════════════════════════════════════════════════════════════
const CARDS = {
  mavpose: {
    oneLiner: 'Ask a drone\'s flight log a question in plain English and get a chart back.',
    story: [
      ['📂', 'Log + question', 'A .bin, .tlog or .ulg flight log and a question'],
      ['🔎', 'Find the data', 'Matches your words to the log\'s message types'],
      ['🧮', 'Tidy it', 'Lines up timestamps and converts units'],
      ['✍️', 'AI writes code', 'An LLM writes the plotting script'],
      ['📈', 'Chart', 'Runs it safely, retries if it fails'],
    ],
    toy: 'mavpose',
    results: [
      ['3 formats', '.tlog, .bin and .ulg: ArduPilot and PX4 logs'],
      ['200 MB', 'the largest log it reads'],
      ['3 retries', 'fixes and re-runs its own plotting code'],
      ['pip install', 'a Python package as well as a CLI'],
    ],
    resultsNote: 'From the MAVPose README.',
    flow: ['Flight log', 'pymavlink / pyulog', 'ChromaDB search', 'Parquet', 'LLM (OpenRouter)', 'Sandboxed Matplotlib', 'plot.png'],
    live: 'https://ayushmaria.github.io/MAVPose/',
    liveLabel: 'Project page',
  },

  ace: {
    oneLiner: 'A WhatsApp assistant that books, moves and cancels pickleball courts for Vibe & Volley, and answers questions about the venue.',
    story: [
      ['💬', 'A message', '"court at 6 on saturday?"'],
      ['🧠', 'Remembers you', 'Loads your chat history'],
      ['📚', 'Checks the FAQ', 'Looks up venue rules'],
      ['📅', 'Books it', 'Checks slots and prices, books'],
      ['✅', 'Replies', 'Confirms in WhatsApp, reminds you later'],
    ],
    toy: 'ace',
    results: [
      ['7 AM–11 PM', 'bookable every day, in 30-minute slots'],
      ['₹250 / ₹150', 'per slot, peak / off-peak, priced by the agent'],
      ['2 modes', 'players book; the owner gets revenue reports and blocks slots'],
      ['Reminders', 'sent automatically before each game'],
    ],
    resultsNote: 'From the Ace README.',
    flow: ['WhatsApp', 'Twilio', 'FastAPI', 'LangGraph agent', 'Gemini 2.5 Flash', 'Booking tools', 'Supabase + pgvector'],
  },

  volley: {
    oneLiner: 'The website players use to book the Vibe & Volley pickleball courts.',
    story: [
      ['📆', 'Pick a day', 'Choose a date and a time block'],
      ['🟩', 'Pick slots', 'Free 30-minute slots in green'],
      ['⚡', 'Live updates', 'Slots others book turn red instantly'],
      ['🧾', 'Checked', 'Price, promo and rules checked on the server'],
      ['📧', 'Confirmed', 'A confirmation email arrives'],
    ],
    toy: 'volley',
    results: [
      ['Live', 'availability updates as others book (Supabase Realtime)'],
      ['4 screens', 'book, manage your booking, admin dashboard, staff view'],
      ['30 min', 'slots, priced and promo-checked on the server'],
      ['Email', 'confirmation for every booking'],
    ],
    resultsNote: 'From the vibe-volley-fresh README.',
    flow: ['React app', 'Supabase Realtime', 'Vercel function /api/book', 'Supabase Postgres', 'EmailJS'],
    live: 'https://vibe-volley-fresh.vercel.app',
  },

  xg: {
    oneLiner: 'How likely each football shot is to be a goal, and which players and teams beat the odds.',
    story: [
      ['⚽', '61,003 shots', 'Open-play shots from StatsBomb data'],
      ['📐', '13 features', 'Distance, angle, defenders in the way…'],
      ['🤖', '4 models', 'Tuned and compared head to head'],
      ['🎯', 'xG per shot', 'The chance each shot goes in'],
      ['🏆', 'Tables', 'Players, teams and leagues vs their xG'],
    ],
    toy: 'xg',
    results: [
      ['61,003', 'open-play shots from 2,616 men\'s matches'],
      ['0.806', 'AUC on 12,009 held-out shots (CatBoost)'],
      ['+98.8', 'Messi: 400 goals from 301.2 xG'],
      ['6th', 'Leicester 2015/16 on xG difference, the year they won the league'],
    ],
    compare: { title: 'AUC, drawn from 0 to 1', rows: [['CatBoost (this project)', 0.806], ["StatsBomb's own model", 0.813]] },
    resultsNote: 'From the Expected-xG-Goals-Football README. Started as a Cranfield MSc thesis.',
    flow: ['StatsBomb open data', 'Shot table (pandas)', 'Features', 'CatBoost · XGBoost · LightGBM · logistic', 'Calibration + tests', 'Charts & tables'],
    live: 'https://ayushmaria.github.io/xg/',
    liveLabel: 'Open the xG explorer',
  },

  instillgcs: {
    oneLiner: 'Flies a drone from a handheld controller: each button press becomes an autopilot command.',
    story: [
      ['🎮', 'Press a button', 'On the STM32 handheld controller'],
      ['🔌', 'Read it', 'evdev reads the USB input'],
      ['🧭', 'Which autopilot?', 'Detects ArduPilot or PX4'],
      ['📡', 'MAVLink', 'Sends the matching command'],
      ['🛸', 'Drone acts', 'Arms, takes off, lands, drops…'],
    ],
    toy: 'gcs',
    results: [
      ['ArduPilot + PX4', 'detected automatically'],
      ['20–100 m', 'altitude dial; take-off at 20 m'],
      ['7 actions', 'arm, take off, land, mode, payload drop, camera, altitude'],
      ['10 s', 'wait for the drone to acknowledge each command'],
    ],
    resultsNote: 'From the InstillGCS code (key.py).',
    flow: ['STM32 controller', 'evdev', 'key.py', 'pymavlink / DroneKit', 'MAVLink', 'ArduPilot or PX4'],
  },

  ledger: {
    oneLiner: 'Finds the invoices customers haven\'t paid in Tally, and lets you ask an AI who owes what.',
    story: [
      ['🏦', 'Ask Tally', 'Requests receivables from TallyPrime'],
      ['📜', 'Read bills', 'Parses the XML reply'],
      ['⏰', 'Overdue only', 'Keeps bills 30+ days overdue'],
      ['☁️', 'Save', 'Loads them into Supabase daily'],
      ['🤖', 'Ask the bot', '"Who owes us the most?" on Discord'],
    ],
    toy: 'ledger',
    results: [
      ['30+ days', 'the overdue rule for a bill to be kept'],
      ['Daily', 'sync, scheduled on the shop\'s PC'],
      ['Live', 'reads TallyPrime\'s own server, no exports'],
      ['Discord', 'bot answers questions about the overdue list'],
    ],
    resultsNote: 'From the tally-bridge and tally-AI READMEs.',
    flow: ['TallyPrime (port 9000)', 'requests + lxml', 'Overdue filter', 'Supabase', 'Tally AI: LangGraph + Gemini', 'Discord'],
  },

  vortex: {
    oneLiner: 'Finds the whirlpools in airflow simulations of a rotor blade and picks out their cores.',
    story: [
      ['🌀', 'Flow image', 'From a rotor blade simulation'],
      ['🔲', 'YOLOv5', 'Boxes each vortex region'],
      ['📏', '4 features', 'Area, aspect ratio, area difference, moment centre'],
      ['🗳️', '3 models vote', 'Random Forest, AdaBoost, XGBoost'],
      ['🎯', 'Core or not', 'The majority decides'],
    ],
    toy: 'vortex',
    results: [
      ['97.56%', 'accuracy detecting vortex cores'],
      ['133', 'images from a NACA0012 rotor blade simulation'],
      ['3 models', 'vote; fewer false positives and negatives'],
      ['Published', 'European Journal of Computational Mechanics, 2023'],
    ],
    resultsNote: 'From the published paper.',
    paper: 'https://doi.org/10.13052/ejcm2642-2085.3252',
    flow: ['CFD image', 'YOLOv5s', 'OpenCV features', 'RF · AdaBoost · XGBoost', 'Hard vote', 'Vortex core'],
  },

  aws: {
    oneLiner: 'A small cluster of cloud servers that splits huge matrix sums between them, timed and costed.',
    story: [
      ['🖥️', '5 servers', '1 master and 4 workers on AWS EC2'],
      ['🔗', 'Connect', 'Linked over SSH'],
      ['🧩', 'Split', 'The matrix is cut into packages'],
      ['⚙️', 'Compute', 'Workers each do their share (MPI)'],
      ['⏱️', 'Gather + time', 'The master collects and times it'],
    ],
    toy: 'aws',
    results: [
      ['$1.05', 'total cost, for 62.48 hours of running'],
      ['5 servers', '1 master + 4 workers (t2.micro)'],
      ['3.4×', 'faster 2000×2000 addition: 4 workers, 500-row packages vs 3 workers, 125-row'],
      ['Slower', 'multiplication got slower as workers were added'],
    ],
    resultsNote: 'From the project report in the repository.',
    flow: ['EC2 master', 'SSH', 'MPI (C)', '4 EC2 workers', 'Gather', 'Timings + cost'],
  },

  tinytots: {
    oneLiner: 'The live website of Tiny Tots, a kindergarten: how parents find it and get in touch.',
    story: [
      ['🔍', 'A parent searches', 'Finds the school on Google'],
      ['🏫', 'Looks around', 'Curriculum, gallery, testimonials'],
      ['📱', 'On a phone', 'A call / enrol bar stays at hand'],
      ['✉️', 'Enquires', 'Fills in the contact form'],
      ['📬', 'School is emailed', 'Via FormSubmit'],
    ],
    toy: null,
    results: [
      ['Live', 'tinytotskindergarten.com'],
      ['Schema.org', '"Preschool" structured data for search'],
      ['Mobile first', 'sticky call / enrol bar, map, gallery'],
      ['Auto deploy', 'every push goes live on Vercel'],
    ],
    resultsNote: 'From the TinyTotsWebsite README.',
    flow: ['HTML + CSS', 'Schema.org JSON-LD', 'FormSubmit', 'Vercel'],
    live: 'https://tinytotskindergarten.com',
  },
};

// ════════════════════════════════════════════════════════════════
// TOYS — each returns a stop() function
// ════════════════════════════════════════════════════════════════
const TOYS = {};

TOYS.ace = (el) => {
  el.innerHTML = `<div class="pc-phone"><div class="pc-phone-bar"><i>A</i>Ace · Vibe &amp; Volley</div><div class="pc-chat" aria-live="polite"></div></div>
    <div class="pc-center"><button type="button" class="pc-btn pc-btn--primary">Play the conversation</button></div>`;
  const chat = el.querySelector('.pc-chat');
  const script = [
    ['me', 'hi, is there a court free saturday evening?'],
    ['tool', '→ check_availability(sat, evening)'],
    ['bot', 'Hi! Saturday evening has these 30-min slots free:\n6:00 · 6:30 · 8:00 · 9:30 PM\nPeak price is ₹250 per slot.'],
    ['me', 'book 6 and 6:30 please'],
    ['tool', '→ create_booking(sat 18:00–19:00)'],
    ['bot', 'Booked ✅ Saturday 6:00–7:00 PM, 2 slots, ₹500.\nI\'ll remind you before you play.'],
    ['me', 'do you rent paddles?'],
    ['tool', '→ search_faq("paddle rental")'],
    ['bot', 'Yes, paddles and balls are at the front desk. 🏓'],
  ];
  let timer = null;
  const play = () => {
    clearTimeout(timer); chat.innerHTML = '';
    let i = 0;
    const next = () => {
      if (i >= script.length) return;
      const [who, text] = script[i++];
      const d = document.createElement('div'); d.className = 'pc-msg pc-msg--' + who; d.textContent = text; chat.appendChild(d);
      chat.scrollTop = chat.scrollHeight;
      timer = setTimeout(next, reduceMotion() ? 0 : (who === 'tool' ? 650 : 1250));
    };
    next();
  };
  el.querySelector('button').addEventListener('click', play);
  play();
  return () => clearTimeout(timer);
};

TOYS.volley = (el) => {
  const SLOTS = ['5:00', '5:30', '6:00', '6:30', '7:00', '7:30', '8:00', '8:30', '9:00', '9:30', '10:00', '10:30'];
  const taken = new Set([1, 5, 8]), mine = new Set();
  el.innerHTML = `<p class="pc-sub">Saturday · evening · tap free slots (30 min, ₹250 peak)</p>
    <div class="pc-slots"></div>
    <div class="pc-sum"><span class="pc-sum-text">No slots picked</span><button type="button" class="pc-btn pc-btn--primary">Book</button></div>
    <p class="pc-sub pc-note" aria-live="polite">Another player is booking too: their slots turn red live, as Supabase Realtime does on the real site.</p>`;
  const grid = el.querySelector('.pc-slots');
  const render = () => {
    grid.innerHTML = SLOTS.map((s, i) => `<button type="button" class="pc-slot${taken.has(i) ? ' is-taken' : ''}${mine.has(i) ? ' is-mine' : ''}" data-i="${i}" ${taken.has(i) ? 'disabled' : ''} aria-pressed="${mine.has(i)}">${s} PM</button>`).join('');
    el.querySelector('.pc-sum-text').textContent = mine.size ? `${mine.size} slot${mine.size > 1 ? 's' : ''} · ₹${mine.size * 250}` : 'No slots picked';
  };
  grid.addEventListener('click', e => {
    const b = e.target.closest('.pc-slot'); if (!b || b.disabled) return;
    const i = +b.dataset.i; mine.has(i) ? mine.delete(i) : mine.add(i); render();
  });
  el.querySelector('.pc-sum button').addEventListener('click', () => {
    if (!mine.size) return;
    el.querySelector('.pc-note').textContent = `Booked ✅ ${[...mine].map(i => SLOTS[i]).join(', ')} PM. A confirmation email is on its way.`;
    mine.forEach(i => taken.add(i)); mine.clear(); render();
  });
  render();
  const iv = setInterval(() => {
    const free = SLOTS.map((_, i) => i).filter(i => !taken.has(i) && !mine.has(i));
    if (free.length < 4) return;
    const i = free[Math.floor(Math.random() * free.length)];
    taken.add(i); render();
    const b = grid.querySelector(`[data-i="${i}"]`); if (b && !reduceMotion()) b.classList.add('is-flash');
  }, 5000);
  return () => clearInterval(iv);
};

TOYS.xg = (el) => {
  el.innerHTML = `<p class="pc-sub pc-center">Tap anywhere in the attacking half to take a shot</p>
    <svg class="pc-pitch" viewBox="0 0 68 55" role="img" aria-label="Half a football pitch: tap to place a shot and see its expected-goals value">
      <rect x="0" y="0" width="68" height="55" fill="#4f8d4a"/>
      <g fill="none" stroke="#e8f3e2" stroke-width="0.35">
        <rect x="0.5" y="0.5" width="67" height="54"/><rect x="13.84" y="0.5" width="40.32" height="16.5"/><rect x="24.84" y="0.5" width="18.32" height="5.5"/>
        <path d="M 26.7 17 A 9.15 9.15 0 0 0 41.3 17"/><path d="M 24.85 54.5 A 9.15 9.15 0 0 1 43.15 54.5"/>
      </g>
      <rect x="30.34" y="-0.2" width="7.32" height="0.9" fill="#fff"/><circle cx="34" cy="11" r="0.35" fill="#e8f3e2"/>
      <g class="pc-shots"></g>
    </svg>
    <p class="pc-read" aria-live="polite">Your shot's xG appears here</p>
    <p class="pc-sub pc-center">A simple stand-in formula on distance and angle; the project's CatBoost model also weighs defenders, shot type and more.</p>`;
  const svg = el.querySelector('svg'), shots = el.querySelector('.pc-shots'), read = el.querySelector('.pc-read');
  const xg = (x, y) => {
    const d = Math.hypot(x - 34, y), ang = Math.abs(Math.atan2(37.66 - x, y) - Math.atan2(30.34 - x, y));
    return 1 / (1 + Math.exp(-(-1.1 - 0.11 * d + 1.5 * ang)));
  };
  svg.addEventListener('click', e => {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 68, y = (e.clientY - r.top) / r.height * 55, v = xg(x, y);
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 0.6 + v * 3);
    c.setAttribute('fill', `rgba(255, ${Math.round(220 - v * 180)}, 60, 0.92)`); c.setAttribute('stroke', '#2b2d42'); c.setAttribute('stroke-width', 0.25);
    shots.appendChild(c); if (shots.children.length > 12) shots.firstChild.remove();
    read.textContent = `xG ${v.toFixed(2)} · about 1 in ${Math.max(1, Math.round(1 / v))} shots from here goes in`;
  });
  return () => {};
};

TOYS.gcs = (el) => {
  el.innerHTML = `<div class="pc-gcs">
      <div>
        <div class="pc-ctrl" role="group" aria-label="Handheld controller">
          <button type="button" data-c="arm">ARM</button><button type="button" data-c="takeoff">TAKE OFF</button><button type="button" data-c="land">LAND</button>
          <button type="button" data-c="loiter">LOITER</button><button type="button" data-c="drop">DROP</button><button type="button" data-c="cam">CAMERA</button>
          <label>Altitude dial <span class="pc-alt">20 m</span><input type="range" min="20" max="100" step="10" value="20" aria-label="Altitude"></label>
        </div>
        <div class="pc-sky"><div class="pc-ground"></div><div class="pc-drone" aria-hidden="true">🛸</div><div class="pc-hud pc-hud--l">ALT 0 m</div><div class="pc-hud pc-hud--r">DISARMED</div></div>
      </div>
      <div class="pc-console" aria-live="polite">key.py · autopilot: ArduPilot (detected)\nwaiting for controller input…</div>
    </div>`;
  const con = el.querySelector('.pc-console'), drone = el.querySelector('.pc-drone');
  const hudL = el.querySelector('.pc-hud--l'), hudR = el.querySelector('.pc-hud--r');
  let armed = false, air = false, target = 20;
  const log = (s) => { con.textContent += '\n' + s; con.scrollTop = con.scrollHeight; };
  const setAlt = (a) => { drone.style.bottom = (14 + a * 0.75) + 'px'; hudL.textContent = `ALT ${a} m`; };
  el.querySelector('input').addEventListener('input', e => {
    target = +e.target.value; el.querySelector('.pc-alt').textContent = target + ' m';
    if (air) { log(`dial ${target} m → reposition to ${target} m`); setAlt(target); }
  });
  el.querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.c;
    if (c === 'arm') { armed = !armed; log(`ARM → MAV_CMD_COMPONENT_ARM_DISARM (${armed ? 1 : 0})\n  ✓ COMMAND_ACK: ACCEPTED`); hudR.textContent = armed ? 'ARMED · GUIDED' : 'DISARMED'; if (!armed) { air = false; setAlt(0); } }
    else if (c === 'takeoff') { if (!armed) return log('TAKE OFF → refused: arm first'); log(`TAKE OFF → MAV_CMD_NAV_TAKEOFF (${target} m)\n  ✓ COMMAND_ACK: ACCEPTED`); air = true; setAlt(target); hudR.textContent = 'FLYING · GUIDED'; }
    else if (c === 'land') { if (!air) return log('LAND → already on the ground'); log('LAND → MAV_CMD_NAV_LAND\n  ✓ COMMAND_ACK: ACCEPTED'); air = false; setAlt(0); hudR.textContent = 'ARMED · LAND'; }
    else if (c === 'loiter') { log('LOITER → flight mode LOITER\n  ✓ mode changed'); hudR.textContent = air ? 'FLYING · LOITER' : 'ARMED · LOITER'; }
    else if (c === 'drop') log('DROP → MAV_CMD_DO_SET_SERVO (payload)\n  ' + (air ? '📦 payload released' : '(on the ground: servo moved)'));
    else if (c === 'cam') log('CAMERA → start capture\n  📷 recording');
  }));
  return () => {};
};

TOYS.mavpose = (el) => {
  const Q = {
    'Plot altitude and battery voltage': [['#d8462f', 'altitude (m)', (u) => u < 0.15 ? u / 0.15 : u < 0.8 ? 1 + Math.sin(u * 30) * 0.03 : Math.max(0, 1 - (u - 0.8) / 0.2)],
                                         ['#2f6c9f', 'battery (V)', (u) => 0.95 - u * 0.5 + Math.sin(u * 40) * 0.01]],
    'Show roll and pitch in the turns':  [['#d8462f', 'roll (°)', (u) => 0.5 + Math.sin(u * 18) * 0.35 * Math.sin(u * Math.PI)],
                                         ['#3d9a4c', 'pitch (°)', (u) => 0.5 + Math.sin(u * 11 + 1) * 0.18]],
    'When did GPS satellites drop?':     [['#7a4fc0', 'satellites', (u) => (u > 0.45 && u < 0.58 ? 0.35 : 0.85) + Math.sin(u * 50) * 0.02]],
  };
  el.innerHTML = `<p class="pc-sub">Pick a question about a flight log:</p>
    <div class="pc-choices">${Object.keys(Q).map((q, i) => `<button type="button" class="pc-btn" data-q="${i}">${esc(q)}</button>`).join('')}</div>
    <div class="pc-term" aria-live="polite">› waiting for a question…</div>
    <div class="pc-plot"><svg viewBox="0 0 320 130" role="img" aria-label="The chart MAVPose would draw for the chosen question"></svg></div>
    <p class="pc-sub">A scripted preview with made-up flight data; MAVPose itself works on your real log.</p>`;
  const term = el.querySelector('.pc-term'), svg = el.querySelector('svg');
  let timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const draw = (series) => {
    const N = 60, path = (f) => Array.from({ length: N + 1 }, (_, i) => `${i ? 'L' : 'M'}${(30 + i / N * 280).toFixed(1)} ${(106 - f(i / N) * 74).toFixed(1)}`).join(' ');
    svg.innerHTML = `<g font-family="ui-monospace, Menlo, monospace" font-size="8" fill="currentColor" opacity="0.75">
        <line x1="30" y1="110" x2="312" y2="110" stroke="currentColor" opacity="0.4"/><line x1="30" y1="10" x2="30" y2="110" stroke="currentColor" opacity="0.4"/>
        <text x="170" y="124" text-anchor="middle">time in flight</text></g>` +
      series.map(([c, name, f], k) => `<path d="${path(f)}" fill="none" stroke="${c}" stroke-width="2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" class="pc-line" style="transition-delay:${k * 0.2}s"/>
        <text x="${36 + k * 100}" y="14" font-size="8.5" font-family="ui-monospace, Menlo, monospace" fill="${c}">${esc(name)}</text>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => svg.querySelectorAll('.pc-line').forEach(p => p.style.strokeDashoffset = '0')));
  };
  el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    clear(); svg.innerHTML = '';
    el.querySelectorAll('[data-q]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    const q = Object.keys(Q)[+b.dataset.q];
    const lines = [`› "${q.toLowerCase()}"`, '  matched messages: GPS, BAT, ATT, CTUN', '  extracted 1,842 rows → telemetry.parquet', '  LLM wrote plot.py · running in sandbox…', '  ✓ plot.png saved'];
    term.textContent = '';
    lines.forEach((l, i) => timers.push(setTimeout(() => { term.textContent += (i ? '\n' : '') + l; if (i === lines.length - 1) draw(Q[q]); }, reduceMotion() ? 0 : i * 450)));
  }));
  return clear;
};

TOYS.ledger = (el) => {
  const A = {
    'who owes us the most?': 'Top overdue customers:\n1. ABC Traders · ₹15,200 · 45 days\n2. Shree Stores · ₹9,850 · 38 days\n3. Patel & Sons · ₹7,400 · 61 days',
    'total outstanding?': 'Total overdue (30+ days): ₹48,650 across 12 bills from 7 customers.',
    'anything over 60 days?': 'One bill: Patel & Sons, ₹7,400, 61 days overdue. Worth a call today.',
  };
  el.innerHTML = `<div class="pc-discord"><div class="pc-discord-bar"># collections-bot</div><div class="pc-dchat" aria-live="polite"></div></div>
    <div class="pc-choices">${Object.keys(A).map(q => `<button type="button" class="pc-btn" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <p class="pc-sub">Scripted with example data; the real bot answers from the synced Supabase table.</p>`;
  const chat = el.querySelector('.pc-dchat');
  let t = null;
  el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => {
    clearTimeout(t);
    const add = (who, text) => { const d = document.createElement('div'); d.className = 'pc-dmsg'; d.innerHTML = `<b>${who}</b>`; const p = document.createElement('p'); p.textContent = text; d.appendChild(p); chat.appendChild(d); chat.scrollTop = chat.scrollHeight; };
    add('you', '@tally-ai ' + b.dataset.q);
    t = setTimeout(() => add('Tally AI 🤖', A[b.dataset.q]), reduceMotion() ? 0 : 700);
  }));
  return () => clearTimeout(t);
};

TOYS.vortex = (el) => {
  const F = [
    ['area', 'Contour area', 0, 100, 40],
    ['aspect', 'Aspect ratio', 0, 100, 25],
    ['diff', 'Area difference', 0, 100, 30],
    ['moment', 'Moment centre offset', 0, 100, 20],
  ];
  el.innerHTML = `<p class="pc-sub">Shape a detected region and watch the three models vote. Round, compact, centred regions tend to be cores.</p>
    <div class="pc-vortex">
      <svg viewBox="-50 -50 100 100" class="pc-blob" role="img" aria-label="The detected region's shape"><ellipse class="pc-ell" cx="0" cy="0" rx="20" ry="20"/><circle class="pc-mc" cx="0" cy="0" r="2.5"/></svg>
      <div class="pc-sliders">${F.map(([k, n, a, b, v]) => `<label>${n}<input type="range" data-k="${k}" min="${a}" max="${b}" value="${v}"></label>`).join('')}</div>
    </div>
    <div class="pc-votes"></div>
    <p class="pc-read" aria-live="polite"></p>
    <p class="pc-sub">Illustrative thresholds, not the trained models; the paper's ensemble scored 97.56%.</p>`;
  const vals = {}; F.forEach(([k, , , , v]) => vals[k] = v);
  const ell = el.querySelector('.pc-ell'), mc = el.querySelector('.pc-mc');
  const update = () => {
    const r = 8 + vals.area * 0.32, asp = 1 + vals.aspect / 80;
    ell.setAttribute('rx', r * asp); ell.setAttribute('ry', r / asp);
    mc.setAttribute('cx', vals.moment * 0.3);
    const score = (wA, wS, wD, wM, cut) => (wA * (vals.area > 15 && vals.area < 85 ? 1 : 0) + wS * (1 - vals.aspect / 100) + wD * (1 - vals.diff / 100) + wM * (1 - vals.moment / 100)) > cut;
    const votes = [['Random Forest', score(1, 1.2, 1, 1, 2.6)], ['AdaBoost', score(0.8, 1.4, 0.9, 1.1, 2.7)], ['XGBoost', score(1.1, 1, 1.2, 0.9, 2.6)]];
    el.querySelector('.pc-votes').innerHTML = votes.map(([n, v]) => `<span class="pc-vote ${v ? 'is-yes' : 'is-no'}">${n}: ${v ? 'core' : 'not a core'}</span>`).join('');
    const yes = votes.filter(v => v[1]).length;
    el.querySelector('.pc-read').textContent = `${yes} of 3 vote core → ${yes >= 2 ? 'vortex core ✓' : 'not a core'}`;
  };
  el.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { vals[i.dataset.k] = +i.value; update(); }));
  update();
  return () => {};
};

TOYS.aws = (el) => {
  const RUNS = {
    a: { label: '3 workers · 125-row packages', workers: 3, pkg: 125, time: '3.00' },
    b: { label: '4 workers · 500-row packages', workers: 4, pkg: 500, time: '0.885' },
  };
  el.innerHTML = `<p class="pc-sub">Adding two 2000×2000 matrices on the cluster. Pick a run:</p>
    <div class="pc-choices"><button type="button" class="pc-btn" data-r="a">${RUNS.a.label}</button><button type="button" class="pc-btn" data-r="b">${RUNS.b.label}</button></div>
    <div class="pc-matrix" aria-hidden="true"></div>
    <div class="pc-legend"></div>
    <p class="pc-read" aria-live="polite">Each colour is one worker's share of the rows.</p>
    <p class="pc-sub">Times as reported in the project's report (units as given there).</p>`;
  const grid = el.querySelector('.pc-matrix'), legend = el.querySelector('.pc-legend');
  const COLORS = ['#e0a33a', '#3d9ad0', '#5cc38a', '#c46fd6'];
  let timers = [];
  const run = (key) => {
    timers.forEach(clearTimeout); timers = [];
    const R = RUNS[key], rows = 16, pkgRows = Math.max(1, Math.round(R.pkg / 125));
    el.querySelectorAll('[data-r]').forEach(b => b.setAttribute('aria-pressed', b.dataset.r === key ? 'true' : 'false'));
    grid.innerHTML = Array.from({ length: rows }, (_, i) => `<i data-row="${i}"></i>`).join('');
    legend.innerHTML = Array.from({ length: R.workers }, (_, w) => `<span><i style="background:${COLORS[w]}"></i>worker ${w + 1}</span>`).join('');
    el.querySelector('.pc-read').textContent = 'Splitting the rows into packages…';
    const cells = [...grid.children];
    let pkg = 0;
    for (let r = 0; r < rows; r += pkgRows, pkg++) {
      const w = pkg % R.workers;
      for (let k = r; k < Math.min(rows, r + pkgRows); k++) timers.push(setTimeout(() => { cells[k].style.background = COLORS[w]; }, reduceMotion() ? 0 : 120 + pkg * (key === 'a' ? 160 : 260)));
    }
    timers.push(setTimeout(() => { el.querySelector('.pc-read').textContent = `Gathered by the master · time ${R.time}`; }, reduceMotion() ? 0 : 120 + pkg * (key === 'a' ? 160 : 260) + 200));
  };
  el.querySelectorAll('[data-r]').forEach(b => b.addEventListener('click', () => run(b.dataset.r)));
  run('b');
  return () => timers.forEach(clearTimeout);
};

// ════════════════════════════════════════════════════════════════
// RENDER
// ════════════════════════════════════════════════════════════════
let stopToy = () => {}, storyTimer = null, tabs = [], current = null;

function storyHTML(steps) {
  return `<ol class="pc-story">${steps.map(([i, t, s]) => `<li class="pc-step"><span class="pc-step-ico" aria-hidden="true">${i}</span><b>${esc(t)}</b><span>${esc(s)}</span></li>`).join('')}</ol>`;
}
function playStory(root) {
  clearInterval(storyTimer);
  const cells = [...root.querySelectorAll('.pc-step')];
  cells.forEach(c => c.classList.remove('is-on'));
  if (reduceMotion()) { cells.forEach(c => c.classList.add('is-on')); return; }
  let k = 0;
  storyTimer = setInterval(() => {
    cells.forEach((c, j) => c.classList.toggle('is-on', j === k));
    if (++k > cells.length) { clearInterval(storyTimer); cells.forEach(c => c.classList.add('is-on')); }
  }, 900);
}

function select(i, focus = false) {
  if (!tabs.length) return;
  i = (i + tabs.length) % tabs.length;
  tabs.forEach((t, j) => {
    const on = j === i;
    t.setAttribute('aria-selected', on ? 'true' : 'false');
    t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
  if (focus) tabs[i].focus();
  const panel = document.getElementById(tabs[i].getAttribute('aria-controls'));
  // the toy starts when its tab is first opened, and stops on close
  if (panel.dataset.toy && !panel.dataset.started) {
    panel.dataset.started = '1';
    stopToy = TOYS[panel.dataset.toy](panel.querySelector('.pc-toy')) || (() => {});
  }
  if (panel.dataset.story) playStory(panel);
}

export const ProjectCards = {
  has: (id) => !!CARDS[id],
  /** The extra footer links a card brings (live site, paper). */
  links: (id) => {
    const c = CARDS[id] || {};
    const out = [];
    if (c.live) out.push({ label: c.liveLabel || 'Open the live site', href: c.live, cls: 'btn-demo' });
    if (c.paper) out.push({ label: 'Read the paper', href: c.paper, cls: 'btn-demo' });
    return out;
  },
  /**
   * Fill `el` with the card for project `id`. `p` is the project's entry in
   * index.html (why, stack, badges…).
   */
  render(id, el, p) {
    this.stop();
    const c = CARDS[id];
    const uid = 'pc-' + id;
    const panels = [
      ['what', 'What it does', `${storyHTML(c.story)}<p class="pc-why" id="${uid}-why">${esc(p.why)}</p>`, { story: 1 }],
      c.toy ? ['try', 'Try it', `<div class="pc-toy"></div><p class="pc-sub pc-scripted">A scripted preview that runs in your browser.</p>`, { toy: c.toy }] : null,
      ['res', 'Results', `<div class="pc-tiles">${c.results.map(([b, s]) => `<div class="pc-tile"><b>${esc(b)}</b><span>${esc(s)}</span></div>`).join('')}</div>` +
        (c.compare ? `<div class="pc-compare" role="img" aria-label="${esc(c.compare.title)}: ${c.compare.rows.map(r => `${r[0]} ${r[1]}`).join(', ')}">${c.compare.rows.map(([n, v], k) => `<div class="pc-crow"><span>${esc(n)}</span><i style="width:${v * 100}%" class="${k ? 'is-ref' : ''}"></i><em>${v.toFixed(3)}</em></div>`).join('')}<p class="pc-sub">${esc(c.compare.title)}</p></div>` : '') +
        `<p class="pc-sub">${esc(c.resultsNote)}${c.paper ? ` <a href="${c.paper}" target="_blank" rel="noopener">Read the paper ↗</a>` : ''}</p>`, {}],
      ['hood', 'Under the hood', `<div class="pc-flow" aria-label="How the parts connect">${c.flow.map(f => `<span>${esc(f)}</span>`).join('<i aria-hidden="true">→</i>')}</div>
        <div class="modal-stack pc-stack">${p.stack.map(s => `<span class="modal-chip">${esc(s)}</span>`).join('')}</div>`, {}],
    ].filter(Boolean);

    el.innerHTML = `<p class="pc-oneliner" id="${uid}-one">${esc(c.oneLiner)}</p>
      <div class="pc-tabs" role="tablist" aria-label="About this project">${panels.map(([k, label], i) => `<button type="button" role="tab" class="pc-tab" id="${uid}-t-${k}" aria-controls="${uid}-p-${k}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}</div>
      ${panels.map(([k, , body, data]) => `<div class="pc-panel" role="tabpanel" id="${uid}-p-${k}" aria-labelledby="${uid}-t-${k}" tabindex="0" ${data.toy ? `data-toy="${data.toy}"` : ''} ${data.story ? 'data-story="1"' : ''} hidden>${body}</div>`).join('')}`;
    tabs = [...el.querySelectorAll('[role="tab"]')];
    current = el;
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(i));
      t.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); select(i + (e.key === 'ArrowRight' ? 1 : -1), true); }
        if (e.key === 'Home') { e.preventDefault(); select(0, true); }
        if (e.key === 'End') { e.preventDefault(); select(tabs.length - 1, true); }
      });
    });
    select(0);
    return `${uid}-one`;
  },
  /** Next / previous tab (gamepad bumpers). */
  step(d) {
    if (!tabs.length || !current || !document.contains(current)) return;
    const i = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    select(i + d, true);
  },
  stop() {
    clearInterval(storyTimer);
    try { stopToy(); } catch (e) { /* ignore */ }
    stopToy = () => {}; tabs = []; current = null;
  },
};

// ←/→ switch tabs from anywhere in the open card, unless focus is on a tab
// (which handles its own keys) or a control that uses arrows (sliders, inputs).
document.addEventListener('keydown', (e) => {
  if ((e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (!current || !document.contains(current) || current.hidden) return;
  const t = e.target;
  if (t && t.closest && t.closest('[role="tab"], input, textarea, select, [contenteditable="true"]')) return;
  e.preventDefault();
  ProjectCards.step(e.key === 'ArrowRight' ? 1 : -1);
});

window.ProjectCards = ProjectCards;
