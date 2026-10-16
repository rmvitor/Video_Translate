import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVideoExport, exportTimeline, videoSubtitles, videoExportCommand } from '../src/video-export-plan.mjs';
const segments=[{start:1,end:2,original:'Welcome.',translated:'Bem-vindo.'},{start:3,end:4,original:'Continue.',translated:'Continue.'}];

test('video export uses actual narration marks, retains the full voice and preserves original timings',()=>{
  const original=structuredClone(segments),timeline=exportTimeline(segments,4,{duration:6,marks:[{id:'0',start:0},{id:'0',start:1},{id:'1',start:4}]});
  assert.equal(timeline.leadIn,1);assert.equal(timeline.duration,7);
  assert.deepEqual(timeline.captions.map(({start,end})=>[start,end]),[[1,5],[5,7]]);
  assert.deepEqual(segments,original);
  assert.equal(exportTimeline(segments,20,{duration:6,marks:[{id:'0',start:0},{id:'1',start:4}]}).duration,20);
  assert.throws(()=>exportTimeline(segments,4,{duration:6,marks:[{id:'0',start:0}]}),/todos os trechos/);
});

test('export validates missing originals, incomplete translations and invalid clocks before processing',()=>{
  const project={duration:5,segments};
  assert.doesNotThrow(()=>validateVideoExport(project,{size:100},'pt-BR','track'));
  assert.throws(()=>validateVideoExport(project,null,'pt-BR','track'),/vídeo original/);
  assert.throws(()=>validateVideoExport({...project,segments:[{...segments[0],translated:''}]},{size:100},'pt-BR','track'),/todos os trechos/);
  assert.throws(()=>validateVideoExport({...project,duration:2000},{size:100},'original','none'),/30 minutos/);
  assert.throws(()=>validateVideoExport({...project,segments:[{...segments[0],end:0}]},{size:100},'original','none'),/tempos/);
});

test('MP4 assembly keeps independent audio/subtitle tracks and never truncates a longer narration',()=>{
  const base={audio:'both',subtitles:'track',videoDuration:4,duration:7,leadIn:1,videoCodec:'h264',hasOriginalAudio:true};
  const args=videoExportCommand(base);
  assert.ok(args.includes('1:a:0')&&args.includes('0:a:0'));
  assert.ok(args.includes('2:s:0')&&args.includes('3:s:0'));
  assert.ok(args.some(arg=>arg.includes('tpad=stop_mode=clone:stop_duration=3.000')));
  assert.ok(!args.includes('-shortest'));assert.equal(args[args.indexOf('-t')+1],'7.000');
  assert.throws(()=>videoExportCommand({...base,hasOriginalAudio:false}),/faixa de áudio original/);
  const copy=videoExportCommand({...base,audio:'original',duration:4});
  assert.equal(copy[copy.indexOf('-c:v')+1],'copy');assert.ok(!copy.includes('narration.wav'));
});

test('subtitle text cannot inject entries and burned captions require local rendering',()=>{
  const srt=videoSubtitles([{start:0,end:1,translated:'<b>Olá</b>\n\n00:00:03,000 --> 00:00:04,000\nExtra'}]);
  assert.match(srt,/&lt;b&gt;Olá&lt;\/b&gt;/);assert.equal(srt.split('\n').length,4);
  const args=videoExportCommand({audio:'original',subtitles:'burned',videoDuration:4,duration:4,leadIn:0,videoCodec:'h264',hasOriginalAudio:false});
  assert.ok(args.includes('libx264'));assert.ok(args.some(arg=>arg.includes('fontsdir=fonts')));assert.ok(!args.includes('-c:s'));
});
