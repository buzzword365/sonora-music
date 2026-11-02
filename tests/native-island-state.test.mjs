import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createNativeIslandSender} from '../electron/native-island-state.mjs';

class Pipe extends EventEmitter {
  constructor(){ super();this.lines=[];this.writable=true;this.destroyed=false;this.blockNext=false; }
  write(text){this.lines.push(JSON.parse(text.trim()));if(this.blockNext){this.blockNext=false;return false;}return true;}
}

const fixture=(position,overrides={})=>({
  title:'Example',artist:'Artist',trackId:'native-A',hasTrack:true,playing:true,
  position,duration:180,artwork:'data:image/jpeg;base64,EXAMPLE',
  ...overrides
});
const pipe=new Pipe();
const sender=createNativeIslandSender(pipe);

assert.equal(sender.write(fixture(0),true),true);
assert.equal(pipe.lines.length,1);
assert.equal(pipe.lines[0].artwork,fixture(0).artwork);
sender.write(fixture(1));
assert.equal(pipe.lines.length,2);
assert.equal('artwork' in pipe.lines[1],false,'progress should not re-send art');
sender.write(fixture(1));
assert.equal(pipe.lines.length,2,'identical status should not flood the pipe');
sender.write(fixture(2,{trackId:'native-B'}));
assert.equal(pipe.lines[2].artwork,fixture(0).artwork,'track changes must send full art');
sender.write(fixture(3,{trackId:'native-B',artwork:'data:image/jpeg;base64,DIFFERENT'}));
assert.equal(pipe.lines[3].artwork,'data:image/jpeg;base64,DIFFERENT','art changes must send full bytes');

// Backpressure: only the most recent progress should be retained.
pipe.blockNext=true;
sender.write(fixture(4));
const count=pipe.lines.length;
for(let i=5;i<1000;i++)sender.write(fixture(i));
assert.equal(pipe.lines.length,count,'no unbounded messages while blocked');
pipe.emit('drain');
assert.equal(pipe.lines.length,count+1);
assert.equal(pipe.lines.at(-1).position,999,'last update should win');
assert.equal(pipe.lines.at(-1).artwork,fixture(0).artwork,'coalesced message must be self-contained');

// Tests restart and empty cover, then cleanup.
sender.write(fixture(0,{trackId:'native-C',artwork:''}));
assert.equal(pipe.lines.at(-1).artwork,'','track without art must clear old cover');
const beforeDispose=pipe.lines.length;
sender.close();
pipe.emit('drain');
assert.equal(sender.write(fixture(10)),false);
assert.equal(pipe.lines.length,beforeDispose,'closed sender must not write');
assert.equal(pipe.listenerCount('drain'),0,'no drain listener leak');

const broken = new Pipe();
broken.write=()=>{throw Error('broken pipe')};
const safe=createNativeIslandSender(broken);
assert.equal(safe.write(fixture(0)),false,'broken pipe must not crash the Electron process');
safe.close();
console.log('PASS: native bridge dedupes status, only sends artwork on changes, bounds backpressure, keeps latest state, recovers empty artwork, cleans up and handles broken pipes');
