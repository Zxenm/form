let currentWhatsApp = '';

// Apply animation classes to elements based on their position on screen
function setupAnimations() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('fade-in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });
  
  document.querySelectorAll('.forum-category, .thread, .profile-item').forEach(el => {
    observer.observe(el);
  });
}

// Call setupAnimations when DOM is loaded or when content changes
document.addEventListener('DOMContentLoaded', setupAnimations);

async function checkLogin() {
  try {
    const response = await fetch('/check-login');
    const data = await response.json();
    if (data.loggedIn) {
      const userPhoto = document.getElementById('userPhoto');
      const response = await fetch('/profile');
      const userData = await response.json();
      userPhoto.src = userData.photoUrl || '/images/default-avatar.png';
      document.getElementById('userInfo').innerHTML = formatUsername(data.username, userData.rank || 'Verified');
      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('forumSection').style.display = 'block';
      document.getElementById('forumSection').classList.remove('hidden');
      showMainPage();
      updateThreadAvatars(userData.photoUrl); // Update thread avatars after login
    }
  } catch (error) {
    console.error('Error checking login status:', error);
  }
}

// Check login status when page loads
window.addEventListener('load', checkLogin);

function toggleForms() {
  document.getElementById('whatsappForm').classList.toggle('hidden');
  document.getElementById('loginForm').classList.toggle('hidden');
}

async function login(event) {
  event.preventDefault();
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;

  const response = await fetch('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const data = await response.json();
  if (data.success) {
    showLoggedInState(username);
  } else {
    alert(data.message);
  }
}

function showLoggedInState(username) {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('forumSection').classList.remove('hidden');
  document.getElementById('userInfo').textContent = username;
}

function toggleNavDropdown() {
  const dropdown = document.getElementById('navDropdown');
  dropdown.style.display = dropdown.style.display === 'none' || dropdown.classList.contains('hidden') ? 'flex' : 'none';
  dropdown.classList.toggle('hidden');
}

let lastActivityTime = Date.now();
let onlineCheckInterval;

document.addEventListener('mousemove', () => lastActivityTime = Date.now());
document.addEventListener('keypress', () => lastActivityTime = Date.now());

function updateOnlineStatus() {
  const inactiveTime = Date.now() - lastActivityTime;
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');

  if (inactiveTime > 300000) { // 5 minutes
    statusDot?.classList.add('offline');
    if (statusText) statusText.textContent = 'Offline';
  } else {
    statusDot?.classList.remove('offline');
    if (statusText) statusText.textContent = 'Online';
  }
}

// Profile functions
let socket;

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.IO
  socket = io();

  socket.on('notification', (data) => {
    showNotification(data.title, data.message);
  });
});

function showNotification(title, message) {
  const notification = document.createElement('div');
  notification.className = 'notification slide-in-right';
  notification.innerHTML = `
    <h4>${title}</h4>
    <p>${message}</p>
  `;
  document.body.appendChild(notification);
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.5s forwards';
    setTimeout(() => notification.remove(), 500);
  }, 5000);
}

// Add slideOutRight animation if it doesn't exist
if (!document.querySelector('style#animation-styles')) {
  const styleEl = document.createElement('style');
  styleEl.id = 'animation-styles';
  styleEl.innerHTML = `
    @keyframes slideOutRight {
      from { transform: translateX(0); opacity: 1; }
      to { transform: translateX(100%); opacity: 0; }
    }
  `;
  document.head.appendChild(styleEl);
}

function rankColor(rank) {
  switch (rank) {
    case 'Admin':
      return 'red';
    case 'Moderator':
      return 'blue';
    case 'Verified':
      return 'green';
    default:
      return 'black';
  }
}

function formatUsername(username, rank) {
  const color = rankColor(rank);
  return `<span style="color: ${color};">${username}</span>`;
}

async function viewProfile() {
  if (onlineCheckInterval) {
    clearInterval(onlineCheckInterval);
  }
  const response = await fetch('/profile');
  const userData = await response.json();
  
  // Make sure experiencePoints property exists
  if (!userData.experiencePoints) userData.experiencePoints = 0;
  
  // Calculate level and progress
  const level = calculateLevel(userData.experiencePoints);
  const progress = calculateProgressToNextLevel(userData.experiencePoints);
  const nextLevelXP = calculateExperienceForLevel(level + 1);

  const profileHTML = `
    <div class="profile-info">
      <div class="profile-banner">
        <img src="${userData.bannerUrl || '/images/original_banner.jpg'}" alt="Profile Banner">
      </div>
      <div class="profile-photo">
        <img id="profilePhoto" src="${userData.photoUrl || '/images/default-avatar.png'}" alt="Profile Photo">
        <div class="photo-upload">
          <input type="file" id="photoInput" accept="image/*" style="display: none;" onchange="uploadProfilePhoto()">
          <div id="photoControls">
            <button onclick="togglePhotoButtons()">Change Profile Picture</button>
            <div id="photoButtons" style="display: none; margin-top: 10px;">
              <div style="display: flex; gap: 10px; align-items: center; justify-content: center;">
              <button onclick="document.getElementById('photoInput').click()">Upload Image</button>
              <button onclick="setDefaultPhoto()">Set to Default</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="profile-grid">
        <div class="profile-item">
          <span class="profile-label">Username</span>
          <div class="profile-value-container">
            <span class="profile-value" id="username-display">${formatUsername(userData.username, userData.rank || 'Verified')}</span>
          </div>
        </div>
        <div class="profile-item">
          <span class="profile-label">WhatsApp Number</span>
          <span class="profile-value">${userData.whatsapp}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Rank</span>
          <span class="profile-value">${userData.rank || 'Verified'}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Registered On</span>
          <span class="profile-value">${new Date(userData.joinDate).toLocaleString()}</span>
        </div>
        <div class="profile-item">
          <span class="profile-label">Last Login</span>
          <span class="profile-value">${new Date(userData.lastLogin).toLocaleString()}</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('forumSection').innerHTML = profileHTML;
  if (userData.role === 'admin') {
    displayAdminPanel();
  }
  toggleNavDropdown();
}

async function displayAdminPanel() {
  const response = await fetch('/admin/users');
  const users = await response.json();

  const adminHTML = `
    <div class="admin-panel">
      <h3>Admin Panel</h3>
      <div class="user-list">
        ${Object.entries(users).map(([whatsapp, user]) => `
          <div class="user-item">
            <span>${formatUsername(user.username, user.rank || 'Verified')} (${user.rank || 'Verified'})</span>
            <div>
              <button onclick="changeUserRole('${whatsapp}')">Change Role</button>
              <button onclick="deleteUser('${whatsapp}')" class="delete-btn">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  document.getElementById('forumSection').innerHTML += adminHTML;
}

async function changeUserRole(whatsapp) {
  const response = await fetch('/admin/change-role', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ whatsapp })
  });

  if (response.ok) {
    viewProfile();
  }
}

async function deleteUser(whatsapp) {
  if (confirm('Are you sure you want to delete this user?')) {
    const response = await fetch('/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ whatsapp })
    });

    if (response.ok) {
      viewProfile();
    }
  }
}

function openNewWindow(title, page) {
  const width = 800;
  const height = 600;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  window.open(page, title, 
    `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,resizable=yes`
  );
}

function viewUserProfile(whatsapp) {
  window.location.href = `/user/${whatsapp}`;
}

// Update lastActive timestamp periodically
function updateUserActivity() {
  fetch('/api/update-activity', { method: 'POST' })
    .catch(err => console.error('Error updating activity:', err));
}

// Set up interval to update user activity
if (document.getElementById('userInfo').textContent.trim() !== '') {
  setInterval(updateUserActivity, 60000); // Update every minute
  updateUserActivity(); // Initial update
}

function togglePassword(inputId, button) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    button.innerHTML = '<img src="images/close_eye.png" alt="Hide">';
  } else {
    input.type = 'password';
    button.innerHTML = '<img src="images/open_eye.png" alt="Show">';
  }
}

function showMainPage() {
  document.getElementById('forumSection').innerHTML = `
    <div class="samp-logo">
      <img src="images/banner1.png" alt="AltherPride SAMP Logo">
    </div>
    <div class="forum-category">
      <h2>Server Information</h2>
      <div class="forum-threads">
        <div class="thread" onclick="openNewWindow('Server Rules', 'rules.html')">
          <div class="thread-icon">📋</div>
          <div class="thread-content">
            <h3>Server Rules</h3>
            <p>Important rules and guidelines for all players</p>
          </div>
          <div class="thread-stats">
            <div class="post-count">0</div>
            <div>posts</div>
          </div>
        </div>
        <div class="thread" onclick="openNewWindow('Server Features', 'features.html')">
          <div class="thread-icon">⭐</div>
          <div class="thread-content">
            <h3>Server Features</h3>
            <p>List of available features and systems</p>
          </div>
          <div class="thread-stats">
            <div class="post-count">0</div>
            <div>posts</div>
          </div>
        </div>
        <div class="thread" onclick="openNewWindow('Server Status', 'status.html')">
          <div class="thread-icon">🔄</div>
          <div class="thread-content">
            <h3>Server Status</h3>
            <p>Current server status and maintenance updates</p>
          </div>
          <div class="thread-stats">
            <div class="post-count">16</div>
            <div>posts</div>
          </div>
        </div>
      </div>
    </div>

    <div class="forum-category">
      <h2>Player Support</h2>
      <div class="forum-threads">
        <div class="thread" onclick="openNewWindow('Player Reports', 'reports.html')">
          <div class="thread-icon">🚫</div>
          <div class="thread-content">
            <h3>Player Reports</h3>
            <p>Report players breaking rules</p>
          </div>
          <div class="thread-stats">
            <div class="post-count">0</div>
            <div>posts</div>
          </div>
        </div>
        <div class="thread" onclick="openNewWindow('Asset Refund', 'refund.html')">
          <div class="thread-icon">💰</div>
          <div class="thread-content">
            <h3>Asset Refund</h3>
            <p>Request refunds for lost items</p>
          </div>
          <div class="thread-stats">
            <div class="post-count">0</div>
            <div>posts</div>
          </div>
        </div>
      </div>
    </div>

    <div class="forum-category">
      <h2>Character Section</h2>
      <div class="forum-threads">
        <div class="thread" onclick="openNewWindow('Character Story', 'character_story.html')">
          <div class="thread-icon">📖</div>
          <div class="thread-content">
            <h3>Character Story Request</h3>
            <p>Share your character's journey and adventures</p>
          </div>
          <div class="thread-stats">
            <div class="post-count">0</div>
            <div>posts</div>
          </div>
        </div>
        <div class="thread" onclick="openNewWindow('Character Killed', 'character_killed.html')">
          <div class="thread-icon">☠️</div>
          <div class="thread-content">
            <h3>Character Killed Request</h3>
            <p>Report and discuss character deaths</p>
          </div>
          <div class="thread-stats">
            <div class="post-count">0</div>
            <div>posts</div>
          </div>
        </div>
      </div>
    </div>
  `;
  toggleNavDropdown();
}

async function logout() {
  window.location.href = '/logout';
}

function toggleEditField(field) {
  const displayElement = document.getElementById(`${field}-display`);
  const editElement = document.getElementById(`${field}-edit`);
  if (displayElement && editElement) {
    editElement.classList.toggle('hidden');
  }
}

async function saveProfileField(field) {
  const editElement = document.getElementById(`${field}-edit`);
  const inputs = editElement.querySelectorAll('input');
  let data = {};

  if (field === 'username') {
    data = { username: inputs[0].value };
  } else if (field === 'password') {
    const [current, newPass, confirm] = inputs;
    if (newPass.value !== confirm.value) {
      alert('New passwords do not match');
      return;
    }
    data = {
      currentPassword: current.value,
      newPassword: newPass.value
    };
  }

  try {
    const response = await fetch(`/api/profile/${field}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    const result = await response.json();
    if (result.success) {
      viewProfile();
      alert('Profile updated successfully');
    } else {
      alert(result.message || 'Failed to update profile');
    }
  } catch (error) {
    console.error('Error updating profile:', error);
    alert('Failed to update profile');
  }
}

async function registerWhatsApp(event) {
  event.preventDefault();
  const whatsapp = document.getElementById('whatsapp').value;

  const response = await fetch('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ whatsapp })
  });

  const data = await response.json();
  if (data.success) {
    currentWhatsApp = whatsapp;
    document.getElementById('whatsappForm').classList.add('hidden');
    document.getElementById('profileForm').classList.remove('hidden');
  } else {
    alert(data.message);
  }
}

async function completeProfile(event) {
  event.preventDefault();
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  const response = await fetch('/complete-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      whatsapp: currentWhatsApp,
      username,
      password
    })
  });

  const data = await response.json();
  if (data.success) {
    showLoggedInState(username);
  } else {
    alert(data.message);
  }
}

function togglePhotoButtons() {
  const buttons = document.getElementById('photoButtons');
  buttons.style.display = buttons.style.display === 'none' ? 'block' : 'none';
}

async function setDefaultPhoto() {
  try {
    const response = await fetch('/upload-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setDefault: true })
    });

    const data = await response.json();
    if (data.success) {
      document.getElementById('profilePhoto').src = '/images/default-avatar.png' + '?t=' + Date.now();
      togglePhotoButtons();
    }
  } catch (error) {
    console.error('Error setting default photo:', error);
    alert('Error setting default photo');
  }
}

async function uploadProfilePhoto() {
  const input = document.getElementById('photoInput');
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('photo', file);

  try {
    const response = await fetch('/upload-photo', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();
    if (data.success) {
      document.getElementById('profilePhoto').src = data.photoUrl + '?t=' + Date.now();
    } else {
      alert('Failed to upload photo: ' + data.message);
    }
  } catch (error) {
    console.error('Error uploading photo:', error);
    alert('Error uploading photo');
  }
}

function updateThreadAvatars(photoUrl) {
  const threadAvatars = document.querySelectorAll('.thread-avatar');
  threadAvatars.forEach(avatar => {
    avatar.src = photoUrl || '/images/default-avatar.png';
  });
}