// ---------- helper functions ----------
async function getJSON(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function requestJSON(method, url, body) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function el(tag, props = {}, ...children) {
  const e = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e[k] = v;
  });
  children.forEach(c => {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  });
  return e;
}

// ---------- global state ----------
let currentTeams = {};
let isAdmin = false;

// ---------- AUTH ELEMENTS ----------
const adminPasswordInput = document.getElementById('adminPassword');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const loginStatus = document.getElementById('loginStatus');

// Buttons
const refreshTeamsBtn = document.getElementById('refreshTeams');
const generateBtn = document.getElementById('generate');
const saveTeamsBtn = document.getElementById('saveTeams');

// Containers
const teamsContainer = document.getElementById('teams');
const matchesContainer = document.getElementById('matches');
const cupResults = document.getElementById("cupResults");
const leagueResults = document.getElementById("leagueResults");

// ---------- TEAM MANAGEMENT ----------
async function loadTeams() {
  try {
    currentTeams = await getJSON('/api/teams');
    renderTeams();
    setTeamsEditable(isAdmin);
  } catch (err) {
    console.error('Failed to load teams:', err);
  }
}

function renderTeams() {
  teamsContainer.innerHTML = '';
  Object.entries(currentTeams).forEach(([teamName, players]) => {
    const teamDiv = el('div', { className: 'team' });
    const h = el('h3', {}, teamName);
    const addBtn = el('button', { onclick: () => addPlayerRow(teamName), className: 'add-player' }, 'Add player');
    teamDiv.append(h, addBtn);

    const playersContainer = el('div', { className: 'players' });
    players.forEach(p => playersContainer.appendChild(makePlayerRow(teamName, p)));
    teamDiv.appendChild(playersContainer);
    teamsContainer.appendChild(teamDiv);
  });
}

function makePlayerRow(teamName, player) {
  const row = document.createElement('div');
  row.className = 'player-row';

  const name = document.createElement('input');
  name.value = player.name || '';
  name.className = 'p-name';

  const pos = document.createElement('select');
  pos.className = 'p-position';
  ['Forward', 'Midfielder', 'Defender', 'Goalkeeper'].forEach(opt => {
    const o = document.createElement('option');
    o.value = o.text = opt;
    if (opt === player.position) o.selected = true;
    pos.appendChild(o);
  });

  const rating = document.createElement('input');
  rating.type = 'number';
  rating.className = 'p-rating';
  rating.value = player.rating || 75;
  rating.min = 0;
  rating.max = 100;

  const remove = document.createElement('button');
  remove.textContent = '−';
  remove.className = 'remove-player';
  remove.onclick = () => removePlayer(teamName, row);

  row.append(name, pos, rating, remove);
  return row;
}

function addPlayerRow(teamName) {
  const teamDiv = Array.from(document.getElementsByClassName('team'))
    .find(td => td.querySelector('h3').textContent === teamName);
  const playersContainer = teamDiv.querySelector('.players');
  playersContainer.appendChild(makePlayerRow(teamName, {}));
}

function removePlayer(teamName, row) {
  row.remove();
}

function gatherTeamsFromUI() {
  const teamDivs = Array.from(document.getElementsByClassName('team'));
  const teamsToSave = {};
  teamDivs.forEach(td => {
    const teamName = td.querySelector('h3').textContent;
    const players = Array.from(td.querySelectorAll('.player-row')).map(row => ({
      name: row.querySelector('.p-name').value,
      position: row.querySelector('.p-position').value,
      rating: parseInt(row.querySelector('.p-rating').value, 10) || 75
    }));
    teamsToSave[teamName] = players;
  });
  return teamsToSave;
}

function setTeamsEditable(enable) {
  const inputs = teamsContainer.querySelectorAll('input, select, button.remove-player, button.add-player');
  inputs.forEach(el => {
    el.disabled = !enable;
    if (enable) el.classList.remove('disabled');
    else el.classList.add('disabled');
  });
}

// ---------- AUTH SYSTEM ----------
async function initAuth() {
  try {
    const auth = await getJSON('/api/auth');
    isAdmin = !!auth.isAdmin;
  } catch (err) {
    console.warn('Auth check failed', err);
    isAdmin = false;
  }
  applyAuthToUI();
  await loadTeams();
}

function applyAuthToUI() {
  generateBtn.style.display = isAdmin ? 'inline-block' : 'none';
  saveTeamsBtn.style.display = isAdmin ? 'inline-block' : 'none';
  logoutBtn.style.display = isAdmin ? 'inline-block' : 'none';
  loginBtn.style.display = isAdmin ? 'none' : 'inline-block';
  adminPasswordInput.style.display = isAdmin ? 'none' : 'inline-block';
  setTeamsEditable(isAdmin);
}

loginBtn.addEventListener('click', async () => {
  const pw = adminPasswordInput.value.trim();
  if (!pw) return alert('Enter password');
  try {
    await requestJSON('POST', '/api/login', { password: pw });
    isAdmin = true;
    loginStatus.textContent = 'Access granted';
    adminPasswordInput.value = '';
    applyAuthToUI();
  } catch (err) {
    console.error(err);
    loginStatus.textContent = 'Invalid password';
  }
});

logoutBtn.addEventListener('click', async () => {
  try {
    await requestJSON('POST', '/api/logout');
  } catch {}
  isAdmin = false;
  applyAuthToUI();
});

// ---------- BUTTON EVENTS ----------
refreshTeamsBtn.addEventListener('click', () => loadTeams());

generateBtn.addEventListener('click', async () => {
  if (!isAdmin) return alert('Admin only');
  try {
    const res = await requestJSON('POST', '/api/generate', {});
    // Add random prediction/confidence for each match
    const matchesWithPrediction = res.matches.map(m => {
      const winner = Math.random() > 0.5 ? m.home : m.away;
      const confidence = Math.floor(Math.random() * 51) + 50; // 50% to 100%
      return { ...m, prediction: { winner, confidence } };
    });
    renderMatches(matchesWithPrediction);
  } catch (err) {
    console.error(err);
    alert('Failed to generate matches');
  }
});

saveTeamsBtn.addEventListener('click', async () => {
  if (!isAdmin) return alert('Admin only');
  const teamsToSave = gatherTeamsFromUI();
  try {
    const data = await requestJSON('POST', '/api/teams', teamsToSave);
    alert(data.message || 'Teams saved!');
    await loadTeams();
  } catch (err) {
    console.error(err);
    alert('Failed to save teams');
  }
});

// ---------- MATCH DISPLAY ----------
function renderMatches(matches) {
  matchesContainer.innerHTML = '';
  matches.forEach(m => {
    const div = document.createElement('div');
    if (m.away) {
      div.textContent = `${m.home} vs ${m.away} → Predicted Winner: ${m.prediction.winner} (${m.prediction.confidence}%)`;
    } else {
      div.textContent = `${m.home} advances automatically`;
    }
    matchesContainer.appendChild(div);
  });
}

// ---------- COMPETITION FEATURES ----------
document.getElementById('cupBtn').addEventListener('click', async () => {
  try {
    const data = await getJSON('/cup');
    cupResults.innerHTML = '';
    data.bracket.forEach((r, i) => {
      const roundLi = el('li', {}, `Round ${i + 1}:`);
      const matchUl = el('ul');
      r.matches.forEach(m => {
        const confidence = Math.floor(Math.random() * 51) + 50;
        const matchText = m.away
          ? `${m.home} vs ${m.away} → Winner: ${m.winner} (${confidence}%)`
          : `${m.home} advances automatically`;
        matchUl.appendChild(el('li', {}, matchText));
      });
      roundLi.appendChild(matchUl);
      cupResults.appendChild(roundLi);
    });
    cupResults.appendChild(el('li', {}, `🏆 Winner: ${data.winner}`));
  } catch (err) {
    console.error(err);
    alert("Failed to load cup competition");
  }
});

document.getElementById('leagueBtn').addEventListener('click', async () => {
  try {
    const data = await getJSON('/league');
    leagueResults.innerHTML = '';
    data.forEach((team, i) => {
      let medal = '';
      if (i === 0) medal = '🥇';
      else if (i === 1) medal = '🥈';
      else if (i === 2) medal = '🥉';
      leagueResults.appendChild(
        el('li', {},
          `${medal} ${team.name} - ${team.points} pts (W:${team.wins}, D:${team.draws}, L:${team.losses})`
        )
      );
    });
  } catch (err) {
    console.error(err);
    alert("Failed to load league competition");
  }
});

// ---------- INIT ----------
window.addEventListener('DOMContentLoaded', initAuth);
