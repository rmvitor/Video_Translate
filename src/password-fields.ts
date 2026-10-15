import {createElement,Eye,EyeOff} from 'lucide';
import {passwordChecks,passwordPolicy} from './password-policy.mjs';

function setVisibility(input:HTMLInputElement,button:HTMLButtonElement,visible:boolean){
  const start=input.selectionStart,end=input.selectionEnd;
  input.type=visible?'text':'password';
  button.setAttribute('aria-pressed',String(visible));
  button.setAttribute('aria-label',visible?'Ocultar senha':'Mostrar senha');
  button.title=visible?'Ocultar senha':'Mostrar senha';
  const icon=createElement(visible?EyeOff:Eye);icon.setAttribute('aria-hidden','true');icon.setAttribute('focusable','false');button.replaceChildren(icon);
  if(start!==null&&end!==null)input.setSelectionRange(start,end);
}

export function enhancePasswordInputs(root:HTMLElement){
  root.querySelectorAll<HTMLInputElement>('input[type=password]:not([data-password-field])').forEach(input=>{
    input.dataset.passwordField='true';
    input.spellcheck=false;input.setAttribute('autocapitalize','none');input.setAttribute('autocorrect','off');
    const wrapper=document.createElement('span');wrapper.className='password-input';input.before(wrapper);wrapper.append(input);
    const label=wrapper.parentElement;
    if(label?.matches('label.field-label')){
      const field=document.createElement('div');field.className=label.className;label.before(field);field.append(label,wrapper);
      label.className='';(label as HTMLLabelElement).htmlFor=input.id;
    }
    const button=document.createElement('button');button.type='button';button.className='password-toggle';button.dataset.passwordToggle=input.id;button.setAttribute('aria-controls',input.id);
    wrapper.append(button);setVisibility(input,button,false);
    button.addEventListener('click',()=>setVisibility(input,button,input.type==='password'));
  });
}

export function concealPasswords(root:HTMLElement,clear=false){
  root.querySelectorAll<HTMLInputElement>('input[data-password-field]').forEach(input=>{
    const button=input.parentElement!.querySelector<HTMLButtonElement>('[data-password-toggle]')!;
    setVisibility(input,button,false);if(clear)input.value='';
  });
}

export function bindPasswordChecklist(input:HTMLInputElement,list:HTMLElement,policy:ReturnType<typeof passwordPolicy>){
  const summary=document.createElement('p');summary.className='password-check-summary';summary.id=list.id+'-summary';summary.setAttribute('role','status');summary.setAttribute('aria-live','polite');summary.setAttribute('aria-atomic','true');list.after(summary);
  input.setAttribute('aria-describedby',`${list.id} ${summary.id}`);
  const rows=passwordChecks('',policy).map(check=>{
    const row=document.createElement('li');row.dataset.requirement=check.id;
    const icon=document.createElement('span');icon.className='password-check-icon';icon.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.textContent=check.label;
    const status=document.createElement('span');status.className='password-check-state';row.append(icon,label,status);return row;
  });list.replaceChildren(...rows);
  const update=()=>{
    const checks=passwordChecks(input.value,policy),count=checks.filter(check=>check.met).length;
    checks.forEach((check,index)=>{
      const row=rows[index];row.dataset.met=String(check.met);
      row.querySelector('.password-check-icon')!.textContent=check.met?'✓':'';
      row.querySelector('.password-check-state')!.textContent=check.met?'OK':'Pendente';
    });
    const message=count===checks.length?'Todos os requisitos atendidos.':`${count} de ${checks.length} requisitos atendidos.`;
    if(summary.textContent!==message)summary.textContent=message;
  };
  input.addEventListener('input',update);input.addEventListener('change',update);update();
}
