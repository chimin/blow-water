import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  page = 'setup';
  room: string;

  messages: string[] = [];
  input: string;

  videos: { [target: string]: MediaStream } = {};
  videoColumns = '';

  private ws: WebSocket;
  private me: string;
  private rtcList: { [target: string]: RTCPeerConnection } = {};

  join() {
    const url = new URL(location.href);
    this.ws = new WebSocket(`${url.protocol.replace(/^http/, 'ws')}//${url.host}/room/${this.room}`);
    this.ws.onmessage = ev => this.processWebSocketMessage(JSON.parse(ev.data));
    this.page = 'room';
    document.body.style.background = '#000';
  }

  send() {
    if (this.input) {
      this.ws.send(JSON.stringify({ type: 'text-message', from: this.me, content: this.input }));
      this.input = '';
    }
  }

  playVideo(event: Event, target: string) {
    const videoElement = event.target as HTMLVideoElement;
    videoElement.muted = target == this.me;
    videoElement.play();
  }

  doLayout() {
    const videoCount = Object.keys(this.videos).length;
    const columnCount = videoCount ? Math.ceil(Math.sqrt(videoCount)) : 0;
    this.videoColumns = '';
    for (let i = 0; i < columnCount; i++) {
      this.videoColumns += 'auto ';
    }
  }

  private processWebSocketMessage(message: { type: string }) {
    switch (message.type) {
      case 'participant-list': this.processParticipantList(message as any); break;
      case 'participant-leave': this.processParticipantLeave(message as any); break;
      case 'text-message': this.processTextMessage(message as any); break;
      case 'video-offer': this.processVideoOffer(message as any); break;
      case 'video-answer': this.processVideoAnswer(message as any); break;
      case 'ice-candidate': this.processIceCandidate(message as any); break;
    }
  }

  private async processParticipantList(message: { you: string, all: string[]; }) {
    this.me = message.you;
    this.videos[this.me] = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    this.doLayout();
    message.all.filter(t => t != this.me).forEach(t => this.offerVideo(t));
  }

  private processParticipantLeave(message: { from: string }) {
    const target = message.from;
    delete this.videos[target];
    delete this.rtcList[target];
    this.doLayout();
  }

  private processTextMessage(message: { from: string, content: string }) {
    this.messages.push(`[${message.from}] ${message.content}`);
    setTimeout(() => this.messages.shift(), 5000);
  }

  private async processVideoOffer(message: { from: string, sdp: any }) {
    const target = message.from;
    const rtc = this.setupRtcPeerConnection(target);
    await rtc.setRemoteDescription(new RTCSessionDescription(message.sdp));
    const answer = await rtc.createAnswer();
    await rtc.setLocalDescription(answer);
    this.ws.send(JSON.stringify({ type: 'video-answer', from: this.me, to: target, sdp: answer }));
  }

  private async processVideoAnswer(message: { from: string, sdp: any }) {
    const target = message.from;
    const rtc = this.rtcList[target];
    await rtc.setRemoteDescription(new RTCSessionDescription(message.sdp));
  }

  private processIceCandidate(message: { from: string, candidate: any }) {
    const target = message.from;
    this.rtcList[target].addIceCandidate(new RTCIceCandidate(message.candidate));
  }

  private async offerVideo(target: string) {
    const rtc = this.rtcList[target] = this.setupRtcPeerConnection(target);
    const offer = await rtc.createOffer();
    await rtc.setLocalDescription(offer);
    this.ws.send(JSON.stringify({ type: 'video-offer', from: this.me, to: target, sdp: offer }));
  }

  private setupRtcPeerConnection(target: string) {
    const url = new URL(location.href);
    const turnServer = `turn:${url.hostname}:3478`;
    const rtc = this.rtcList[target] = new RTCPeerConnection({
      iceServers: [{
        urls: ['stun:stun.l.google.com:19302']
      }, {
        urls: [turnServer + '?transport=tcp', turnServer + '?transport=udp'],
        username: 'turn',
        credential: 'turnpass'
      }]
    });
    rtc.onicecandidate = ev => this.processRtcIceCandidate(target, ev);
    rtc.ontrack = ev => this.processRtcTrack(target, ev);
    const myVideo = this.videos[this.me];
    myVideo.getTracks().forEach(t => rtc.addTrack(t, myVideo));
    return rtc;
  }

  private processRtcIceCandidate(target: string, ev: RTCPeerConnectionIceEvent) {
    if (ev.candidate) {
      this.ws.send(JSON.stringify({ type: 'ice-candidate', from: this.me, to: target, candidate: ev.candidate }));
    }
  }

  private processRtcTrack(target: string, ev: RTCTrackEvent) {
    this.videos[target] = ev.streams[0];
    this.doLayout();
  }
}
