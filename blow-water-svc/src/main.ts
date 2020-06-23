import { server as WebSocketServer, connection } from 'websocket';
import * as http from 'http';
import * as fs from 'fs';
import * as mime from 'mime-types';

const server = http.createServer((request, response) => {
    const path = 'web' + request.url;
    if (fs.existsSync(path)) {
        const stat = fs.statSync(path);
        const actualPath = stat.isDirectory() ? path + '/index.html' : path;
        response.writeHead(200, { 'Content-Type': mime.lookup(actualPath).toString() });
        response.end(fs.readFileSync(actualPath));
    } else {
        response.writeHead(404);
        response.end();
    }
});
server.listen(8080);

const wsSessions: { [room: string]: { [id: string]: connection } } = {};
let sessionIdCounter = 0;

const wsServer = new WebSocketServer({
    httpServer: server,
    autoAcceptConnections: false
});
wsServer.on('request', request => {
    const pathMatch = request.resource.match(/^\/room\/([^\/]+)$/);
    if (!pathMatch) {
        request.reject(404);
        return;
    }

    const room = pathMatch[1];
    if (!wsSessions[room]) {
        wsSessions[room] = {};
    }

    const ws = request.accept();
    const sessionId = ++sessionIdCounter;
    wsSessions[room][sessionId] = ws;
    ws.send(JSON.stringify({
        type: 'participant-list',
        you: sessionId,
        all: Object.keys(wsSessions[room]),
    }));

    ws.on('message', message => {
        if (message.type == 'utf8') {
            const command = JSON.parse(message.utf8Data) as { to?: string };
            if (command.to) {
                if (wsSessions[room][command.to]) {
                    wsSessions[room][command.to].send(message.utf8Data);
                }
            } else {
                Object.values(wsSessions[room]).forEach(s => s.send(message.utf8Data));
            }
        }
    });
    
    ws.on('close', () => {
        delete wsSessions[room][sessionId];
        const message = JSON.stringify({
            type: 'participant-leave',
            from: sessionId,
        });
        Object.values(wsSessions[room]).forEach(s => s.send(message));
    });
});

console.log('Server started');