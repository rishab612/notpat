let socket;
const clientId = crypto.randomUUID();

function joinRoom() {
  const room = document.getElementById('roomName').value.trim();
  if (!room) return alert('Please enter a workspace name.');

  socket = new WebSocket('ws://localhost:3000');

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'join', room }));

    document.getElementById('roomLabel').textContent = `Room: ${room}`;
    document.getElementById('editorBox').style.display = 'block';

    const editor = document.getElementById('editor');
    editor.addEventListener('input', () => {
      socket.send(JSON.stringify({
        type: 'update',
        room,
        content: editor.value,
        senderId: clientId
      }));
    });
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'update' && data.senderId !== clientId) {
      const editor = document.getElementById('editor');
      const caretPos = editor.selectionStart;
      editor.value = data.content;
      editor.setSelectionRange(caretPos, caretPos);
    }
  };

  socket.onerror = (err) => {
    console.error("WebSocket error:", err);
  };
}
