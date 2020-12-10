const moment = require('moment');

const cluster = require('cluster'),
      express = require('express'),
      fs = require('fs'),
      MongoClient = require('mongodb').MongoClient,
      clusterTools = require('./server/clusterTools'),
      fabric = require('fabric').fabric,
      // app = express(),
      port = process.env.PORT || 8080,
      numCPUs = require('os').cpus().length,
      printLines = '----------------------------------------------------';

// JSON to store whiteboard state
const whiteboardJsonFile = __dirname + '/public/whiteboard.json';
fs.writeFile(whiteboardJsonFile, '', ()=> console.log('Whiteboard JSON file created...'));

// Mongodb connection string
const mongodbUri = "mongodb+srv://mkp14:hsXMDcZHujEombHL@cluster0.pvuqn.mongodb.net/workingDatabases?retryWrites=true&w=majority";


// Retrieve & send whiteboard state
var whiteboardContent = fs.readFileSync(whiteboardJsonFile, 'utf-8');

// Store connected clients
// let clients = new Map();
// let users = {};
let leader = null;

// store worker threads
let workers = [];
  
if (cluster.isMaster) {
  // Build master http server that doesn't listen for port connections 
  var server = require('http').createServer();
  var io = require('socket.io')(server);
  var redis = require('socket.io-redis');

  // Attach redis adapter to master socket instance
  io.adapter(redis({ host: 'localhost', port: 6379 }));

  // Store clients details
  let allClients = new Map();
  let allUsers = {};
  var socketCounter = 1;

  console.log(`Master process initializing ${numCPUs} workers`);
  // createListing(whiteboardContent);
  
  // Initialize worker processes
  for (var i = 0; i < numCPUs; i++) {
    // Create & store worker server
    workers.push(cluster.fork());

    // Listen for messages from worker
    workers[i].on('message', (msg)=> {
      
      // Client joins
      if (msg.userJoined) {
        // Retrieve socket id & username
        var socketId = msg.userJoined[0];
        var username = msg.userJoined[1];

        // Select initial leader
        if(allClients.size < 1) {
          leader = socketId;
          
          console.log(`\n${printLines}\nMaster Server: ${socketId} set as leader`);

          retrieveWhiteboards(io, leader);

          // // Get leader's whiteboard state
          // console.log('Master sending old state ' + previousWhiteboards);
          // io.to(leader).emit('leader', previousWhiteboards);
        } else {
          // Retrieve & send whiteboard state
          var whiteboardContent = fs.readFileSync(whiteboardJsonFile, 'utf-8');

          // Get leader's whiteboard state
          io.to(leader).emit('canvas:leader', socketId);
          // io.to(socketId).emit('canvas:initial', whiteboardContent);
          console.log(`\n${printLines}\nMaster Server: Canvas state sent to ${socketId}`);
        }
        // Store socket & username
        allClients.set(msg.userJoined[0], socketCounter);
        allUsers[msg.userJoined[0]] = msg.userJoined[1];
        socketCounter++;

        // Send status update to all clients 
        io.emit('update:history', `${username} joined.`);
        io.emit('update:userCount', getUserCount(allUsers));
        io.emit('update:users', allUsers);
      }
      // Leader loads previous canvas
      else if (msg.canvasLoad) {
        // Retrieve socket id
        var socketId = msg.canvasLoad[0];
        var previousCanvas = msg.canvasLoad[1];

        // Send previous canvas state to clients
        io.emit('canvas:load', previousCanvas);
        io.emit('update:history', `${allUsers[socketId]} loaded saved whiteboard.`);
        console.log(`\n${printLines}\nMaster Server: '${socketId}' loaded saved whiteboard`);
      }
      // Client clears whiteboard
      else if (msg.canvasClear) {
        // Retrieve socket id
        var socketId = msg.canvasClear;

        io.emit('canvas:clear');
        io.emit('update:history', `${allUsers[socketId]} cleared the whiteboard.`);
        console.log(`\n${printLines}\nMaster Server: '${socketId}' cleared the whiteboard`);
      }
      // Leader closes whiteboard
      else if (msg.canvasClose) {
        // Retrieve socket id
        var socketId = msg.canvasClose;

        // Close all sockets
        io.emit('canvas:close');
        io.close();
        console.log(`\n${printLines}\nMaster Server: '${socketId}' closed the whiteboard`);
      }
      // Client disconnects
      else if (msg.userDisconnected) {
        // Retrieve socket id
        var socketId = msg.userDisconnected;
        var emitMessage = ``;

        // Leader client disconnects
        if(socketId === leader) {
          console.log(`\n${printLines}\nMaster Server: leader ${socketId} left`);
          emitMessage = `${allUsers[socketId]} leader left.`;
          leader = null;
        } else {
          console.log(`\n${printLines}\nMaster Server: ${socketId} left.`);
          emitMessage = `${allUsers[socketId]} left.`;
        }
        // Delete client socket
        allClients.delete(msg.userDisconnected);
        delete allUsers[msg.userDisconnected];

        // Send status update to all clients 
        io.emit('update:history', emitMessage);
        io.emit('update:userCount', getUserCount(allUsers));
        io.emit('update:users', allUsers);
      } 
    });
    // Get all connected users
    // (io.sockets.sockets).size
  }

  // Worker process exits
  cluster.on('exit', function(worker, code, signal) {
    console.log('Worker ' + worker.process.pid + ' died');

    // Replace dead worker
    workers.push(cluster.fork());
  }); 

} else {
  // build worker server using express & http
  var app = express();
  var server = require('http').createServer(app);
  var io = require('socket.io')(server);
  var redis = require('socket.io-redis');

  // Attach Redis adapter to worker socket instance
  io.adapter(redis({ host: 'localhost', port: 6379 }));

  // Listen for activity on port
  server.listen(port, ()=> console.log(`Worker Server ${process.pid}: listening on port ${port}...`));

  // set server directory & PORT
  app.use(express.static(__dirname));

  app.get('/', (request,response)=>{
    response.setHeader('Content-Type', 'text/html');
    response.sendFile(__dirname + '/public/whiteboard.html');
  });

  // Handling socket interactions 
  io.sockets.on('connection', (socket)=> {
    // Store connected clients
    let workerClients = new Map();
    let workerUsers = {};
    var i = 1;

    console.log(`Worker Server ${process.pid}: [id=${socket.id}] connected...`);

    // Update state when user joins
    socket.on('join', (username)=> {
      // Store client socket & username
      workerClients.set(socket, i);
      workerUsers[socket.id] = username;
      i++;

      // Send message to master process
      process.send({ userJoined: [socket.id, username] });

      // Update all clients on join
      socket.emit('update:history', `${username} connected to server.`);
    });

    /**
     * TODO:
     * 
     * add object removal
     * client leader selection using voting
     */

    // Object added by client
    socket.on('object:added', (data)=> socket.broadcast.emit('object:added', data));
    
    // Retrieve leader's canvas state
    socket.on('canvas:leader', (data)=> {
      // Store canvas locally
      fs.writeFile(whiteboardJsonFile, data[1], ()=> console.log(`Worker Server ${process.pid}: Leader's whiteboard state saved.`));

      // Send leader's canvas state to new client
      io.to(data[0]).emit('canvas:initial', data[1]);

      // Add timestamp to canvas & store on database
      var savedWhiteboard = JSON.parse(data[1]);
      savedWhiteboard["timestamp"] = moment().format()
      createWhiteboardSave(savedWhiteboard);
    });

    // Leader loads previous canvas state
    socket.on('canvas:load', (data)=> {
      // Send previous canvas state to clients
      process.send({ canvasLoad: [socket.id, data] });
    });

    // Whiteboard closed by leader
    socket.on('canvas:close', ()=> {
      // Inform master of whiteboard close
      process.send({ canvasClose: socket.id });
      io.close();
    });

    // Whiteboard cleared by client
    socket.on('canvas:clear', ()=> {
      // Inform master of whiteboard clear
      process.send({ canvasClear: socket.id });
    });

    // Client disconnects
    socket.on('disconnect', ()=> {
      // Send message only if user fully joined the whiteboard
      if (socket.id in workerUsers){
        // Update master process
        process.send({ userDisconnected: socket.id });

        // Remove client socket & update user list
        workerClients.delete(socket);
        delete workerUsers[socket.id];

        console.log(`Worker Server ${process.pid}: ${socket.id} left.`);
      } else {
        console.log(`Worker Server ${process.pid}: ${socket.id} disconnected...`);
      }
    });
  });

} // End of else

// Print connections to server every 10 seconds
// setInterval(()=> {
//   if(clients.size == 0) {
//     console.log(`\n${printLines}\nServer: No clients connected...`);
//   } else {
//     console.log(`\n${printLines}\nServer: ${clients.size} connected client(s)`);
//     io.emit('message', "You're in");
//   }
// }, 10000);

// Function returning the count of keys in an object
function getUserCount(object){ return Object.keys(object).length }

// Function to save whiteboard state to database 
async function createWhiteboardSave(whiteboardState){
  // Connect to mongoDb
  const client = await MongoClient.connect(mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true }).catch(err => { console.log(err);});

  if(!client) {
    return; 
  }

  // Store whiteboard on database
  try {
    const result = await client.db("collaborativeWhiteboard").collection("whiteboardStates").insertOne(whiteboardState);
    console.log(`Whiteboard state stored with the following id: ${result.insertedId}`);
  } catch (err) {
    console.log(err);
  } finally {
    client.close();
  }
}

// Function to retrieve saved whiteboard states from database 
async function retrieveWhiteboards(io, socketId){
  // Connect to mongoDb
  const client = await MongoClient.connect(mongodbUri, { useNewUrlParser: true, useUnifiedTopology: true }).catch(err => { console.log(err);});

  if(!client) {
    return; 
  }

  // Retrieve whiteboard states from database
  try {
    const cursor = client.db("collaborativeWhiteboard").collection("whiteboardStates").find().limit(5);
    const result = await cursor.toArray();

    // Send saved whiteboards to leader
    io.to(socketId).emit('set:leader', result);
  } catch (err) {
    console.log(err);
  } finally {
    client.close();
  }
}