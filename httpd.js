const https = require('https');
const url = require('url'); //url parsing
const fs = require('fs'); //file system
const net = require('net'); //network
const ws = require('ws'); //websocket
// https://github.com/websockets/ws
//install with:
//npm install --save ws
//on Dexter, if httpd.js is going to be in the /srv/samba/share/ folder,
//install ws there but then run it from root. e.g.
//cd /srv/samba/share/
//npm install --save ws
//cd /
//node /srv/samba/share/httpd.js

//var mime = require('mime'); //translate extensions into mime types
//skip that,it's stupidly big
const mimeTypes = {
    "html": "text/html",
    "mp3": "audio/mpeg",
    "mp4": "video/mp4",
    "jpeg": "image/jpeg",
    "jpg": "image/jpeg",
    "png": "image/png",
    "svg": "image/svg+xml",
    "gif": "image/gif",
    "js": "text/javascript",
    "css": "text/css",
};

const options = {
    key: fs.readFileSync('./certs/privkey.pem'),
    cert: fs.readFileSync('./certs/fullchain.pem')
};
//standard web server on port 443 to serve files
const server = https.createServer(options, function(req, res) {
    var q = url.parse(req.url, true);
    if ("/" == q.pathname) q.pathname = "index.html";
    var filename = "/srv/samba/share/www/" + q.pathname;
    console.log("serving" + q.pathname);
    fs.readFile(filename, function(err, data) {
        if (err) {
            res.writeHead(404, {
                'Content-Type': 'text/html'
            });
            return res.end("404 Not Found");
        }
        res.setHeader('Access-Control-Allow-Origin', '*');
        let mimeType = mimeTypes[q.pathname.split(".").pop()] || "application/octet-stream";
        console.log("Content-Type:", mimeType);
        res.setHeader("Content-Type", mimeType);
        res.writeHead(200);
        res.write(data);
        return res.end();
    });
}).listen(443);
console.log("listing on port 443");

//socket server to accept websockets from the browser on port 3000
//and forward them out to DexRun as a raw socket
const browser = new ws.Server({
    server
})

var bs;
const dexter = new net.Socket();

//don't open the socket yet, because Dexter only allows 1 socket connection
dexter.connected = false; //track socket status (doesn't ws do this?)

browser.on('connection', function connection(socket, req) {
    console.log(process.hrtime()[1], " browser connected ", req.connection.Server);
    bs = socket
    socket.on('message', function(data) {
        console.log(process.hrtime()[1], " browser says ", data.toString());
        //Now as a client, open a raw socket to DexRun on localhost
        if (!dexter.connected && !dexter.connecting) {
            dexter.connect(50000, "127.0.0.1")
            console.log("dexter connect")
            dexter.on("connect", function() {
                dexter.connected = true
                console.log("dexter connected")
                dexter.write(data.toString());
            })
            dexter.on("data", function(data) {
                //console.log(process.hrtime()[1], " dexter says ", data)
                //for(let i = 0; i<8*4; i+=4) {console.log(i, data[i])}
                console.log(process.hrtime()[1], " dexter says ", "#" + data[1 * 4] + " op:" + String.fromCharCode(data[4 * 4]))
                if (data[5 * 4]) {
                    console.log("error:" + data[5 * 4])
                }
                if (bs) {
                    bs.send(data, {
                        binary: true
                    })
                    console.log(process.hrtime()[1], " sent to browser ")
                }
            })
            dexter.on("close", function() {
                dexter.connected = false
                console.log("dexter disconnect")
                dexter.removeAllListeners()
                //or multiple connect/data/close events next time
            })
            dexter.on("end", function() {
                dexter.connected = false
                console.log("dexter ended")
                //dexter.removeAllListeners()
                dexter.end()
                //or multiple connect/data/close events next time
            })
            dexter.on("error", function() {
                dexter.connected = false
                console.log("dexter error")
                if (bs) bs.send(null, {
                    binary: true
                });

                dexter.removeAllListeners()
                dexter.destroy()
            })
        }
        dexter.write(data.toString());
    });
    socket.on('close', function(data) {
        console.log(process.hrtime()[1], " browser disconnected ");
        bs = null
        dexter.end()
    });
});


//test to see if we can get a status update from DexRun
//dexter.write("1 1 1 undefined g ;")
