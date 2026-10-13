import type { createAccess } from './access';
const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const date=(value?:string)=>value?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value)):'—';
const status:Record<string,string>={pending:'Aguardando',active:'Liberado',blocked:'Bloqueado'};
const events:Record<string,string>={registration:'Cadastro',master_bootstrap:'Master configurado',access_granted:'Entrada liberada',access_denied:'Entrada negada',logout:'Saída',policy_updated:'Política alterada',sessions_revoked:'Sessões revogadas'};
const localDate=(value?:string)=>{if(!value)return '';const d=new Date(value);d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,16);};
type User={id:string;email:string;display_name:string;role:string;status:string;starts_at?:string;expires_at?:string;session_minutes:number;active_seconds:number;last_seen_at?:string;last_ip?:string};
export function createAdmin(options:{access:ReturnType<typeof createAccess>;dialog:(html:string)=>void;toast:(message:string)=>void}) {
  let users:User[]=[],offset=0,search='',historyOffset=0,historyUser:string|undefined,busy=false;
  const root=document.createElement('section');root.id='admin-view';root.hidden=true;document.querySelector('main')!.append(root);
  root.innerHTML=`<div class="page-heading"><div><div class="eyebrow">GESTÃO MASTER</div><h1>Usuários e acesso<span>.</span></h1><p>Gerencie a entrada na ferramenta. O painel não recebe conteúdo dos treinamentos.</p></div><button class="button secondary" id="reload-access">Atualizar</button></div><div id="admin-error" role="alert"></div><div id="admin-summary" class="admin-summary"></div><form id="admin-search-form" class="admin-filters"><input id="admin-search" aria-label="Buscar usuário" placeholder="Buscar por nome ou e-mail" maxlength="120"/><button class="button primary">Buscar</button><button class="button secondary" type="button" id="all-history">Histórico geral</button></form><div id="admin-users"></div><div class="admin-paging"><button class="button secondary" id="admin-prev">Anterior</button><span id="admin-page"></span><button class="button secondary" id="admin-next">Próxima</button></div><div id="admin-history" class="admin-history"></div>`;
  const error=(message:string)=>{root.querySelector('#admin-error')!.textContent=message;};
  async function refresh(){
    if(busy||options.access.profile?.role!=='master')return;busy=true;error('');
    try{
      const result=await options.access.call('list',{search,offset});users=result.users;
      root.querySelector('#admin-summary')!.innerHTML=['total','pending','active','blocked'].map((key,index)=>`<article class="info-card"><b>${Number(result.counts[key])||0}</b>${['Contas','Aguardando','Liberadas','Bloqueadas'][index]}</article>`).join('');
      root.querySelector('#admin-users')!.innerHTML=`<div class="table-scroll"><table class="admin-table"><thead><tr><th>Usuário</th><th>Acesso</th><th>Prazo / sessão</th><th>Último acesso / IP</th><th>Tempo ativo</th><th>Ações</th></tr></thead><tbody>${users.map(user=>`<tr><td><strong>${esc(user.display_name||user.email)}</strong><small>${esc(user.email)}${user.role==='master'?' · Master':''}</small></td><td><span class="status-label">${status[user.status]||'Desconhecido'}</span></td><td>${user.expires_at?date(user.expires_at):'Sem prazo final'}<small>Início: ${user.starts_at?date(user.starts_at):'Imediato'}</small><small>Sessão: ${user.session_minutes} min</small></td><td>${date(user.last_seen_at)}<small>${esc(user.last_ip||'IP indisponível')}</small></td><td>${Math.floor(user.active_seconds/60)} min</td><td><div class="inline-actions">${user.role!=='master'?`<button class="text-button" data-policy="${user.id}">Gerenciar</button><button class="text-button" data-revoke="${user.id}">Encerrar sessões</button>`:''}<button class="text-button" data-history="${user.id}">Histórico</button></div></td></tr>`).join('')||'<tr><td colspan="6">Nenhum usuário encontrado.</td></tr>'}</tbody></table></div>`;
      root.querySelector('#admin-page')!.textContent=`Página ${offset/50+1}`;
      root.querySelector<HTMLButtonElement>('#admin-prev')!.disabled=offset===0;root.querySelector<HTMLButtonElement>('#admin-next')!.disabled=users.length<50;
    }catch(err){error(err instanceof Error?err.message:'Não foi possível carregar o painel.');}finally{busy=false;}
  }
  async function history(id?:string){
    historyUser=id;
    try{
      const result=await options.access.call('history',{user_id:id,offset:historyOffset});
      root.querySelector('#admin-history')!.innerHTML=`<h2>${id?'Histórico do usuário':'Histórico geral'}</h2><p class="backup-description">Horários em Brasília. Tempo ativo estimado por confirmações periódicas com a aba visível; não mede produtividade. IP observado no gateway, podendo representar VPN/proxy.</p><h3>Sessões</h3><div class="table-scroll"><table class="admin-table"><thead><tr><th>Entrada</th><th>Última presença / saída</th><th>Tempo ativo</th><th>IP / dispositivo</th></tr></thead><tbody>${result.sessions.map((s:any)=>`<tr><td>${date(s.started_at)}</td><td>${date(s.last_seen_at)}<small>${s.closed_at?'Encerrada: '+date(s.closed_at):'Sem encerramento registrado'}</small></td><td>${Math.floor(s.active_seconds/60)} min</td><td>${esc(s.ip||'—')}<small>${esc(s.user_agent)}</small></td></tr>`).join('')||'<tr><td colspan="4">Sem sessões.</td></tr>'}</tbody></table></div><h3>Eventos</h3><div class="table-scroll"><table class="admin-table"><thead><tr><th>Horário</th><th>Evento</th><th>IP</th><th>Detalhes</th></tr></thead><tbody>${result.events.map((event:any)=>`<tr><td>${date(event.created_at)}</td><td>${esc(events[event.event]||event.event)}</td><td>${esc(event.ip||'—')}</td><td>${esc(JSON.stringify(event.details))}</td></tr>`).join('')||'<tr><td colspan="4">Sem eventos.</td></tr>'}</tbody></table></div><div class="admin-paging"><button class="button secondary" id="history-prev" ${historyOffset===0?'disabled':''}>Anterior</button><span>Página ${historyOffset/50+1}</span><button class="button secondary" id="history-next" ${result.sessions.length<50&&result.events.length<50?'disabled':''}>Próxima</button></div>`;
    }catch(err){error(err instanceof Error?err.message:'Não foi possível consultar o histórico.');}
  }
  root.querySelector('#admin-search-form')!.addEventListener('submit',event=>{event.preventDefault();search=root.querySelector<HTMLInputElement>('#admin-search')!.value;offset=0;void refresh();});
  root.addEventListener('click',async event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('button');if(!button)return;
    if(button.id==='reload-access')void refresh();
    if(button.id==='admin-prev'||button.id==='admin-next'){offset=Math.max(0,offset+(button.id==='admin-next'?50:-50));void refresh();}
    if(button.id==='history-prev'||button.id==='history-next'){historyOffset=Math.max(0,historyOffset+(button.id==='history-next'?50:-50));void history(historyUser);}
    if(button.dataset.history||button.id==='all-history'){historyOffset=0;void history(button.dataset.history);}
    if(button.dataset.policy){
      const user=users.find(user=>user.id===button.dataset.policy)!;
      options.dialog(`<h2>Gerenciar acesso</h2><p>${esc(user.email)}</p><form id="policy-form"><label class="field-label">Situação<select id="policy-status">${Object.entries(status).map(([key,label])=>`<option value="${key}" ${user.status===key?'selected':''}>${label}</option>`).join('')}</select></label><label class="field-label">Início da liberação (horário deste dispositivo)<input id="policy-start" type="datetime-local" value="${localDate(user.starts_at)}" /></label><label class="field-label">Fim da liberação (vazio: sem prazo)<input id="policy-end" type="datetime-local" value="${localDate(user.expires_at)}" /></label><label class="field-label">Tempo máximo por sessão (minutos)<input id="policy-minutes" type="number" min="5" max="1440" value="${user.session_minutes}" required/></label><p>Salvar encerra as sessões atuais deste usuário. Ele precisará entrar novamente com a nova política.</p><p id="policy-error" class="field-error" role="alert"></p><button class="button primary">Salvar política de acesso</button></form>`);
      document.querySelector('#policy-form')!.addEventListener('submit',async()=>{
        const submit=document.querySelector<HTMLButtonElement>('#policy-form button')!;submit.disabled=true;
        try{
          const dateValue=(selector:string)=>{const value=document.querySelector<HTMLInputElement>(selector)!.value;return value?new Date(value).toISOString():null;};
          await options.access.call('update',{user_id:user.id,status:document.querySelector<HTMLSelectElement>('#policy-status')!.value,starts_at:dateValue('#policy-start'),expires_at:dateValue('#policy-end'),session_minutes:Number(document.querySelector<HTMLInputElement>('#policy-minutes')!.value)});
          document.querySelector<HTMLDialogElement>('#dialog')!.close();options.toast('Política salva. As sessões anteriores foram revogadas.');await refresh();
        }catch(err){document.querySelector('#policy-error')!.textContent=err instanceof Error?err.message:'Não foi possível salvar.';}finally{submit.disabled=false;}
      });
    }
    if(button.dataset.revoke){
      const id=button.dataset.revoke;
      options.dialog('<h2>Encerrar sessões deste usuário?</h2><p>Ele precisará entrar novamente. A biblioteca local será preservada.</p><button class="button danger" id="confirm-revoke">Encerrar sessões</button>');
      document.querySelector('#confirm-revoke')!.addEventListener('click',async()=>{try{await options.access.call('revoke',{user_id:id});document.querySelector<HTMLDialogElement>('#dialog')!.close();options.toast('Sessões revogadas.');await refresh();}catch(err){options.toast(err instanceof Error?err.message:'Não foi possível revogar.');}});
    }
  });
  return {refresh,reset:()=>{users=[];offset=0;historyOffset=0;root.querySelector('#admin-users')!.innerHTML='';root.querySelector('#admin-summary')!.innerHTML='';root.querySelector('#admin-history')!.innerHTML='';}};
}
