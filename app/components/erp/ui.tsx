'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import type { Dataset, Entity, EntityRecord, Field } from '@/lib/erp/types';
import { specs } from '@/lib/erp/config';
import { formatMoney } from '@/lib/erp/domain';

export type IconName = 'grid' | 'clients' | 'contacts' | 'opportunities' | 'consultants' | 'projects' | 'contracts' | 'purchase_orders' | 'timesheets' | 'invoices' | 'expenses' | 'settings' | 'search' | 'plus' | 'download' | 'chevron' | 'close' | 'menu' | 'check' | 'clock' | 'refresh' | 'logout' | 'shield' | 'building' | 'link' | 'trash' | 'edit' | 'file' | 'external';
const paths: Record<IconName, ReactNode> = {
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></>,
  clients: <><path d="M4 21V6l8-3 8 3v15M8 21v-5h8v5M8 8h.01M16 8h.01M8 12h.01M16 12h.01M2 21h20"/></>,
  contacts: <><rect x="5" y="3" width="15" height="18" rx="2"/><path d="M3 7h4M3 12h4M3 17h4M9 17c0-4 7-4 7 0"/><circle cx="12.5" cy="9" r="2.5"/></>,
  opportunities: <><path d="M3 17l6-6 4 4 8-10M15 5h6v6"/><path d="M3 21h18"/></>,
  consultants: <><circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5"/></>,
  projects: <><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V4h8v3M3 12a24 24 0 0 0 18 0M10 12v3h4v-3"/></>,
  contracts: <><path d="M7 3h9l4 4v14H4V3h3M14 3v5h6M8 12h8M8 16h5"/></>,
  purchase_orders: <><path d="M8 3H4v18h16V3h-4M8 3h8v4H8zM8 12h8M8 16h5"/></>,
  timesheets: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  invoices: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3zM8 8h8M8 12h8M8 16h4"/></>,
  expenses: <><path d="M3 6h17v15H3zM3 6V4h14v2M15 11h6v5h-6zM17 13.5h.01"/></>,
  settings: <><path d="M9 3h6l1 4 4 1v7l-4 1-1 4H9l-1-4-4-1V8l4-1z"/><circle cx="12" cy="11.5" r="3"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, download: <><path d="M12 3v12l-4-4M12 15l4-4M4 16v5h16v-5"/></>,
  chevron: <path d="M7 10l5 5 5-5"/>, close: <path d="M6 6l12 12M6 18L18 6"/>, menu: <path d="M4 6h16M4 12h16M4 18h16"/>,
  check: <path d="M4 12l5 5L20 6"/>, clock: <><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/></>,
  refresh: <><path d="M20 8a8 8 0 0 0-14-3L3 8M3 3v5h5M4 16a8 8 0 0 0 14 3l3-3M16 16h5v5"/></>,
  logout: <><path d="M9 3H4v18h5M12 12h9M17 8l4 4-4 4"/></>, shield: <><path d="M12 2l8 4v6c0 5-8 10-8 10S4 17 4 12V6zM8 11l3 3 5-5"/></>,
  building: <><path d="M4 21V6l8-3 8 3v15M8 21v-5h8v5M8 8h.01M16 8h.01M8 12h.01M16 12h.01M2 21h20"/></>,
  link: <><path d="M10 13l4-4M8 16l-2 2a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0M13 8l2-2a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0" transform="translate(1 0)"/></>,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/></>,
  edit: <><path d="M4 20l1-5L17 3l4 4L9 19l-5 1zM14 6l4 4"/></>,
  file: <><path d="M4 3h10l6 6v12H4zM14 3v6h6M8 14h8M8 17h5"/></>, external: <><path d="M14 3h7v7M21 3l-12 12M11 3H3v18h18v-8"/></>,
};
export function Icon({name, size = 20, className = ''}: {name: IconName; size?: number; className?: string}) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export const statusLabels: Record<string, string> = {active:'Activo',inactive:'Inactivo',planned:'Planificado',completed:'Completado',on_hold:'En pausa',closed:'Cerrado',cancelled:'Anulado',draft:'Borrador',submitted:'Pendiente de aprobación',approved:'Aprobado',rejected:'Rechazado',invoiced:'Facturado',issued:'Emitida',pending:'Pendiente',paid:'Pagada',new:'Nueva',qualified:'Cualificada',proposal:'Propuesta',won:'Ganada',lost:'Perdida',signed:'Firmado',expired:'Finalizado',terminated:'Rescindido',owner:'Propietario',admin:'Administrador',manager:'Gestor',viewer:'Solo lectura'};
export function StatusBadge({value}: {value: string}) { return <span className={`erp-badge erp-status-${value}`}>{statusLabels[value] || value || 'Sin estado'}</span>; }
export function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase() || 'A'; }
export function dateLabel(value: unknown) { if(!value) return '—'; const date = new Date(`${String(value).slice(0,10)}T12:00:00`); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric'}).format(date); }
export function recordTitle(entity: Entity, row?: EntityRecord) { return row ? String(row[specs[entity].titleField] || row.id.slice(0,8)) : '—'; }
export function displayField(field: Field | undefined, row: EntityRecord, key: string, dataset: Dataset) {
  const val=row[key]; if(val===null || val===undefined || val==='') return '—';
  if(field?.type==='money' || key.endsWith('_minor')) return formatMoney(Number(val),String(row.currency_code || 'EUR'));
  if(field?.type==='date' || key.endsWith('_date')) return dateLabel(val);
  if(field?.type==='reference' && field.entity) return recordTitle(field.entity,dataset[field.entity].find(r=>r.id===val));
  if(field?.options) return field.options.find(o=>o.value===String(val))?.label || String(val);
  if(key==='tax_rate' || key==='probability') return `${val} %`;
  if(typeof val==='number') return new Intl.NumberFormat('es-ES',{maximumFractionDigits:2}).format(val);
  return String(val);
}

export function Modal({title,subtitle,onClose,children,wide=false}: {title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
  const ref=useRef<HTMLDialogElement>(null);
  const titleId=useId();
  useEffect(()=>{const dialog=ref.current;if(dialog && !dialog.open)dialog.showModal();return ()=>{dialog?.close();};},[]);
  return <dialog ref={ref} className={`erp-dialog ${wide?'erp-dialog-wide':''}`} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-labelledby={titleId}>
    <div className="erp-dialog-inner"><header className="erp-dialog-header"><div><h2 id={titleId}>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button type="button" className="erp-icon-button" onClick={onClose} aria-label="Cerrar"><Icon name="close"/></button></header>{children}</div>
  </dialog>;
}
export function EmptyState({icon='file',title,description,action}: {icon?:IconName;title:string;description:string;action?:ReactNode}) {return <div className="erp-empty"><div className="erp-empty-icon"><Icon name={icon} size={28}/></div><h3>{title}</h3><p>{description}</p>{action}</div>;}
export function ErrorNotice({message}: {message:string}) { return <div className="erp-form-error" role="alert">{message}</div>; }
export function errorMessage(error: unknown) {return error instanceof Error ? error.message : 'No se pudo completar la operación. Vuelve a intentarlo.';}
export function downloadFile(contents:string,filename:string,type='text/csv;charset=utf-8;') {const blob=new Blob(type.startsWith('text/csv')&&!contents.startsWith('\ufeff')?['\ufeff',contents]:[contents],{type});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
