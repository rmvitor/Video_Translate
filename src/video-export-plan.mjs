import { timestamp } from './subtitles.mjs';

export function validateVideoExport(project, file, audio, subtitles) {
  if (!['pt-BR', 'original', 'both'].includes(audio) || !['burned', 'track', 'none'].includes(subtitles)) throw new Error('Escolha opções de áudio e legenda válidas.');
  if (!file?.size) throw new Error('Selecione novamente o vídeo original para preparar o download.');
  if (file.size > 500 * 1024 * 1024) throw new Error('A exportação local aceita vídeos de até 500 MB.');
  if (!Number.isFinite(project?.duration) || project.duration <= 0 || project.duration > 1800) throw new Error('A exportação local aceita vídeos com duração válida de até 30 minutos.');
  if (!project.segments?.length) throw new Error('Prepare a transcrição e a tradução antes de baixar o vídeo.');
  if (project.segments.some((s,index) => !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end <= s.start || s.start >= project.duration || index>0&&s.start<project.segments[index-1].start)) throw new Error('Revise os tempos da transcrição antes de exportar.');
  if ((audio !== 'original' || subtitles !== 'none') && project.segments.some(s => !s.translated?.trim())) throw new Error('Traduza todos os trechos antes de incluir narração ou legenda em PT-BR.');
}

export function exportTimeline(segments, videoDuration, narration) {
  if (!narration) return { duration: videoDuration, leadIn: 0, captions: segments.map(s => ({ ...s, end: Math.min(s.end, videoDuration) })) };
  if (!Number.isFinite(narration.duration) || narration.duration <= 0) throw new Error('A voz local não gerou uma narração válida.');
  const starts = new Map();
  for (const mark of narration.marks) if (!starts.has(mark.id)) starts.set(mark.id, mark.start);
  const leadIn = segments[0].start;
  const captions = segments.map((segment, index) => {
    const start = starts.get(String(index)), end = index + 1 < segments.length ? starts.get(String(index + 1)) : narration.duration;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > narration.duration + .01) throw new Error('A narração não contém os tempos de todos os trechos. Gere-a novamente.');
    return { ...segment, start: leadIn + start, end: leadIn + end };
  });
  return { duration: Math.max(videoDuration, leadIn + narration.duration), leadIn, captions };
}

export function videoSubtitles(segments) {
  // A body line cannot inject an extra subtitle entry or HTML formatting.
  const text = value => value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/gu, ' ').trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return segments.map((s, index) => `${index + 1}\n${timestamp(s.start)} --> ${timestamp(s.end)}\n${text(s.translated)}\n`).join('\n');
}

export function videoExportCommand({ audio, subtitles, videoDuration, duration, leadIn, videoCodec, hasOriginalAudio }) {
  const narrated = audio !== 'original';
  if (audio === 'both' && !hasOriginalAudio) throw new Error('O vídeo não tem uma faixa de áudio original. Escolha somente a narração em PT-BR.');
  const seconds = value => value.toFixed(3);
  const args = ['-protocol_whitelist', 'file,pipe,data', '-i', '/source/video'];
  if (narrated) args.push('-itsoffset', seconds(leadIn), '-i', 'narration.wav');
  const subtitleIndex = narrated ? 2 : 1;
  if (subtitles === 'track') {
    args.push('-i', 'captions.srt');
    if (audio === 'both') args.push('-i', 'original-timing.srt');
  }
  args.push('-map', '0:v:0');
  if (narrated) args.push('-map', '1:a:0');
  if (audio !== 'pt-BR' && hasOriginalAudio) args.push('-map', '0:a:0');
  if (subtitles === 'track') {
    args.push('-map', `${subtitleIndex}:s:0`);
    if (audio === 'both') args.push('-map', `${subtitleIndex + 1}:s:0`);
  }
  const filters = [];
  if (duration > videoDuration + .001) filters.push(`tpad=stop_mode=clone:stop_duration=${seconds(duration - videoDuration)}`);
  if (subtitles === 'burned') filters.push("subtitles=captions.srt:fontsdir=fonts:force_style='FontName=Liberation Sans,FontSize=20,Outline=1,Shadow=0,MarginV=18'");
  if (filters.length || videoCodec !== 'h264') {
    filters.unshift('pad=ceil(iw/2)*2:ceil(ih/2)*2');
    args.push('-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '22', '-pix_fmt', 'yuv420p', '-threads', '1');
  } else args.push('-c:v', 'copy');
  if (narrated || hasOriginalAudio) args.push('-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-af', 'apad', '-disposition:a:0', 'default', '-metadata:s:a:0', `language=${narrated ? 'por' : 'und'}`, '-metadata:s:a:0', `title=${narrated ? 'Português (Brasil)' : 'Áudio original'}`);
  if (audio === 'both') args.push('-disposition:a:1', '0', '-metadata:s:a:1', 'title=Áudio original');
  if (subtitles === 'track') {
    args.push('-c:s', 'mov_text', '-metadata:s:s:0', 'language=por', '-metadata:s:s:0', `title=PT-BR (${narrated ? 'narração' : 'áudio original'})`, '-disposition:s:0', 'default');
    if (audio === 'both') args.push('-metadata:s:s:1', 'language=por', '-metadata:s:s:1', 'title=PT-BR (áudio original)', '-disposition:s:1', '0');
  }
  args.push('-map_metadata', '-1', '-map_chapters', '-1', '-t', seconds(duration), '-movflags', '+faststart', 'translated.mp4');
  return args;
}
