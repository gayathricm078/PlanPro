// PlanPro - script.js (single calendar + upcoming; no duplicates)

// ---- Safe DOM helpers ----
function $(id){ return document.getElementById(id); }

const app = $('app') || document.body;
const usernameInput = $('usernameInput');
const signinBtn = $('signinBtn');
const authArea = $('authArea');
const taskControls = $('taskControls');
const welcomeMsg = $('welcomeMsg');
const avatar = $('avatar');
const userNameLarge = $('userNameLarge');
const logoutBtn = $('logoutBtn');

const taskTitle = $('taskTitle');
const taskNote = $('taskNote');
const taskCategory = $('taskCategory');
const taskDate = $('taskDate');
const taskPriority = $('taskPriority');
const addTaskBtn = $('addTaskBtn');
const clearDoneBtn = $('clearDoneBtn');
const taskList = $('taskList');

const journalTxt = $('journalTxt');
const saveJournal = $('saveJournal');
const clearJournal = $('clearJournal');

const progressLabel = $('progressLabel');
const themeToggle = $('themeToggle');
const themeLabel = $('themeLabel');

const quoteEl = $('quote');
const newQuote = $('newQuote');
const copyQuoteBtn = $('copyQuoteBtn');

const backupBtn = $('backupBtn');
const restoreBtn = $('restoreBtn');
const restoreInput = $('restoreInput');

const chartCanvas = $('progressChart');

const calendarEl = $('calendar');         // must exist in HTML
const upcomingList = $('upcomingList');   // must exist in HTML

// ---- Utilities & storage helpers ----
function safeJSONParse(s, fallback){ try { return JSON.parse(s); } catch(e){ return fallback; } }
function isQuotaExceeded(e){
  return e && (e.name==='QuotaExceededError' || e.name==='NS_ERROR_DOM_QUOTA_REACHED' || e.code===22);
}
function userKey(name){ return 'planpro_user_' + name; }
function globalThemeKey(){ return 'planpro_theme'; }

function saveUserData(name, data){
  try{
    localStorage.setItem(userKey(name), JSON.stringify(data));
    return true;
  }catch(e){
    if(isQuotaExceeded(e)){
      alert('Unable to save: local storage quota exceeded.');
    }else{
      console.error('saveUserData error', e);
      alert('Error saving data.');
    }
    return false;
  }
}

function loadUserData(name){
  try{
    const raw = localStorage.getItem(userKey(name));
    if(!raw) return {tasks:[], journal:'', theme:'light'};
    const parsed = safeJSONParse(raw, null) || {tasks:[], journal:'', theme:'light'};
    parsed.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    parsed.journal = typeof parsed.journal === 'string' ? parsed.journal : '';
    parsed.theme = parsed.theme === 'dark' ? 'dark' : 'light';
    return parsed;
  }catch(e){
    console.error('loadUserData error', e);
    return {tasks:[], journal:'', theme:'light'};
  }
}

// ---- Global state ----
let currentUser = localStorage.getItem('planpro_current') || null;
let progressChart = null;
let selectedDate = null;

// ---- Chart ----
function createOrUpdateChart(done, pending){
  if(!chartCanvas) return;
  if(progressChart && typeof progressChart.destroy === 'function') progressChart.destroy();
  const ctx = chartCanvas.getContext ? chartCanvas.getContext('2d') : null;
  if(!ctx) return;
  progressChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: ['Done','Pending'], datasets: [{ data: [done, pending], borderWidth: 0 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
  });
}

// ---- Quotes ----
const quotes = [
  "Small steps every day lead to big results.",
  "Focus on progress, not perfection.",
  "Do something today that your future self will thank you for.",
  "Stay consistent — momentum compounds.",
  "Break big tasks into tiny tasks and start.",
  "Your future is created by what you do today, not tomorrow.",
  "Progress is better than perfection."
];
function randomQuote(){ return quotes[Math.floor(Math.random()*quotes.length)]; }
function renderQuote(){ if(quoteEl) quoteEl.textContent = randomQuote(); }

// ---- Helpers ----
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
function emojiFor(cat){ switch(cat){ case 'study': return '📚'; case 'work': return '💼'; case 'personal': return '💖'; case 'health': return '🏃'; default: return '✨'; } }
function formatDate(d){ return d.toISOString().split('T')[0]; }

// ---- Auth ----
if(currentUser) try { signin(currentUser, true); } catch(e){ console.warn('signin failed', e); }

signinBtn && signinBtn.addEventListener('click', ()=>{
  const name = (usernameInput && usernameInput.value || '').trim();
  if(!name) return alert('Type a username');
  signin(name);
});
usernameInput && usernameInput.addEventListener('keydown', e=>{ if(e.key==='Enter') signinBtn.click(); });

logoutBtn && logoutBtn.addEventListener('click', ()=>{
  localStorage.removeItem('planpro_current');
  currentUser = null;
  authArea && authArea.classList.remove('hidden');
  taskControls && taskControls.classList.add('hidden');
  logoutBtn.style.display = 'none';
  welcomeMsg.textContent = 'Not signed in';
  avatar.textContent = 'G';
  userNameLarge.textContent = 'Guest';
  const savedTheme = localStorage.getItem(globalThemeKey());
  app.setAttribute('data-theme', savedTheme || 'light');
  themeLabel.textContent = app.getAttribute('data-theme') === 'dark' ? 'Dark' : 'Light';
});

// ---- Signin ----
function signin(name, silent=false){
  try{
    currentUser = name;
    localStorage.setItem('planpro_current', name);
    const data = loadUserData(name);
    if(!localStorage.getItem(userKey(name))) saveUserData(name, data);
    welcomeMsg.textContent = 'Hi, ' + name;
    avatar.textContent = name[0] ? name[0].toUpperCase() : 'G';
    userNameLarge.textContent = name;
    authArea && authArea.classList.add('hidden');
    taskControls && taskControls.classList.remove('hidden');
    logoutBtn.style.display = 'inline-block';
    const theme = data.theme || localStorage.getItem(globalThemeKey()) || 'light';
    app.setAttribute('data-theme', theme);
    themeLabel.textContent = theme === 'dark' ? 'Dark' : 'Light';
    renderAll();
  }catch(e){
    console.error('signin error', e);
    if(!silent) alert('Signin failed');
  }
}

// ---- Tasks: add / clear done ----
addTaskBtn && addTaskBtn.addEventListener('click', ()=>{
  if(!currentUser) return alert('Sign in first');
  const title = (taskTitle.value || '').trim(); if(!title) return alert('Add a title');
  const cat = taskCategory.value || 'other';
  const note = taskNote.value || '';
  const date = taskDate.value || null;
  const pr = taskPriority.value || 'medium';
  const d = loadUserData(currentUser);
  if(d.tasks.length > 2000 && !confirm('You have many tasks, continue?')) return;
  d.tasks.push({ id: Date.now() + Math.floor(Math.random()*1000), title, cat, note, date, priority: pr, done: false });
  if(!saveUserData(currentUser, d)) return;
  taskTitle.value = ''; taskNote.value = ''; taskDate.value = ''; taskPriority.value = 'medium';
  renderAll();
});

clearDoneBtn && clearDoneBtn.addEventListener('click', ()=>{
  if(!currentUser) return alert('Sign in first');
  if(!confirm('Remove all completed tasks?')) return;
  const d = loadUserData(currentUser);
  d.tasks = d.tasks.filter(t => !t.done);
  saveUserData(currentUser, d);
  renderAll();
});

// ---- Render tasks (with event wiring) ----
function renderTasks(listEl = taskList, filterDate = null){
  if(!listEl || !currentUser) return;
  const d = loadUserData(currentUser);
  listEl.innerHTML = '';
  const filteredTasks = filterDate ? d.tasks.filter(t => t.date === filterDate) : d.tasks;
  if(!filteredTasks.length){ listEl.innerHTML = '<div class="muted">No tasks yet!</div>'; return; }

  filteredTasks.sort((a,b)=>{
    if(a.done !== b.done) return a.done ? 1 : -1;
    if(a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    const prio = { high: 0, medium: 1, low: 2 };
    return (prio[a.priority]||2) - (prio[b.priority]||2);
  }).forEach(t=>{
    const el = document.createElement('div');
    el.className = 'task-item' + (t.done ? ' done' : '');
    el.dataset.id = t.id;
    el.innerHTML = `
      <label style="display:flex;align-items:flex-start;gap:0.6rem">
        <input type='checkbox' class='task-check' ${t.done ? 'checked' : ''}/>
        <div style="flex:1">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <h4 style="margin:0;font-size:1rem">${emojiFor(t.cat)} ${escapeHtml(t.title)}</h4>
            <div style="font-size:0.9rem;color:#6b7280">${t.priority ? (t.priority[0].toUpperCase()+t.priority.slice(1)) : ''}</div>
          </div>
          <div class='small' style="margin-top:6px;color:#6b7280">${t.date ? 'Due ' + t.date + ' • ' : ''}${escapeHtml(t.note || '')}</div>
        </div>
      </label>
      <div style="margin-top:8px;display:flex;gap:6px;justify-content:flex-end">
        <button class='btn small btn-edit'>Edit</button>
        <button class='btn small btn-del'>Delete</button>
      </div>
    `;
    listEl.appendChild(el);
  });

  // Events
  listEl.querySelectorAll('.task-check').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const id = Number(cb.closest('.task-item').dataset.id);
      const d = loadUserData(currentUser);
      const t = d.tasks.find(x => x.id === id);
      if(t) t.done = cb.checked;
      saveUserData(currentUser, d);
      renderAll();
    });
  });
  listEl.querySelectorAll('.btn-del').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = Number(b.closest('.task-item').dataset.id);
      if(!confirm('Delete this task?')) return;
      const d = loadUserData(currentUser);
      d.tasks = d.tasks.filter(x => x.id !== id);
      saveUserData(currentUser, d);
      renderAll();
    });
  });
  listEl.querySelectorAll('.btn-edit').forEach(b=>{
    b.addEventListener('click', ()=>{
      const id = Number(b.closest('.task-item').dataset.id);
      const d = loadUserData(currentUser);
      const t = d.tasks.find(x => x.id === id); if(!t) return;
      const newTitle = prompt('Edit title', t.title); if(newTitle != null) t.title = newTitle.trim();
      const newNote = prompt('Edit note', t.note || ''); if(newNote != null) t.note = newNote;
      const newDate = prompt('Edit date (YYYY-MM-DD)', t.date || ''); if(newDate != null) t.date = newDate || null;
      const newPr = prompt('Edit priority (low,medium,high)', t.priority || 'medium'); if(newPr != null) t.priority = ['low','medium','high'].includes(newPr) ? newPr : t.priority;
      saveUserData(currentUser, d);
      renderAll();
    });
  });
}

// ---- Calendar ----
function renderCalendar(){
  if(!calendarEl) return;
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  calendarEl.innerHTML = '';
  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  dayNames.forEach(dn=>{
    const el = document.createElement('div'); el.textContent = dn; el.style.fontWeight = '700';
    calendarEl.appendChild(el);
  });
  for(let i=0;i<firstDay;i++){
    const el = document.createElement('div'); el.innerHTML = ''; calendarEl.appendChild(el);
  }
  for(let d=1; d<=daysInMonth; d++){
    const el = document.createElement('div');
    el.textContent = d;
    const today = now.getDate();
    if(d === today) el.classList.add('today');
    if(selectedDate && selectedDate.getDate() === d && selectedDate.getMonth() === month && selectedDate.getFullYear() === year) el.classList.add('selected');
    el.addEventListener('click', ()=>{
      selectedDate = new Date(year, month, d);
      renderCalendar();
      renderTasks(taskList, formatDate(selectedDate));
    });
    calendarEl.appendChild(el);
  }
}

// ---- Upcoming tasks (next 10) ----
function renderUpcoming(){
  if(!upcomingList || !currentUser) return;
  const d = loadUserData(currentUser);
  const todayStr = formatDate(new Date());
  const upcoming = d.tasks.filter(t => t.date && t.date >= todayStr && !t.done).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,10);
  if(!upcoming.length) {
    upcomingList.innerHTML = '<div class="muted">No upcoming tasks!</div>';
    return;
  }
  upcomingList.innerHTML = '';
  upcoming.forEach(t=>{
    const el = document.createElement('div');
    el.className = 'task-item';
    el.innerHTML = `<strong>${emojiFor(t.cat)} ${escapeHtml(t.title)}</strong><br><span class='small'>Due ${t.date}</span>`;
    upcomingList.appendChild(el);
  });
}

// ---- Progress ----
function renderProgress(){
  const d = loadUserData(currentUser);
  const total = d.tasks.length;
  const done = d.tasks.filter(t => t.done).length;
  progressLabel.textContent = `${done} of ${total} tasks completed`;
  createOrUpdateChart(done || 0, Math.max(total - done, 0));
}

// ---- Journal save/clear ----
saveJournal && saveJournal.addEventListener('click', ()=>{
  if(!currentUser) return alert('Sign in first');
  const d = loadUserData(currentUser);
  d.journal = journalTxt.value || '';
  saveUserData(currentUser, d);
  alert('Journal saved locally.');
});
clearJournal && clearJournal.addEventListener('click', ()=>{
  if(!currentUser) return alert('Sign in first');
  if(!confirm('Clear journal?')) return;
  journalTxt.value = '';
  const d = loadUserData(currentUser);
  d.journal = '';
  saveUserData(currentUser, d);
});

// ---- Backup / Restore ----
backupBtn && backupBtn.addEventListener('click', ()=>{
  if(!currentUser) return alert('Sign in first');
  const data = loadUserData(currentUser);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `planpro_${currentUser}_${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

restoreBtn && restoreInput && restoreBtn.addEventListener('click', ()=> restoreInput.click());
restoreInput && restoreInput.addEventListener('change', (e)=>{
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  if(!currentUser) return alert('Sign in first to restore into your account');
  const reader = new FileReader();
  reader.onload = function(ev){
    try{
      const parsed = JSON.parse(ev.target.result);
      if(!parsed || typeof parsed !== 'object') throw new Error('Invalid file');
      // Merge tasks/journal/theme sensibly:
      const existing = loadUserData(currentUser);
      existing.tasks = Array.isArray(parsed.tasks) ? parsed.tasks : existing.tasks;
      existing.journal = typeof parsed.journal === 'string' ? parsed.journal : existing.journal;
      existing.theme = parsed.theme === 'dark' ? 'dark' : existing.theme;
      saveUserData(currentUser, existing);
      alert('Restore completed.');
      renderAll();
    }catch(err){
      console.error(err);
      alert('Failed to restore: invalid file.');
    }
  };
  reader.readAsText(f);
  restoreInput.value = '';
});

// ---- Theme toggle ----
themeToggle && themeToggle.addEventListener('click', ()=>{
  const cur = app.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const next = cur === 'dark' ? 'light' : 'dark';
  app.setAttribute('data-theme', next);
  themeLabel.textContent = next === 'dark' ? 'Dark' : 'Light';
  if(currentUser){ const d = loadUserData(currentUser); d.theme = next; saveUserData(currentUser, d); }
  else localStorage.setItem(globalThemeKey(), next);
});

// ---- Copy quote to clipboard ----
copyQuoteBtn && copyQuoteBtn.addEventListener('click', ()=>{
  if(!quoteEl) return;
  const text = quoteEl.textContent || '';
  if(!navigator.clipboard) return alert('Clipboard not supported');
  navigator.clipboard.writeText(text).then(()=> alert('Quote copied to clipboard.'));
});

// ---- Quote button ----
newQuote && newQuote.addEventListener('click', renderQuote);

// ---- Render All ----
function renderAll(){
  if(!currentUser) return;
  const d = loadUserData(currentUser);
  journalTxt && (journalTxt.value = d.journal || '');
  renderTasks();
  renderCalendar();
  renderUpcoming();
  renderProgress();
  renderQuote();
}

// ---- Initial load ----
window.addEventListener('DOMContentLoaded', ()=>{
  const savedTheme = localStorage.getItem(globalThemeKey());
  if(savedTheme) app.setAttribute('data-theme', savedTheme);
  themeLabel.textContent = app.getAttribute('data-theme') === 'dark' ? 'Dark' : 'Light';
  renderQuote();
  if(currentUser) renderAll();
});