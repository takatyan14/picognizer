Picognizer for node.js
===============

Picognizer is the node.js library for detecting synthesized sounds (e.g. sound effects of video games, replayed speech or music, and sound alerts of home appliances).
In order to input sound, you need a microphone connected to the machine running node.js.

## Check Microphone ##
```bash
$ arecord -l
**** List of CAPTURE Hardware Devices ****
card 1: Device [USB PnP Sound Device], device 0: USB Audio [USB Audio]
Subdevices: 1/1
Subdevice #0: subdevice #0
```

Now you can use card #1 subdevice #0.

## How to code
1. Clone picognizer and install dependencies.

```bash
$ git clone https://github.com/takatyan14/picognizer.git
$ cd picognizer
$ npm install --no-save
$ cd ../
```

2. Use

```bash
$ vi app.js
```

```javascript
// app.js
var Pico = require('./picognizer/picognizer');

var P = new Pico;

var audiofiles = ['Intercom.mp3'];
// these files must be same samplerate.
var thresholds = [30];
var triggered = (new Array(audiofiles.length)).fill(false);

// parameters
options = {
  inputType: 'mic',
  mode: 'dtw',
  card: 1, // specify the numbers of your microphone.
  subDevice: 0,
  power: 1,
  framesec: 0.1,
  duration: 2
};

function fire(index) {
  console.log('The intercom is ringing!');
}

// main routine
P.init(options);

P.oncost(audiofiles, function(cost) {
  if (!(cost instanceof Array)) cost = [cost];
  // console.log(cost);
  for (var index = 0; index < cost.length; ++index) {
    if (cost[index] < thresholds[index]) {
      if (!triggered[index]) {
        fire(index);
        triggered[index] = true;
      }
    }
    else {
      triggered[index] = false;
    }
  }
});

```

And execute.

```bash
$ node app.js
```
### options
#### power
You can use this option only using microphone. It is a multiplication factor to amplify the sound of the microphone.

#### bufferSize
"buffeSize" is the size of the feature to extract. When you use spectral features, it is necessary to a power of two greater than samples in framesec. If bufferSize is undefined, it is automatically calculated according to the framesec.

#### mode
It is an option to set cost calculation algorithms.
The target feature vector and the input feature vector are calculated using dynamic time warping as "dtw" or direct comparison "direct."

#### inputType
You can select either input data from the microphone as "mic" or the audio file as "audio". If "audio" is defined, it is necessary to specify the audio file with "file."

#### card, subDevice
If you use microphone, specify the numbers of your microphone.

#### slice
If the sound source of the target is long, you can cut out the specified seconds and extract feature vectors. The slice [0] represents the start time and slice [1] accounts for the end time. Please describe it all in seconds.

Please see [meyda website][] for parameters (bufferSize, feature) on features since meyda is used for feature extraction.

[meyda website]:https://meyda.js.org/ "meyda website"
