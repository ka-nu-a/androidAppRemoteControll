let operationDataConnection = null;
let streamMediaConnection = null;
let moveEventDelay = null; // onmousemoveイベントの発生頻度を減らす

const sendData = (dataConnection, data) => {
	dataConnection.send(data);
};

const onConnection = (conn => {
	if(operationDataConnection) {
		operationDataConnection.close(true);
	}
	operationDataConnection = conn;
	operationDataConnection.on("close", onCloseData);
});

const onCall = (conn => {
	if(streamMediaConnection) {
		streamMediaConnection.close(true);
	}
	streamMediaConnection = conn;
	streamMediaConnection.answer(null);
	streamMediaConnection.on("stream", onStream);
	streamMediaConnection.on("close", onCloseMedia);
});

const onStream = (stream => {
	const videoElm = document.getElementById("v_stream");
	videoElm.srcObject = stream;
	videoElm.play();
});

const onCloseMedia = (() => {
	streamMediaConnection = null;
	const videoElm = document.getElementById("v_stream");
	videoElm.srcObject = null;
	console.log("INFO: media connection was closed.");
});

const onCloseData = (() => {
	operationDataConnection = null;
	console.log("INFO: data connection was closed.");
});

const init = (async () => {
	const peer = await createPeer("operator");
	const APIport = 80;
	const APIpath = "/api/peer/reciever";
	const APIquery = new URLSearchParams({ip:await getIpAddr()});
	const APIurl = "http://" + location.hostname + ":" + APIport + APIpath + "?" + APIquery;
	const recieverPeerID = await fetch(APIurl)
		.then(resp => {
			if(resp.ok) {
				return resp.text();
			} else {
				throw new Error(`Request failed: ${resp.status} from ${APIurl}`);
			}
		});
	const streamerPeerID = "streamer";
	
	peer.on("open", async () => {
		operationDataConnection = peer.connect(recieverPeerID, {serialization: "binary"});
		operationDataConnection.on("error", () => {
			console.error("ERROR: don't connect data channel yet.");
		});
		operationDataConnection.on("close", onCloseData);
		
		streamMediaConnection = peer.call(streamerPeerID, null, {
			videoReceiveEnabled: true,
			audioReceiveEnabled: true
		});
		streamMediaConnection.on("stream", onStream);
		streamMediaConnection.on("close", onCloseMedia);
	});
	
	peer.on("connection", onConnection);
	peer.on("call", onCall);
	peer.on("error", (err) => {
		switch(err.type) {
			case "peer-unavailable":
				const idxPeerIdStart = err.message.indexOf('"')+1;
				const remotePeerID = err.message.substring(
					idxPeerIdStart,
					err.message.indexOf('"', idxPeerIdStart)
				);
				switch(remotePeerID) {
					case recieverPeerID:
						console.log("Info: can't find '" + recieverPeerID + "'. waiting for connected by reciever.");
						operationDataConnection = null;
						break;
					case streamerPeerID:
						console.log("Info: can't find '" + streamerPeerID + "'. waiting for called by streamer.");
						streamMediaConnection = null;
						break;
					default:
						console.error("Info: can't find '" + remotePeerID + "'");
						break;
				}
				break;
			default:
				console.error(`${err.type}: ${err.message}`);
				break;
		}
	});
});
init();

// デバイス間の差を吸収するオブジェクト
const deviceDependencyData = (() => {
	if(typeof window.ontouchstart === "undefined") {
		// PC
		const pcData = {};
		pcData.convEv2FhdPos = ((event) => {
			const clientRect = event.target.getBoundingClientRect();
			const pos = {
				x: Math.floor(event.offsetX/clientRect.width*1920),
				y: Math.floor(event.offsetY/clientRect.height*1080)
			};
			return  pos;
		});
		pcData.evDown = "mousedown";
		pcData.evUp = "mouseup";
		pcData.evMove = "mousemove";
		return pcData;
	} else {
		// SmartPhone
		const spData = {};
		spData.convEv2FhdPos = ((event) => {
			const clientRect = event.target.getBoundingClientRect();
			const clientPosX = clientRect.left + window.pageXOffset;
			const clientPosY = clientRect.top + window.pageYOffset;
			console.log(event.touches);
			const pos = {
				x: Math.floor((event.changedTouches[0].pageX - clientPosX)/clientRect.width*1920),
				y: Math.floor((event.changedTouches[0].pageY - clientPosY)/clientRect.height*1080)
			}
			return pos;
		});
		spData.evDown = "touchstart";
		spData.evUp   = "touchend";
		spData.evMove = "touchmove";
		return spData;
	}
})();

// MOVE
const onmousemove = (event) => {
	event.preventDefault(); // スマホでスクロールしないようにする
	if(moveEventDelay) return;
	moveEventDelay = setTimeout(()=>moveEventDelay=null, 17); // ひとまず60fps。負荷重かったらfps下げる。
	const fhdPos = deviceDependencyData.convEv2FhdPos(event);
	sendData(operationDataConnection, {action:"MOVE", x:fhdPos.x, y:fhdPos.y})
}

const v_stream = document.getElementById("v_stream");
// DOWN
v_stream.addEventListener(deviceDependencyData.evDown, (event) => {
	event.target.addEventListener(deviceDependencyData.evMove, onmousemove);
	const fhdPos = deviceDependencyData.convEv2FhdPos(event);
	sendData(operationDataConnection, {action:"DOWN", x:fhdPos.x, y:fhdPos.y})
	sendData(operationDataConnection, {action:"MOVE", x:fhdPos.x, y:fhdPos.y})
});
// UP
v_stream.addEventListener(deviceDependencyData.evUp, (event) => {
	event.target.removeEventListener(deviceDependencyData.evMove, onmousemove);
	const fhdPos = deviceDependencyData.convEv2FhdPos(event);
	sendData(operationDataConnection, {action:"UP", x:fhdPos.x, y:fhdPos.y})
});
