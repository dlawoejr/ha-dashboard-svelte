import WebSocket from 'ws';

const url = 'wss://ha.dlawoejr.com/api/websocket';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJkNmY1NzdjYjMwNDc0NGUyODFmYWExYjBlMmYyOGEyNyIsImlhdCI6MTczODk4NzY1NywiZXhwIjo0ODkyNTg3NjU3fQ.hN98DqOeeoIIN-1eP_bZZXF5w5998a44k5_mXJ3kQgY';

const ws = new WebSocket(url);

let messageId = 1;

ws.on('open', () => {
    console.log('Connected to HA');
});

ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    console.log('Received:', JSON.stringify(msg, null, 2));

    if (msg.type === 'auth_required') {
        console.log('Sending auth...');
        ws.send(JSON.stringify({
            type: 'auth',
            access_token: token
        }));
    } else if (msg.type === 'auth_ok') {
        console.log('Auth OK, sending subscribe_trigger...');

        ws.send(JSON.stringify({
            id: messageId++,
            type: 'subscribe_trigger',
            trigger: {
                platform: 'state',
                entity_id: ['sun.sun', 'person.dlawoejr']
            }
        }));

        // Wait a second, then close
        setTimeout(() => ws.close(), 3000);
    } else if (msg.type === 'auth_invalid') {
        console.error('Auth invalid');
        ws.close();
    }
});

ws.on('error', (err) => {
    console.error('WS Error:', err);
});
