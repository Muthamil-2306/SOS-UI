// ===================== CONFIG =====================
// Point this at wherever server.js is running. Same-origin deploys can leave this as ''.
const API_BASE = 'https://sos-ui-backend.onrender.com/api';

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

  if (!name || !email || !pass || !confirm) {
    errorBox.textContent = 'All fields are required.';
    return;
  }
  if (!email.includes('@')) {
    errorBox.textContent = 'Enter a valid email address.';
    return;
  }
  if (pass.length < 6) {
    errorBox.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if (pass !== confirm) {
    errorBox.textContent = 'Passwords do not match.';
    return;
  }

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
      document.getElementById('loginError').textContent = 'Account created — sign in below.';
    })
    .catch(err => { errorBox.textContent = err.message; });
}

// ===================== LOGIN =====================
function login() {
  const email = document.getElementById('loginEmail').value.trim();
  const pass = document.getElementById('loginPass').value;
  const errorBox = document.getElementById('loginError');
  errorBox.textContent = '';

  if (!email || !pass) {
    errorBox.textContent = 'Email and password are required.';
    return;
  }

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
      localStorage.setItem('currentUserId', data.user.id);
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
}

function logout() {
  localStorage.removeItem('currentUserId');
  localStorage.removeItem('currentUserName');
  document.getElementById('appSection').classList.add('hidden');
  document.getElementById('authSection').classList.remove('hidden');
  showAuth('login');
}

// Resume session on reload
window.addEventListener('DOMContentLoaded', () => {
  const uid = localStorage.getItem('currentUserId');
  const name = localStorage.getItem('currentUserName');
  if (uid && name) enterApp(name);
});

// ===================== TAB SWITCHING =====================
function showTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.tab-panel').forEach(s => s.classList.toggle('active', s.id === tab));
}

// ===================== SOS (press-and-hold) =====================
const SOS_HOLD_MS = 2000;
let sosHoldTimer = null;
let sosStartTime = 0;
let sosAnimFrame = null;

const sosBtn = () => document.getElementById('sosBtn');
const sosRingFill = () => document.getElementById('sosRingFill');
const RING_CIRCUMFERENCE = 2 * Math.PI * 90; // matches r=90 in SVG

function sosPressStart(e) {
  e.preventDefault();
  sosStartTime = Date.now();
  sosBtn().classList.add('charging');
  document.getElementById('sosHint').textContent = 'Keep holding…';
  const tick = () => {
    const elapsed = Date.now() - sosStartTime;
    const progress = Math.min(elapsed / SOS_HOLD_MS, 1);
    sosRingFill().style.strokeDashoffset = RING_CIRCUMFERENCE * (1 - progress);
    if (progress < 1) {
      sosAnimFrame = requestAnimationFrame(tick);
    }
  };
  sosAnimFrame = requestAnimationFrame(tick);
  sosHoldTimer = setTimeout(() => {
    fireSOS();
  }, SOS_HOLD_MS);
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
    return;
  }

  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    const link = `https://maps.google.com/?q=${lat},${lon}`;
    document.getElementById('location').innerHTML =
      `<svg width="13" height="13"><use href="#icon-pin"/></svg><a href="${link}" target="_blank" rel="noopener">${lat.toFixed(5)}, ${lon.toFixed(5)}</a>`;
    logAlert('SOS sent with current location.');

    const user_id = localStorage.getItem('currentUserId');
    const message = document.getElementById('sosMessage').value || 'Emergency SOS!';

    fetch(`${API_BASE}/sos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id, location: `${lat},${lon}`, message })
    })
      .then(res => res.json())
      .then(() => logAlert('Alert delivered to server.'))
      .catch(() => logAlert('Could not reach server — alert saved locally only.'));
  }, () => {
    logAlert('Location permission denied. SOS sent without location.');
  });
}

function dial(num) { window.location.href = `tel:${num}`; }

function logAlert(msg) {
  const log = document.getElementById('alertLog');
  const empty = log.querySelector('.log-empty');
  if (empty) empty.remove();
  const time = new Date().toLocaleTimeString();
  log.innerHTML = `<div>[${time}] ${msg}</div>` + log.innerHTML;
}

// ===================== CONTACTS =====================
function addContact() {
  const contact = {
    user_id: localStorage.getItem('currentUserId'),
    contact_name: document.getElementById('cName').value.trim(),
    contact_number: document.getElementById('cPhone').value.trim(),
    contact_email: document.getElementById('cEmail').value.trim(),
    relation: document.getElementById('cRelation').value.trim()
  };
  if (!contact.contact_name || !contact.contact_number) {
    alert('Name and phone are required.');
    return;
  }
  fetch(`${API_BASE}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact)
  })
    .then(res => res.json())
    .then(() => {
      ['cName', 'cPhone', 'cEmail', 'cRelation'].forEach(id => document.getElementById(id).value = '');
      renderContacts();
    })
    .catch(() => alert('Could not save contact — check your connection.'));
}

function renderContacts() {
  const user_id = localStorage.getItem('currentUserId');
  if (!user_id) return;
  fetch(`${API_BASE}/contacts/${user_id}`)
    .then(res => res.json())
    .then(contacts => {
      const list = document.getElementById('contactList');
      if (!contacts.length) {
        list.innerHTML = `<div class="empty-state">
          <svg width="28" height="28"><use href="#icon-empty"/></svg>
          No trusted contacts yet — add one above.
        </div>`;
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
      document.getElementById('contactList').innerHTML = '<div class="empty-state">Could not load contacts.</div>';
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
  }).catch(() => alert('Microphone access denied or unavailable.'));
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
  }).catch(() => alert('Camera access denied or unavailable.'));
}
function stopVideo() {
  if (videoRecorder) videoRecorder.stop();
  if (videoStream) videoStream.getTracks().forEach(t => t.stop());
  document.getElementById('videoStartBtn').disabled = false;
  document.getElementById('videoStopBtn').disabled = true;
}