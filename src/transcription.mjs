export function transcriptionModel(source='en',quality='base') {
  const size=quality==='small'?'small':'base';
  return `Xenova/whisper-${size}${source==='en'?'.en':''}`;
}
const tokens=text=>String(text||'').trim().split(/\s+/).filter(Boolean);
const comparable=word=>word.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');

// Whisper's complete text is authoritative. Timestamp metadata must not erase
// speech, including final words and chunks whose start/end were not predicted.
export function normalizeTranscript(output,duration) {
  if(!Number.isFinite(duration)||duration<=0)throw new Error('Duração do áudio inválida.');
  const full=tokens(output.text),chunks=(output.chunks||[]).filter(chunk=>tokens(chunk.text).length);
  if(!chunks.length)return fallback(full,duration);
  let cursor=0,aligned=true;
  const texts=chunks.map(chunk=>{
    const begin=cursor;
    for(const word of tokens(chunk.text)){
      const next=full.findIndex((token,index)=>index>=cursor&&comparable(token)===comparable(word));
      if(next<0){aligned=false;break;}cursor=next+1;
    }
    return full.slice(begin,cursor).join(' ');
  });
  if(full.length){
    if(!aligned)return fallback(full,duration);
    if(cursor<full.length)texts[texts.length-1]+=' '+full.slice(cursor).join(' ');
  }else for(let i=0;i<chunks.length;i++)texts[i]=tokens(chunks[i].text).join(' ');
  const lengths=texts.map(text=>Math.max(1,tokens(text).length)),total=lengths.reduce((sum,length)=>sum+length,0);
  let consumed=0;
  return chunks.map((chunk,index)=>{
    const estimatedStart=duration*consumed/total;consumed+=lengths[index];const estimatedEnd=duration*consumed/total;
    const valid=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&value<=duration;
    const stamp=chunk.timestamp||[],next=chunks[index+1]?.timestamp?.[0];
    let start=valid(stamp[0])?stamp[0]:estimatedStart;
    let end=valid(stamp[1])?stamp[1]:valid(next)&&next>start?next:estimatedEnd;
    if(end<=start){start=estimatedStart;end=estimatedEnd;}
    return {start,end,original:texts[index].trim(),translated:''};
  });
}
function fallback(words,duration){
  if(!words.length)return [];
  const groups=[];let current=[];
  for(const word of words){current.push(word);if(/[.!?]["')\]]*$/.test(word)||current.length>=40){groups.push(current);current=[];}}
  if(current.length)groups.push(current);
  let consumed=0;
  return groups.map(group=>{const start=duration*consumed/words.length;consumed+=group.length;return {start,end:duration*consumed/words.length,original:group.join(' '),translated:''};});
}
