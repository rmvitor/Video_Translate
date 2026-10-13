import { createBackup, readBackup } from './backup-format.mjs';
import { localSnapshot, mergeSnapshot, type LocalSnapshot } from './storage';
export function createBackupArea(options:{isBusy:()=>boolean;allowed:()=>boolean;account:()=>string|undefined;toast:(message:string)=>void;refresh:()=>Promise<void>;flush:()=>Promise<void>}) {
  let busy=false;
  const panel=document.createElement('article');panel.className='info-card backup-panel';
  panel.innerHTML=`<h2>Backup local e transferência</h2><p class="backup-description">Crie um arquivo criptografado com projetos, assuntos, textos, imagens, análises e progresso. Ele é baixado neste computador e pode ser importado em outro após o login. Nenhum backup é enviado ao Supabase.</p><label class="field-label backup-password">Senha do backup (mínimo 8 caracteres)<input id="backup-password" type="password" autocomplete="new-password" minlength="8" placeholder="Guarde esta senha em um local seguro"/></label><div class="backup-actions"><label><input id="backup-videos" type="checkbox" checked/>Incluir vídeos já guardados neste dispositivo</label><button class="button primary" id="export-backup">Criar backup local</button><button class="button secondary" id="import-backup">Restaurar backup</button></div><p class="settings-status">Vídeos que estão somente na sessão não entram no arquivo. Os modelos de IA e as chaves de acesso ficam fora do backup. Sem a senha, o backup não pode ser recuperado. Limite: 512 MB; vídeos grandes podem precisar ser transferidos separadamente.</p><p id="backup-status" role="status"></p><input id="backup-input" type="file" accept=".entrelinhas,application/octet-stream" hidden/>`;
  document.querySelector('#settings-view')!.append(panel);
  const status=(message:string)=>{panel.querySelector('#backup-status')!.textContent=message;};
  const password=()=>{const value=panel.querySelector<HTMLInputElement>('#backup-password')!.value;if(value.length<8)throw new Error('Use uma senha de backup com pelo menos 8 caracteres.');return value;};
  const guard=()=>{if(!options.allowed())return false;if(busy||options.isBusy()){options.toast('Conclua o processamento atual primeiro.');return false;}return true;};
  const setBusy=(value:boolean)=>{busy=value;panel.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{button.disabled=value;});};
  panel.querySelector('#export-backup')!.addEventListener('click',async()=>{
    if(!guard())return;
    try{const secret=password(),owner=options.account();setBusy(true);status('Preparando arquivos locais…');await options.flush();
      const snapshot=await localSnapshot();const blob=await createBackup(snapshot,secret,panel.querySelector<HTMLInputElement>('#backup-videos')!.checked,(done:number,total:number)=>status(`Preparando arquivo ${done} de ${total}…`));
      if(!options.allowed()||owner!==options.account())throw new Error('Seu acesso encerrou. Entre novamente para exportar.');
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`entrelinhas-backup-${new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date())}.entrelinhas`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);status('Backup criptografado criado. Guarde o arquivo e a senha em locais seguros.');
    }catch(err){status(err instanceof Error?err.message:'Não foi possível criar o backup. Confira a memória disponível.');}finally{setBusy(false);panel.querySelector<HTMLInputElement>('#backup-password')!.value='';}
  });
  panel.querySelector('#import-backup')!.addEventListener('click',()=>{if(guard())try{password();panel.querySelector<HTMLInputElement>('#backup-input')!.click();}catch(err){status((err as Error).message);}});
  panel.querySelector('#backup-input')!.addEventListener('change',async event=>{
    const input=event.target as HTMLInputElement,file=input.files?.[0],owner=options.account();
    if(!file||!guard())return;
    try{const secret=password();setBusy(true);status('Conferindo senha e integridade do backup…');
      const snapshot=await readBackup(file,secret) as LocalSnapshot;
      if(!options.allowed()||owner!==options.account())throw new Error('Entre novamente antes de restaurar.');
      await options.flush();const result=await mergeSnapshot(snapshot);await options.refresh();status(`Backup restaurado: ${result.added} materiais/organizações adicionados, ${result.skipped} já existentes preservados. Nenhum dado existente foi substituído.`);
    }catch(err){status(err instanceof Error?err.message:'Não foi possível restaurar. Confira a memória e o armazenamento disponíveis.');}finally{setBusy(false);input.value='';panel.querySelector<HTMLInputElement>('#backup-password')!.value='';}
  });
  async function legacy(){
    document.querySelector('#legacy-notice')?.remove();
    let owner:string|null;try{owner=localStorage.getItem('entrelinhas.legacy-owner');}catch{return;}
    if(owner)return;
    const snapshot=await localSnapshot(true);if(!snapshot.projects.length&&!snapshot.documents.length&&!snapshot.collections.length)return;
    const account=options.account();const banner=document.createElement('div');banner.id='legacy-notice';banner.className='legacy-notice';banner.innerHTML='<p>Há uma biblioteca anterior ao login neste navegador. Importe-a para esta conta somente se esses materiais forem seus. A cópia anterior será preservada.</p><button class="button secondary" id="claim-legacy">Importar minha biblioteca anterior</button>';document.querySelector('main')!.prepend(banner);
    banner.querySelector('button')!.addEventListener('click',async()=>{if(!guard())return;try{setBusy(true);if(account!==options.account()||localStorage.getItem('entrelinhas.legacy-owner'))return;banner.querySelector<HTMLButtonElement>('button')!.disabled=true;localStorage.setItem('entrelinhas.legacy-owner',account!);try{await mergeSnapshot(snapshot);}catch(error){if(localStorage.getItem('entrelinhas.legacy-owner')===account)localStorage.removeItem('entrelinhas.legacy-owner');throw error;}banner.remove();await options.refresh();options.toast('Biblioteca anterior importada para sua conta neste dispositivo.');}catch{options.toast('Não foi possível importar. A biblioteca anterior continua preservada.');banner.querySelector<HTMLButtonElement>('button')!.disabled=false;}finally{setBusy(false);}});
  }
  return {get busy(){return busy;},legacy,reset:()=>{panel.querySelector<HTMLInputElement>('#backup-password')!.value='';status('');document.querySelector('#legacy-notice')?.remove();}};
}
