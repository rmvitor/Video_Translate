// Trim only very quiet padding at the edges; never remove pauses inside speech.
export function trimPadding(samples, sampleRate) {
  const keep=Math.floor(sampleRate*.03);
  let start=0,end=samples.length;
  while(start<end&&Math.abs(samples[start])<.001)start++;
  while(end>start&&Math.abs(samples[end-1])<.001)end--;
  return samples.subarray(Math.max(0,start-keep),Math.min(samples.length,end+keep));
}
export function encodeWav(parts,rate) {
  const length=parts.reduce((sum,part)=>sum+part.length,0);
  const bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes);
  const tag=(offset,text)=>[...text].forEach((letter,index)=>view.setUint8(offset+index,letter.charCodeAt(0)));
  tag(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);tag(8,'WAVE');tag(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);
  view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);tag(36,'data');view.setUint32(40,length*2,true);
  let offset=44;for(const part of parts)for(const sample of part){view.setInt16(offset,sample,true);offset+=2;}
  return bytes;
}
export function pcm16(samples) {
  return Int16Array.from(samples,sample=>Math.max(-1,Math.min(1,sample))*(sample<0?32768:32767));
}
