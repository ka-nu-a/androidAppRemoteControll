Android App Remote Controll
====
Android App on your PC can be Controlled by others through Web browser. (Like GeForce NOW or PlayStation Now.)

## Features
- Very low latency by WebRTC(wrapped by SkyWay).
- It works even if the target application is not at the foreground.

## Requirement
- [Skyway API Key](https://console-webrtc-free.ecl.ntt.com/users/registration)
- [Skyway Gateway](https://github.com/skyway/skyway-webrtc-gateway/releases)
- [Node.js](https://github.com/nodejs/node)
- Android App on your pc (e.g. [WSA](https://learn.microsoft.com/ja-jp/windows/android/wsa/), [Nox Player](https://www.bignox.com/), etc..)
  - Note: Must Operate At 1920x1080px.
- [ADB](https://developer.android.com/studio/releases/platform-tools)

## Usage
```
$ docker run --name skyway-gw -d -p 8000:8000 -p 50001-50020:50001-50020/udp gateway-image
$ export SKYWAY_API_KEY="your api key"
$ export PORT="8080"
$ cd reciever
$ npm start
```

## Install
```
$ git clone https://github.com/skyway/skyway-webrtc-gateway.git
$ docker build skyway-webrtc-gateway -t gateway-image
$ git clone https://github.com/ka-nu-a/androidAppRemoteControll.git
$ cd androidAppRemoteControll
```

## Contribution
1. Fork it
2. Create your feature branch (git checkout -b my-new-feature)
3. Commit your changes (git commit -am 'Add some feature')
4. Push to the branch (git push origin my-new-feature)
5. Create new Pull Request

## Licence
[MIT](https://github.com/tcnksm/tool/blob/master/LICENCE)

## Author
[kanua](https://github.com/ka-nu-a)
