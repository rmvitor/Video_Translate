const ENGLISH_TERMS = ['Insight','Insights','Home Management','Home Manager','Close Management','Account Reconciliation','Close Period','Smart View','To Do','Dashboard','Worklist','Workflow','Overview','Getting Started','Home','Setup','Settings','Task Types','User Roles','Administrator','Login','Sign In','Sign Out','Upload','Download','Backup','Oracle'];
const AMBIGUOUS = new Set('a o os as e de do da dos das no na nos nas em um uma para com por se que total data local status visual item itens menu manual control final normal fiscal principal report'.split(' '));
const words = text => [...text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)];
const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/** @typedef {{id:string,text:string,original?:string,sourceLanguage?:string}} ReadingItem */
/** @typedef {{id:string,offset:number}} Mark */
/** @typedef {{text:string,lang:'pt-BR'|'en-US',marks:Mark[]}} Chunk */

// Conservative detection: known interface terms, explicit local terms, and copied
// multiword/capitalized labels from an English source. Never translate the text.
export function pronunciationRuns(text, original = '', terms = '', sourceLanguage = 'en', mode = 'mixed') {
  if (mode !== 'mixed') return [{text,lang:mode === 'en-US' ? 'en-US' : 'pt-BR'}];
  const matches = [], candidates = [...ENGLISH_TERMS, ...terms.split(/[,;\n]/).map(t=>t.trim()).filter(t=>t&&t.length<=80).slice(0,100)];
  if (sourceLanguage === 'en') {
    const sourceWords = words(original), sourceSet = new Set(sourceWords.map(w=>w[0].toLowerCase())), translated = words(text);
    for (let i=0;i<translated.length;i++) {
      const word=translated[i][0];
      if (!sourceSet.has(word.toLowerCase()) || AMBIGUOUS.has(word.toLowerCase()) || /[^a-z'-]/i.test(word)) continue;
      let end=i;
      while(end+1<translated.length && sourceSet.has(translated[end+1][0].toLowerCase()) && !AMBIGUOUS.has(translated[end+1][0].toLowerCase()) && /^\s+$/.test(text.slice(translated[end].index+translated[end][0].length,translated[end+1].index))) end++;
      const phrase=translated.slice(i,end+1).map(w=>w[0]).join(' ');
      if ((end>i || /^[A-Z]/.test(word)) && new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(phrase)}(?:$|[^\\p{L}\\p{N}])`,'iu').test(original)) candidates.push(phrase);
      i=end;
    }
  }
  for (const phrase of new Set(candidates)) {
    const expression=new RegExp(`(?<![\\p{L}\\p{N}])${phrase.split(/\s+/).map(escape).join('\\s+')}(?![\\p{L}\\p{N}])`,'giu');
    for (const match of text.matchAll(expression)) matches.push({start:match.index,end:match.index+match[0].length+(text.slice(match.index+match[0].length).match(/^[,.;:!?”’)\]]+/)?.[0].length||0)});
  }
  matches.sort((a,b)=>a.start-b.start||b.end-a.end);
  const ranges=[];
  for(const match of matches){const last=ranges.at(-1);if(last&&match.start<=last.end)last.end=Math.max(last.end,match.end);else ranges.push({...match});}
  const runs=[];let cursor=0;
  for(const range of ranges){if(range.start>cursor)runs.push({text:text.slice(cursor,range.start),lang:'pt-BR'});runs.push({text:text.slice(range.start,range.end),lang:'en-US'});cursor=range.end;}
  if(cursor<text.length)runs.push({text:text.slice(cursor),lang:'pt-BR'});
  return runs;
}

/** @param {ReadingItem[]} items @returns {Chunk[]} */
export function buildNarrationPlan(items, mode = 'pt-BR', terms = '') {
  /** @type {Chunk[]} */
  const chunks=[];let total=0;
  for(const item of items){
    const source=item.sourceLanguage||'en';
    if(mode==='en-US'&&source!=='en')throw new Error('A narração em inglês usa o texto original em inglês. Escolha PT-BR para este material.');
    const text=(mode==='en-US'?item.original||'':item.text).trim();
    if(!text)continue;
    if((total+=text.length)>60000)throw new Error('Texto muito longo para uma única narração. Leia uma parte por vez.');
    for(const run of pronunciationRuns(text,item.original,terms,source,mode)){
      // Split at words, retaining every token. Join neighboring sections in the
      // same voice so paragraph/cue boundaries do not create playback gaps.
      for(const word of run.text.match(/\S+\s*/g)||[]){
        let tail=chunks.at(-1);
        if(!tail||tail.lang!==run.lang||tail.text.length+word.length+(tail.text&&!/\s$/.test(tail.text)?1:0)>600){tail={text:'',lang:run.lang==='en-US'?'en-US':'pt-BR',marks:[]};chunks.push(tail);}
        if(tail.text&&!/\s$/.test(tail.text))tail.text+=' ';
        if(tail.marks.at(-1)?.id!==item.id)tail.marks.push({id:item.id,offset:tail.text.length});
        tail.text+=word;
      }
    }
  }
  for(const chunk of chunks)chunk.text=chunk.text.trimEnd();
  return chunks;
}

export function narrationPlaybackRate(videoRate = 1) {
  // Keep the speaker's natural pace. Subtitle length and gaps never stretch
  // speech or trigger a stop; only an explicit player speed change affects it.
  return Math.min(2,Math.max(.6,videoRate));
}

// A cue can have several language runs; its first audio mark defines its start.
export function narrationPosition(segments, marks, duration, time) {
  const starts = new Map();
  for (const mark of marks) if (!starts.has(mark.id)) starts.set(mark.id, mark.start);
  const spoken = segments.map((segment,index)=>({...segment,id:String(index),audioStart:starts.get(String(index))})).filter(segment=>segment.audioStart!==undefined);
  const index = spoken.findIndex(segment=>segment.end>time);
  if (index<0) return {offset:duration,startsAt:time,finished:true};
  const cue=spoken[index],end=spoken[index+1]?.audioStart??duration;
  const fraction=Math.min(1,Math.max(0,(time-cue.start)/Math.max(.001,cue.end-cue.start)));
  return {offset:cue.audioStart+(end-cue.audioStart)*fraction,startsAt:Math.max(time,cue.start),finished:false};
}

// Video cues are synthesized separately, then concatenated into one local WAV.
// Their marks are actual sample boundaries, not character-based estimates.
/** @param {ReadingItem[]} items @returns {Chunk[]} */
export function buildVideoNarrationPlan(items,mode='pt-BR',terms='') {
  if(items.reduce((sum,item)=>sum+(mode==='en-US'?item.original||'':item.text).length,0)>60000)throw new Error('Texto muito longo para uma única narração. Leia uma parte por vez.');
  return items.flatMap(item=>buildNarrationPlan([item],mode,terms));
}
export function narrationCueTiming(segments,marks,duration,id){
  const starts=new Map();for(const mark of marks)if(!starts.has(mark.id))starts.set(mark.id,mark.start);
  const ids=[...starts.keys()],index=ids.indexOf(String(id)),segment=segments[Number(id)];
  if(index<0||!segment)return null;
  return {id:Number(id),videoStart:segment.start,videoEnd:segment.end,audioStart:starts.get(String(id)),audioEnd:starts.get(ids[index+1])??duration};
}
