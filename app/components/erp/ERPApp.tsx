'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useERP } from '@/lib/erp/use-erp';
import { specs } from '@/lib/erp/config';
import { canAdmin, canWrite, isEntity, type Entity, type EntityRecord, type RecordInput } from '@/lib/erp/types';
import Dashboard from './Dashboard';
import RecordsView from './RecordsView';
import Settings, { HoldedPreparation } from './Settings';
import { AuthScreen, CompanyForm, InvoicePartsForm, type CompanyInput, type InvoicePartsInput } from './Workflows';
import { Icon, initials, type IconName } from './ui';

type Module=Entity|'dashboard'|'settings';
const navigation:{label:string;items:Entity[]}[]=[{label:'COMERCIAL',items:['clients','contacts','opportunities']},{label:'OPERACIONES',items:['projects','consultants','contracts','purchase_orders','timesheets']},{label:'FINANZAS',items:['invoices','expenses']}];
function currentModule():Module {const value=new URLSearchParams(window.location.search).get('module');return value&&(isEntity(value)||value==='settings'||value==='dashboard')?value:'dashboard';}
function subscribeNavigation(listener:()=>void){window.addEventListener('popstate',listener);window.addEventListener('minierp:navigate',listener);return()=>{window.removeEventListener('popstate',listener);window.removeEventListener('minierp:navigate',listener);};}
const serverModule=():Module=>'dashboard';

export default function ERPApp(){
  const erp=useERP();const active=useSyncExternalStore(subscribeNavigation,currentModule,serverModule);const [mobileMenu,setMobileMenu]=useState(false);const [companyForm,setCompanyForm]=useState(false);const [invoiceForm,setInvoiceForm]=useState(false);const [prepareInvoice,setPrepareInvoice]=useState<EntityRecord|null>(null);const [toast,setToast]=useState('');
  useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),5000);return()=>clearTimeout(timer);},[toast]);
  function navigate(destination:Module){setMobileMenu(false);const url=new URL(window.location.href);url.searchParams.set('module',destination);url.searchParams.delete('id');window.history.replaceState(null,'',url);window.dispatchEvent(new Event('minierp:navigate'));}
  async function save(entity:Entity,input:RecordInput,id?:string){const result=await erp.save(entity,input,id);setToast(id?'Cambios guardados.':'Registro creado.');return result;}
  async function remove(entity:Entity,id:string){await erp.remove(entity,id);setToast('Registro eliminado.');}
  async function createCompany(input:CompanyInput){await erp.createCompany(input);setToast('Empresa creada. Ya puedes empezar a trabajar.');navigate('dashboard');}
  async function createInvoice(input:InvoicePartsInput){const result=await erp.invoiceTimesheets(input);setToast('Borrador creado. Los partes han quedado vinculados a la factura.');navigate('invoices');return result;}
  function switchCompany(id:string){setPrepareInvoice(null);setInvoiceForm(false);erp.selectCompany(id);setMobileMenu(false);}
  const title=active==='dashboard'?'Resumen':active==='settings'?'Configuración':specs[active].label;
  const writable=canWrite(erp.role);
  if(!erp.ready)return <main className="erp-loading-screen" aria-label="Cargando MiniERP"><span className="erp-brand-mark">a</span><strong>Preparando tu espacio de trabajo…</strong><span className="erp-loading-spinner"/></main>;
  if(erp.mode==='live'&&!erp.authenticated)return <AuthScreen onSignIn={erp.signIn} error={erp.error}/>;
  return <div className="erp-app">
    {mobileMenu&&<button className="erp-mobile-scrim" aria-label="Cerrar navegación" onClick={()=>setMobileMenu(false)}/>}
    <aside className={`erp-sidebar ${mobileMenu?'erp-sidebar-open':''}`} aria-label="Navegación principal">
      <button className="erp-brand" onClick={()=>navigate('dashboard')} aria-label="Almega MiniERP: inicio"><span className="erp-brand-mark">a</span><span><strong>almega</strong><small>WORKSPACE</small></span></button>
      <div className="erp-company-switch"><span className="erp-company-icon"><Icon name="building" size={18}/></span><div><label htmlFor="sidebar-company">Empresa activa</label><select id="sidebar-company" value={erp.activeCompanyId} onChange={e=>switchCompany(e.target.value)} aria-label="Cambiar empresa">{erp.companies.map(company=><option key={company.id} value={company.id}>{company.name}</option>)}{!erp.companies.length&&<option value="">Sin empresa</option>}</select></div></div>
      <nav className="erp-navigation"><button className={`erp-nav-item erp-summary-nav ${active==='dashboard'?'active':''}`} onClick={()=>navigate('dashboard')} aria-current={active==='dashboard'?'page':undefined}><Icon name="grid" size={19}/><span>Resumen</span></button>{navigation.map(group=><div className="erp-nav-group" key={group.label}><div className="erp-nav-label">{group.label}</div>{group.items.map(entity=><button key={entity} className={`erp-nav-item ${active===entity?'active':''}`} onClick={()=>navigate(entity)} aria-current={active===entity?'page':undefined}><Icon name={entity as IconName} size={18}/><span>{specs[entity].label}</span>{entity==='timesheets'&&erp.records.timesheets.filter(t=>t.status==='submitted').length>0&&<span className="erp-nav-count">{erp.records.timesheets.filter(t=>t.status==='submitted').length}</span>}</button>)}</div>)}</nav>
      <div className="erp-sidebar-bottom"><button className={`erp-nav-item ${active==='settings'?'active':''}`} onClick={()=>navigate('settings')} aria-current={active==='settings'?'page':undefined}><Icon name="settings" size={18}/><span>Configuración</span></button><div className="erp-user"><span className="erp-user-avatar">{initials(erp.userEmail?erp.userEmail.split('@')[0].replace(/[._]/g,' '):'Almega')}</span><div><strong>{erp.mode==='demo'?'Espacio de prueba':erp.userEmail?.split('@')[0]||'Mi cuenta'}</strong><small>{erp.mode==='demo'?'Datos de ejemplo':'Sesión iniciada'}</small></div>{erp.mode==='live'&&<button className="erp-icon-button" aria-label="Cerrar sesión" onClick={()=>void erp.signOut()}><Icon name="logout" size={17}/></button>}</div></div>
    </aside>
    <div className="erp-main"><header className="erp-topbar"><div className="erp-breadcrumb"><button className="erp-icon-button erp-mobile-menu" aria-label="Abrir navegación" onClick={()=>setMobileMenu(true)}><Icon name="menu"/></button><span className="erp-breadcrumb-workspace">Mi espacio</span><span className="erp-breadcrumb-divider">/</span><strong>{title}</strong></div><div className="erp-topbar-right"><span className={`erp-mode-label ${erp.mode==='demo'?'demo':''}`}><Icon name={erp.mode==='demo'?'file':'shield'} size={14}/>{erp.mode==='demo'?'Vista de prueba':'Espacio compartido'}</span><button className={`erp-icon-button ${erp.loading?'erp-spinning':''}`} onClick={()=>void erp.refresh()} disabled={erp.loading} aria-label="Actualizar datos"><Icon name="refresh" size={18}/></button><span className="erp-topbar-avatar">{initials(erp.company?.name||'Almega')}</span></div></header>
      {erp.mode==='demo'&&<div className="erp-demo-banner"><Icon name="file" size={15}/><span><strong>Espacio de prueba</strong> · Datos ficticios guardados en este navegador.</span><button onClick={()=>navigate('settings')}>Ver detalles</button></div>}
      {erp.error&&<div className="erp-global-error" role="alert"><span>{erp.error}</span><button className="erp-icon-button" aria-label="Cerrar error" onClick={()=>erp.setError(null)}><Icon name="close" size={17}/></button></div>}
      {erp.loading&&<div className="erp-loading-bar" role="status" aria-label="Actualizando datos"/>}
      <main className="erp-content" id="main-content" aria-busy={erp.loading}>
        {!erp.company?<div className="erp-onboarding"><div className="erp-eyebrow">BIENVENIDO A ALMEGA</div><h1>Vamos a organizar tu negocio.</h1><p>Crea tu primera empresa para empezar a trabajar con clientes, proyectos y facturación.</p><button className="erp-button erp-button-primary" onClick={()=>setCompanyForm(true)}><Icon name="plus" size={18}/>Crear mi primera empresa</button></div>:active==='dashboard'?<Dashboard key={erp.company.id} company={erp.company} dataset={erp.records} onNavigate={navigate} onInvoice={()=>setInvoiceForm(true)} editable={writable} mode={erp.mode}/>:active==='settings'?<Settings key={`${erp.company.id}-${erp.role}`} company={erp.company} dataset={erp.records} role={erp.role} mode={erp.mode} onCreateCompany={()=>setCompanyForm(true)} getMembers={erp.getMembers} addMember={erp.addMember} getAccessToken={erp.getAccessToken} onResetDemo={erp.resetDemo} saveClient={(input,id)=>save('clients',input,id)}/>:<RecordsView key={`${erp.company.id}-${active}`} entity={active} dataset={erp.records} company={erp.company} editable={writable} onSave={save} onDelete={remove} onInvoice={()=>setInvoiceForm(true)} onPrepareHolded={setPrepareInvoice} isAdmin={canAdmin(erp.role)} mode={erp.mode}/>}
      </main><footer className="erp-app-footer"><span>Almega MiniERP</span><span>Un espacio para cada empresa.</span></footer>
    </div>
    {toast&&<div className="erp-toast" role="status"><Icon name="check" size={18}/><span>{toast}</span><button className="erp-icon-button" aria-label="Cerrar notificación" onClick={()=>setToast('')}><Icon name="close" size={16}/></button></div>}
    {companyForm&&<CompanyForm onClose={()=>setCompanyForm(false)} onCreate={createCompany}/>}
    {invoiceForm&&erp.company&&<InvoicePartsForm dataset={erp.records} company={erp.company} onClose={()=>setInvoiceForm(false)} onCreate={createInvoice}/>}
    {prepareInvoice&&erp.company&&erp.mode==='live'&&<HoldedPreparation invoice={prepareInvoice} company={erp.company} getAccessToken={erp.getAccessToken} onClose={()=>setPrepareInvoice(null)}/>}
  </div>;
}
