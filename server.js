// server.js (CommonJS)
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_PATH = path.join(__dirname, 'data', 'teams.json');
//const PUBLIC_PATH = path.join(__dirname, 'public');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session middleware
app.use(session({
  name: 'match.sid',
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 4 } // 4 hours
}));

// Serve static frontend
//app.use(express.static(PUBLIC_PATH));
app.use(express.static(__dirname));

// --- Helpers ---
function readTeams() {
  if (!fs.existsSync(DATA_PATH)) return {};
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

function writeTeams(obj) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(403).json({ message: 'Admin only' });
}

// --- In-memory storage for generated matches ---
let lastGeneratedMatches = [];

// --- Public routes ---
app.get('/api/teams', (req, res) => {
  try { res.json(readTeams()); }
  catch { res.status(500).json({ error: 'Failed to read teams' }); }
});

app.get('/api/matches', (req, res) => {
  res.json(lastGeneratedMatches);
});

// Return cup competition based on last generated matches
app.get('/cup', (req, res) => {
  if (!lastGeneratedMatches.length) return res.status(400).json({ error: 'No matches generated yet' });

  const buildCupBracket = (firstRoundMatches) => {
    const bracket = [];
    let currentRound = firstRoundMatches.map(m => ({
      home: m.home,
      away: m.away,
      winner: m.prediction.result,
      confidence: m.prediction.confidence
    }));

    bracket.push({ name: 'SEMIFINAL', matches: currentRound });

    let roundIndex = 0;
    let roundNames = ['FINAL'];

    while (currentRound.length > 1) {
      const nextRound = [];
      for (let i = 0; i < currentRound.length; i += 2) {
        const team1 = currentRound[i].winner;
        const team2 = currentRound[i+1] ? currentRound[i+1].winner : null;
        const winner = team2 ? (Math.random() > 0.5 ? team1 : team2) : team1;
        const confidence = team2 ? Math.floor(Math.random() * 21) + 80 : 100;
        nextRound.push({ home: team1, away: team2, winner, confidence });
      }
      const roundName = roundNames[roundIndex] || `ROUND ${roundIndex+2}`;
      bracket.push({ name: roundName, matches: nextRound });
      currentRound = nextRound;
      roundIndex++;
    }

    return { bracket, winner: currentRound[0].winner };
  };

  res.json(buildCupBracket(lastGeneratedMatches));
});

// Return league competition based on last generated matches
app.get('/league', (req, res) => {
  if (!lastGeneratedMatches.length) return res.status(400).json({ error: 'No matches generated yet' });

  const runLeague = (matches) => {
    const table = {};
    matches.forEach(m => {
      [m.home, m.away].forEach(t => { 
        if (t && t !== 'Bye') table[t] = table[t] || { points:0, wins:0, draws:0, losses:0 }; 
      });
      if (!m.away || m.away === 'Bye') { table[m.home].points += 3; table[m.home].wins++; return; }
      const r = Math.random();
      if (r < 0.45) { table[m.home].points += 3; table[m.home].wins++; table[m.away].losses++; }
      else if (r < 0.9) { table[m.away].points += 3; table[m.away].wins++; table[m.home].losses++; }
      else { table[m.home].points++; table[m.away].points++; table[m.home].draws++; table[m.away].draws++; }
    });
    return Object.entries(table)
      .sort((a,b)=>b[1].points - a[1].points)
      .map(([name,s])=>({ name, ...s }));
  };

  res.json(runLeague(lastGeneratedMatches));
});

// Check admin status
app.get('/api/auth', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

// --- Admin routes ---
app.post('/api/teams', requireAdmin, (req, res) => {
  try { writeTeams(req.body); res.json({ message:'Teams saved' }); }
  catch { res.status(500).json({ error:'Failed to save teams' }); }
});

app.post('/api/generate', requireAdmin, (req, res) => {
  const teamsObj = readTeams();
  const teamNames = Object.keys(teamsObj);
  const shuffled = teamNames.sort(() => Math.random() - 0.5);
  if (shuffled.length % 2 !== 0) shuffled.push('Bye');

  lastGeneratedMatches = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    const match = { home: shuffled[i], away: shuffled[i+1] };
    match.prediction = { 
      result: Math.random() > 0.5 ? shuffled[i] : shuffled[i+1], 
      confidence: Math.floor(Math.random() * 21) + 80 
    };
    lastGeneratedMatches.push(match);
  }

  res.json({ matches: lastGeneratedMatches });
});

// Admin login/logout
app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';
  if (password === ADMIN_PASSWORD) { req.session.isAdmin = true; return res.json({ ok:true, message:'Logged in' }); }
  return res.status(401).json({ ok:false, message:'Invalid password' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => { 
    if(err) return res.status(500).json({ error:'Failed to log out' }); 
    res.clearCookie('match.sid'); 
    res.json({ ok:true }); 
  });
});

// SPA fallback
app.use((req,res)=> res.sendFile(path.join(PUBLIC_PATH,'index.html')));

app.listen(PORT, ()=>console.log(`Server running: http://localhost:${PORT}`));
