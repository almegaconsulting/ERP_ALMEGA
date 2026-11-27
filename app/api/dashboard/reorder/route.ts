// Legacy anonymous endpoint is retired; ERP mutations require company membership.
export async function POST() { return Response.json({ error: 'Esta operación pertenece a la versión anterior. Abre el nuevo panel del MiniERP.' }, { status: 410 }); }
