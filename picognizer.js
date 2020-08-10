var DTW = require("./lib/dtw");
var dist = require("./lib/distanceFunctions/asymmetric.js");
var Code = require("./code.js");
var Meyda = require("meyda");
var fs = require('fs');
var AV = require('av')
  , mp3 = require('mp3')
  , flac = require('flac')
  , alac = require('alac')
  , aac = require('aac');
var Microphone = require('node-microphone');
const { exec } = require('child_process');

var options = {};
options.distanceFunction = dist.distance;
var dtw = new DTW(options);
var audio = {};
var c = new Code();
var micfunc = new Code();
var inputfunc;
var stopfunc = function () {};
var repeatTimer;
var effectdata;
var sr = 0;

var Pico = function() {

  options = {
    "bufferSize": null,
    "featureExtractors": [],
    "framesec": null,
    "duration": null,
    "slice": []
  };
  var inputState = {
    "inputOn": false,
    "output": false,
    "type": null,
    "power": 1
  };

  this.init = function(args) {
    if (args === undefined) {
      console.log("Default parameter (bufferSize: auto, window:hamming, feature: powerSpectrum)");
    }

    if (args.feature === undefined) options.featureExtractors = ["powerSpectrum"];
    else options.featureExtractors = args.feature;

    if (args.mode === undefined) options.mode = "dtw";
    else options.mode = args.mode;

    if (args.inputType === "mic") {
      inputState.type = "mic";
      inputState.card = args.card;
      inputState.subDevice = args.subDevice;
    } else if (args.inputType === "audio") {
      inputState.type = "audio";
      inputState.file = args.file;
    } else throw new Error("inputType must be specified.");
    if (! isNaN(args.power)) inputState.power = parseFloat(args.power);

    if (args.framesec === undefined) options.framesec = 0.05;
    else options.framesec = args.framesec;

    if (args.duration === undefined) options.duration = 1.0;
    else options.duration = args.duration;

    if (args.bufferSize !== undefined) options.bufferSize = args.bufferSize;

    if (options.slice != undefined) options.slice = args.slice;

    return;
  };

  this.oncost = function(audiofile, callback) {

    var audionum;
    var loadAudionum = 0;
    effectdata = [];

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
        let data = [];
        loadAudio(audiofile[n], data, options);
        effectdata[n] = data;
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
    stopfunc();
    clearInterval(repeatTimer);
    return;
  };
};

function determineBufferSize() {
  if (options.bufferSize === null) options.bufferSize = detectPow(options.framesec*sr);

  if (options.bufferSize <= options.framesec*sr){
    console.log("bufferSize should be a power of 2 greater than %d",options.framesec*sr);
    options.bufferSize = detectPow(options.framesec*sr);
    console.log("Set bufferSize: %d", options.bufferSize);
  }
}

function detectPow(value) {
  let n = 0;
  while (Math.pow(2, n) < value) {
      n++;
  }
  return Math.pow(2,n);
}

function usingAudio(inputState) {
  console.log('using file');
  fs.readFile(inputState.file, function(err, data) {
    if (err) {
      throw new Error('load target file failed!');
    } else {
      decodeAudioData(data, function (err, decodedBuf, sampleRate) {
        if (err) throw err;
        if (sr != sampleRate) {
          throw new Error('input audio file sample rate mismatched!');
        }
        inputfunc = function () {
          return decodedBuf;
        }
        inputState.inputOn = true;
        c.execfuncs();
      });
    }
  });
}

//microphone
function usingMic(inputState) {
  console.log("using mic");
  const microphone = new Microphone({
    channels: 1,
    rate: sr,
    device: 'plughw:' + inputState.card + ',' + inputState.subDevice,
    bitwidth: 16,
    endian: 'little',
    encoding: 'signed-integer'
  });

  var stream = microphone.startRecording();
  inputfunc = function () {
    var chunks = [];
    var chunk;
    chunk = stream.read(options.bufferSize*2);
    if (chunk === null) return null;
    for (var i=0; i < chunk.length; i+=2) {
      var val = chunk.readInt16LE(i) * inputState.power / 32768;
      if (val > 1) val = 1; else if (val < -1) val = -1;
      chunks.push(val);
    }
    return chunks;
  };
  stopfunc = function () { microphone.stopRecording(); };
  inputState.inputOn = true;
  c.execfuncs();
}

function checkSpectrum(options) {
  if (options.featureExtractors.indexOf('powerSpectrum') != -1 || options.featureExtractors.indexOf('amplitudeSpectrum') != -1) return true;
  else return false;
}

function loadEffectAudio(audiofile, callback) {
  fs.readFile(audiofile, function(err, data) {
    if(!err) {
      decodeAudioData(data, function(err2, buffer, sampleRate) {
        if (err2) throw err2;
        callback(buffer, sampleRate);
      });
    } else throw new Error('loading effect audio file failed!');
  });
}

function decodeAudioData(buffer, done) {
  var asset = AV.Asset.fromBuffer(buffer);

  asset.on('error', function(err) {
    done(err);
  });

  asset.decodeToBuffer(function(decoded) {
    var deinterleaved = []
      , numberOfChannels = asset.format.channelsPerFrame
      , length = Math.floor(decoded.length / numberOfChannels);

    if (numberOfChannels == 1) {
      done(null, decoded, asset.format.sampleRate);
      return;
    }
    for (var i=0; i < length; i++) {
      deinterleaved.push(decoded.slice(i * numberOfChannels, (i+1) * numberOfChannels).reduce(function(a,b) { return a+b; }) / numberOfChannels);
    }

    done(null, deinterleaved, asset.format.sampleRate);
  });
}

//sound effect
function loadAudio(filename, data, options) {

  var checkspec = checkSpectrum(options);
  var signal;
  var framesize;

  loadEffectAudio(filename, function(signal, sampleRate) {
    if (sr === 0 ) {
      sr = sampleRate;
      determineBufferSize();
    } else if (sr != sampleRate)
      throw new Error('Sample rates of audio files must be same!');

    framesize = sr * options.framesec;
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
  var effectlen = effectdata.length;

  Meyda.bufferSize = options.bufferSize;

  maxnum = effectdata[0].length;
  if (effectlen > 1) {
    for (const value of effectdata) {
      if (maxnum < value.length)
        maxnum = value.length;
    }
  }
  RingBufferSize = maxnum;

  console.log("calculating cost");

  //buffer
  var buff = new RingBuffer(RingBufferSize);
  var silbuff = new RingBuffer(RingBufferSize);

  clearInterval(repeatTimer);

  if (options.mode === "dtw") {

    console.log("========= dtw mode =========");
    setInterval(function() {
      var signal = inputfunc();
      if (signal === null || signal.length == 0) return;
      var features = Meyda.extract(options.featureExtractors[0], signal);
      silbuff.add(Meyda.extract("rms", signal));
      if (features != null) {
        if (checkspec === true) features = specNormalization(features, options);
        buff.add(features);
      }
    }, 1000 * options.framesec)

    //cost
    repeatTimer = setInterval(function() {
      var buflen = buff.getCount();
      if (silbuff.getCount() == 0) return;
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
            for (const value of effectdata) {
              var tmp = dtw.compute(buff.getArray(value.length), value);
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
    console.log("========= direct comparison mode =========");
    setInterval(function() {
      var signal = inputfunc();
      if (signal === null || signal.length == 0) return;
      silbuff.add(Meyda.extract("rms", signal));
      var features = Meyda.extract(options.featureExtractors[0], signal);
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
      if (silbuff.getCount() == 0) return;
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
    for (const value of effectdata) {
      L = value.length;
      var tmp = 0;
      for (let n = L - 1; n > BufferSize - L; n--) {
        tmp = tmp + dist.distance(buff.get(n), value[n]);
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
