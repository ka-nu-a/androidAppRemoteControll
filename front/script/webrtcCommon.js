const getIpAddr = async () => {
	const APIurl = "https://api.ipify.org/?format=json";
	return fetch(APIurl)
		.then(resp => {
			if(resp.ok) {
				return resp.json();
			} else {
				console.error(`Request failed: ${resp.status} from ${APIurl}`);
				return "0.0.0.0";
			}
		})
		.then(json => json.ip)
		.catch(err => {
			console.error(`Request failed: ${err.status} from ${APIurl}`);
			return "0.0.0.0";
		});
}

const createPeer = async (id=undefined) => {
	const APIport = 80;
	const APIpath = "/api/key";
	const APIquery = new URLSearchParams({ip:await getIpAddr()});
	const APIurl = "http://" + location.hostname + ":" + APIport + APIpath + "?" + APIquery;
	return fetch(APIurl)
		.then(resp => {
			if(resp.ok) {
				return resp.text();
			} else {
				throw new Error(`Request failed: ${resp.status} from ${APIurl}`);
			}
		})
		.then(token=>
			new Peer(id, {
				key: token,
				debug: 2
			})
		)
}
