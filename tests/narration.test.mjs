import test from 'node:test';
import assert from 'node:assert/strict';
import {buildNarrationPlan,buildVideoNarrationPlan,narrationCueTiming,narrationRate,pronunciationRuns,playbackRateForVideo} from '../src/narration-plan.mjs';
import {trimPadding,pcm16,encodeWav} from '../src/voice-audio.mjs';

test('continuous planning joins Portuguese sections without dropping words or section markers',()=>{
 const items=[{id:'1',text:'Bem-vindo ao treinamento.'},{id:'2',text:'Vamos iniciar a configuração.'},{id:'3',text:'Confira todos os dados.'}];
 const chunks=buildNarrationPlan(items);
 assert.equal(chunks.length,1);assert.equal(chunks[0].text,items.map(item=>item.text).join(' '));
 assert.deepEqual(chunks[0].marks.map(mark=>mark.id),['1','2','3']);
 const long='Este treinamento mostra cada etapa em detalhes. '.repeat(40);
 const split=buildNarrationPlan([{id:'long',text:long}]);
 assert.ok(split.every(chunk=>chunk.text.length<=600));assert.equal(split.map(chunk=>chunk.text).join(' '),long.trim());
});
test('English terms use English pronunciation while Portuguese context is preserved',()=>{
 const text='Veja o Insight e abra Home Management para continuar.';
 const runs=pronunciationRuns(text,'Open Insight and Home Management to continue.');
 assert.deepEqual(runs.filter(run=>run.lang==='en-US').map(run=>run.text),['Insight','Home Management']);
 assert.equal(runs.map(run=>run.text).join(''),text);
 assert.ok(pronunciationRuns('Confira o total local e o status.','Check the local total and status.').every(run=>run.lang==='pt-BR'));
 assert.deepEqual(pronunciationRuns('Abra Account Settings agora.','Open Account Settings now.').filter(run=>run.lang==='en-US').map(run=>run.text),['Account Settings']);
 assert.deepEqual(pronunciationRuns('Escolha o widget.','','widget').filter(run=>run.lang==='en-US').map(run=>run.text),['widget.']);
 assert.ok(pronunciationRuns(text,'','','en','pt-BR').every(run=>run.lang==='pt-BR'));
});
test('English-only narration reads original text and rejects sources in other languages',()=>{
 const chunks=buildNarrationPlan([{id:'cue',text:'Veja a página inicial.',original:'Open Home Management.',sourceLanguage:'en'}],'en-US');
 assert.equal(chunks[0].text,'Open Home Management.');assert.equal(chunks[0].lang,'en-US');
 assert.throws(()=>buildNarrationPlan([{id:'1',text:'Olá',original:'Hola',sourceLanguage:'es'}],'en-US'),/original em inglês/);
});
test('continuous WAV assembly trims padding, preserves internal pauses and joins all speech samples',()=>{
 const input=new Float32Array(1000);input.fill(.25,400,430);input.fill(-.25,700,730);
 const trimmed=trimPadding(input,1000);
 assert.equal(trimmed.filter(sample=>sample!==0).length,60);
 assert.ok(trimmed.length>300); // Silence between words stays intact.
 const a=pcm16(new Float32Array([.5,-.5])),b=pcm16(new Float32Array([1,-1]));
 const wav=encodeWav([a,b],22050),view=new DataView(wav);
 assert.equal(view.getUint32(40,true),8);assert.equal(view.getUint32(24,true),22050);
 assert.deepEqual([...new Int16Array(wav,44)],[16383,-16384,32767,-32768]);
});
test('speech pace adapts to the video within an intelligible range instead of pausing or skipping content',()=>{
 assert.equal(playbackRateForVideo(12,10),1.2);assert.equal(playbackRateForVideo(50,10),2);
 assert.equal(playbackRateForVideo(8,10,1,1.5),1.2000000000000002);assert.equal(playbackRateForVideo(0,10,.8),.8);
});

test('default narration stays Portuguese and cached audio seeking follows cues without changing the rate',async()=>{
 const {narrationPosition}=await import('../src/narration-plan.mjs');
 assert.ok(buildNarrationPlan([{id:'0',text:'Abra Insight e Home Management.'}]).every(chunk=>chunk.lang==='pt-BR'));
 const segments=[{start:0,end:.5},{start:1,end:2}],marks=[{id:'0',start:0},{id:'0',start:1},{id:'1',start:3}];
 assert.deepEqual(narrationPosition(segments,marks,6,.25),{offset:1.5,startsAt:.25,finished:false});
 assert.deepEqual(narrationPosition(segments,marks,6,.75),{offset:3,startsAt:1,finished:false});
 assert.deepEqual(narrationPosition(segments,marks,6,1.5),{offset:4.5,startsAt:1.5,finished:false});
 assert.deepEqual(narrationPosition(segments,marks,6,2),{offset:6,startsAt:2,finished:true});
});

test('video synthesis retains words and creates sample-aligned boundaries for unequal cue lengths',()=>{
 const items=[{id:'0',text:'Confira cada uma das etapas antes de continuar.'},{id:'1',text:'Pronto.'}];
 const chunks=buildVideoNarrationPlan(items);
 assert.equal(chunks.map(chunk=>chunk.text).join(' '),items.map(item=>item.text).join(' '));
 assert.deepEqual(chunks.map(chunk=>chunk.marks),[[{id:'0',offset:0}],[{id:'1',offset:0}]]);
 const mixed=buildVideoNarrationPlan([{id:'0',text:'Abra Insight agora.'},{id:'1',text:'Confira Home Management.'}],'mixed');
 assert.ok(mixed.every(chunk=>chunk.marks.length===1&&chunk.marks[0].offset===0));
 assert.throws(()=>buildVideoNarrationPlan([{id:'0',text:'A '.repeat(16000)},{id:'1',text:'B '.repeat(16000)}]),/muito longo/);
 const segments=[{start:0,end:5},{start:6,end:8}],marks=[{id:'0',start:0},{id:'0',start:1},{id:'1',start:4}];
 assert.deepEqual(narrationCueTiming(segments,marks,7,'0'),{id:0,videoStart:0,videoEnd:5,audioStart:0,audioEnd:4});
 assert.deepEqual(narrationCueTiming(segments,marks,7,'1'),{id:1,videoStart:6,videoEnd:8,audioStart:4,audioEnd:7});
 assert.equal(narrationCueTiming(segments,marks,7,'2'),null);
 // Per-cue pace is .8x then 1.5x rather than a single global ratio.
 assert.equal(narrationRate(narrationCueTiming(segments,marks,7,'0'),2,2.5),.8);
 assert.equal(narrationRate(narrationCueTiming(segments,marks,7,'1'),5.5,7),1.5);
 assert.equal(narrationRate(narrationCueTiming(segments,marks,7,'1'),5.5,7,1.25),1.875);
 assert.equal(narrationRate({videoStart:0,videoEnd:1,audioStart:0,audioEnd:8},0,0),2);
 assert.equal(narrationRate({videoStart:0,videoEnd:10,audioStart:0,audioEnd:1},0,0),.6);
});
