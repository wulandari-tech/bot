const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// --- Database Sederhana (db.json) ---

const DB_FILE = path.join(__dirname, 'db.json');

// Fungsi untuk membaca data dari db.json
function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    } else {
      // Jika file belum ada, inisialisasi dengan struktur dasar
      return { users: [], groups: [], messages: [] };
    }
  } catch (error) {
    console.error('Error reading db.json:', error);
    return { users: [], groups: [], messages: [] }; // Default jika error
  }
}

// Fungsi untuk menulis data ke db.json
function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('Error writing to db.json:', error);
  }
}

// Inisialisasi data
let db = readDb();


// --- Middleware ---
app.use(express.json());

// --- Endpoint API (Contoh) ---

// 1. History Chat
app.get('/api/history/:groupId', (req, res) => {
  const { groupId } = req.params;
  const messages = db.messages.filter(m => m.groupId === groupId)
    .sort((a, b) => a.timestamp - b.timestamp); // Urutkan berdasarkan timestamp

  // Sertakan username pengirim (join sederhana)
    const messagesWithSender = messages.map(msg => {
      const sender = db.users.find(u => u.userId === msg.senderId);
      return {
          ...msg,
          senderUsername: sender ? sender.username : 'Unknown User'
      }
    });

  res.json(messagesWithSender);
});

// 2.  Buat Grup
app.post('/api/groups', (req, res) => {
    const { groupName, userId } = req.body; // userId dari pembuat grup

    if (!groupName || !userId) {
        return res.status(400).json({ message: 'Nama grup dan userId diperlukan.' });
    }
    const user = db.users.find(u => u.userId === userId);
     if (!user) {
        return res.status(404).json({ message: 'User tidak ditemukan.' });
    }


    const newGroupId = `group-${db.groups.length + 1}`; // ID sederhana
    const newGroup = {
        groupId: newGroupId,
        groupName,
        members: [userId], // Pembuat grup langsung jadi anggota
        timestamp: Date.now(),
    };

    db.groups.push(newGroup);
    writeDb(db);

    res.status(201).json(newGroup); // Kirim data grup baru
});

// 3. Dapatkan semua groups
app.get('/api/groups', (req, res) => {
    const groupData = db.groups.map(group => {
       const memberUsernames = group.members.map(memberId => {
          const user = db.users.find(u => u.userId === memberId);
          return user ? user.username : 'Unknown';
       });
       return {
          ...group,
          memberUsernames,
       }
    });

    res.json(groupData);
});

// 4. Endpoint dummy untuk login/register (SANGAT SEDERHANA)
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: 'Username dan password diperlukan.' });
    }

    let user = db.users.find(u => u.username === username);

    if (!user) {
        // Jika user belum ada, anggap sebagai registrasi
        const newUserId = `user-${db.users.length + 1}`; // ID sederhana
        user = { userId: newUserId, username, password };
        db.users.push(user);
        writeDb(db);  // Simpan ke db.json
    } else if (user.password !== password) {
       return res.status(401).json({ message: 'Password salah.' });
    }
     //  Jika user sdh ada dan password benar
      res.json({ userId: user.userId, username: user.username });
});

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log('User terhubung:', socket.id);
    let currentUserId = null; // Menyimpan userId setelah login

     // Event: User Login (dari frontend)
    socket.on('login', async (userData) => {
      currentUserId = userData.userId;
      console.log(`User ${currentUserId} login`);

      // Join semua grup yang user ini jadi anggota
      db.groups.forEach(group => {
        if (group.members.includes(currentUserId)) {
          socket.join(group.groupId);
          console.log(`User ${currentUserId} joined group ${group.groupId}`);
        }
      });
    });


    // 1. Kirim Pesan
  socket.on('chatMessage', (data) => {
    const { groupId, messageText } = data;

    if (!currentUserId) {
      console.error('User belum login, tidak bisa kirim pesan');
      return; // Hentikan jika belum login
    }

    // Simpan pesan
    const newMessage = {
      messageId: `msg-${db.messages.length + 1}`, // ID sederhana
      groupId,
      senderId: currentUserId,
      messageText,
      timestamp: Date.now(),
    };

    db.messages.push(newMessage);
    writeDb(db); // Simpan ke db.json

     // Dapatkan username pengirim.
      const sender = db.users.find(u => u.userId === currentUserId);

    // Emit ke semua anggota grup (termasuk pengirim)
    io.to(groupId).emit('message', {
      ...newMessage,
      senderUsername: sender ? sender.username : 'Unknown User' // Kirim username
    });
  });


    // 2. Join Group (setelah login, dan saat masuk halaman grup)
   socket.on('joinGroup', (groupId) => {
    if (!currentUserId) {
        return;
    }

    // Cek apakah user adalah anggota grup
    const group = db.groups.find(g => g.groupId === groupId);

    if (group && group.members.includes(currentUserId)) {
        socket.join(groupId);
        console.log(`User ${socket.id} bergabung ke grup ${groupId}`);
    } else {
        console.log(`User ${socket.id} tidak diizinkan bergabung ke grup ${groupId}`);
    }
});


    // 3. Leave Group
    socket.on('leaveGroup', (groupId) => {
        socket.leave(groupId);
        console.log(`User ${socket.id} keluar dari grup ${groupId}`);
    });

    // --- WebRTC Signaling (Contoh Dasar, sama seperti sebelumnya) ---
     socket.on('offer', (data) => {
        socket.to(data.groupId).emit('offer', { ...data, senderId: currentUserId });
    });

    socket.on('answer', (data) => {
        socket.to(data.groupId).emit('answer', { ...data, senderId: currentUserId });
    });

    socket.on('ice-candidate', (data) => {
        socket.to(data.groupId).emit('ice-candidate', { ...data, senderId: currentUserId });
    });
    // --- Tambahan:  Event untuk memberitahu anggota lain saat ada user baru join/leave ---

    socket.on('userJoinedGroup', (data) => {
      const { groupId } = data;
       const user = db.users.find(u => u.userId === currentUserId);

        io.to(groupId).emit('userJoinedGroup', { groupId, userId: currentUserId, username: user.username }); // Kirim info user
    });
    socket.on('disconnect', () => {
        console.log('User terputus:', socket.id);
          if (currentUserId) {
            // Beri tahu semua grup tempat user ini berada
             db.groups.forEach(group => {
              if(group.members.includes(currentUserId)){
                io.to(group.groupId).emit('userLeftGroup', { groupId: group.groupId, userId: currentUserId });
              }
             });
          }
    });

});

// --- HTML (Inline) ---

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Diskusi App</title>
      <style>
        /* CSS Styling (Lebih Rapi) */
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
        #messages li.me { background-color: #dcf8c6; align-self: flex-end; } /* Pesan dari saya */
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
        #video-container{
          display: flex;
        }
      </style>
    </head>
    <body>

      <div id="login-container">
        <input type="text" id="username-input" placeholder="Username">
        <input type="password" id="password-input" placeholder="Password">
        <button id="login-button">Login / Register</button>
    </div>


      <div id="container" style="display: none;">  <!-- Awalnya disembunyikan -->
        <div id="sidebar">
             <div id="create-group-form">
                <input type="text" id="new-group-name" placeholder="Nama grup baru">
                <button id="create-group-button">Buat Grup</button>
            </div>
            <ul id="group-list"></ul>
        </div>
        <div id="chat-area">
          <div id="header">
            <div id="group-name"></div>
            <div id="call-buttons">
              <button id="video-call-button" title="Video Call"></button>
              <button id="voice-call-button" title="Voice Call"></button>
            </div>
          </div>
          <div id="messages-container">
            <ul id="messages"></ul>
          </div>
          <div id="message-form">
            <input type="text" id="message-input" placeholder="Ketik pesan...">
            <button id="send-button">Kirim</button>
          </div>
        </div>
         <div id="video-container"></div>
      </div>

      <script src="/socket.io/socket.io.js"></script>
      <script>
        const socket = io();

        // --- Elemen UI ---
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


        let currentUserId = null;
        let currentGroupId = null;

        // --- Login/Register ---
          loginButton.addEventListener('click', async () => {
            const username = usernameInput.value;
            const password = passwordInput.value;

            if(!username || !password){
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
                // alert('Login berhasil!  UserID: ' + currentUserId);
                loginContainer.style.display = 'none'; // Sembunyikan form login
                container.style.display = 'flex';    // Tampilkan area chat

                //  Setelah login berhasil, minta daftar grup
                fetchGroups();

                socket.emit('login', { userId: currentUserId });

            } else {
                const errorData = await response.json();
                alert('Login gagal: ' + errorData.message);
            }
        });


        // --- Fungsi untuk Load History Chat ---
        function loadChatHistory(groupId) {
            fetch('/api/history/' + groupId)
                .then(response => response.json())
                .then(history => {
                    messagesList.innerHTML = ''; // Bersihkan pesan sebelumnya
                    history.forEach(message => addMessageToUI(message));
                })
                .catch(error => console.error('Error loading history:', error));
        }
        // --- Fungsi untuk Menambahkan Pesan ke UI ---
        function addMessageToUI(message) {
          const li = document.createElement('li');
          li.textContent = \`\${message.senderUsername}: \${message.messageText} (\${new Date(message.timestamp).toLocaleString()})\`;
           // Cek apakah pesan ini dari user yang sedang login
            if (message.senderId === currentUserId) {
                li.classList.add('me'); // Tambahkan class 'me'
            }
          messagesList.appendChild(li);
          messagesList.scrollTop = messagesList.scrollHeight; // Auto-scroll ke bawah
        }

       // --- Event: Menerima Pesan Baru ---
        socket.on('message', (message) => {
             // Cek apakah pesan ini untuk grup yang sedang aktif
            if (message.groupId === currentGroupId) {
                addMessageToUI(message);
            }
        });

        // --- Kirim Pesan ---
         sendButton.addEventListener('click', () => {
            const text = messageInput.value;
            if (text.trim() !== '' && currentGroupId) {
                socket.emit('chatMessage', { groupId: currentGroupId, messageText: text });
                messageInput.value = '';
            }
        });

        // --- Event: User bergabung ke grup (dari server) ---
        socket.on('userJoinedGroup', (data) => {
          //  if (data.groupId === currentGroupId) {
                console.log(\`User \${data.username} bergabung ke grup \${data.groupId}\`);
                // Tambahkan notifikasi ke UI (opsional)
          //  }
        });

         // --- Event: User keluar dari grup (dari server) ---
        socket.on('userLeftGroup', (data) => {
             if (data.groupId === currentGroupId) {
                console.log(\`User \${data.userId} keluar dari grup \${data.groupId}\`);
                // Update UI (misalnya, hapus user dari daftar anggota)
            }
        });

        // --- Fungsi untuk Menampilkan Daftar Grup ---

         function displayGroups(groups) {
            groupList.innerHTML = ''; // Bersihkan daftar grup
            groups.forEach(group => {
                const listItem = document.createElement('li');
                listItem.classList.add('group-item')
                listItem.textContent = group.groupName;

                // Tampilkan anggota grup (jika ada)
                if(group.memberUsernames){
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
                    socket.emit('joinGroup', currentGroupId); // Join grup yang dipilih
                });
                groupList.appendChild(listItem);
            });
        }

        // --- Fungsi untuk Mengambil Daftar Grup dari Server ---
        function fetchGroups() {
            fetch('/api/groups')
                .then(response => response.json())
                .then(groups => {
                    displayGroups(groups);
                })
                .catch(error => console.error('Error fetching groups:', error));
        }
         // --- Buat Grup Baru ---
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
                    // Tambahkan grup baru ke daftar (tanpa perlu fetch ulang)
                    displayGroups([newGroup]); // Langsung tambahkan ke UI
                    newGroupNameInput.value = ''; // Kosongkan input

                     // Emit event ke server bahwa user membuat grup baru
                    socket.emit('userJoinedGroup', { groupId: newGroup.groupId });
                })
                .catch(error => console.error('Error creating group:', error));
            }
        });

         // --- WebRTC (Sama seperti sebelumnya, dengan sedikit perbaikan) ---
        let localStream;
        let peerConnections = {}; // Menyimpan RTCPeerConnection, key adalah userId

         async function startCall(isInitiator, callType) {
          try {
              localStream = await navigator.mediaDevices.getUserMedia({
                  video: callType === 'video', // Hanya video jika video call
                  audio: true
              });

              // Tampilkan local video
              const localVideo = document.createElement('video');
              localVideo.srcObject = localStream;
              localVideo.autoplay = true;
              localVideo.muted = true; // Mute local video
              videoContainer.appendChild(localVideo);



              // Buat offer jika pemanggil pertama
              if (isInitiator) {
                  // Kirim offer ke semua anggota grup (simplified, idealnya kirim ke user tertentu)
                  socket.emit('offer', { groupId: currentGroupId, callType });
              }

          } catch (err) {
              console.error("Error accessing media:", err);
              alert("Gagal mengakses kamera/mikrofon: " + err.message);
          }
      }

        // --- Signaling Handlers ---
       socket.on('offer', async (data) => {
        if (data.senderId === currentUserId) return; // Jangan proses offer dari diri sendiri

        const pc = new RTCPeerConnection();
        peerConnections[data.senderId] = pc;

        // Add local stream to PC
        if(localStream){
          localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        }


        // Set remote description dari offer
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));

        // Buat answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // Kirim answer ke pengirim offer
        socket.emit('answer', { groupId: currentGroupId, answer, to: data.senderId });

        // --- ICE Candidate Handling ---

        pc.onicecandidate = event => {
            if (event.candidate) {
                socket.emit('ice-candidate', { groupId: currentGroupId, candidate: event.candidate, to: data.senderId });
            }
        };

        // --- Handle Remote Stream ---
        pc.ontrack = event => {
            const remoteVideo = document.createElement('video');
            remoteVideo.srcObject = event.streams[0];
            remoteVideo.autoplay = true;
            videoContainer.appendChild(remoteVideo);
        };
    });

      socket.on('answer', async (data) => {
        if (data.senderId === currentUserId) return; // Jangan proses answer dari diri sendiri
        const pc = peerConnections[data.senderId];
        if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    });

    socket.on('ice-candidate', async (data) => {
       if (data.senderId === currentUserId) return; //  Jangan proses ice candidate dari diri sendiri
        const pc = peerConnections[data.senderId];
        if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });

        // --- Tombol Panggilan ---
          videoCallButton.addEventListener('click', () => {
              startCall(true, 'video'); // true = initiator, 'video' = tipe panggilan
          });

          voiceCallButton.addEventListener('click', () => {
              startCall(true, 'audio'); // true = initiator, 'audio' = tipe panggilan
          });
      </script>
    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});
