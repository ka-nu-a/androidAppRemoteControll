let localStream = null;
let streamMediaConnection = null;
let peer = null;
const operatorPeerID = "operator";

const init = (async () => {
	peer = await createPeer("streamer");
	peer.on("call", connection => {
		if(localStream) {
			streamMediaConnection = connection;
			streamMediaConnection.answer(localStream);
			streamMediaConnection.on("close", onClose);
		} else {
			connection.close(true);
		}
	});
	peer.on("error", (err) => {
		switch(err.type) {
			case "peer-unavailable":
				console.log("Info: can't find '" + operatorPeerID + "'. waiting for called by streamer.");
				streamMediaConnection = null;
				break;
			default:
				console.error(`${err.type}: ${err.message}`);
				break;
		}
	});
});
init();

const onClose = (() => {
	streamMediaConnection = null
	console.log("INFO: media connection was closed.");
});

// Chrome外の音声を共有する場合、ステレオミキサーを噛ましてマイクとして入力しないとダメそう
// https://support.skyway.io/hc/ja/community/posts/360028941674-画面共有と同時にPC内の音声も共有したい
// SSL以外(e.g. LivePreview)ではデバイスにアクセスできない＆エラーが発生して処理中断するのでハンドリング
// SSL以外のサーバーで動かしたい場合は以下リストにサーバーのアドレスを追加する。(chromeの場合)
// chrome://flags/#unsafely-treat-insecure-origin-as-secure
const startVideo = (async () => {
	if(typeof navigator.mediaDevices === "undefined") {
		console.error("ERROR: can't use navigator.mediaDevices. please add host(" + location.host+ ") to");
		console.error("chrome://flags/#unsafely-treat-insecure-origin-as-secure");
		return;
	}
	await navigator.mediaDevices.getDisplayMedia({video: true, audio: true})
		.catch(err => {
			console.error("mediaDevice.getUserMedia() error:", err);
			return;
		})
		.then(stream => {
			const videoElm = document.getElementById("v_stream_check");
			videoElm.srcObject = stream;
			videoElm.play();
			localStream = stream;
			if(streamMediaConnection) {
				streamMediaConnection.replaceStream(localStream);
			} else {
				streamMediaConnection = peer.call(operatorPeerID, localStream);
				streamMediaConnection.on("close", onClose);
			}
			const b_toggle = document.getElementById("b_toggle");
			b_toggle.innerText = "stop";
			b_toggle.onclick = stopVideo;
		});
});

const stopVideo = () => {
	if(localStream === null) return;
	for(var track of localStream.getTracks()){
		track.stop();
	}
	for(var track of localStream.getAudioTracks()){
		track.stop();
	}
	const videoElm = document.getElementById("v_stream_check");
	streamMediaConnection.close(true);
	videoElm.srcObject = null;
	localStream = null;
	const b_toggle = document.getElementById("b_toggle");
	b_toggle.innerText = "start";
	b_toggle.onclick = startVideo;
}

document.getElementById("b_toggle").onclick = startVideo;
