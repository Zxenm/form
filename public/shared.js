async function loadUserInfo() {
  try {
    const loginCheck = await fetch('/check-login');
    const loginData = await loginCheck.json();

    if (loginData.loggedIn) {
      const response = await fetch('/profile');
      const userData = await response.json();
      const userPhoto = document.getElementById('userPhoto');
      const userInfo = document.getElementById('userInfo');
      if (userPhoto) userPhoto.src = userData.photoUrl || '/images/default-avatar.png';
      if (userInfo) userInfo.innerHTML = formatUsername(userData.username || loginData.username, userData.rank || 'Verified');
    }
  } catch (error) {
    console.error('Error loading user info:', error);
  }
}

function showMainPage() {
  window.location.href = '/';
}

function viewProfile() {
  window.location.href = 'profile.html';
}

function logout() {
  window.location.href = '/logout';
}

// Apply animations to dynamically loaded content
function setupPageAnimations() {
  // Add animation classes to elements
  document.querySelectorAll('.forum-category').forEach((el, i) => {
    el.style.animationDelay = `${i * 0.1}s`;
  });
  
  document.querySelectorAll('.thread').forEach((el, i) => {
    el.style.animationDelay = `${i * 0.05}s`;
  });
  
  document.querySelectorAll('.profile-item').forEach((el, i) => {
    el.style.animationDelay = `${i * 0.1}s`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  loadUserInfo();
  setupPageAnimations();
});

// User level and XP functions
function calculateLevel(experiencePoints) {
  return Math.floor(Math.sqrt(experiencePoints / 10));
}

function calculateExperienceForLevel(level) {
  return level * level * 10;
}

function calculateProgressToNextLevel(experiencePoints) {
  const currentLevel = calculateLevel(experiencePoints);
  const nextLevelXP = calculateExperienceForLevel(currentLevel + 1);
  const currentLevelXP = calculateExperienceForLevel(currentLevel);
  return ((experiencePoints - currentLevelXP) / (nextLevelXP - currentLevelXP)) * 100;
}

// Online status helpers
function getTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return Math.floor(seconds / 60) + ' minutes ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
  if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';
  return 'a long time ago';
}

function isUserOnline(lastActive) {
  // User is considered online if active in the last 5 minutes
  return (Date.now() - lastActive) < 300000;
}

function getRankColor(rank) {
  const rankColors = {
    'Verified': '#81CCFF',
    'Server Donater': '#F6FF00',
    'Prob Helper': '#1ABC9C', 
    'Junior Helper': '#2ECC71',
    'Server Helper': '#2ECC71',
    'Prob Admin': '#FF3737',
    'Junior Admin': '#FF3737',
    'Senior Admin': '#FF3737',
    'Head Admin': '#FF0000',
    'Server Management': '#FFFFFF',
    'Executive Admin': '#FFFFDE'
  };
  return rankColors[rank] || '#808080'; // Default to gray if rank not found
}

function formatUsername(username, rank) {
  return `<span style="color: ${getRankColor(rank)}">${username}</span>`;
}