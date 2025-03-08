
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = 3000;

// Socket.IO connection handling
io.on('connection', (socket) => {
  socket.on('join', (whatsapp) => {
    socket.join(whatsapp);
  });
});

// Helper to emit notifications
function sendNotification(whatsapp, title, message) {
  io.to(whatsapp).emit('notification', { title, message });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, 'public/uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    cb(null, `${req.session.whatsapp}_${timestamp}${path.extname(file.originalname)}`);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image file'));
    }
  }
});

app.use(express.static('public'));
app.use('/uploads', express.static('public/uploads'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'alther-pride-secret',
  resave: false,
  saveUninitialized: true
}));

// Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

// User data file
const userFile = path.join(dataDir, 'users.json');
if (!fs.existsSync(userFile)) {
  fs.writeFileSync(userFile, '{}');
}

// All route definitions go here, after app initialization
app.get('/', (req, res) => {
  if (!req.session.verified) {
    res.sendFile(path.join(__dirname, 'public', 'verify.html'));
  } else if (req.session.whatsapp) {
    res.redirect('/profile');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

app.get('/forum', (req, res) => {
  req.session.verified = true;
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/register', (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const { whatsapp } = req.body;

  const whatsappRegex = /^08\d{8,13}$/;

  if (!whatsappRegex.test(whatsapp)) {
    res.json({ success: false, message: 'Invalid number format. Number must start with 08 and be between 10-15 digits' });
    return;
  }

  const isRepeatingPattern = /^(.)\1+$/.test(whatsapp.substring(2));
  if (isRepeatingPattern) {
    res.json({ success: false, message: 'Invalid number: Cannot use repeated digits' });
    return;
  }

  if (users[whatsapp]) {
    res.json({ success: false, message: 'WhatsApp number already registered' });
    return;
  }

  users[whatsapp] = { verified: false };
  fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
  res.json({ success: true });
});

app.post('/complete-profile', (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const { whatsapp, username, password } = req.body;

  if (!users[whatsapp]) {
    res.json({ success: false, message: 'WhatsApp number not found' });
    return;
  }

  users[whatsapp] = {
    ...users[whatsapp],
    username,
    password,
    verified: true,
    role: whatsapp === '088233076089' ? 'admin' : 'user',
    joinDate: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
    photoUrl: '/images/default-avatar.png',
    bannerUrl: '/images/original_banner.jpg'
  };

  fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
  req.session.whatsapp = whatsapp;
  res.json({ success: true });
});

app.get('/profile', (req, res) => {
  if (!req.session.whatsapp) {
    res.redirect('/');
    return;
  }
  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];
  res.json({ ...user, whatsapp: req.session.whatsapp });
});

app.get('/api/users/:whatsapp', (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.params.whatsapp];
  if (user) {
    res.json({ success: true, photoUrl: user.photoUrl || '/images/default-avatar.png' });
  } else {
    res.json({ success: false });
  }
});

// Helper function to update thread history
async function updateUserThreadHistory(whatsapp, updates) {
  const dataDir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dataDir);
  const commentFiles = files.filter(file => file.startsWith('comments_'));
  
  for (const file of commentFiles) {
    const filePath = path.join(dataDir, file);
    const comments = JSON.parse(fs.readFileSync(filePath));
    let modified = false;

    comments.forEach(comment => {
      if (comment.authorWhatsapp === whatsapp) {
        Object.assign(comment, updates);
        modified = true;
      }
    });

    if (modified) {
      fs.writeFileSync(filePath, JSON.stringify(comments, null, 2));
    }
  }
}

app.post('/api/profile/username', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { username } = req.body;
  const users = JSON.parse(fs.readFileSync(userFile));
  
  // Check if username is taken by another user
  const isUsernameTaken = Object.entries(users).some(([whatsapp, user]) => 
    user.username === username && whatsapp !== req.session.whatsapp
  );

  if (isUsernameTaken) {
    return res.json({ success: false, message: 'Username already taken' });
  }

  users[req.session.whatsapp].username = username;
  fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
  
  // Update thread history with new username
  updateUserThreadHistory(req.session.whatsapp, { author: username });
  
  res.json({ success: true });
});

app.post('/api/profile/password', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { currentPassword, newPassword } = req.body;
  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];

  if (user.password !== currentPassword) {
    return res.json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
  res.json({ success: true });
});

app.post('/login', (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const { username, password } = req.body;

  const whatsapp = Object.keys(users).find(key => 
    users[key].username === username && users[key].password === password
  );

  if (whatsapp) {
    req.session.whatsapp = whatsapp;
    res.json({ success: true });
  } else {
    res.json({ success: false, message: 'Invalid username or password' });
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      res.status(500).send('Error logging out');
    } else {
      res.redirect('/');
    }
  });
});

// Track user activity for online/offline status
app.use((req, res, next) => {
  if (req.session.whatsapp) {
    const users = JSON.parse(fs.readFileSync(userFile));
    if (users[req.session.whatsapp]) {
      users[req.session.whatsapp].lastActive = Date.now();
      fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
    }
  }
  next();
});

// Profile viewing route
app.get('/user/:whatsapp', (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const targetWhatsapp = req.params.whatsapp;
  
  if (!users[targetWhatsapp]) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  
  res.sendFile(path.join(__dirname, 'public', 'user_profile.html'));
});

app.get('/api/user/:whatsapp', (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const targetWhatsapp = req.params.whatsapp;
  
  if (!users[targetWhatsapp]) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  
  const user = users[targetWhatsapp];
  const isOnline = (Date.now() - (user.lastActive || 0)) < 300000; // 5 minutes
  
  // Filter out sensitive information
  const publicUserData = {
    username: user.username,
    rank: user.rank || 'Verified',
    photoUrl: user.photoUrl || '/images/default-avatar.png',
    bannerUrl: user.bannerUrl || '/images/original_banner.jpg',
    joinDate: user.joinDate,
    lastActive: user.lastActive,
    isOnline: isOnline,
    experiencePoints: user.experiencePoints || 0,
    level: Math.floor(Math.sqrt((user.experiencePoints || 0) / 10)),
    role: user.role
  };
  
  res.json({ success: true, user: publicUserData });
});

// Experience points system
app.post('/api/topics/:id/comments', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const topicsFile = path.join(dataDir, 'topics.json');
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  const topicIndex = topics.findIndex(t => t.id === req.params.id);
  const topic = topics[topicIndex];

  // Initialize thread count if it doesn't exist
  if (!topic.threadCount) {
    topic.threadCount = 0;
  }
  topic.threadCount++;
  fs.writeFileSync(topicsFile, JSON.stringify(topics, null, 2));

  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];

  if (topic.isLocked && user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'This topic is locked' });
  }

  // Add experience points for commenting
  if (!user.experiencePoints) user.experiencePoints = 0;
  user.experiencePoints += 5; // 5 XP for commenting
  fs.writeFileSync(userFile, JSON.stringify(users, null, 2));

  const { content, quotedCommentId } = req.body;

  const commentsFile = path.join(dataDir, `comments_${req.params.id}.json`);
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, '[]');
  }

  const comments = JSON.parse(fs.readFileSync(commentsFile));
  const newComment = {
    id: Date.now().toString(),
    content,
    author: user.username,
    authorWhatsapp: req.session.whatsapp,
    authorPhotoUrl: user.photoUrl,
    rank: user.rank || 'Verified',
    createdAt: new Date().toISOString(),
    quotedCommentId,
    level: Math.floor(Math.sqrt(user.experiencePoints / 10))
  };

  comments.push(newComment);
  fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2));
  res.json({ success: true, comment: newComment });
});

app.post('/api/topics', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { title, description } = req.body;
  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];
  
  // Add experience points for creating a topic
  if (!user.experiencePoints) user.experiencePoints = 0;
  user.experiencePoints += 10; // 10 XP for creating a topic
  fs.writeFileSync(userFile, JSON.stringify(users, null, 2));

  const topicsFile = path.join(dataDir, 'topics.json');
  if (!fs.existsSync(topicsFile)) {
    fs.writeFileSync(topicsFile, '[]');
  }
  
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  
  const newTopic = {
    id: Date.now().toString(),
    title,
    description,
    author: user.username,
    authorWhatsapp: req.session.whatsapp,
    authorLevel: Math.floor(Math.sqrt(user.experiencePoints / 10)),
    createdAt: new Date().toISOString(),
    threadCount: 0
  };
  
  topics.push(newTopic);
  fs.writeFileSync(topicsFile, JSON.stringify(topics, null, 2));
  
  res.json({ success: true, topic: newTopic });
});

const isAdmin = (req, res, next) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];

  if (user?.role !== 'admin' || !user?.rank) {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  if (!user.permissions.includes('manage_users')) {
    return res.status(403).json({ success: false, message: 'Insufficient rank permissions' });
  }

  next();
};

app.get('/admin/users', isAdmin, (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  res.json(users);
});

app.get('/admin/ranks', isAdmin, (req, res) => {
  const ranksFile = path.join(dataDir, 'ranks.json');
  const ranks = JSON.parse(fs.readFileSync(ranksFile));
  res.json(ranks);
});

app.post('/admin/change-rank', isAdmin, (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const { whatsapp, rank } = req.body;
  
  if (users[whatsapp]) {
    users[whatsapp].rank = rank;
    fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

app.post('/admin/change-role', isAdmin, (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const { whatsapp } = req.body;

  if (users[whatsapp]) {
    users[whatsapp].role = users[whatsapp].role === 'admin' ? 'user' : 'admin';
    fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

app.post('/admin/delete-user', isAdmin, (req, res) => {
  const users = JSON.parse(fs.readFileSync(userFile));
  const { whatsapp } = req.body;

  if (whatsapp === '088233076089') {
    return res.status(403).json({ success: false, message: 'Cannot delete main admin' });
  }

  if (users[whatsapp]) {
    delete users[whatsapp];
    fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false, message: 'User not found' });
  }
});

app.post('/upload-photo', upload.single('photo'), (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  if (req.body.setDefault) {
    const users = JSON.parse(fs.readFileSync(userFile));
    users[req.session.whatsapp].photoUrl = '/images/default-avatar.png';
    fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
    return res.json({ success: true, photoUrl: '/images/default-avatar.png' });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const photoUrl = `/uploads/${req.file.filename}`;
  const users = JSON.parse(fs.readFileSync(userFile));
  users[req.session.whatsapp].photoUrl = photoUrl;
  fs.writeFileSync(userFile, JSON.stringify(users, null, 2));
  
  // Update thread history with new photo URL
  updateUserThreadHistory(req.session.whatsapp, { authorPhotoUrl: photoUrl });
  
  res.json({ success: true, photoUrl });
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }
  res.json({ success: true, url: `/uploads/${req.file.filename}` });
});



app.get('/check-login', (req, res) => {
  if (req.session.whatsapp) {
    const users = JSON.parse(fs.readFileSync(userFile));
    const user = users[req.session.whatsapp];
    res.json({ loggedIn: true, username: user.username });
  } else {
    res.json({ loggedIn: false });
  }
});

app.get('/api/topics/:id', (req, res) => {
  const topicsFile = path.join(dataDir, 'topics.json');
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  const topic = topics.find(t => t.id === req.params.id);
  
  if (!topic) {
    return res.status(404).json(null);
  }
  
  res.json(topic);
});

app.get('/api/topics', (req, res) => {
  try {
    const topicsFile = path.join(dataDir, 'topics.json');
    if (!fs.existsSync(topicsFile)) {
      fs.writeFileSync(topicsFile, '[]');
    }
    
    const topics = JSON.parse(fs.readFileSync(topicsFile));
    const users = JSON.parse(fs.readFileSync(userFile));
  
  const topicsWithPermissions = topics.map(topic => ({
    ...topic,
    canDelete: req.session.whatsapp && (
      topic.authorWhatsapp === req.session.whatsapp || 
      users[req.session.whatsapp]?.role === 'admin'
    )
  }));
  
  res.json(topicsWithPermissions);
  } catch (error) {
    console.error('Error in /api/topics:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

app.post('/api/topics', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const { title, description } = req.body;
  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];

  const topicsFile = path.join(dataDir, 'topics.json');
  if (!fs.existsSync(topicsFile)) {
    fs.writeFileSync(topicsFile, '[]');
  }
  
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  
  const newTopic = {
    id: Date.now().toString(),
    title,
    description,
    author: user.username,
    authorWhatsapp: req.session.whatsapp,
    createdAt: new Date().toISOString(),
    threadCount: 0
  };
  
  topics.push(newTopic);
  fs.writeFileSync(topicsFile, JSON.stringify(topics, null, 2));
  
  res.json({ success: true, topic: newTopic });
});

app.post('/api/topics/:id/comments', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const topicsFile = path.join(dataDir, 'topics.json');
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  const topicIndex = topics.findIndex(t => t.id === req.params.id);
  const topic = topics[topicIndex];

  // Initialize thread count if it doesn't exist
  if (!topic.threadCount) {
    topic.threadCount = 0;
  }
  topic.threadCount++;
  fs.writeFileSync(topicsFile, JSON.stringify(topics, null, 2));

  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];

  if (topic.isLocked && user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'This topic is locked' });
  }

  const { content, quotedCommentId } = req.body;

  const commentsFile = path.join(dataDir, `comments_${req.params.id}.json`);
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, '[]');
  }

  const comments = JSON.parse(fs.readFileSync(commentsFile));
  const newComment = {
    id: Date.now().toString(),
    content,
    author: user.username,
    authorWhatsapp: req.session.whatsapp,
    authorPhotoUrl: user.photoUrl,
    rank: user.rank || 'Verified',
    createdAt: new Date().toISOString(),
    quotedCommentId
  };

  comments.push(newComment);
  fs.writeFileSync(commentsFile, JSON.stringify(comments, null, 2));
  res.json({ success: true, comment: newComment });
});

app.get('/api/topics/:id/comments', (req, res) => {
  const commentsFile = path.join(dataDir, `comments_${req.params.id}.json`);
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, '[]');
  }
  
  const comments = JSON.parse(fs.readFileSync(commentsFile));
  res.json(comments);
});

app.put('/api/topics/:id/status', (req, res) => {
  const topicsFile = path.join(dataDir, 'topics.json');
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  const { status, previousStatus } = req.body;
  
  const topicIndex = topics.findIndex(t => t.id === req.params.id);
  if (topicIndex === -1) {
    return res.status(404).json({ success: false, message: 'Topic not found' });
  }

  // Get thread count from comments
  const commentsFile = path.join(dataDir, `comments_${req.params.id}.json`);
  let threadCount = 0;
  if (fs.existsSync(commentsFile)) {
    const comments = JSON.parse(fs.readFileSync(commentsFile));
    threadCount = comments.length;
  }
  
  // Update thread count
  topics[topicIndex].threadCount = threadCount;
  
  // Update status
  topics[topicIndex].status = status;
  fs.writeFileSync(topicsFile, JSON.stringify(topics, null, 2));
  res.json({ success: true, threadCount });
});

app.post('/api/topics/:id/toggle-lock', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];
  
  if (user?.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }

  const topicsFile = path.join(dataDir, 'topics.json');
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  
  const topicIndex = topics.findIndex(t => t.id === req.params.id);
  if (topicIndex === -1) {
    return res.status(404).json({ success: false, message: 'Topic not found' });
  }
  
  topics[topicIndex].isLocked = !topics[topicIndex].isLocked;
  fs.writeFileSync(topicsFile, JSON.stringify(topics, null, 2));
  
  res.json({ 
    success: true, 
    isLocked: topics[topicIndex].isLocked 
  });
});

app.delete('/api/topics/:id', (req, res) => {
  if (!req.session.whatsapp) {
    return res.status(401).json({ success: false, message: 'Not logged in' });
  }

  const topicsFile = path.join(dataDir, 'topics.json');
  const topics = JSON.parse(fs.readFileSync(topicsFile));
  const users = JSON.parse(fs.readFileSync(userFile));
  const user = users[req.session.whatsapp];
  
  const topic = topics.find(t => t.id === req.params.id);
  
  if (!topic) {
    return res.status(404).json({ success: false, message: 'Topic not found' });
  }
  
  if (topic.authorWhatsapp !== req.session.whatsapp && user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Not authorized' });
  }
  
  const updatedTopics = topics.filter(t => t.id !== req.params.id);
  fs.writeFileSync(topicsFile, JSON.stringify(updatedTopics, null, 2));
  
  res.json({ success: true });
});

http.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
