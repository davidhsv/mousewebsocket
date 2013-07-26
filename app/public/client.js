$(document)
		.ready(
				function() {

					//variaveis
					var isMobile = /ipad|iphone|android/i.test(navigator.userAgent);
					var insideIframe = (window.parent != window);
					var viewport = document.getElementById('viewport');
					var w = viewport.width, h = viewport.height;
					var lastSent = new Date() - 100;
					var jviewport = $(viewport);
					var jwindow = $(window);
					////var tl = new TimelineLite();

					//constantes
					var MIN_SEND_RATE = 10; // the min interval in ms between 2 send

					function sendPoints (x, y) {
						lastSent = new Date();
						socket.emit('c', JSON.stringify([
							1,
							x,
							y
						]));
					}

					function canSendNow() {
						return new Date() - lastSent > MIN_SEND_RATE;
					}

					function onMouseMove(e) {
						e.preventDefault();
						var o = positionWithE(e);
						if (canSendNow()) {
							sendPoints(o.x, o.y);
						}
					}
					

					function positionWithE(e) {
						var o = jviewport.offset();
						var x = e.clientX, y = e.clientY;
						if (e.touches) {
							var touch = e.touches[0];
							if (touch) {
								x = touch.pageX;
								y = touch.pageY;
							}
						}
						return {
							x : x - (o.left - jwindow.scrollLeft()),
							y : y - (o.top - jwindow.scrollTop())
						};
					}
					
					viewport.addEventListener(isMobile ? "touchmove" : "mousemove", onMouseMove);
					
					/*
					 Connect to socket.io on the server.
					 */
					var host = window.location.host.split(':')[0];
					var socket = io.connect('http://' + host, {
						reconnect : false
					});
					var intervalID;
					var reconnectCount = 0;

					socket.on('connect', function() {
						console.log('connected');
					});
					socket.on('connecting', function() {
						console.log('connecting');
					});
					socket.on('disconnect', function() {
						console.log('disconnect');
						intervalID = setInterval(tryReconnect, 4000);
					});
					socket.on('connect_failed', function() {
						console.log('connect_failed');
						intervalID = setInterval(tryReconnect, 4000);
					});
					socket.on('error', function(err) {
						console.log('error: ' + err);
						console.log(err);
						intervalID = setInterval(tryReconnect, 4000);
					});
					socket.on('reconnect_failed', function() {
						console.log('reconnect_failed');
						intervalID = setInterval(tryReconnect, 4000);
					});
					socket.on('reconnect', function() {
						console.log('reconnected ');
					});
					socket.on('reconnecting', function() {
						console.log('reconnecting');
					});

					var tryReconnect = function() {
							++reconnectCount;
							if (reconnectCount == 5) {
								clearInterval(intervalID);
							}
							console
									.log('Making a dummy http call to set jsessionid (before we do socket.io reconnect)');
							$
									.ajax('/')
									.success(function() {
										console.log("http request succeeded");
										//reconnect the socket AFTER we got jsessionid set
										socket.socket.reconnect();
										clearInterval(intervalID);
									})
									.error(
											function(err) {
												console
														.log("http request failed (probably server not up yet)");
											});
						};
						
						/*
						 When a message comes from the server, format, colorize it etc. and display in the chat widget
						 */
						socket.on('c', function(msg) {
							var message = JSON.parse(msg);
							var usuario = message[1];

							var action = message[0];

							switch (action) {
							case 1:
								//se for eu mesmo, dar highlight no cursor
								var img = $("#" + usuario);
								if (img.length == 0) {
									img = $(jviewport).append("<img style='position:absolute' src='img/verde.png' id='" + usuario + "'/>");
								}
								//console.log(message.x, message.y);
								
								////tl.to(img.get(0), 0.003, {left: message[2], top: message[3]});
								img.css({left: message[2], top: message[3]});
								break;
//							case 'control':
//								messageView.find('.user').text(message.user);
//								messageView.find('.message').text(message.msg);
//								messageView.addClass('control');
//								break;
							}

//							// color own user:
//							if (message.user == name)
//								messageView.find('.user').addClass('self');

						});
					
//==========================================================================

					//Check if the user is rejoining
					//ps: This value is set by Express if browser session is still valid
					var user = $('#user').text();
					// show join box
					if (user === "") {
						$('#ask').show();
						$('#ask input').focus();
					} else { //rejoin using old session
						join(user);
					}

					// join on enter
					$('#ask input').keydown(function(event) {
						if (event.keyCode == 13) {
							$('#ask a').click();
						}
					});

					/*
					 When the user joins, hide the join-field, display chat-widget and also call 'join' function that
					 initializes Socket.io and the entire app.
					 */
					$('#ask a').click(function() {
						join($('#ask input').val());
					});

					function join(name) {
						$('#ask').hide();
						$('#channel').show();
						$('input#message').focus();
						

						

						/*
						 When the user Logs in, send a HTTP POST to server w/ user name.
						 */
						$.post('/user', {
							"user" : name
						}).success(function() {
							// send join message
							socket.emit('join', JSON.stringify({}));
						}).error(function() {
							console.log("error");
						});

						var container = $('div#msgs');

						

						/*
						 When the user creates a new chat message, send it to server via socket.emit w/ 'chat' event/channel name
						 */
						$('#channel form').submit(function(event) {
							event.preventDefault();
							var input = $(this).find(':input');
							var msg = input.val();
							socket.emit('c', JSON.stringify({
								action : 'message',
								msg : msg
							}));
							input.val('');
						});

					}
				});