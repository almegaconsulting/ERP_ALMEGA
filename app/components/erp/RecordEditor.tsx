'use client';

import { useState, type FormEvent } from 'react';
import { specs } from '@/lib/erp/config';
import { fromMinor, toMinor, formatMoney, invoiceTotals } from '@/lib/erp/domain';
import type { Company, Dataset, Entity, EntityRecord, Field, RecordInput } from '@/lib/erp/types';
import { ErrorNotice, errorMessage, Icon, Modal, recordTitle, StatusBadge } from './ui';

type Props={entity:Entity;record?:EntityRecord;company:Company;dataset:Dataset;editable:boolean;onClose:()=>void;onSave:(input:RecordInput,id?:string)=>Promise<unknown>;onDelete:(id:string)=>Promise<unknown>};
function initialValues(entity:Entity,record:EntityRecord|undefined,company:Company) {
  const currency=String(record?.currency_code||company.currency_code);
  return Object.fromEntries(specs[entity].fields.map(field=>{
    let value=record?.[field.key]??field.default??'';
    if(!record && field.key==='currency_code')value=company.currency_code;
    if(!record && field.key==='country_code')value=company.country_code;
    if(!record && ['work_date','issue_date','expense_date'].includes(field.key))value=new Date().toISOString().slice(0,10);
    if(field.type==='money')value=fromMinor(Number(value||0),currency);
    return [field.key,String(value??'')];
  }));
}
export default function RecordEditor({entity,record,company,dataset,editable,onClose,onSave,onDelete}:Props) {
  const spec=specs[entity];
  const [values,setValues]=useState<Record<string,string>>(()=>initialValues(entity,record,company));
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [confirmDelete,setConfirmDelete]=useState(false);
  const currency=values.currency_code||company.currency_code;
  const locked=entity==='timesheets'&&record?.status==='invoiced';
  const finalInvoice=entity==='invoices'&&record&&record.status!=='draft';
  const invoiceHasParts=entity==='invoices'&&record&&dataset.timesheets.some(part=>part.invoice_id===record.id);
  function change(field:Field,value:string) {
    setValues(previous=>{
      const next={...previous,[field.key]:value};
      if(field.key==='project_id'){
        const project=dataset.projects.find(p=>p.id===value);
        if(project){if('currency_code' in next)next.currency_code=String(project.currency_code);if(entity==='timesheets'&&project.consultant_id)next.consultant_id=String(project.consultant_id);}
        if('purchase_order_id' in next)next.purchase_order_id='';
      }
      return next;
    });
  }
  function options(field:Field){
    if(field.type!=='reference'||!field.entity)return [];
    let rows=dataset[field.entity];
    if(field.key==='purchase_order_id')rows=rows.filter(r=>r.project_id===values.project_id&&r.status!=='cancelled');
    if(field.key==='consultant_id'&&entity==='timesheets'){
      const project=dataset.projects.find(p=>p.id===values.project_id);
      if(project?.consultant_id)rows=rows.filter(r=>r.id===project.consultant_id);
    }
    return rows.map(row=>({value:row.id,label:recordTitle(field.entity!,row)}));
  }
  async function submit(event:FormEvent){
    event.preventDefault();if(!editable||locked||busy)return;setBusy(true);setError('');
    try{
      const input:RecordInput={};
      for(const field of spec.fields){if(field.readOnly)continue;const value=values[field.key]??'';
        input[field.key]=value===''&&!field.required?null:field.type==='money'?toMinor(value,currency):field.type==='number'?Number(value):value.trim();
      }
      await onSave(input,record?.id);onClose();
    }catch(err){setError(errorMessage(err));}finally{setBusy(false);}
  }
  async function remove(){if(!record)return;setBusy(true);setError('');try{await onDelete(record.id);onClose();}catch(err){setError(errorMessage(err));setConfirmDelete(false);}finally{setBusy(false);}}
  let totalPreview='';
  if(entity==='invoices')try{const total=invoiceTotals(toMinor(values.subtotal_minor||'0',currency),Number(values.tax_rate||0));totalPreview=formatMoney(total.total_minor,currency);}catch{/* validation on submit */}
  return <Modal title={record?`${editable?'Editar':'Ver'} ${spec.singular}`:`Crear ${spec.singular}`} subtitle={company.name} onClose={()=>!busy&&onClose()}>
    <form onSubmit={submit} className="erp-record-form">
      {error&&<ErrorNotice message={error}/>}
      {locked&&<div className="erp-info-notice">Este parte ya está vinculado a una factura. Se conserva como registro del trabajo facturado.</div>}
      {finalInvoice&&<div className="erp-info-notice">La factura está cerrada para cambios de importes. Puedes actualizar su estado de cobro.</div>}
      {invoiceHasParts&&!finalInvoice&&<div className="erp-info-notice">La base, moneda y proyecto proceden de los partes vinculados. Para modificarlos, anula esta factura y vuelve a generarla.</div>}
      <div className="erp-form-grid">
      {spec.fields.map(field=>{
        const disabled=!editable||locked||busy||field.readOnly||Boolean(finalInvoice&&field.key!=='status')||Boolean(invoiceHasParts&&['project_id','currency_code','subtotal_minor'].includes(field.key));
        let fieldOptions=field.type==='reference'?options(field):field.options||[];
        if(entity==='invoices'&&field.key==='status'){
          const transitions:Record<string,string[]>={draft:['draft','issued','cancelled'],issued:['issued','paid','cancelled'],paid:['paid'],cancelled:['cancelled']};
          const allowed=record?transitions[String(record.status)]||[]:['draft'];
          fieldOptions=fieldOptions.filter(option=>allowed.includes(option.value));
        }
        const readonlyStatus=field.key===spec.statusField&&locked;
        return <div key={field.key} className={`erp-field ${field.type==='textarea'?'erp-field-full':''}`}>
          <label htmlFor={`field-${field.key}`}>{field.label}{field.required&&<span className="erp-required"> *</span>}</label>
          {readonlyStatus?<StatusBadge value="invoiced"/>:field.type==='textarea'?<textarea id={`field-${field.key}`} value={values[field.key]} required={field.required} disabled={disabled} rows={3} maxLength={5000} onChange={e=>change(field,e.target.value)}/>:field.type==='select'||field.type==='reference'?<select id={`field-${field.key}`} value={values[field.key]} required={field.required} disabled={disabled} onChange={e=>change(field,e.target.value)}>
            {(field.type==='reference'||!field.required)&&<option value="">{field.required?'Seleccionar…':'Sin asignar'}</option>}
            {fieldOptions.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
          </select>:<div className={field.type==='money'?'erp-money-input':''}><input id={`field-${field.key}`} value={values[field.key]} type={field.type==='money'||field.type==='number'?'number':field.type} required={field.required} disabled={disabled} min={field.min} max={field.max} step={field.type==='money'?(['JPY','CLP'].includes(currency)?1:0.01):field.step} maxLength={field.type==='text'?500:undefined} onChange={e=>change(field,e.target.value)}/>{field.type==='money'&&<span>{currency}</span>}</div>}
          {field.type==='reference'&&fieldOptions.length===0&&<small>Crea primero {field.entity?specs[field.entity].label.toLowerCase():'el registro relacionado'} para poder seleccionarlo.</small>}
          {field.key==='currency_code'&&<small>Los importes se expresan en esta moneda; cambiarla no realiza una conversión.</small>}
        </div>;
      })}
      </div>
      {totalPreview&&<div className="erp-total-preview"><span>Total con impuestos</span><strong>{totalPreview}</strong></div>}
      {entity==='invoices'&&!record&&<p className="erp-muted erp-small">El registro se guarda en el MiniERP. No se envía al cliente ni a Holded.</p>}
      <footer className="erp-dialog-footer">
        {record&&editable&&!locked&&(!finalInvoice)&&<button type="button" className="erp-button erp-button-danger-text" disabled={busy} onClick={()=>setConfirmDelete(true)}><Icon name="trash" size={17}/>Eliminar</button>}
        <div className="erp-footer-spacer"/><button type="button" className="erp-button" disabled={busy} onClick={onClose}>{editable?'Cancelar':'Cerrar'}</button>
        {editable&&!locked&&<button className="erp-button erp-button-primary" type="submit" disabled={busy}>{busy?'Guardando…':record?'Guardar cambios':'Crear registro'}</button>}
      </footer>
      {confirmDelete&&<div className="erp-delete-confirm" role="alert"><p>¿Eliminar este {spec.singular}? Esta acción no se puede deshacer. Si tiene registros vinculados, se conservará.</p><div className="erp-button-row"><button type="button" className="erp-button" onClick={()=>setConfirmDelete(false)} disabled={busy}>Conservar</button><button type="button" className="erp-button erp-button-danger" onClick={remove} disabled={busy}>{busy?'Eliminando…':'Confirmar eliminación'}</button></div></div>}
    </form>
  </Modal>;
}
