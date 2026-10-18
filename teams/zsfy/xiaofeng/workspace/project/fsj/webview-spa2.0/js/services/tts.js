/**
 * 百度语音合成服务 (TTS)
 */
var TtsService = {
  config: {
    tokenUrl: 'https://v4pre.h5sys.cn/api/12024287/d1tt8aha3j50000e10yg',
    ttsUrl: 'https://tsn.baidu.com/text2audio',
    per: '4147',
    spd: '5',
    pit: '4',
    vol: '5',
    aue: '3'
  },

  _token: null,
  _tokenExpire: 0,
  _audioElement: null,

  initAudio: function () {
    if (!this._audioElement) {
      this._audioElement = new Audio();
      this._audioElement.preload = 'auto';
    }
    var silent = 'data:audio/mpeg;base64,SUQzBAAAAAABEVRYWFgAAAAtAAADY29tbWVudABCaWdTb3VuZEJhbmsuY29tIC8gTGFTb25vdGhlcXVlLm9yZwBURU5DAAAAHQAAA1N3aXRjaCBQbHVzIMKpIE5DSCBTb2Z0d2FyZQBUSVQyAAAABgAAAzIyMzUAVFNTRQAAAA8AAANMYXZmNTcuODMuMTAwAAAAAAAAAAAAAAD/80DEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQsRbAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zQMSkAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';
    this._audioElement.src = silent;
    this._audioElement.volume = 0;
    this._audioElement.play().catch(function () {});
    var AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      try {
        var ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume().catch(function () {});
      } catch (e) {}
    }
  },

  _getToken: function () {
    var self = this;
    if (self._token && Date.now() < self._tokenExpire) return Promise.resolve(self._token);

    return fetch(self.config.tokenUrl, { cache: 'no-store' })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        self._token = data.output;
        self._tokenExpire = Date.now() + 29 * 24 * 60 * 60 * 1000;
        return self._token;
      });
  },

  textToSpeech: function (text) {
    var self = this;
    if (text.length > 200) text = text.substring(0, 200);
    return self._getToken().then(function (token) {
      var params = [
        'tex=' + encodeURIComponent(text),
        'lan=zh', 'cuid=baidu_workshop', 'ctp=1', 'tok=' + token,
        'aue=' + self.config.aue, 'per=' + self.config.per,
        'spd=' + self.config.spd, 'pit=' + self.config.pit, 'vol=' + self.config.vol
      ];
      return self.config.ttsUrl + '?' + params.join('&');
    });
  },

  play: function (text) {
    var self = this;
    return self.textToSpeech(text).then(function (audioUrl) {
      var audio = self._audioElement;
      if (!audio) { self.initAudio(); audio = self._audioElement; }

      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = null;

        function safeSettle(isResolve, err) {
          if (settled) return;
          settled = true;
          if (timer) clearTimeout(timer);
          if (isResolve) resolve(); else reject(err);
        }

        audio.onloadedmetadata = function () {
          var duration = audio.duration;
          if (duration && isFinite(duration)) {
            timer = setTimeout(function () { safeSettle(true); }, duration * 1000 + 500);
          }
        };
        audio.onended = function () { safeSettle(true); };
        audio.onerror = function () { safeSettle(false, new Error('音频加载失败')); };

        var maxTimeout = Math.max(text.length * 300, 5000) + 5000;
        timer = setTimeout(function () { safeSettle(false, new Error('播放超时')); }, maxTimeout);

        audio.src = audioUrl;
        audio.volume = 1;
        audio.play().catch(function (e) {
          if (e.name === 'NotAllowedError' || e.name === 'AbortError') {
            self.initAudio();
            audio.play().catch(function (e2) { safeSettle(false, e2); });
          } else { safeSettle(false, e); }
        });
      });
    });
  },

  stop: function () {
    if (this._audioElement) {
      this._audioElement.pause();
      this._audioElement.src = '';
    }
  }
};
