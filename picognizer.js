var DTW = require("./lib/dtw");
var dist = require("./lib/distanceFunctions/asymmetric.js");
var Code = require("./code.js");
require("./constants.js");

var options = {};
options.distanceFunction = dist.distance;
var dtw = new DTW(options);
var audio = {};
var source = {};
var acontext = new AudioContext();
var mediaStream;
var c = new Code();
var micfunc = new Code();
var repeatTimer;
var meyda;
var effectdata;
const sr = 48000;

var Pico = function() {

  options = {
    "audioContext": acontext,
    "source": null,
    "bufferSize": null,
    "windowingFunction": null,
    "featureExtractors": [],
    "framesec": null,
    "duration": null,
    "slice": []
  };
  var inputState = {
    "inputOn": false,
    "output": false,
    "type": null,
    "bgm": null
  };

  this.init = function(args) {
    if (args === undefined) {
      console.log("Default parameter (bufferSize: auto, window:hamming, feature: powerSpectrum)");
    }

    if (args.windowFunc === undefined) options.windowingFunction = "hamming";
    else options.windowingFunction = args.windowFunc;

    if (args.feature === undefined) options.featureExtractors = ["powerSpectrum"];
    else options.featureExtractors = args.feature;

    if (args.mode === undefined) options.mode = "dtw";
    else options.mode = args.mode;

    if (args.inputType === undefined) inputState.type = "mic";
    else {
      inputState.type = args.inputType;
      inputState.bgm = args.bgm;
    }

    if (args.micOutput === undefined) inputState.output = false;

    if (args.framesec === undefined) options.framesec = 0.05;
    else options.framesec = args.framesec;

    if (args.duration === undefined) options.duration = 1.0;
    else options.duration = args.duration;

    if (args.bufferSize === undefined) options.bufferSize = detectPow(options.framesec*sr);
    else options.bufferSize = args.bufferSize;

    if (options.slice != undefined) options.slice = args.slice;

    if (options.bufferSize <= options.framesec*sr){
      console.log("bufferSize should be a power of 2 greater than %d",options.framesec*sr);
      options.bufferSize = detectPow(options.framesec*sr);
      console.log("Set bufferSize: %d", options.bufferSize);
    }

    return;
  };

  this.oncost = function(audiofile, callback) {

    var audionum;
    var data = [];
    var loadAudionum = 0;
    effectdata = {};

    //mic
    if (inputState.type === "audio" && inputState.inputOn === false) {
      var inputData = function func() {
        usingAudio(inputState);
      }
    } else if (inputState.type === "mic") {
      var inputData = function func() {
        usingMic(inputState);
      }
    }
    micfunc.addfunc(function func() {
      loadAudionum++;
      if (loadAudionum >= audionum) inputData(inputState);
      else return true;
    });

    if (!(audiofile instanceof Array)) {
      audionum = 1;
      loadAudio(audiofile, data, options);
      effectdata[0] = data;
    } else {
      audionum = audiofile.length;
      for (let n = 0; n < audionum; n++) {
        data = [];
        var key = String(n);
        loadAudio(audiofile[n], data, options);
        effectdata[key] = data;
      }
    }

    var costcal = function func() {
      costCalculation(effectdata, options, callback);
      return true;
    }
    c.addfunc(costcal);
    return;
  };

  this.stop = function() {
    console.log("Stoppped.");
    meyda.stop();
    clearInterval(repeatTimer);
    return;
  };
};

function detectPow(value) {
  let n = 0;
  while (Math.pow(2, n) < value) {
      n++;
  }
  return Math.pow(2,n);
}

function usingAudio(inputState) {

  audio.inputsound = new Audio();
  audio.inputsound.src = inputState.bgm;
  audio.inputsound.crossOrigin = "anonymous";
  audio.inputsound.addEventListener('loadstart', function() {
    console.log("Audio file loaded!");
    source.input = acontext.createMediaElementSource(audio.inputsound);
    source.input.connect(acontext.destination);
    inputState.inputOn = true;
    audio.inputsound.play();
  });

  audio.inputsound.addEventListener('play', function() {
    c.execfuncs();
  });

  audio.inputsound.addEventListener('ended', function() {
    meyda.stop();
    clearInterval(repeatTimer);
    console.log("Stopped.");
  });
}

//microphone
function usingMic(inputState) {
  console.log("using mic");
  if (!navigator.getUserMedia) {
    alert('getUserMedia is not supported.');
  }
  navigator.getUserMedia({
      video: false,
      audio: true
    },
    function(stream) { //success
      mediaStream = stream;
      audio.inputsound = new Audio();
      audio.inputsound.src = mediaStream;
      source.input = acontext.createMediaStreamSource(mediaStream);
      console.log("The microphone turned on.");
      if (inputState.output === true) source.input.connect(acontext.destination);
      inputState.inputOn = true;
      c.execfuncs();
    },
    function(err) { //error
      alert("Error accessing the microphone.");
    }
  )
}

function checkSpectrum(options) {
  if (options.featureExtractors.indexOf('powerSpectrum') != -1 || options.featureExtractors.indexOf('amplitudeSpectrum') != -1) return true;
  else return false;
}

function loadEffectAudio(audiofile, callback) {
  var request = new XMLHttpRequest();
  request.open('GET', audiofile, true);
  request.responseType = 'arraybuffer';

  request.onload = function() {
    acontext.decodeAudioData(request.response, function(buffer) {
      callback(buffer);
    });
  }
  request.send();
}

//sound effect
function loadAudio(filename, data, options) {

  var checkspec = checkSpectrum(options);
  var signal;
  var framesize = sr * options.framesec;

  loadEffectAudio(filename, function(buffer) {
    signal = buffer.getChannelData(0);
    let maxframe = Math.ceil(signal.length/ framesize);
    let frame = 0;
    let startframe = 0;
    let endframe = startframe + framesize;

    if (options.slice != undefined){
      if (options.slice[1]*sr >= signal.length){
        console.log("Slice size should be smaller than %f", signal.length/sr);
        console.log("Set end of slice  to singal size");
      }
      else{
        var array = options.silce*sr;
        signal = signal.slice(array[0], array[1]);
      }
    }

    Meyda.bufferSize = options.bufferSize;

    for (let n = 0; n < maxframe; n++) {
      let pad = new Array(options.bufferSize).fill(0);
      let padtmp = signal.slice(startframe, endframe);
      for (let loop = 0; loop < padtmp.length; loop++) {
        pad[loop] = padtmp[loop];
      }
      var features = Meyda.extract(options.featureExtractors[0], pad);
      if (checkspec === true) {
        features = specNormalization(features, options);
      }
      data.push(features);
      startframe = startframe + framesize;
      endframe = startframe + framesize;

      if (n === maxframe-1) {
          micfunc.execfuncs();
      }
    }
  });
}

//costCalculation
function costCalculation(effectdata, options, callback) {

  var RingBufferSize;
  var maxnum;
  var checkspec = checkSpectrum(options);
  var effectlen = Object.keys(effectdata).length;

  options.source = source.input;

  maxnum = effectdata[0].length;
  if (effectlen > 1) {
    for (var keyString in effectdata) {
      if (maxnum < effectdata[keyString].length)
        maxnum = effectdata[keyString].length;
    }
  }
  RingBufferSize = maxnum;

  meyda = Meyda.createMeydaAnalyzer(options);

  console.log("calculating cost");

  //buffer
  var buff = new RingBuffer(RingBufferSize);
  var silbuff = new RingBuffer(RingBufferSize);

  clearInterval(repeatTimer);

  if (options.mode === "dtw") {

    console.log("========= dtw mode =========");
    meyda.start(options.featureExtractors);
    setInterval(function() {
      var features = meyda.get(options.featureExtractors[0]);
      silbuff.add(meyda.get("rms"));
      if (features != null) {
        if (checkspec === true) features = specNormalization(features, options);
        buff.add(features);
      }
    }, 1000 * options.framesec)

    //cost
    repeatTimer = setInterval(function() {
      var buflen = buff.getCount();
      if (average(silbuff.buffer) < 0.0005){
        cost = Infinity;
        callback(cost);
      } else {
        if (buflen < RingBufferSize) {
          console.log('Now buffering');
        } else {
          if (effectlen === 1) {
            var cost = dtw.compute(buff.buffer, effectdata[0]);
          } else {
            var cost = [];
            for (var keyString in effectdata) {
              var tmp = dtw.compute(buff.getArray(effectdata[keyString].length), effectdata[keyString]);
              cost.push(tmp);
            }
          }
          if (callback != null) {
            callback(cost);
          }
        }
      }
    }, 1000 * options.duration)

  }
  if (options.mode === "direct") {
    meyda.start(options.featureExtractors);
    console.log("========= direct comparison mode =========");
    setInterval(function() {
      silbuff.add(meyda.get("rms"));
      var features = meyda.get(options.featureExtractors[0]);
        if (features != null) {
          if (checkspec === true) features = specNormalization(features, options);
          buff.add(features);
        }
        buflen = buff.getCount();
        if (buflen >= RingBufferSize) {
          cost = distCalculation(effectdata, buff, effectlen, RingBufferSize);
        }
    }, 1000 * options.framesec)

    //cost
    repeatTimer = setInterval(function() {
      buflen = buff.getCount();
      if (average(silbuff.buffer) < 0.0001){
        cost = Infinity;
        callback(cost);
      }else{
        if (buflen >= RingBufferSize) {
          if (callback != null) {
            callback(cost);
          }
        }
      }
    }, 1000 * options.duration)
  }
}

// for direct comparison
function distCalculation(effectdata, buff, effectlen, BufferSize) {

  if (effectlen === 1) {
    var d = 0;
    for (let n = 0; n < BufferSize; n++) {
      d = d + dist.distance(buff.get(n), effectdata[0][n]);
    }

  } else {
    var d = [];
    for (var keyString in effectdata) {
      L = effectdata[keyString].length;
      var tmp = 0;
      for (let n = L - 1; n > BufferSize - L; n--) {
        tmp = tmp + dist.distance(buff.get(n), effectdata[keyString][n]);
      }
      d.push(tmp);
    }
  }
  return d;
}

var RingBuffer = function(bufferCount) {
  if (bufferCount === undefined) bufferCount = 0;
  this.buffer = new Array(bufferCount);
  this.count = 0;
};

RingBuffer.prototype = {
  add: function(data) {
    var lastIndex = (this.count % this.buffer.length);
    this.buffer[lastIndex] = data;
    this.count++;
    return (this.count <= this.buffer.length ? 0 : 1);
  },

  get: function(index) {
    if (this.buffer.length < this.count)
      index += this.count;
    index %= this.buffer.length;
    return this.buffer[index];
  },
  // getArray(Number get_count): returns Array of nearest get_count elements.
  getArray: function(get_count) {
    var lastIndex = (this.count % this.buffer.length);
    if (get_count <= lastIndex)
      return this.buffer.slice(lastIndex - get_count , lastIndex);
    else
      return this.buffer.slice(lastIndex - get_count).concat(this.buffer.slice(0, lastIndex));
  },
  getCount: function() {
    return Math.min(this.buffer.length, this.count);
  }
};

function specNormalization(freq, options) {
  freq[0] = 0;
  var maxval = Math.max.apply([], freq);
  if (maxval === 0) {
    return freq;
  } else {
    for (let n = 0; n < options.bufferSize; n++) {
      freq[n] = freq[n] / maxval;
    }
    for (let n = 0; n < options.bufferSize; n++) {
      if (freq[n] < 0.001) freq[n] = 0;
    }
    return freq;
  }
}

function average(a) {
  return a.reduce(function(x, y) {
    if (y === a[a.length-1]) return (x + y) / a.length;
    return x + y;
  });
}

module.exports = Pico;
