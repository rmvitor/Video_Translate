import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTranscript,transcriptionModel} from '../src/transcription.mjs';
test('transcription retains words when timestamp chunks are absent, invalid or omit recognized words',()=>{
  const text='Welcome to training. Review every account before closing.';
  const output={text,chunks:[{text:'Welcome to training.',timestamp:[0,0]},{text:'Review every account',timestamp:[null,null]},{text:'closing.',timestamp:[10,10]}]};
  const segments=normalizeTranscript(output,10);
  assert.equal(segments.map(segment=>segment.original).join(' '),text);
  assert.ok(segments.every(segment=>segment.start>=0&&segment.end>segment.start&&segment.end<=10));
  assert.equal(normalizeTranscript({text},10).map(segment=>segment.original).join(' '),text);
  assert.equal(normalizeTranscript({text:'',chunks:[{text:'Last word.',timestamp:[null,null]}]},2)[0].original,'Last word.');
  assert.deepEqual(normalizeTranscript({text:'',chunks:[]},2),[]);
});
test('complete text preserves final words and stable predicted times while stronger models remain local',()=>{
  const segments=normalizeTranscript({text:'Review the accounts. Keep every final word.',chunks:[{text:'Review the accounts.',timestamp:[.2,1.5]},{text:'Keep every',timestamp:[2,3]}]},4);
  assert.deepEqual(segments.map(segment=>[segment.start,segment.end]),[[.2,1.5],[2,3]]);
  assert.equal(segments[1].original,'Keep every final word.');
  assert.equal(transcriptionModel('en'),'Xenova/whisper-base.en');assert.equal(transcriptionModel('es'),'Xenova/whisper-base');assert.equal(transcriptionModel('en','small'),'Xenova/whisper-small.en');assert.equal(transcriptionModel('de','small'),'Xenova/whisper-small');assert.equal(transcriptionModel('en','untrusted'),'Xenova/whisper-base.en');
});
