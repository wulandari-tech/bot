const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const DB_FILE = path.join(__dirname, 'db.json');

function readDb() {
    try {
        return fs.existsSync(DB_FILE) ? JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) : { users: [], groups: [], messages: [] };
    } catch (error) {
        console.error('Error reading db.json:', error);
        return { users: [], groups: [], messages: [] };
    }
}

function writeDb(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (error) {
        console.error('Error writing to db.json:', error);
    }
}

let db = readDb();

app.use(express.json());

app.get('/api/history/:groupId', (req, res) => {
    const { groupId } = req.params;
    const messages = db.messages.filter(m => m.groupId === groupId)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map(msg => {
            const sender = db.users.find(u => u.userId === msg.senderId);
            return { ...msg, senderUsername: sender ? sender.username : 'Unknown User' };
        });
    res.json(messagesWithSender);
});

app.post('/api/groups', (req, res) => {
    const { groupName, userId } = req.body;
    if (!groupName || !userId) return res.status(400).json({ message: 'Nama grup dan userId diperlukan.' });
    if (!db.users.find(u => u.userId === userId)) return res.status(404).json({ message: 'User tidak ditemukan.' });

    const newGroupId = `group-${db.groups.length + 1}`;
    const newGroup = { groupId: newGroupId, groupName, members: [userId], timestamp: Date.now() };
    db.groups.push(newGroup);
    writeDb(db);
    res.status(201).json(newGroup);
});

app.get('/api/groups', (req, res) => {
    const groupData = db.groups.map(group => ({
        ...group,
        memberUsernames: group.members.map(memberId => {
            const user = db.users.find(u => u.userId === memberId);
            return user ? user.username : 'Unknown';
        })
    }));
    res.json(groupData);
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ message: 'Username dan password diperlukan.' });

    let user = db.users.find(u => u.username === username);
    if (!user) {
        const newUserId = `user-${db.users.length + 1}`;
        user = { userId: newUserId, username, password };
        db.users.push(user);
        writeDb(db);
    } else if (user.password !== password) {
        return res.status(401).json({ message: 'Password salah.' });
    }
    res.json({ userId: user.userId, username: user.username });
});

io.on('connection', (socket) => {
    console.log('User terhubung:', socket.id);
    let currentUserId = null;

    socket.on('login', (userData) => {
        currentUserId = userData.userId;
        console.log(`User ${currentUserId} login`);
        db.groups.forEach(group => {
            if (group.members.includes(currentUserId)) socket.join(group.groupId);
        });
    });

    socket.on('chatMessage', (data) => {
        const { groupId, messageText } = data;
        if (!currentUserId) return;

        const newMessage = { messageId: `msg-${db.messages.length + 1}`, groupId, senderId: currentUserId, messageText, timestamp: Date.now() };
        db.messages.push(newMessage);
        writeDb(db);

        const sender = db.users.find(u => u.userId === currentUserId);
        io.to(groupId).emit('message', { ...newMessage, senderUsername: sender ? sender.username : 'Unknown User' });
    });

    socket.on('joinGroup', (groupId) => {
        if (!currentUserId) return;
        const group = db.groups.find(g => g.groupId === groupId);
        if (group && group.members.includes(currentUserId)) socket.join(groupId);
    });

    socket.on('leaveGroup', (groupId) => socket.leave(groupId));

    socket.on('offer', (data) => socket.to(data.groupId).emit('offer', { ...data, senderId: currentUserId }));
    socket.on('answer', (data) => socket.to(data.groupId).emit('answer', { ...data, senderId: currentUserId }));
    socket.on('ice-candidate', (data) => socket.to(data.groupId).emit('ice-candidate', { ...data, senderId: currentUserId }));

    socket.on('userJoinedGroup', (data) => {
        const { groupId } = data;
        const user = db.users.find(u => u.userId === currentUserId);
        io.to(groupId).emit('userJoinedGroup', { groupId, userId: currentUserId, username: user.username });
    });

    socket.on('disconnect', () => {
        if (currentUserId) {
            db.groups.forEach(group => { if (group.members.includes(currentUserId)) io.to(group.groupId).emit('userLeftGroup', { groupId: group.groupId, userId: currentUserId }); });
        }
    });
});

app.get('/', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Diskusi App</title>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.15.3/css/all.min.css">
      <style>
        body { font-family: sans-serif; margin: 0; padding: 0; background-color: #f0f2f5; }
        #container { display: flex; height: 100vh; }
        #sidebar { width: 250px; background-color: #fff; border-right: 1px solid #ddd; overflow-y: auto; }
        #chat-area { flex: 1; display: flex; flex-direction: column; }
        #header { background-color: #007bff; color: #fff; padding: 10px; display: flex; justify-content: space-between; align-items: center; }
        #group-name { font-size: 1.2em; font-weight: bold; }
        #call-buttons {  }
        #call-buttons button { background: none; border: none; color: #fff; cursor: pointer; margin-left: 10px; font-size: 1.2em;}
        #messages-container { flex: 1; overflow-y: auto; padding: 10px; }
        #messages { list-style: none; padding: 0; margin: 0; }
        #messages li { margin-bottom: 8px; padding: 8px; border-radius: 5px; background-color: #fff; }
        #messages li.me { background-color: #dcf8c6; align-self: flex-end; }
        #message-form { display: flex; padding: 10px; border-top: 1px solid #ddd; }
        #message-input { flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 5px; margin-right: 5px;}
        #send-button { padding: 8px 15px; background-color: #007bff; color: #fff; border: none; border-radius: 5px; cursor: pointer; }
        #login-container { display: flex; flex-direction:column; width: 300px; margin: 50px auto; padding: 20px; border: 1px solid #ccc; border-radius: 5px; background-color: #fff; }
        #login-container input { margin-bottom: 10px; padding: 8px; border: 1px solid #ccc; border-radius: 5px; }
        #login-button, #register-button { padding: 8px 15px; background-color: #007bff; color: #fff; border: none; border-radius: 5px; cursor: pointer;  margin-bottom: 10px;}
        #group-list{ list-style: none; padding: 0; margin: 0; }
        .group-item { padding: 10px; cursor: pointer; border-bottom: 1px solid #eee; }
        .group-item:hover { background-color: #f0f0f0; }
        #create-group-form { padding: 10px; border-bottom: 1px solid #ddd; }
        #new-group-name { width: 80%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; margin-right: 5px; }
        #create-group-button { padding: 8px 12px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; }
        .group-member { margin-left: 5px; background-color: #ddd; padding: 2px 5px; border-radius: 3px; }
        #video-container{ display: flex; }
        .modal { display: none; position: fixed; z-index: 1; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.4); }
        .modal-content { background-color: #fefefe; margin: 15% auto; padding: 20px; border: 1px solid #888; width: 80%; border-radius: 10px; display: flex; flex-direction: column; align-items: center;}
        .modal-content button { margin: 5px; padding: 10px 15px; border: none; border-radius: 5px; cursor: pointer; width: 80%; }
        .modal-content .hangup-button { background-color: #f44336; color: white; }
        .modal-content .control-button { background-color: #2196F3; color: white;}
         #device-info {margin-left: auto; color: #aaa; font-size: 0.8em;}

        /* Responsiveness */
        @media (max-width: 768px) {
            #sidebar { width: 100%; border-right: none; }
            #chat-area { margin-top: 10px; }
            #container{flex-direction: column;}
        }

      </style>
    </head>
    <body>
    <div id="login-container">
        <input type="text" id="username-input" placeholder="Username">
        <input type="password" id="password-input" placeholder="Password">
        <button id="login-button"><i class="fas fa-sign-in-alt"></i> Login / Register</button>
    </div>

  <div id="container" style="display: none;">
    <div id="sidebar">
      <div id="create-group-form">
        <input type="text" id="new-group-name" placeholder="Nama grup baru">
        <button id="create-group-button"><i class="fas fa-plus"></i> Buat Grup</button>
      </div>
      <ul id="group-list"></ul>
    </div>
    <div id="chat-area">
    <div id="header">
        <div id="group-name"></div>
        <div id="call-buttons">
            <button id="video-call-button" title="Video Call"><i class="fas fa-video"></i></button>
              <button id="voice-call-button" title="Voice Call"><i class="fas fa-phone"></i></button>
              <span id="device-info"></span>
        </div>
    </div>
      <div id="messages-container">
        <ul id="messages"></ul>
      </div>
      <div id="message-form">
        <input type="text" id="message-input" placeholder="Ketik pesan...">
        <button id="send-button"><i class="fas fa-paper-plane"></i> Kirim</button>
      </div>
    </div>
    <div id="video-container"></div>
  </div>


    <div id="call-modal" class="modal">
        <div class="modal-content">
            <button class="hangup-button" id="hangup-button"><i class="fas fa-phone-slash"></i> Akhiri Panggilan</button>
            <button class="control-button" id="toggle-audio-button"><i class="fas fa-microphone"></i> <span id="audio-text">Bisukan Audio</span></button>
            <button class="control-button" id="toggle-video-button"><i class="fas fa-video"></i> <span id="video-text">Matikan Video</span> </button>
        </div>
    </div>

    <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();

        const loginContainer = document.getElementById('login-container');
        const usernameInput = document.getElementById('username-input');
        const passwordInput = document.getElementById('password-input');
        const loginButton = document.getElementById('login-button');

        const container = document.getElementById('container');
        const groupList = document.getElementById('group-list');
        const chatArea = document.getElementById('chat-area');
        const groupNameDisplay = document.getElementById('group-name');
        const messagesList = document.getElementById('messages');
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');
        const videoCallButton = document.getElementById('video-call-button');
        const voiceCallButton = document.getElementById('voice-call-button');
        const createGroupForm = document.getElementById('create-group-form');
        const newGroupNameInput = document.getElementById('new-group-name');
        const createGroupButton = document.getElementById('create-group-button');
        const videoContainer = document.getElementById('video-container');
        const callModal = document.getElementById('call-modal');
        const hangupButton = document.getElementById('hangup-button');
        const toggleAudioButton = document.getElementById('toggle-audio-button');
        const toggleVideoButton = document.getElementById('toggle-video-button');
        const deviceInfoDisplay = document.getElementById('device-info');
        const audioText = document.getElementById('audio-text');  // Tambahkan ini
        const videoText = document.getElementById('video-text'); // Tambahkan ini

        let currentUserId = null;
        let currentGroupId = null;
        let localStream;
        let peerConnections = {};
        let isAudioMuted = false;
        let isVideoMuted = false;


        function detectDevice() {
            const userAgent = navigator.userAgent;
            let device = 'Unknown';

            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent)) {
                device = 'Mobile';
            } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
                device = 'iOS Device';
            }
            else if (/Tablet|iPad/i.test(userAgent)) {
                device = 'Tablet';
            } else if (/Linux/.test(userAgent)) {
                device = 'Linux Desktop';
            }
            else if (/Win/.test(userAgent)) {
                device = 'Windows Desktop';
            } else if (/Mac/.test(userAgent)) {
                device = 'Mac Desktop';
            }

            deviceInfoDisplay.textContent = device;
        }

        detectDevice();


        loginButton.addEventListener('click', async () => {
            const username = usernameInput.value;
            const password = passwordInput.value;

            if (!username || !password) {
                alert('isi semua form.');
                return;
            }

            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const data = await response.json();
                currentUserId = data.userId;
                loginContainer.style.display = 'none';
                container.style.display = 'flex';
                fetchGroups();
                socket.emit('login', { userId: currentUserId });
            } else {
                const errorData = await response.json();
                alert('Login gagal: ' + errorData.message);
            }
        });

        function loadChatHistory(groupId) {
            fetch('/api/history/' + groupId)
                .then(response => response.json())
                .then(history => {
                    messagesList.innerHTML = '';
                    history.forEach(message => addMessageToUI(message));
                })
                .catch(error => console.error('Error loading history:', error));
        }

        function addMessageToUI(message) {
            const li = document.createElement('li');
            li.textContent = \`\${message.senderUsername}: \${message.messageText} (\${new Date(message.timestamp).toLocaleString()})\`;
            if (message.senderId === currentUserId) li.classList.add('me');
            messagesList.appendChild(li);
            messagesList.scrollTop = messagesList.scrollHeight;
        }

        socket.on('message', (message) => {
            if (message.groupId === currentGroupId) addMessageToUI(message);
        });

        sendButton.addEventListener('click', () => {
            const text = messageInput.value;
            if (text.trim() !== '' && currentGroupId) {
                socket.emit('chatMessage', { groupId: currentGroupId, messageText: text });
                messageInput.value = '';
            }
        });

        socket.on('userJoinedGroup', (data) => {
            if (data.groupId === currentGroupId) console.log(\`User \${data.username} bergabung ke grup \${data.groupId}\`);
        });

        socket.on('userLeftGroup', (data) => {
            if (data.groupId === currentGroupId) console.log(\`User \${data.userId} keluar dari grup \${data.groupId}\`);
        });

        function displayGroups(groups) {
            groupList.innerHTML = '';
            groups.forEach(group => {
                const listItem = document.createElement('li');
                listItem.classList.add('group-item')
                listItem.textContent = group.groupName;

                if (group.memberUsernames) {
                    group.memberUsernames.forEach(username => {
                        const memberSpan = document.createElement('span');
                        memberSpan.classList.add('group-member');
                        memberSpan.textContent = username;
                        listItem.appendChild(memberSpan)
                    });
                }

                listItem.addEventListener('click', () => {
                    currentGroupId = group.groupId;
                    groupNameDisplay.textContent = group.groupName;
                    loadChatHistory(currentGroupId);
                    socket.emit('joinGroup', currentGroupId);
                });
                groupList.appendChild(listItem);
            });
        }

        function fetchGroups() {
            fetch('/api/groups')
                .then(response => response.json())
                .then(groups => displayGroups(groups))
                .catch(error => console.error('Error fetching groups:', error));
        }

        createGroupButton.addEventListener('click', () => {
            const groupName = newGroupNameInput.value;
            if (groupName.trim() !== '' && currentUserId) {
                fetch('/api/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ groupName, userId: currentUserId }),
                })
                    .then(response => response.json())
                    .then(newGroup => {
                        displayGroups([newGroup]);
                        newGroupNameInput.value = '';
                        socket.emit('userJoinedGroup', { groupId: newGroup.groupId });
                    })
                    .catch(error => console.error('Error creating group:', error));
            }
        });



       async function startCall(isInitiator, callType) {
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: callType === 'video',
                    audio: true
                });

                const localVideo = document.createElement('video');
                localVideo.srcObject = localStream;
                localVideo.autoplay = true;
                localVideo.muted = true;
                videoContainer.appendChild(localVideo);

                if (isInitiator) {
                  socket.emit('offer', { groupId: currentGroupId, callType });
                }

               callModal.style.display = "block";


            } catch (err) {
                console.error("Error accessing media:", err);
                alert("Gagal mengakses kamera/mikrofon: " + err.message);
            }
        }

        socket.on('offer', async (data) => {
            if (data.senderId === currentUserId) return;

            const pc = new RTCPeerConnection();
            peerConnections[data.senderId] = pc;


            if (localStream) {
                localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
            }

            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { groupId: currentGroupId, answer, to: data.senderId });

            pc.onicecandidate = event => {
                if (event.candidate) {
                    socket.emit('ice-candidate', { groupId: currentGroupId, candidate: event.candidate, to: data.senderId });
                }
            };

            pc.ontrack = event => {
                const remoteVideo = document.createElement('video');
                remoteVideo.srcObject = event.streams[0];
                remoteVideo.autoplay = true;
                videoContainer.appendChild(remoteVideo);
            };
              callModal.style.display = "block";
        });

        socket.on('answer', async (data) => {
            if (data.senderId === currentUserId) return;
            const pc = peerConnections[data.senderId];
            if (pc) await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        });

        socket.on('ice-candidate', async (data) => {
            if (data.senderId === currentUserId) return;
            const pc = peerConnections[data.senderId];
            if (pc) await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        });

       function toggleAudio() {
            if (localStream) {
                localStream.getAudioTracks().forEach(track => {
                    track.enabled = !track.enabled;
                    isAudioMuted = !track.enabled;
                });
                audioText.textContent = isAudioMuted ? 'Bunyikan Audio' : 'Bisukan Audio';
                // Ganti ikon
                toggleAudioButton.innerHTML = isAudioMuted ? '<i class="fas fa-microphone-slash"></i> ' + audioText.textContent : '<i class="fas fa-microphone"></i> ' + audioText.textContent;
            }
        }

        function toggleVideo() {
            if (localStream) {
                localStream.getVideoTracks().forEach(track => {
                    track.enabled = !track.enabled;
                    isVideoMuted = !track.enabled
                });
                videoText.textContent = isVideoMuted ? 'Hidupkan Video' : 'Matikan Video';

                // Ganti ikon
                toggleVideoButton.innerHTML = isVideoMuted ? '<i class="fas fa-video-slash"></i> ' + videoText.textContent : '<i class="fas fa-video"></i> ' + videoText.textContent;
            }
        }
         function endCall() {
            for (let userId in peerConnections) {
                if (peerConnections.hasOwnProperty(userId)) {
                    peerConnections[userId].close();
                }
            }
            peerConnections = {};

            if (localStream) {
                localStream.getTracks().forEach(track => track.stop());
                localStream = null;
            }

            while (videoContainer.firstChild) {
                videoContainer.removeChild(videoContainer.firstChild);
            }

            callModal.style.display = 'none';
        }


        videoCallButton.addEventListener('click', () => startCall(true, 'video'));
        voiceCallButton.addEventListener('click', () => startCall(true, 'audio'));
        hangupButton.addEventListener('click', endCall);
        toggleAudioButton.addEventListener('click', toggleAudio);
        toggleVideoButton.addEventListener('click', toggleVideo);

    </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server berjalan di port ${PORT}`));
