'use client';

import { useState } from 'react';
import { currencies } from '@/lib/erp/config';
import { formatMoney } from '@/lib/erp/domain';
import type { Company, Dataset, Entity } from '@/lib/erp/types';
import { dateLabel, EmptyState, Icon, StatusBadge } from './ui';

type Props={company:Company;dataset:Dataset;onNavigate:(module:Entity)=>void;onInvoice:()=>void;editable:boolean;mode:'live'|'demo'};
export default function Dashboard({company,dataset,onNavigate,onInvoice,editable,mode}:Props){
  const [currency,setCurrency]=useState(company.currency_code);const [month,setMonth]=useState(new Date().toISOString().slice(0,7));
  const today=new Date().toISOString().slice(0,10);
  const monetaryInvoices=dataset.invoices.filter(i=>i.currency_code===currency);
  const billed=monetaryInvoices.filter(i=>['issued','paid'].includes(String(i.status))&&String(i.issue_date).startsWith(month));
  const revenue=billed.reduce((sum,i)=>sum+Number(i.subtotal_minor||0),0);
  const outstanding=monetaryInvoices.filter(i=>i.status==='issued').reduce((sum,i)=>sum+Number(i.total_minor||0),0);
  const overdue=monetaryInvoices.filter(i=>i.status==='issued'&&String(i.due_date)<today);
  const pending=dataset.timesheets.filter(t=>t.status==='submitted');
  const approved=dataset.timesheets.filter(t=>t.status==='approved');
  const projects=dataset.projects.filter(p=>p.status==='active');
  const monthDays=dataset.timesheets.filter(t=>['approved','invoiced'].includes(String(t.status))&&String(t.work_date).startsWith(month)).reduce((sum,t)=>sum+Number(t.days||0),0);
  const latestInvoices=[...monetaryInvoices].sort((a,b)=>String(b.issue_date).localeCompare(String(a.issue_date))).slice(0,5);
  const selectedDate=new Date(`${month}-01T12:00:00`);
  const selectedValid=!Number.isNaN(selectedDate.getTime());
  const bars=Array.from({length:6},(_,index)=>{
    const date=selectedValid?new Date(selectedDate.getFullYear(),selectedDate.getMonth()-5+index,1):new Date();const key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
    return {label:new Intl.DateTimeFormat('es-ES',{month:'short'}).format(date).replace('.',''),key,value:monetaryInvoices.filter(i=>String(i.issue_date).startsWith(key)&&['issued','paid'].includes(String(i.status))).reduce((sum,i)=>sum+Number(i.subtotal_minor||0),0)};
  });
  const maxBar=Math.max(...bars.map(b=>b.value),1);
  const actualCurrencies=new Set([company.currency_code,...dataset.invoices.map(i=>String(i.currency_code)),...dataset.projects.map(p=>String(p.currency_code)),...dataset.opportunities.map(o=>String(o.currency_code))]);
  const openPipeline=dataset.opportunities.filter(o=>o.currency_code===currency&&!['won','lost'].includes(String(o.stage)));
  const weightedPipeline=openPipeline.reduce((sum,o)=>sum+Math.round(Number(o.amount_minor||0)*Number(o.probability||0)/100),0);
  return <>
    <div className="erp-page-heading"><div><div className="erp-eyebrow">VISTA GENERAL</div><h1>Tu negocio, en perspectiva.</h1><p>Lo que necesitas saber para seguir avanzando.</p></div><div className="erp-dashboard-filters"><label><span className="erp-sr-only">Mes del resumen</span><input aria-label="Mes del resumen" type="month" value={month} onChange={e=>e.target.value&&setMonth(e.target.value)}/></label><select aria-label="Moneda del resumen" value={currency} onChange={e=>setCurrency(e.target.value)}>{currencies.filter(c=>actualCurrencies.has(c.value)).map(c=><option key={c.value} value={c.value}>{c.value}</option>)}</select></div></div>
    <div className="erp-metrics">
      <Metric label="Facturado sin impuestos" value={formatMoney(revenue,currency)} detail="Facturas emitidas y cobradas del mes" icon="invoices" tone="violet"/>
      <Metric label="Pendiente de cobro" value={formatMoney(outstanding,currency)} detail={overdue.length?`${overdue.length} ${overdue.length===1?'factura vencida':'facturas vencidas'} · todos los periodos`:'Facturas emitidas · todos los periodos'} icon="clock" tone="amber"/>
      <Metric label="Proyectos en curso" value={String(projects.length).padStart(2,'0')} detail={`${dataset.clients.filter(c=>c.status==='active').length} clientes activos en esta empresa`} icon="projects" tone="blue"/>
      <Metric label="Jornadas aprobadas" value={new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(monthDays)} detail="Incluye las jornadas ya facturadas del mes" icon="timesheets" tone="green"/>
    </div>
    <div className="erp-dashboard-grid">
      <section className="erp-panel erp-chart-panel"><div className="erp-panel-heading"><div><h2>Evolución de la facturación</h2><p>Base imponible · últimos 6 meses · {currency}</p></div><span className="erp-chart-legend"><i/>Facturado</span></div><div className="erp-chart" role="img" aria-label={bars.map(b=>`${b.label}: ${formatMoney(b.value,currency)}`).join('; ')}><div className="erp-chart-grid"><span>{formatMoney(maxBar===1?0:maxBar,currency)}</span><span>{formatMoney(maxBar===1?0:Math.round(maxBar/2),currency)}</span><span>0</span></div><div className="erp-chart-bars">{bars.map((bar,index)=><div className="erp-chart-column" key={bar.key}><span className="erp-chart-value">{bar.value?formatMoney(bar.value,currency):'—'}</span><div className={`erp-chart-bar ${index===5?'erp-chart-bar-current':''}`} style={{height:`${Math.max(2,(bar.value/maxBar)*128)}px`}}/><span className="erp-chart-month">{bar.label}</span></div>)}</div></div><div className="erp-chart-footnote">Cada moneda se muestra por separado. No se aplican tipos de cambio.</div></section>
      <section className="erp-panel erp-attention-panel"><div className="erp-panel-heading"><div><h2>Necesita tu atención</h2><p>El siguiente paso, a un clic.</p></div><Icon name="clock" size={19}/></div><div className="erp-attention-list">
        <button className="erp-attention-item" onClick={()=>onNavigate('timesheets')}><span className="erp-action-icon amber"><Icon name="timesheets"/></span><span><strong>{pending.length} partes por revisar</strong><small>Validar el trabajo enviado</small></span><span className="erp-counter">{pending.length}</span></button>
        <button className="erp-attention-item" onClick={()=>onNavigate('invoices')}><span className="erp-action-icon rose"><Icon name="invoices"/></span><span><strong>{overdue.length} facturas vencidas</strong><small>Seguimiento de cobros en {currency}</small></span><span className="erp-counter">{overdue.length}</span></button>
        <button className="erp-attention-item" onClick={editable?onInvoice:()=>onNavigate('timesheets')}><span className="erp-action-icon green"><Icon name="check"/></span><span><strong>{approved.length} partes listos para facturar</strong><small>Crear un borrador desde las jornadas</small></span><span className="erp-counter">{approved.length}</span></button>
      </div><div className="erp-pipeline-note"><span>Previsión comercial ponderada</span><strong>{formatMoney(weightedPipeline,currency)}</strong><small>{openPipeline.length} oportunidades abiertas · todos los periodos</small></div></section>
      <section className="erp-panel"><div className="erp-panel-heading"><div><h2>Proyectos en curso</h2><p>Servicios activos de {company.name}</p></div><button className="erp-text-button" onClick={()=>onNavigate('projects')}>Ver todos</button></div>{projects.length===0?<EmptyState icon="projects" title="Tu próximo proyecto empieza aquí" description="Crea un cliente y vincúlalo a un proyecto para organizar su actividad." action={<button className="erp-button" onClick={()=>onNavigate('projects')}>Ir a proyectos</button>}/>:<div className="erp-project-list">{projects.slice(0,4).map((project,index)=>{const client=dataset.clients.find(c=>c.id===project.client_id);const consultant=dataset.consultants.find(c=>c.id===project.consultant_id);return <button className="erp-project-item" key={project.id} onClick={()=>onNavigate('projects')}><span className={`erp-project-icon erp-avatar-${index%4}`}><Icon name="projects" size={20}/></span><span className="erp-project-info"><strong>{String(project.name)}</strong><small>{String(client?.name||'Cliente sin asignar')}<span> · </span>{String(consultant?.full_name||'Equipo por asignar')}</small></span><span className="erp-project-rate"><strong>{formatMoney(Number(project.sell_rate_minor||0),String(project.currency_code||company.currency_code))}</strong><small>por jornada</small></span></button>;})}</div>}</section>
      <section className="erp-panel"><div className="erp-panel-heading"><div><h2>Últimas facturas</h2><p>Actividad reciente · {currency}</p></div><button className="erp-text-button" onClick={()=>onNavigate('invoices')}>Ver todas</button></div>{latestInvoices.length===0?<EmptyState icon="invoices" title="Aún no hay facturas en esta moneda" description="Tus facturas aparecerán aquí cuando las registres." action={<button className="erp-button" onClick={()=>onNavigate('invoices')}>Ir a facturas</button>}/>:<div className="erp-mini-table-scroll"><table className="erp-mini-table"><thead><tr><th>Factura</th><th>Total</th><th>Estado</th></tr></thead><tbody>{latestInvoices.map(invoice=><tr key={invoice.id}><td><button className="erp-record-link erp-invoice-link" onClick={()=>onNavigate('invoices')}><strong>{String(invoice.invoice_number)}</strong><small>{dateLabel(invoice.issue_date)}</small></button></td><td className="erp-numeric-cell">{formatMoney(Number(invoice.total_minor||0),currency)}</td><td><StatusBadge value={String(invoice.status)}/></td></tr>)}</tbody></table></div>}</section>
    </div>
    <div className="erp-dashboard-caption"><Icon name="shield" size={15}/><span>{mode==='demo'?'Vista de ejemplo. Los registros de prueba no se comparten entre dispositivos.':`Mostrando únicamente los datos de ${company.name}.`}</span></div>
  </>;
}
function Metric({label,value,detail,icon,tone}:{label:string;value:string;detail:string;icon:'invoices'|'clock'|'projects'|'timesheets';tone:string}){return <section className="erp-metric"><div className="erp-metric-top"><span>{label}</span><span className={`erp-metric-icon ${tone}`}><Icon name={icon} size={18}/></span></div><strong className="erp-metric-value">{value}</strong><p>{detail}</p></section>;}
