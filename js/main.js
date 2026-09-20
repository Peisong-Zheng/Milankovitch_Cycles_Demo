// Entry point: load data, assemble orbit scene / right-pane views / charts / player,
// own the shared year-phase clock, start the render loop
import { loadOrbitalData } from './data.js';
import { OrbitScene } from './scene.js';
import { EarthView } from './earthview.js';
import { SummerView } from './summerview.js';
import { SolsticeView, drawSolsticeDiagram } from './solsticeview.js';
import { TimeChart } from './charts.js';
import { Player } from './player.js';
import { solsticeAnomaly } from './insolation.js';

const $ = (id) => document.getElementById(id);

const REV_SECONDS = 30; // decorative duration of one Earth revolution (year)
const TWO_PI = Math.PI * 2;

function fmtTime(t) {
  return (t < 0 ? '−' : '+') + Math.abs(t).toFixed(1) + ' kyr';
}

async function boot() {
  const data = await loadOrbitalData('orb_data');
  $('loading').style.display = 'none';

  const scene = new OrbitScene($('scene'), data);
  const earth = new EarthView($('earth'), data);   // precession view
  const summer = new SummerView($('summer'), $('summerChart'), data);
  const solstice = new SolsticeView($('solsticeAnim'), data); // solstice-drift view
  drawSolsticeDiagram($('diagram1'));

  const charts = [
    new TimeChart($('chartEcc'), {
      title: 'Eccentricity (~100 kyr)',
      color: '#38bdf8',
      getValues: (d) => d.ecc,
      fmt: (v) => v.toFixed(5),
    }),
    new TimeChart($('chartObl'), {
      title: 'Obliquity (~41 kyr)',
      color: '#fbbf24',
      getValues: (d) => d.oblDeg,
      fmt: (v) => v.toFixed(3) + '°',
    }),
    new TimeChart($('chartPre'), {
      title: 'Climatic precession (~21 kyr)',
      color: '#a78bfa',
      getValues: (d) => d.pre,
      fmt: (v) => (v >= 0 ? '+' : '') + v.toFixed(5),
      zeroLine: true,
      showXAxis: true,
    }),
  ];

  const player = new Player();
  const slider = $('slider');
  const playBtn = $('playBtn');
  const timeLabel = $('timeLabel');
  const hud = {
    time: $('hudTime'), ecc: $('hudEcc'), obl: $('hudObl'), pre: $('hudPre'),
    summer: $('hudSummer'),
  };

  // year phase (true anomaly) driving the orbit scene's decorative revolution
  let anomaly = Math.PI * 0.7;

  // Dragging the slider stops autoplay and jumps to that moment
  let scrubbing = false;
  slider.addEventListener('pointerdown', () => { scrubbing = true; });
  window.addEventListener('pointerup', () => { scrubbing = false; });
  window.addEventListener('pointercancel', () => { scrubbing = false; });
  slider.addEventListener('input', () => {
    player.seek(parseFloat(slider.value));
    scene.resetTrail(anomaly);
    syncPlayBtn();
  });
  playBtn.addEventListener('click', () => {
    player.toggle();
    syncPlayBtn();
  });

  // right pane view switch: PRECESSION (axial precession under locked
  // sunlight) vs NH SUMMER (side view: solstice Sun–Earth distance + the
  // scrolling 65°N insolation strip)
  const viewToggle = $('viewToggle');
  let activeView = 'precession';
  function setView(name) {
    activeView = name;
    $('earth').style.display = name === 'precession' ? '' : 'none';
    $('summerWrap').style.display = name === 'summer' ? '' : 'none';
    viewToggle.textContent = name === 'precession' ? 'View: Precession' : 'View: NH summer';
    viewToggle.title = name === 'precession'
      ? 'Axial precession under locked sunlight — click for the NH summer distance view'
      : 'NH-summer Sun–Earth distance and 65°N insolation — click for the precession view';
    // canvases were 0-sized while hidden; force a resize on the incoming view
    if (name === 'precession') earth._resize();
    else summer._resize();
  }
  viewToggle.addEventListener('click', () =>
    setView(activeView === 'precession' ? 'summer' : 'precession'));
  setView(new URLSearchParams(location.search).get('view') === 'summer' ? 'summer' : 'precession');

  // left pane view switch: ORBIT (full scene) vs SOLSTICE DRIFT (didactic
  // scroll panel); the HUD and legend belong to the orbit view
  const orbitToggle = $('orbitViewToggle');
  let activeOrbitView = 'orbit';
  function setOrbitView(name) {
    activeOrbitView = name;
    const isOrbit = name === 'orbit';
    $('scene').style.display = isOrbit ? '' : 'none';
    $('solsticeWrap').style.display = isOrbit ? 'none' : '';
    $('hud').style.display = isOrbit ? '' : 'none';
    $('legend').style.display = isOrbit ? '' : 'none';
    $('eccNote').style.display = isOrbit ? '' : 'none';
    orbitToggle.textContent = isOrbit ? 'View: Orbit' : 'View: Solstice drift';
    orbitToggle.title = isOrbit
      ? 'Full orbit scene — click for the solstice-drift view'
      : 'June-solstice drift along the orbit — click for the orbit view';
    // canvases were 0-sized while hidden; force a resize on the incoming view
    if (isOrbit) {
      scene._resize();
      // the year-phase clock kept advancing while the solstice panel was shown,
      // so the orbit trail's history is stale — collapse it (same as a scrub)
      scene.resetTrail(anomaly);
    } else solstice._resize();
  }
  orbitToggle.addEventListener('click', () =>
    setOrbitView(activeOrbitView === 'orbit' ? 'solstice' : 'orbit'));
  setOrbitView('orbit');

  // about sidebar: hamburger / close button / overlay / Esc
  const sidebar = $('sidebar');
  const overlay = $('overlay');
  const menuBtn = $('menuBtn');
  function setSidebar(open) {
    sidebar.classList.toggle('open', open);
    overlay.classList.toggle('open', open);
    sidebar.setAttribute('aria-hidden', String(!open));
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', () => setSidebar(true));
  $('sidebarClose').addEventListener('click', () => setSidebar(false));
  overlay.addEventListener('click', () => setSidebar(false));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSidebar(false); });

  function syncPlayBtn() {
    playBtn.textContent = player.playing ? '⏸' : '▶';
    playBtn.title = player.playing ? 'Pause' : 'Play';
  }

  let last = performance.now();
  let lastIdx = -1;

  function frame(now) {
    // clamp tab-switch jumps above and negative first-frame timestamps below
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;

    player.update(dt);
    if (player.playing) anomaly = (anomaly + (dt * TWO_PI) / REV_SECONDS) % TWO_PI;
    const idx = data.indexAt(player.t);

    if (activeOrbitView === 'orbit') scene.update(idx, anomaly, dt, player.playing);
    else solstice.update(idx);
    if (activeView === 'precession') earth.update(idx);
    else summer.update(idx);

    // charts redraw only when the index changed or a resize cleared the canvas
    for (const c of charts) {
      if (idx !== lastIdx || c.dirty) {
        c.draw(data, idx);
        c.dirty = false;
      }
    }

    if (!scrubbing) slider.value = String(player.t);
    timeLabel.textContent = fmtTime(player.t);

    if (idx !== lastIdx) {
      hud.time.textContent = fmtTime(player.t);
      hud.ecc.textContent = data.ecc[idx].toFixed(5);
      hud.obl.textContent = data.oblDeg[idx].toFixed(3) + '°';
      hud.pre.textContent = (data.pre[idx] >= 0 ? '+' : '') + data.pre[idx].toFixed(5);

      // where NH summer solstice falls on the orbit (true anomaly relative
      // to perihelion)
      const thSol = solsticeAnomaly(data.pi[idx]);
      const solDeg = ((thSol * 180 / Math.PI) % 360 + 360) % 360;
      hud.summer.textContent = solDeg.toFixed(0) + '° past perihelion';

      lastIdx = idx;
    }

    requestAnimationFrame(frame);
  }

  syncPlayBtn();
  requestAnimationFrame(frame);

  // debug / test handle
  window.__app = { player, scene, earth, summer, solstice, data };
}

boot().catch((err) => {
  console.error(err);
  const el = $('loading');
  el.classList.add('error');
  el.innerHTML =
    'Failed to load data: ' + err.message +
    '<br>Please open this page via a local server. In the project root run:<br>' +
    '<code>python3 -m http.server 8000</code> then visit <code>http://localhost:8000</code>';
});
