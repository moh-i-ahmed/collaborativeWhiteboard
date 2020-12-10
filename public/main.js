moment.locale('en');

(function() {
  // Connect to server socket
  var socket = io.connect("http://localhost:8080", { transports: [ 'websocket' ], reconnect: true });

  // Check connection status
  setTimeout(()=>{ console.log("Connected:" + socket.connected) }, 1000);

  socket.on('connect_failed', function() {
    document.write("Sorry, there seems to be an issue with the connection!");
  });

  // HTML DOM id
  var $ = function(id){return document.getElementById(id)};

  // Create fabric.js canvas object
  var canvas = this.__canvas = new fabric.Canvas('canvas', { isDrawingMode: true, selection: false });
  
  window.addEventListener('resize', resizeCanvas, false);

  // Set canvas dimensions
  function resizeCanvas() {
    canvas.setHeight(window.innerHeight *0.6);
    canvas.setWidth(window.innerWidth * 0.9);
    canvas.renderAll();
  }

  // Resize canvas on page initialize
  resizeCanvas();

  fabric.Object.prototype.transparentCorners = false;

  // Drawing control panel
    var drawingOptionsEl = $('drawing-mode-options'),
      drawingColorEl = $('drawing-color'),
      drawingShadowColorEl = $('drawing-shadow-color'),
      drawingLineWidthEl = $('drawing-line-width'),
      drawingShadowWidth = $('drawing-shadow-width'),
      drawingShadowOffset = $('drawing-shadow-offset'),
      // closeAppEl = $('closeApp'),
      clearEl = $('clear-canvas');

  // Wipe canvas content
  clearEl.onclick = function() { 
    // Store canvas as JSON
    var canvasState = JSON.stringify(canvas);

    canvas.clear();
    socket.emit('canvas:clear', {});
  };

  // Brush selector
  $('drawing-mode-selector').onchange = function() {

    canvas.freeDrawingBrush = new fabric[this.value + 'Brush'](canvas);

    if (canvas.freeDrawingBrush) {
      var brush = canvas.freeDrawingBrush;
      brush.color = drawingColorEl.value;
      if (brush.getPatternSrc) {
        brush.source = brush.getPatternSrc.call(brush);
      }
      brush.width = parseInt(drawingLineWidthEl.value, 10) || 1;
      brush.shadow = new fabric.Shadow({
        blur: parseInt(drawingShadowWidth.value, 10) || 0,
        offsetX: 0,
        offsetY: 0,
        affectStroke: true,
        color: drawingShadowColorEl.value,
      });
    }
  };

  // Change drawing color
  drawingColorEl.onchange = function() {
    var brush = canvas.freeDrawingBrush;
    brush.color = this.value;
    if (brush.getPatternSrc) {
      brush.source = brush.getPatternSrc.call(brush);
    }
  };
  drawingShadowColorEl.onchange = function() {
    canvas.freeDrawingBrush.shadow.color = this.value;
  };
  drawingLineWidthEl.onchange = function() {
    canvas.freeDrawingBrush.width = parseInt(this.value, 10) || 1;
    this.previousSibling.innerHTML = this.value;
  };
  drawingShadowWidth.onchange = function() {
    canvas.freeDrawingBrush.shadow.blur = parseInt(this.value, 10) || 0;
    this.previousSibling.innerHTML = this.value;
  };
  drawingShadowOffset.onchange = function() {
    canvas.freeDrawingBrush.shadow.offsetX = parseInt(this.value, 10) || 0;
    canvas.freeDrawingBrush.shadow.offsetY = parseInt(this.value, 10) || 0;
    this.previousSibling.innerHTML = this.value;
  };

  if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = drawingColorEl.value;
    canvas.freeDrawingBrush.width = parseInt(drawingLineWidthEl.value, 10) || 1;
    canvas.freeDrawingBrush.shadow = new fabric.Shadow({
      blur: parseInt(drawingShadowWidth.value, 10) || 0,
      offsetX: 0,
      offsetY: 0,
      affectStroke: true,
      color: drawingShadowColorEl.value,
    });
  }
  
  /* 
  ---------------------------------------------------------------
  --------------------- Canvas Events ---------------------------
  ---------------------------------------------------------------
  */

  // Generate UUID
  function generateUUID() {
    return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
  }

  // Retrieve object by stored UUID
  function getObjectById(uuid) {
    var object = null;
    var objects = canvas.getObjects();

    len =  objects.length;
    for (var i = 0; i < len; i++) {
      if(objects[i].uuid && objects[i].uuid === uuid) {
        object = objects[i];
        break;
      }
      return object;
    }
  }

  // Client adds object to canvas
  canvas.on('object:added', (newObject)=> {
    var fabricObject = newObject.target;

    if(!fabricObject.remote) {
      // Add identifying attributes to object
      fabricObject.toObject = (function(toObject) {
        return function() {
          return fabric.util.object.extend(toObject.call(this), { 
            uuid: generateUUID(),
            author: socket.id,
            timestamp: (moment().format()),
          });
        };
      })(fabricObject.toObject);
      
      // Serialize object to JSON & transmit
      socket.emit('object:added', JSON.stringify(fabricObject));
    }
    // Remove remote flag
    delete fabricObject.remote;
  });

  // Object added to canvas by other client
  socket.on('object:added', (rawObject)=> {
    // Parse incoming JSON
    var fabricObject = JSON.parse(rawObject);

    // Deserialize JSON & add object to canvas
    fabric.util.enlivenObjects([fabricObject], function(enlivenedObjects) {
      // Prevent an infinite loop of adding the same object
      enlivenedObjects[0].remote = true;
      canvas.add(enlivenedObjects[0]);
      canvas.renderAll();
    });
  });


  /* 
  ---------------------------------------------------------------
  --------------------- Socket Events ---------------------------
  ---------------------------------------------------------------
  */

  // Get username before acessing whiteboard
  jQuery(document).ready(function($) {
    var ready = false;

    // Show username modal
    $(window).on('load',function(){
      $('#loginModal').modal('show');
      $('#controlPanel').hide();
    });

    // Disable canvas until username is entered
    $("#canvas").prop('disabled', true);
    $("#name").focus();
    $("form").submit(function(event){
        event.preventDefault();
    });

    // Username entered using Join button
    $("#join").on("click", function(){
      var name = $("#name").val();
      if (name != "") {
          socket.emit("join", name);
          $("#login").detach();
          $("#canvas").prop('disabled', false);
          $('#loginModal').modal('hide');
          $("#username").append(name);

          ready = true;
      }
    });

    // Username entered using Enter key
    $("#name").on("keypress", function(e){
      if(e.which == 13) {
        var name = $("#name").val();
        if (name != "") {
          socket.emit("join", name);
          $("#login").detach();
          $("#canvas").prop('disabled', false);
          $('#loginModal').modal('hide');
          $("#username").append(name);

          ready = true;
        }
      }
    });

    // Leader closing application
    $("#loadWhiteboards").on("click", function() { 
      $('#loadingModal').modal('show');
    });

    // Leader closing application
    $("#closeApp").on("click", function() { 
      // Show leader a status message
      $("#closedMessage").empty();
      $("#closedMessage").append("Whiteboard successfully closed... ");
      $('#closedModal').modal('show');

      // Update all clients of whiteboard close
      socket.emit('canvas:close', {});

      // Destroy leader socket
      socket.destroy();
    });
        
    /* 
    ---------------------------------------------------------------
    --------------------- Socket Events ---------------------------
    ---------------------------------------------------------------
    */

    // Update status
    socket.on("update:history", (data)=> {
      if(ready)
        $("#history").append(data + "<br>");
    });

    // Update user count
    socket.on("update:userCount", function(userCount){
      if(ready) {
        $("#userCount").empty();
        $("#userCount").append("Connected users: " + userCount);
      }
    });

    // Update user list
    socket.on("update:users", function(users){
      if(ready) {
        $("#users").empty();
        $.each(users, function(clientid, name) {
            $('#users').append(name + "<br>");
        });
      }
    });

    // Whiteboard closed by leader
    socket.on('canvas:close', ()=> {
      // Show closing message & destroy client sockets
      $('#loginModal').modal('hide');
      $('#closedModal').modal('show');
      socket.destroy();
    });

    // Enable control features for leader
    socket.on("set:leader", (previousWhiteboards)=> {
      $("#controlPanel").show();
      
      // Show previous whiteboards
      $("#previousWhiteboards").empty();
      $.each(previousWhiteboards, function(index) {
        // Generate dynamic whiteboard loading content
        var previousWhiteboardId = `loadWhiteboard${index}`;

        var loadingButton = $(`<div class='bg-white py-2 rounded'> <a class='collapse-item show' href='#' id='${previousWhiteboardId}'> <i class='fa fa-save fa-sm fa-fw mr-2 text-primary'></i> </a> </div>`);

        // Add dynamic content to view
        $('#previousWhiteboards').append(loadingButton);
        $(`#${previousWhiteboardId}`).append(previousWhiteboards[index]["timestamp"] + "<br>");

        // Loading event listener
        $(`#${previousWhiteboardId}`).on("click", function() { 
          // Update all clients of whiteboard close
          socket.emit('canvas:load', previousWhiteboards[index]);
        });
      });
    });

    // Client disconnects
    socket.on("disconnect", function(){
      $("#update").append("Server is unavailable... <br>");
      $("#users").append("Unavailable... <br>");
    });

  });

  // Load initial canvas state on join
  socket.on('canvas:initial', (data)=> {
    // Temporarily disable event listener to prevent looping
    var initialListeners = canvas.__eventListeners['object:added'];
    canvas.__eventListeners['object:added'] = [];

    // Load initial canvas
    canvas.loadFromJSON(data, function() {
      // canvas.remote = true;
      canvas.renderAll();
    }, function(o, object) {
      console.log(o, object);
    });
    
    // Re-enable event listener
    canvas.__eventListeners['object:added'] = initialListeners;
  });

  // Leader loads previous canvas state
  socket.on('canvas:load', (data)=> {
    // Temporarily disable event listener to prevent looping
    var initialListeners = canvas.__eventListeners['object:added'];
    canvas.__eventListeners['object:added'] = [];

    // Load previous canvas
    canvas.loadFromJSON(data, function() {
      canvas.renderAll();
    }, function(o, object) {
      console.log(o, object);
    });
    
    // Re-enable event listener
    canvas.__eventListeners['object:added'] = initialListeners;
  });

  // Send leader canvas state to new client
  socket.on('canvas:leader', (data)=> {
    // Serialize canvas as JSON
    var canvasState = JSON.stringify(canvas);

    // Transmit receiving socket id & canvas state
    socket.emit('canvas:leader', [data, canvasState]);
  });

  // Wipe all whiteboards
  socket.on('canvas:clear', ()=> canvas.clear());

})();