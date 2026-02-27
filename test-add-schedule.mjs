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

    if (msg.type === 'auth_required') {
        ws.send(JSON.stringify({
            type: 'auth',
            access_token: token
        }));
    } else if (msg.type === 'auth_ok') {
        console.log('Auth OK, adding schedule via REST API...');

        // Add schedule via fetch POST
        fetch('https://ha.dlawoejr.com/api/scheduler/add', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                weekdays: ["daily"],
                timeslots: [{
                    start: "14:05:00",
                    actions: [{
                        service: "input_boolean.turn_on",
                        entity_id: "input_boolean.washer", // assuming this exists
                        service_data: {}
                    }]
                }],
                repeat_type: "repeat",
                name: "Test Schedule 123"
            })
        }).then(res => res.json()).then(res => {
            console.log('Add response:', res);

            // Now fetch all schedules via websocket
            ws.send(JSON.stringify({
                id: messageId++,
                type: "scheduler/schedules"
            }));
        }).catch(err => {
            console.error(err);
            ws.close();
        });

    } else if (msg.type === 'result' && msg.id === messageId - 1) {
        console.log('Schedules List:');
        const schedules = msg.result;
        const added = schedules.find(s => s.name === "Test Schedule 123");
        console.log(JSON.stringify(added, null, 2));
        ws.close();
    } else if (msg.type === 'auth_invalid') {
        console.error('Auth invalid');
        ws.close();
    }
});
