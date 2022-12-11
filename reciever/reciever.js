/*
 * argv
 *   SKYWAY_API_KEY [optional]
 *     It can also set by same name env. Must set to either argv or env.
 *   PORT [optional]
 *     HTTP Server's port.
 *     It can also set by same name env. If neither is set, use default value(80).
 * Note: Also can use .env file.
 */

require("dotenv").config();
const {networkInterfaces} = require("os");
const axios = require("axios");

const xferPort = 10001; // データ転送先のポート
const skywayApiKey = process.argv[2] || process.env.SKYWAY_API_KEY || (() => {
	console.error("ERROR: SKYWAY_API_KEY is Must parameter. Set to either argv or env");
	process.exit(-1);
})();
const peerId = "reciever";

const getLocalIpAddress = () => {
  const nets = networkInterfaces();
  const net = nets["eth0"]?.find((v) => v.family == "IPv4");
  return net ? net.address : null;
}

// reciever (RCV)
(async () => {
	const dgram = require("dgram");
	const binaryPack = require("js-binarypack");
	const socket = dgram.createSocket("udp4");
	const adb = require("adbkit");
	const fs = require("fs");
	
	const resolvConf = fs.readFileSync("/etc/resolv.conf", {encoding: "utf-8"});
	const adbServerAddr = resolvConf.substring(resolvConf.lastIndexOf(" ")+1).slice(0, -1);
	const client = adb.createClient({
		host: adbServerAddr,
		port: "5037",
		bin: "dontUseLocalAdbServer"
	});
	const deviceID = await (async () => {
		try {
			return await client.connect("localhost:58526");
		} catch (err) {
			console.error("RCV: ERROR can't connect to adb server(localhost:58526). Is adb server running?");
			process.exit(-1);
		}
	})();
	
	socket.on("listening", () => {
		const address = socket.address();
		console.log("RCV: UDP listening on " + address.address + ":" + address.port);
	});
	socket.on("message", (message, remote) => {
		message = binaryPack.unpack(message);
		const command = "input touchscreen motionevent " + message.action + " " + message.x + " " + message.y;
		console.log("RCV: " + remote.address + ":" + remote.port + " - " + command);
		client.shell(deviceID, command);
	});
	socket.bind(xferPort, getLocalIpAddress());
})();

// API key server (API)
(async () => {
	const express = require("express");
	const app = express();
	const port = process.argv[3] || process.env.PORT || 80;
	
	app.use("/", express.static("../front"));
	
	app.get("/api/key", (req, res) => {
		if(typeof req.query.ip === "undefined") {
			console.log("API: /api/key invalid access!");
			res.status(404);
			res.end();
		} else {
			console.log("API: /api/key from " + req.query.ip);
			res.send(skywayApiKey);
		}
	});
	app.get("/api/peer/reciever", (req, res) => {
		if(typeof req.query.ip === "undefined") {
			console.log("API: /api/peer/reciever invalid access!");
			res.status(404);
			res.end();
		} else {
			console.log("API: /api/peer/reciever from " + req.query.ip);
			res.send(peerId);
		}
	});
	app.listen(port, () => {
		console.log("API: TCP listening on " + getLocalIpAddress() + ":" + port);
	});
})();

// skyway-gw controll (SWY)
(async() => {
	const NewDataConnectionRecievedException = require("./newDataConnectionRecievedException");
	
	let peer = null;
	let dataConnectionID = null;
	let sendDataID = null;
	let fRecieveNewDataConnection = false;
	let axiosAbortController = new AbortController();

	axios.defaults.baseURL = "http://localhost:8000";
	
	const createPeer = async (key, peerId) => {
		params = {
			"key": key,
			"domain": "localhost",
			"turn": true,
			"peer_id": peerId
		}
		const res = await axios({
			method: "post",
			url: "/peers",
			data: params,
			validateStatus: status => status == 201
		});
		return res.data ? res.data.params : null;
	};

	const waitExpectedEvents = async (ApiPath, ApiParams, expectedEvents, validStatus, abortController = new AbortController(), force = false) => {
		if(!Array.isArray(expectedEvents)) {
			expectedEvents = [expectedEvents];
		}
		if(!Array.isArray(validStatus)) {
			validStatus = [validStatus];
		}
		let event;
		while(1) {
			event = await axios({
				method: "get",
				url: ApiPath,
				params: ApiParams,
				validateStatus: status => validStatus.includes(status),
				signal: abortController.signal
			}).catch(e => {
				if(/*!(e instanceof DOMException)*/ e.name !== "CanceledError"){
					throw e;
				}
			});
			if(!force && fRecieveNewDataConnection) {
				throw new NewDataConnectionRecievedException();
			} else if(event && event.data && expectedEvents.includes(event.data.event)) {
				console.log("SWY: " + ApiPath + " has " + event.data.event);
				break;
			}
		}
		return event.data;
	};

	const waitNewDataConnection = async (dmyPeer) => {
		let newDataConnectionID;
		newDataConnectionID = (await waitExpectedEvents("/peers/" + peer.peer_id + "/events", {token: peer.token}, "CONNECTION", [200, 404, 408], new AbortController(), true)).data_params.data_connection_id;
		fRecieveNewDataConnection = true;
		axiosAbortController.abort(); // long pooling中だとflagの判定が行われないため、axiosの処理をキャンセル
		axiosAbortController = new AbortController(); // 再使用できないため、再生成する
		return newDataConnectionID;
	};

	const closeDataConnection = async () => {
		if(dataConnectionID) {
			const promise = axios({
				method: "delete",
				url: "/data/connections/" + dataConnectionID,
				validateStatus: status => status == 204
			})
				.then(()=>{
					sendDataID = null; // sendDataID is also delete when delete dataConnection
					console.log("SWY: " + "dataConnection closed.");
				})
				.catch(console.error);
			dataConnectionID = null;
			return promise;
		} else if(sendDataID) {
			const promise = axios({
				method: "delete",
				url: "/data/" + sendDataID,
				validateStatus: status => status == 204
			})
				.then(()=>{
					console.log("SWY: " + "dataXfer terminated.");
				})
				.catch(console.error);
			sendDataID = null;
			return promise;
		}
	};

	const exit = async () => {
		await closeDataConnection();
		if(peer) {
			const promise = axios({
				method: "delete",
				url: "/peers/" + peer.peer_id,
				params: {token: peer.token},
				validateStatus: status => status == 204
			})
				.then(()=>{
					console.log("SWY: " + "peer deleted.");
				})
				.catch(console.error);
			peer = null;
			await promise;
		}
		process.exit(0);
	};

	process.on("exit", exit);
	process.on("SIGINT", exit);
	process.on("SIGQUIT", exit);
	process.on("SIGTERM", exit);

	(async () => {
		try{
			peer = await createPeer(skywayApiKey, peerId);
			await waitExpectedEvents("/peers/" + peer.peer_id + "/events", {token: peer.token}, "OPEN", [200, 408]);
			let promiseNewDataConnectionID = waitNewDataConnection(peer);
			while(true) {
				dataConnectionID = await promiseNewDataConnectionID;
				fRecieveNewDataConnection = false;
				promiseNewDataConnectionID = waitNewDataConnection(peer);
				
				try {
					const sendData = (await axios({
						method: "post",
						url: "/data",
						data: {},
						validateStatus: status => status == 201
					})).data;
					console.log("SWY: " + "can send data at " + sendData.ip_v4 + ":" + sendData.port);
					sendDataID = sendData.data_id;
					await waitExpectedEvents("/data/connections/" + dataConnectionID + "/events", {}, "OPEN", [200, 408], axiosAbortController);
					const recievDataID = (await axios({
						method: "put",
						url: "/data/connections/" + dataConnectionID,
						data: {
							"feed_params": {
								"data_id": sendDataID
							},
							"redirect_params": {
								"ip_v4": getLocalIpAddress(),
								"port": xferPort
							}
						},
						validateStatus: status => status == 200
					})).data.data_id;
					await waitExpectedEvents("/data/connections/" + dataConnectionID + "/events", {}, "CLOSE", [200, 408], axiosAbortController);
				} catch (e) {
					if(!(e instanceof NewDataConnectionRecievedException)) {
						throw e;
					}
				} finally {
					await promiseNewDataConnectionID; // long pooling中にdataConnectionを削除するとAPIエラーになるため、次のアクセスがあるまで待つ
					closeDataConnection();
				}
			}
		} catch(err) {
			console.error("SWY: " + "happen API ACCESS ERROR.");
			console.dir(err, {depth:null});
			exit();
		}
	})();
})();
