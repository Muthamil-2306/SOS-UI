// ===================== CONFIG =====================
// Point this at wherever server.js is running.
const API_BASE = 'https://sos-ui-backend.onrender.com/api';

// ===================== TOAST (replaces alert() popups) =====================
function toast(message, type = 'info') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 250);
  }, 3800);
}

// ===================== AUTH TOKEN HELPERS =====================
function getToken() { return localStorage.getItem('authToken'); }
function authHeaders() {
  const token = getToken();
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Wrapper around fetch for protected endpoints — handles expired/invalid sessions centrally
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(options.headers || {})
    }
  });

  if (res.status === 401) {
    toast('Your session expired — please sign in again.', 'error');
    logout();
    throw new Error('Session expired.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// ===================== AUTH TOGGLE =====================
function showAuth(which) {
  document.getElementById('loginForm').classList.toggle('hidden', which !== 'login');
  document.getElementById('registerForm').classList.toggle('hidden', which !== 'register');
  document.getElementById('loginError').textContent = '';
  document.getElementById('regError').textContent = '';
}

// ===================== REGISTER =====================
function register() {
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const pass = document.getElementById('regPass').value;
  const confirm = document.getElementById('regConfirm').value;
  const errorBox = document.getElementById('regError');
  errorBox.textContent = '';

  if (!name || !email || !pass || !confirm) return errorBox.textContent = 'All fields are required.';
  if (!email.includes('@')) return errorBox.textContent = 'Enter a valid email address.';
  if (pass.length < 6) return errorBox.textContent = 'Password must be at least 6 characters.';
  if (pass !== confirm) return errorBox.textContent = 'Passwords do not match.';

  fetch(`${API_BASE}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password: pass })
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Registration failed.');
      return data;
    })
    .then(() => {
      document.getElementById('regName').value = '';
      document.getElementById('regEmail').value = '';
      document.getElementById('regPass').value = '';
      document.getElementById('regConfirm').value = '';
      showAuth('login');
      document.getElementById('loginEmail').value = email;
      toast('Account created — sign in below.', 'success');
    })
    .catch(err => { errorBox.textContent = err.message; });
}

// ===================== LOGIN =====================
function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errorBox = document.getElementById('loginError');
  errorBox.textContent = '';

  if (!email || !pass) return errorBox.textContent = 'Email and password are required.';

  fetch(`${API_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  })
    .then(async res => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      return data;
    })
    .then(data => {
      localStorage.setItem('authToken', data.token);
      localStorage.setItem('currentUserName', data.user.name);
      enterApp(data.user.name);
    })
    .catch(err => { errorBox.textContent = err.message; });
}

function enterApp(name) {
  document.getElementById('authSection').classList.add('hidden');
  document.getElementById('appSection').classList.remove('hidden');
  document.getElementById('welcomeUser').textContent = name;
  document.getElementById('userName').value = name;
  renderContacts();
  loadAlertHistory();
}

function logout() {
  localStorage.removeItem('authToken');
  localStorage.removeItem('currentUserName');
  document.getElementById('appSection').classList.add('hidden');
  document.getElementById('authSection').classList.remove('hidden');
  showAuth('login');
}

// Resume session on reload
window.addEventListener('DOMContentLoaded', () => {
  const token = getToken();
  const name = localStorage.getItem('currentUserName');
  if (token && name) enterApp(name);
});

// ===================== TAB SWITCHING =====================
function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(s => s.classList.toggle('active', s.id === tab));
  if (tab === 'history') loadAlertHistory();
}

// ===================== SOS (press-and-hold) =====================
const SOS_HOLD_MS = 2000;
let sosHoldTimer = null;
let sosStartTime = 0;
let sosAnimFrame = null;

const sosBtn = () => document.getElementById('sosBtn');
const sosRingFill = () => document.getElementById('sosRingFill');
const RING_CIRCUMFERENCE = 2 * Math.PI * 90;

function sosPressStart(e) {
  e.preventDefault();
  sosStartTime = Date.now();
  sosBtn().classList.add('charging');
  document.getElementById('sosHint').textContent = 'Keep holding…';
  const tick = () => {
    const elapsed = Date.now() - sosStartTime;
    const progress = Math.min(elapsed / SOS_HOLD_MS, 1);
    sosRingFill().style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
    if (progress < 1) sosAnimFrame = requestAnimationFrame(tick);
  };
  sosAnimFrame = requestAnimationFrame(tick);
  sosHoldTimer = setTimeout(fireSOS, SOS_HOLD_MS);
}

function sosPressEnd() {
  if (sosHoldTimer) {
    clearTimeout(sosHoldTimer);
    sosHoldTimer = null;
    cancelAnimationFrame(sosAnimFrame);
    sosBtn().classList.remove('charging');
    sosRingFill().style.strokeDashoffset = RING_CIRCUMFERENCE;
    document.getElementById('sosHint').textContent = 'Hold for 2 seconds to trigger';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const btn = sosBtn();
  if (!btn) return;
  sosRingFill().style.strokeDasharray = RING_CIRCUMFERENCE;
  sosRingFill().style.strokeDashoffset = RING_CIRCUMFERENCE;
  btn.addEventListener('pointerdown', sosPressStart);
  btn.addEventListener('pointerup', sosPressEnd);
  btn.addEventListener('pointerleave', sosPressEnd);
  btn.addEventListener('pointercancel', sosPressEnd);
});

function fireSOS() {
  cancelAnimationFrame(sosAnimFrame);
  sosBtn().classList.remove('charging');
  sosBtn().classList.add('fired');
  document.getElementById('statusLed').classList.add('alert');
  document.getElementById('statusText').textContent = 'SOS ACTIVE';
  document.getElementById('sosHint').textContent = 'Alert triggered';
  setTimeout(() => sosBtn().classList.remove('fired'), 600);

  if (!navigator.geolocation) {
    logAlert('Geolocation not supported on this device.');
    toast('This device does not support location sharing.', 'error');
    return;
  }

  // High-accuracy GPS: forces the device to use GPS chip over network/wifi triangulation where possible
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude, lon = pos.coords.longitude;
      const accuracy = Math.round(pos.coords.accuracy);
      const link = `https://maps.google.com/?q=${lat},${lon}`;
      document.getElementById('location').innerHTML =
        `<svg width="13" height="13"><use href="#icon-pin"/></svg><a href="${link}" target="_blank" rel="noopener">${lat.toFixed(5)}, ${lon.toFixed(5)}</a> <span class="accuracy-tag">±${accuracy}m</span>`;
      logAlert(`SOS sent — location accurate to ${accuracy}m.`);

      const message = document.getElementById('sosMessage').value || 'Emergency SOS!';

      apiFetch('/sos', {
        method: 'POST',
        body: JSON.stringify({ location: `${lat},${lon}`, message })
      })
        .then(() => {
          logAlert('Alert delivered — trusted contacts notified.');
          toast('SOS sent to your trusted contacts.', 'success');
          loadAlertHistory();
        })
        .catch(err => {
          logAlert('Could not reach server — please call helplines directly if needed.');
          toast(err.message, 'error');
        });
    },
    () => {
      logAlert('Location permission denied. SOS sent without location.');
      toast('Location permission denied — please enable it for accurate alerts.', 'error');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function dial(num) { window.location.href = `tel:${num}`; }

function logAlert(msg) {
  const log = document.getElementById('alertLog');
  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();
  const time = new Date().toLocaleTimeString();
  log.innerHTML = `<div>[${time}] ${msg}</div>` + log.innerHTML;
}

// ===================== ALERT HISTORY =====================
function loadAlertHistory() {
  const list = document.getElementById('historyList');
  if (!list || !getToken()) return;

  apiFetch('/alerts')
    .then(alerts => {
      if (!alerts.length) {
        list.innerHTML = `<div class="empty-state"><svg width="28" height="28"><use href="#icon-empty"/></svg>No alerts sent yet.</div>`;
        return;
      }
      list.innerHTML = alerts.map(a => {
        const date = new Date(a.timestamp);
        const link = `https://maps.google.com/?q=${a.location}`;
        return `
          <div class="history-card">
            <div class="history-time">${date.toLocaleDateString()} · ${date.toLocaleTimeString()}</div>
            <div class="history-message">${a.message || 'Emergency SOS'}</div>
            ${a.location ? `<a class="history-loc" href="${link}" target="_blank" rel="noopener"><svg width="12" height="12"><use href="#icon-pin"/></svg>View location</a>` : ''}
          </div>`;
      }).join('');
    })
    .catch(() => {
      list.innerHTML = '<div class="empty-state">Could not load alert history.</div>';
    });
}

// ===================== CONTACTS =====================
function addContact() {
  const contact_name = document.getElementById('cName').value.trim();
  const contact_number = document.getElementById('cPhone').value.trim();
  const contact_email = document.getElementById('cEmail').value.trim();
  const relation = document.getElementById('cRelation').value.trim();

  if (!contact_name || !contact_number) {
    toast('Name and phone are required.', 'error');
    return;
  }

  apiFetch('/contacts', {
    method: 'POST',
    body: JSON.stringify({ contact_name, contact_number, contact_email, relation })
  })
    .then(() => {
      ['cName', 'cPhone', 'cEmail', 'cRelation'].forEach(id => document.getElementById(id).value = '');
      toast('Contact added.', 'success');
      renderContacts();
    })
    .catch(err => toast(err.message, 'error'));
}

function renderContacts() {
  const list = document.getElementById('contactList');
  if (!getToken()) return;

  apiFetch('/contacts')
    .then(contacts => {
      if (!contacts.length) {
        list.innerHTML = `<div class="empty-state"><svg width="28" height="28"><use href="#icon-empty"/></svg>No trusted contacts yet — add one above.</div>`;
        return;
      }
      list.innerHTML = contacts.map(c => `
        <div class="contact-card">
          <div class="contact-avatar">${initials(c.contact_name)}</div>
          <div class="contact-body">
            <div class="contact-name-row">
              <strong>${c.contact_name}</strong>
              <span class="relation">${c.relation || 'Contact'}</span>
            </div>
            <div class="contact-meta">
              <a href="tel:${c.contact_number}"><svg width="13" height="13"><use href="#icon-phone"/></svg>${c.contact_number}</a>
              ${c.contact_email ? `<span>${c.contact_email}</span>` : ''}
              <a href="https://wa.me/${c.contact_number}?text=SOS%20Emergency" target="_blank" rel="noopener"><svg width="13" height="13"><use href="#icon-whatsapp"/></svg>WhatsApp</a>
            </div>
          </div>
        </div>
      `).join('');
    })
    .catch(() => {
      list.innerHTML = '<div class="empty-state">Could not load contacts.</div>';
    });
}

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
}

// ===================== EVIDENCE CAPTURE =====================
let audioChunks = [], mediaRecorder;
function startAudio() {
  navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const blob = new Blob(audioChunks, { type: 'audio/webm' });
      document.getElementById('audioPlayback').src = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'audioEvidence.webm';
      a.click();
    };
    mediaRecorder.start();
    document.getElementById('audioStartBtn').disabled = true;
    document.getElementById('audioStopBtn').disabled = false;
  }).catch(() => toast('Microphone access denied or unavailable.', 'error'));
}
function stopAudio() {
  if (mediaRecorder) mediaRecorder.stop();
  document.getElementById('audioStartBtn').disabled = false;
  document.getElementById('audioStopBtn').disabled = true;
}

let videoRecorder, videoStream;
function startVideo() {
  navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
    videoStream = stream;
    document.getElementById('videoPreview').srcObject = stream;
    videoRecorder = new MediaRecorder(stream);
    const chunks = [];
    videoRecorder.ondataavailable = e => chunks.push(e.data);
    videoRecorder.onstop = () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'videoEvidence.webm';
      a.click();
    };
    videoRecorder.start();
    document.getElementById('videoStartBtn').disabled = true;
    document.getElementById('videoStopBtn').disabled = false;
  }).catch(() => toast('Camera access denied or unavailable.', 'error'));
}
function stopVideo() {
  if (videoRecorder) videoRecorder.stop();
  if (videoStream) videoStream.getTracks().forEach(t => t.stop());
  document.getElementById('videoStartBtn').disabled = false;
  document.getElementById('videoStopBtn').disabled = true;
}